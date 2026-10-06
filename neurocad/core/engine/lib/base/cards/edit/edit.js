// app/core/engine/lib/base/cards/edit.js

/**
 * Universal form for creating/editing cards.
 * Generated from field descriptions in a JSON config.
 *
 * Layout for checkbox fields:
 *   .edit-group--checkbox
 *     └── label.edit-label-checkbox
 *         ├── input[type=checkbox]
 *         └── span (field label)
 *   → checkbox on the LEFT, label text on the RIGHT.
 *
 * Layout for media fields:
 *   .edit-group--media
 *     ├── actions (Выбрать / [extraButtons] / Очистить)  ← LEFT
 *     └── preview (img or placeholder)                   ← RIGHT
 *   → click "Выбрать" opens BaseAssets picker.
 *   → selected src is stored in this.values[key].
 *
 * Other field types keep the standard label-above-input layout.
 *
 * Media sources
 * -------------
 * A media field may declare which picker sources to show:
 *
 *   mediaSources: ['media', 'logos']   — tabs in the picker
 *   mediaSources: ['logos']            — logos only
 *   mediaSource:  'logos'              — same, legacy single-value form
 *
 * Default (no declaration): ['media'] — current behavior.
 *
 *   mediaSource: 'logos'               — which tab opens first
 *
 * Extra media buttons
 * -------------------
 * A media field may declare `extraButtons: [{ label, className,
 * onClick }]`. These buttons are rendered BETWEEN "Выбрать" and
 * "Очистить" (in the order given). `onClick` receives a context:
 *
 *     {
 *       field,          — the field descriptor
 *       getValue,       — () => current value of THIS field
 *       getAllValues,   — () => snapshot of ALL current form values
 *       setValue,       — (src) => update value + hidden input + preview
 *       showError,      — (msg) => show an error under this field
 *       clearError,     — () => clear the error under this field
 *       button,         — the DOM node (for busy state, disable, ...)
 *     }
 *
 * This is the ONLY extension point for media fields. BaseCardsEdit
 * itself knows nothing about logos, LLM, or HTTP — callers provide
 * the extra behaviour through this list.
 *
 * Structured submission errors
 * ----------------------------
 * When onSubmit() throws, this form renders the error at the top of
 * the body. Two error shapes are supported:
 *
 *   1. Plain Error — { message: "..." }
 *      The message is rendered as-is. Block auto-removes after 3 s.
 *
 *   2. Structured error — the server returns
 *
 *          { "detail": { "code": "...", "message": "...",
 *                        "action": { "label": "...", "href": "..." } } }
 *
 *      and fetchJson turns that into an Error whose `detail` field
 *      holds the original object (and whose `message` is the
 *      fallback). We read:
 *
 *          - detail.message → the human-readable text;
 *          - detail.action  → optional { label, href } for a
 *                             follow-up link-button.
 *
 *      When `action` is present, the block does NOT auto-remove —
 *      the follow-up link should stay until the user clicks it or
 *      submits again.
 *
 * This form has NO knowledge of specific error codes / tariffs.
 * Business logic (what "pages_exhausted" means, where the balance
 * page lives) is built on the backend, which is where tariffs are
 * understood. The form is a generic renderer for that payload.
 */
export class BaseCardsEdit {
    constructor(props = {}) {
        this.props = props;
        this.fields = props.fields || [];
        this.title = props.title || 'Форма';
        this.entityType = props.entityType || 'элемент';
        this.onSubmit = props.onSubmit || null;
        this.onCancel = props.onCancel || null;
        this.onClose = props.onClose || null;
        this.initialData = props.initialData || null;
        this.isEdit = !!props.initialData?.id;

        // State
        this.values = {};
        this.errors = {};
        this.isSubmitting = false;
        this.modalOverlay = null;
        this.modalContent = null;

        // Load CSS
        this._loadCSS();

        // Initialize values
        this._initValues();
    }

