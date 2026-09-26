// app/core/engine/lib/base/auth/password.js

/**
 * BaseAuthPassword — password change page.
 *
 * 401 here means "wrong current password", NOT "session expired".
 * So we use fetchJson with skipAuthRedirect: true — do NOT emit
 * auth:unauthorized on 401.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Caption: saves the current header/tab title on open and restores it
 * on destroy.
 */
export class BaseAuthPassword {
    constructor(options = {}) {
        this.options = options;
        this.user = options.user || null;
        this.onSuccess = options.onSuccess || null;
        this.onCancel = options.onCancel || null;

        // Caption helpers — provided by BaseAuth via _renderForm().
        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;
        this.isLoading = false;

        // Saved caption state — filled in render(), used in destroy().
        this._savedCaption = null;

        this._loadCSS();
    }

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/password.css');
        }
    }

    render() {
        // Save current title, set our own.
        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Изменение пароля', 'Изменение пароля');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-password';
        wrapper.innerHTML = `
            <div class="auth-modal-body">
                <div class="auth-error" data-js="password-error" style="display:none;"></div>
                <div class="auth-success" data-js="password-success" style="display:none;"></div>
                <form class="auth-form" data-js="password-form">
                    <div class="auth-group">
                        <label class="auth-label">Текущий пароль</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="password-current" placeholder="Введите текущий пароль" autofocus>
                            <button type="button" class="auth-toggle-password" data-js="toggle-current">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Новый пароль</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="password-new" placeholder="Минимум 6 символов">
                            <button type="button" class="auth-toggle-password" data-js="toggle-new">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Подтверждение нового пароля</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="password-confirm" placeholder="Повторите новый пароль">
                            <button type="button" class="auth-toggle-password" data-js="toggle-confirm">👁️</button>
                        </div>
                    </div>
                    <button type="submit" class="auth-submit" data-js="password-submit">Изменить пароль</button>
                </form>
            </div>
        `;
        this.element = wrapper;
        return wrapper;
    }

    bindEvents(container) {
        const root = container || this.element;
        if (!root) return;

        this.form = root.querySelector('[data-js="password-form"]');
        this.errorEl = root.querySelector('[data-js="password-error"]');
        this.successEl = root.querySelector('[data-js="password-success"]');
        this.currentInput = root.querySelector('[data-js="password-current"]');
        this.newInput = root.querySelector('[data-js="password-new"]');
        this.confirmInput = root.querySelector('[data-js="password-confirm"]');
        this.submitBtn = root.querySelector('[data-js="password-submit"]');

        this.toggleCurrent = root.querySelector('[data-js="toggle-current"]');
        this.toggleNew = root.querySelector('[data-js="toggle-new"]');
        this.toggleConfirm = root.querySelector('[data-js="toggle-confirm"]');

        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSubmit();
            });
        }

        if (this.toggleCurrent && this.currentInput) {
            this.toggleCurrent.addEventListener('click', () => {
                const type = this.currentInput.type === 'password' ? 'text' : 'password';
                this.currentInput.type = type;
                this.toggleCurrent.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        if (this.toggleNew && this.newInput) {
            this.toggleNew.addEventListener('click', () => {
                const type = this.newInput.type === 'password' ? 'text' : 'password';
                this.newInput.type = type;
                this.toggleNew.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        if (this.toggleConfirm && this.confirmInput) {
            this.toggleConfirm.addEventListener('click', () => {
                const type = this.confirmInput.type === 'password' ? 'text' : 'password';
                this.confirmInput.type = type;
                this.toggleConfirm.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        this.currentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.newInput.focus();
            }
        });

        this.newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.confirmInput.focus();
            }
        });

        this.confirmInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._handleSubmit();
            }
        });
    }

    async _handleSubmit() {
        const current = this.currentInput.value;
        const newPassword = this.newInput.value;
        const confirm = this.confirmInput.value;

        if (!current || !newPassword || !confirm) {
            this._showError('Заполните все поля');
            return;
        }

        if (newPassword !== confirm) {
            this._showError('Новый пароль и подтверждение не совпадают');
            return;
        }

        if (newPassword.length < 6) {
            this._showError('Новый пароль должен содержать минимум 6 символов');
            return;
        }

        if (current === newPassword) {
            this._showError('Новый пароль должен отличаться от текущего');
            return;
        }

        this._setLoading(true);
        this._hideError();
        this._hideSuccess();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson('/core/auth/password/change', {
                method: 'POST',
                body: {
                    current_password: current,
                    new_password: newPassword,
                    new_password_confirm: confirm,
                },
                skipAuthRedirect: true,   // wrong current password ≠ session expired
            });

            if (data.success) {
                if (this.onSuccess) {
                    this.onSuccess();
                }
                this._showSuccess(data.message || 'Пароль успешно изменён');
                setTimeout(() => {
                    this._closeModal();
                }, 1500);
            } else {
                this._showError(data.message || 'Ошибка изменения пароля');
            }
        } catch (error) {
            this._showError(error.message || 'Ошибка изменения пароля');
        }

        this._setLoading(false);
    }

    _showError(message) {
        if (this.errorEl) {
            this.errorEl.textContent = message;
            this.errorEl.style.display = 'block';
            this.errorEl.className = 'auth-error';
        }
        if (this.successEl) {
            this.successEl.style.display = 'none';
        }
    }

    _showSuccess(message) {
        if (this.successEl) {
            this.successEl.textContent = message;
            this.successEl.style.display = 'block';
            this.successEl.className = 'auth-success';
        }
        if (this.errorEl) {
            this.errorEl.style.display = 'none';
        }
    }

    _hideError() {
        if (this.errorEl) {
            this.errorEl.textContent = '';
            this.errorEl.style.display = 'none';
            this.errorEl.className = 'auth-error';
        }
    }

    _hideSuccess() {
        if (this.successEl) {
            this.successEl.textContent = '';
            this.successEl.style.display = 'none';
            this.successEl.className = 'auth-success';
        }
    }

    _setLoading(loading) {
        this.isLoading = loading;
        if (this.submitBtn) {
            this.submitBtn.disabled = loading;
            this.submitBtn.textContent = loading ? 'Изменение...' : 'Изменить пароль';
        }
    }

    _closeModal() {
        if (this.onCancel) this.onCancel();
    }

    destroy() {
        // Restore the title that was on screen before we opened.
        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}