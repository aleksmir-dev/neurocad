// app/core/engine/lib/base/cards/edit.js

/**
 * Universal form for creating/editing cards.
 * Generated from field descriptions in a JSON config.
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
     * Create field group
     */
    _createFieldGroup(field) {
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
     * Create input
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

                if (field.options) {
                    field.options.forEach(opt => {
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

            case 'checkbox':
                el = document.createElement('input');
                el.type = 'checkbox';
                el.className = 'edit-input edit-checkbox';
                el.checked = !!value;
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

        if (field.required) {
            el.required = true;
        }

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
        } else if (field.type === 'select') {
            value = el.value;
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
                const firstInput = this.editBody?.querySelector('.edit-input');
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