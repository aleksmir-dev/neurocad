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
 *     ├── actions (Выбрать / Очистить)  ← LEFT
 *     └── preview (img or placeholder)  ← RIGHT
 *   → click "Выбрать" opens BaseAssets picker.
 *   → selected src is stored in this.values[key].
 *
 * Other field types keep the standard label-above-input layout.
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
     * @param {Object} field
     */
    async _openMediaPicker(field) {
        const version = window.coreEngine?.static_version || Date.now();

        try {
            const { BaseAssets } = await import(
                `/static/core/engine/lib/base/assets/assets.js?v=${version}`
            );

            BaseAssets.open({
                onSelect: (src) => {
                    this._setMediaValue(field, src);
                },
            });
        } catch (e) {
            console.warn('[BaseCardsEdit] BaseAssets unavailable:', e);
            alert('Не удалось открыть медиатеку');
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
            const errorMsg = document.createElement('div');
            errorMsg.className = 'edit-global-error';
            errorMsg.textContent = error.message || 'Ошибка сохранения';
            this.editBody.prepend(errorMsg);

            setTimeout(() => {
                errorMsg.remove();
            }, 3000);
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