    /**
     * Load CSS
     */
    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/cards/edit/edit.css');
        }
    }

    /**
     * Initialize values from data
     */
    _initValues() {
        this.fields.forEach(field => {
            const key = field.key;
            if (this.initialData && this.initialData[key] !== undefined) {
                this.values[key] = this.initialData[key];
            } else if (field.default !== undefined) {
                this.values[key] = field.default;
            } else {
                this.values[key] = field.type === 'checkbox' ? false : '';
            }
        });
    }

    /**
     * Open form in a modal
     */
    open() {
        this._createModal();
        this._renderForm();
        this._bindEvents();
        this._showModal();
    }

    /**
     * Close form
     */
    close() {
        this._hideModal();
        if (this.onClose) {
            this.onClose();
        }
    }

    /**
     * Create modal
     */
    _createModal() {
        // Remove existing modal, if any
        const existing = document.querySelector('.core-engine-lib-base-cards-edit');
        if (existing) {
            existing.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'core-engine-lib-base-cards-edit';
        overlay.innerHTML = `
            <div class="edit-overlay" data-js="edit-overlay"></div>
            <div class="edit-content" data-js="edit-content">
                <div class="edit-header">
                    <span class="edit-title">${this.isEdit ? 'Редактировать' : 'Создать'} ${this.entityType}</span>
                    <button class="edit-close" data-js="edit-close">✕</button>
                </div>
                <div class="edit-body" data-js="edit-body"></div>
                <div class="edit-footer">
                    <button class="edit-btn edit-btn-cancel" data-js="edit-cancel">Отмена</button>
                    <button class="edit-btn edit-btn-submit" data-js="edit-submit">
                        ${this.isEdit ? 'Сохранить' : 'Создать'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.modalOverlay = overlay;
        this.modalContent = overlay.querySelector('[data-js="edit-content"]');
        this.editBody = overlay.querySelector('[data-js="edit-body"]');
    }

    /**
     * Render form
     */
    _renderForm() {
        if (!this.editBody) return;

        const form = document.createElement('form');
        form.className = 'edit-form';
        form.setAttribute('data-js', 'edit-form');

        this.fields.forEach(field => {
            const group = this._createFieldGroup(field);
            form.appendChild(group);
        });

        this.editBody.innerHTML = '';
        this.editBody.appendChild(form);

        // Save form reference
        this.form = form;
    }

    /**
     * Create field group.
     *
     * Three layouts:
     *   - checkbox: label with embedded input (checkbox left, text right)
     *   - media:    actions on the left, preview on the right
     *   - others:   label on top, input below (standard)
     */
    _createFieldGroup(field) {
        if (field.type === 'checkbox') {
            return this._createCheckboxGroup(field);
        }
        if (field.type === 'media') {
            return this._createMediaGroup(field);
        }

        // ===== STANDARD layout =====
        const group = document.createElement('div');
        group.className = 'edit-group';

        // Label
        const label = document.createElement('label');
        label.className = 'edit-label';
        label.textContent = field.label || field.key;
        if (field.required) {
            const req = document.createElement('span');
            req.className = 'edit-required';
            req.textContent = ' *';
            label.appendChild(req);
        }
        group.appendChild(label);

        // Input
        const input = this._createInput(field);
        group.appendChild(input);

        // Error
        const error = document.createElement('span');
        error.className = 'edit-error';
        error.setAttribute('data-js', `error-${field.key}`);
        group.appendChild(error);

        return group;
    }

    /**
     * Create checkbox field group.
     *
     * Layout:
     *   <div class="edit-group edit-group--checkbox">
     *     <label class="edit-label-checkbox">
     *       <input type="checkbox" ...>
     *       <span>Label text</span>
     *     </label>
     *     <span class="edit-error">...</span>
     *   </div>
     *
     * The <label> wraps the checkbox, so clicking the text toggles
     * the checkbox (native browser behavior).
     */
    _createCheckboxGroup(field) {
        const group = document.createElement('div');
        group.className = 'edit-group edit-group--checkbox';

        // Label wrapper — clickable, contains checkbox + text
        const label = document.createElement('label');
        label.className = 'edit-label-checkbox';

        // Checkbox input
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'edit-checkbox';
        input.checked = !!this.values[field.key];
        input.setAttribute('data-js', `field-${field.key}`);
        input.setAttribute('data-field', field.key);
        label.appendChild(input);

        // Label text
        const text = document.createElement('span');
        text.className = 'edit-label-text';
        text.textContent = field.label || field.key;
        if (field.required) {
            const req = document.createElement('span');
            req.className = 'edit-required';
            req.textContent = ' *';
            text.appendChild(req);
        }
        label.appendChild(text);

        group.appendChild(label);

        // Error
        const error = document.createElement('span');
        error.className = 'edit-error';
        error.setAttribute('data-js', `error-${field.key}`);
        group.appendChild(error);

        // Change handler
        input.addEventListener('change', () => {
            this._onFieldChange(field, input);
        });

        return group;
    }

    /**
     * Create media field group.
     *
     * Layout:
     *   <div class="edit-group edit-group--media">
     *     <label class="edit-label">...</label>
     *     <div class="edit-media">
     *       <div class="edit-media-actions">
     *         <button class="edit-media-btn edit-media-btn-pick">Выбрать</button>
     *         [... extraButtons ...]
     *         <button class="edit-media-btn edit-media-btn-clear">Очистить</button>
     *       </div>
     *       <div class="edit-media-preview" data-js="preview-<key>">
     *         <img> or placeholder
     *       </div>
     *     </div>
     *     <input type="hidden" data-js="field-<key>" data-field="<key>">
     *     <span class="edit-error">...</span>
     *   </div>
     *
     * Actions on the LEFT, preview on the RIGHT.
     * Click "Выбрать" opens BaseAssets picker (media library).
     * Selected src is written to hidden input and shown in preview.
     *
     * `field.extraButtons` — optional array of additional buttons,
     * rendered between "Выбрать" and "Очистить". See the module
     * docstring for the onClick context.
     */
    _createMediaGroup(field) {
        const group = document.createElement('div');
        group.className = 'edit-group edit-group--media';

        const value = this.values[field.key] || '';

        // Label
        const label = document.createElement('label');
        label.className = 'edit-label';
        label.textContent = field.label || field.key;
        if (field.required) {
            const req = document.createElement('span');
            req.className = 'edit-required';
            req.textContent = ' *';
            label.appendChild(req);
        }
        group.appendChild(label);

        // Media container
        const media = document.createElement('div');
        media.className = 'edit-media';

        // Actions (LEFT)
        const actions = document.createElement('div');
        actions.className = 'edit-media-actions';

        const pickBtn = document.createElement('button');
        pickBtn.type = 'button';
        pickBtn.className = 'edit-media-btn edit-media-btn-pick';
        pickBtn.textContent = 'Выбрать';
        pickBtn.addEventListener('click', () => {
            this._openMediaPicker(field);
        });
        actions.appendChild(pickBtn);

        // ---- Extra buttons (optional) ----
        // Rendered between "Выбрать" and "Очистить", in order.
        // Each entry is { label, className, onClick }.
        // onClick receives a context object — see the module
        // docstring for the full shape.
        if (Array.isArray(field.extraButtons)) {
            for (const btnSpec of field.extraButtons) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'edit-media-btn ' + (btnSpec.className || '');
                btn.textContent = btnSpec.label || 'Действие';

                btn.addEventListener('click', async () => {
                    if (typeof btnSpec.onClick !== 'function') return;
                    try {
                        await btnSpec.onClick({
                            field,
                            getValue: () => this.values[field.key],
                            getAllValues: () => ({ ...this.values }),
                            setValue: (v) => this._setMediaValue(field, v),
                            showError: (msg) => this._setError(field.key, msg),
                            clearError: () => this._clearError(field.key),
                            button: btn,
                        });
                    } catch (e) {
                        console.error('[BaseCardsEdit] extraButtons onClick error:', e);
                        this._setError(field.key, e?.message || 'Ошибка');
                    }
                });

                actions.appendChild(btn);
            }
        }

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'edit-media-btn edit-media-btn-clear';
        clearBtn.textContent = 'Очистить';
        clearBtn.addEventListener('click', () => {
            this._setMediaValue(field, '');
        });
        actions.appendChild(clearBtn);

        media.appendChild(actions);

        // Preview (RIGHT)
        const preview = document.createElement('div');
        preview.className = 'edit-media-preview';
        preview.setAttribute('data-js', `preview-${field.key}`);
        if (value) {
            const img = document.createElement('img');
            img.src = value;
            img.alt = '';
            preview.appendChild(img);
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'edit-media-placeholder';
            placeholder.textContent = field.placeholder || 'Не выбрано';
            preview.appendChild(placeholder);
        }
        media.appendChild(preview);

        group.appendChild(media);

        // Hidden input — keeps value in the same shape as other fields
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.setAttribute('data-js', `field-${field.key}`);
        hidden.setAttribute('data-field', field.key);
        hidden.value = value;
        group.appendChild(hidden);

        // Error
        const error = document.createElement('span');
        error.className = 'edit-error';
        error.setAttribute('data-js', `error-${field.key}`);
        group.appendChild(error);

        return group;
    }

    /**
     * Open the media picker (BaseAssets) and update the field value.
     *
     * Sources are read from the field descriptor:
     *   - field.mediaSources: ['media'] | ['logos'] | ['media','logos']
     *   - field.mediaSource:  'media' | 'logos'  (legacy single-value)
     * Default: ['media'].
     *
     * The initial tab is field.mediaSource if it is among the
     * available sources, otherwise sources[0].
     *
     * @param {Object} field
     */
    async _openMediaPicker(field) {
        const version = window.coreEngine?.static_version || Date.now();

        // ---- 1. Available sources ----
        let sources = ['media'];
        if (Array.isArray(field.mediaSources) && field.mediaSources.length) {
            sources = field.mediaSources.filter(s => s === 'media' || s === 'logos');
            if (!sources.length) sources = ['media'];
        } else if (field.mediaSource === 'logos') {
            sources = ['logos'];
        }

        // ---- 2. Initial tab ----
        const initialSource = sources.includes(field.mediaSource)
            ? field.mediaSource
            : sources[0];

        try {
            const { BaseAssets } = await import(
                `/static/core/engine/lib/base/assets/assets.js?v=${version}`
            );

            BaseAssets.open({
                sources,
                initialSource,
                onSelect: (src) => {
                    this._setMediaValue(field, src);
                },
            });
        } catch (e) {
            console.warn('[BaseCardsEdit] BaseAssets unavailable:', e);

            // Fallback to a modal message if available — do not use
            // native alert() in production UI.
            try {
                const { createModal } = await import(
                    `/static/core/engine/lib/base/modal/index.js?v=${version}`
                );
                const modal = await createModal('message');
                if (modal) {
                    modal.setOnOk(() => modal.destroy());
                    modal.open('Не удалось открыть медиатеку', 'Ошибка');
                    return;
                }
            } catch (_) { /* ignore */ }

            // Last-resort fallback.
            window.alert('Не удалось открыть медиатеку');
        }
    }

    /**
     * Set the value of a media field:
     *   - update this.values[key]
     *   - update hidden input
     *   - update preview
     *   - clear error
     *
     * @param {Object} field
     * @param {string} src
     */
    _setMediaValue(field, src) {
        this.values[field.key] = src;

        // Hidden input
        const hidden = this.editBody.querySelector(`[data-js="field-${field.key}"]`);
        if (hidden) {
            hidden.value = src;
        }

        // Preview
        const preview = this.editBody.querySelector(`[data-js="preview-${field.key}"]`);
        if (preview) {
            preview.innerHTML = '';
            if (src) {
                const img = document.createElement('img');
                img.src = src;
                img.alt = '';
                preview.appendChild(img);
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'edit-media-placeholder';
                placeholder.textContent = field.placeholder || 'Не выбрано';
                preview.appendChild(placeholder);
            }
        }

        this._clearError(field.key);
    }

    /**
     * Create input (for non-checkbox, non-media fields)
     */
    _createInput(field) {
        const value = this.values[field.key] || '';
        const input = document.createElement('div');
        input.className = 'edit-input-wrapper';

        let el;

        switch (field.type) {
            case 'textarea':
                el = document.createElement('textarea');
                el.className = 'edit-input edit-textarea';
                el.rows = field.rows || 3;
                el.placeholder = field.placeholder || '';
                el.value = value;
                break;

            case 'select':
                el = document.createElement('select');
                el.className = 'edit-input edit-select';
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = field.placeholder || 'Выберите...';
                el.appendChild(emptyOpt);

                // Support options as array OR as function.
                // Function form is evaluated at render time — so dynamic
                // lists (e.g. templates created after init) are always
                // up to date.
                const optionsList = typeof field.options === 'function'
                    ? field.options()
                    : field.options;

                if (optionsList) {
                    optionsList.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.label || opt.value;
                        if (value === opt.value) {
                            option.selected = true;
                        }
                        el.appendChild(option);
                    });
                }
                break;

            case 'date':
                el = document.createElement('input');
                el.type = 'date';
                el.className = 'edit-input';
                el.placeholder = field.placeholder || '';
                el.value = value;
                break;

            case 'time':
                el = document.createElement('input');
                el.type = 'time';
                el.className = 'edit-input';
                el.placeholder = field.placeholder || '';
                el.value = value;
                break;

            case 'number':
                el = document.createElement('input');
                el.type = 'number';
                el.className = 'edit-input';
                el.placeholder = field.placeholder || '';
                el.value = value;
                if (field.min !== undefined) el.min = field.min;
                if (field.max !== undefined) el.max = field.max;
                if (field.step !== undefined) el.step = field.step;
                break;

            case 'text':
            default:
                el = document.createElement('input');
                el.type = 'text';
                el.className = 'edit-input';
                el.placeholder = field.placeholder || '';
                el.value = value;
                break;
        }

        el.setAttribute('data-js', `field-${field.key}`);
        el.setAttribute('data-field', field.key);
        el.required = field.required || false;

        input.appendChild(el);

        // Change handling
        el.addEventListener('change', () => {
            this._onFieldChange(field, el);
        });

        el.addEventListener('input', () => {
            this._onFieldChange(field, el);
            this._clearError(field.key);
        });

        return input;
    }

    /**
     * Handle field change
     */
    _onFieldChange(field, el) {
        let value;

        if (field.type === 'checkbox') {
            value = el.checked;
        } else {
            value = el.value;
        }

        this.values[field.key] = value;
    }

    /**
     * Form validation
     */
    _validate() {
        let isValid = true;
        this.errors = {};

        this.fields.forEach(field => {
            const value = this.values[field.key];

            if (field.required) {
                if (field.type === 'checkbox') {
                    if (!value) {
                        this.errors[field.key] = 'Обязательное поле';
                        isValid = false;
                    }
                } else if (!value || String(value).trim() === '') {
                    this.errors[field.key] = 'Обязательное поле';
                    isValid = false;
                }
            }

            if (field.minLength && value && String(value).length < field.minLength) {
                this.errors[field.key] = `Минимум ${field.minLength} символов`;
                isValid = false;
            }

            if (field.maxLength && value && String(value).length > field.maxLength) {
                this.errors[field.key] = `Максимум ${field.maxLength} символов`;
                isValid = false;
            }
        });

        this._showErrors();
        return isValid;
    }

    /**
     * Show errors
     */
    _showErrors() {
        this.fields.forEach(field => {
            const errorEl = this.editBody.querySelector(`[data-js="error-${field.key}"]`);
            if (errorEl) {
                if (this.errors[field.key]) {
                    errorEl.textContent = this.errors[field.key];
                    errorEl.style.display = 'block';
                } else {
                    errorEl.textContent = '';
                    errorEl.style.display = 'none';
                }
            }

            const inputEl = this.editBody.querySelector(`[data-js="field-${field.key}"]`);
            if (inputEl) {
                if (this.errors[field.key]) {
                    inputEl.classList.add('error');
                } else {
                    inputEl.classList.remove('error');
                }
            }
        });
    }

    /**
     * Show an error under a field.
     *
     * Counterpart to _clearError(). Used by extraButtons handlers
     * (e.g. "Генерировать" in media fields) to report failures.
     *
     * @param {string} key — field key
     * @param {string} msg — error message; empty string clears
     */
    _setError(key, msg) {
        if (!msg) {
            this._clearError(key);
            return;
        }

        this.errors[key] = msg;

        const errorEl = this.editBody.querySelector(`[data-js="error-${key}"]`);
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }

        const inputEl = this.editBody.querySelector(`[data-js="field-${key}"]`);
        if (inputEl) {
            inputEl.classList.add('error');
        }
    }

    /**
     * Clear field error
     */
    _clearError(key) {
        const errorEl = this.editBody.querySelector(`[data-js="error-${key}"]`);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }

        const inputEl = this.editBody.querySelector(`[data-js="field-${key}"]`);
        if (inputEl) {
            inputEl.classList.remove('error');
        }

        delete this.errors[key];
    }

    /**
     * Get form data
     */
    getData() {
        const data = {};
        this.fields.forEach(field => {
            const key = field.key;
            if (this.values[key] !== undefined) {
                data[key] = this.values[key];
            }
        });
        return data;
    }

    /**
     * Render a submission error in the form.
     *
     * Two error shapes are supported — see the class docstring for
     * the full description:
     *
     *   1. Plain Error — { message: "..." }
     *      The message is rendered as-is. Block auto-removes after
     *      a moment.
     *
     *   2. Structured error — the server returned
     *          { detail: { code, message, action? } }
     *      and fetchJson copied those fields onto the Error
     *      instance as `error.detail`. We render `detail.message`
     *      and, if `detail.action` is present, an <a> link-button
     *      under it. The block does NOT auto-remove when there is
     *      an action — a follow-up link should stay until the user
     *      clicks it or submits again.
     *
     * This method has NO knowledge of specific error codes or
     * tariffs. Business logic (what "pages_exhausted" means, where
     * the balance page lives) is built on the backend, which
     * understands tariffs. This form is a generic renderer for the
     * payload shape.
     *
     * @param {Error} error — the error thrown by onSubmit
     */
    _showSubmitError(error) {
        const detail = error?.detail;

        // ---- 1. Human-readable text ----
        // Prefer `detail.message` (server-formatted), fall back to
        // `error.message` (generic Error), then a hard-coded default.
        let text = 'Ошибка сохранения';
        if (detail && typeof detail === 'object' && detail.message) {
            text = String(detail.message);
        } else if (error?.message) {
            text = String(error.message);
        }

        // ---- 2. Optional action: { label, href } ----
        let action = null;
        if (detail && typeof detail === 'object' && detail.action) {
            const a = detail.action;
            if (a && typeof a.label === 'string' && typeof a.href === 'string') {
                action = { label: a.label, href: a.href };
            }
        }

        // ---- 3. Build the block ----
        const box = document.createElement('div');
        box.className = 'edit-global-error';

        const textEl = document.createElement('div');
        textEl.className = 'edit-global-error__text';
        textEl.textContent = text;
        box.appendChild(textEl);

        if (action) {
            const link = document.createElement('a');
            link.className = 'edit-global-error__action';
            link.href = action.href;
            link.textContent = action.label;
            box.appendChild(link);
        }

        this.editBody.prepend(box);

        // Auto-remove only when there is no action button — a
        // follow-up link should stay until the user clicks it or
        // resubmits.
        if (!action) {
            setTimeout(() => box.remove(), 3000);
        }
    }

    /**
     * Handle form submit
     */
    async _handleSubmit(e) {
        e.preventDefault();

        if (this.isSubmitting) return;

        if (!this._validate()) {
            const firstError = this.fields.find(f => this.errors[f.key]);
            if (firstError) {
                const el = this.editBody.querySelector(`[data-js="field-${firstError.key}"]`);
                if (el) {
                    el.focus();
                }
            }
            return;
        }

        this.isSubmitting = true;
        const submitBtn = this.modalContent.querySelector('[data-js="edit-submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохранение...';
        }

        try {
            const data = this.getData();
            if (this.isEdit && this.initialData) {
                data.id = this.initialData.id;
            }

            if (this.onSubmit) {
                await this.onSubmit(data);
            }

            this.close();
        } catch (error) {
            console.error('[BaseCardsEdit] Submit error:', error);
            this._showSubmitError(error);
        }

        this.isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = this.isEdit ? 'Сохранить' : 'Создать';
        }
    }

    /**
     * Bind events
     */
    _bindEvents() {
        const closeBtn = this.modalContent.querySelector('[data-js="edit-close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        const cancelBtn = this.modalContent.querySelector('[data-js="edit-cancel"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (this.onCancel) {
                    this.onCancel();
                }
                this.close();
            });
        }

        const submitBtn = this.modalContent.querySelector('[data-js="edit-submit"]');
        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => this._handleSubmit(e));
        }

        if (this.form) {
            this.form.addEventListener('submit', (e) => this._handleSubmit(e));
        }

        const overlay = this.modalOverlay.querySelector('[data-js="edit-overlay"]');
        if (overlay) {
            overlay.addEventListener('click', () => this.close());
        }

        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    /**
     * Show modal
     */
    _showModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.add('active');
            setTimeout(() => {
                const firstInput = this.editBody?.querySelector('.edit-input, .edit-checkbox');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        }
    }

    /**
     * Hide modal
     */
    _hideModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('active');
            setTimeout(() => {
                if (this.modalOverlay) {
                    this.modalOverlay.remove();
                    this.modalOverlay = null;
                    this.modalContent = null;
                    this.editBody = null;
                    this.form = null;
                }
                if (this._escapeHandler) {
                    document.removeEventListener('keydown', this._escapeHandler);
                    this._escapeHandler = null;
                }
            }, 300);
        }
    }

    /**
     * Destroy
     */
    destroy() {
        this._hideModal();
    }
}