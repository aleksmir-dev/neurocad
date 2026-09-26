// app/core/engine/lib/base/auth/profile.js

/**
 * BaseAuthProfile — user profile page.
 *
 * Loads user data (if not passed in options), renders a form,
 * saves changes via PUT /core/auth/profile.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Caption: saves the current header/tab title on open and restores it
 * on destroy, so navigating to the profile does not permanently
 * overwrite the title of the page the user came from.
 */
export class BaseAuthProfile {
    constructor(options = {}) {
        console.log('[BaseAuthProfile] Constructor called');
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

        // Init state
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        // Start async init
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuthProfile] _init() START');
        try {
            // Load profile data from the server if not provided
            if (!this.user) {
                await this._loadUserData();
            }
            this._initialized = true;
            console.log('[BaseAuthProfile] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthProfile] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadUserData() {
        console.log('[BaseAuthProfile] _loadUserData()');
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson('/core/auth/profile');

            if (data.success && data.data) {
                this.user = data.data.user || data.data;
                console.log('[BaseAuthProfile] User data loaded');
            }
        } catch (error) {
            console.error('[BaseAuthProfile] User data load error:', error);
        }
    }

    _loadCSS() {
        console.log('[BaseAuthProfile] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/profile.css');
        }
    }

    render() {
        console.log('[BaseAuthProfile] render()');

        // Save current title, set our own.
        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Профиль', 'Профиль');
        }

        // Escape values for safety
        const login = this._escapeHtml(this.user?.login || '');
        const name = this._escapeHtml(this.user?.name || '');
        const email = this._escapeHtml(this.user?.email || '');
        const isSuperadmin = this.user?.is_superadmin || false;
        const createdAt = this.user?.created_at ? new Date(this.user.created_at).toLocaleDateString() : '—';
        const statusText = isSuperadmin ? 'Администратор' : 'Пользователь';

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-profile';
        wrapper.innerHTML = `
            <div class="auth-modal-body">
                <div class="auth-error" data-js="profile-error" style="display:none;"></div>
                <div class="auth-success" data-js="profile-success" style="display:none;"></div>
                <form class="auth-form" data-js="profile-form">
                    <div class="auth-group">
                        <label class="auth-label">Логин</label>
                        <input type="text" class="auth-input" data-js="profile-login" value="${login}" disabled>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Имя</label>
                        <input type="text" class="auth-input" data-js="profile-name" value="${name}" placeholder="Ваше имя">
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Email</label>
                        <input type="email" class="auth-input" data-js="profile-email" value="${email}" placeholder="your@email.com">
                    </div>
                    <div class="auth-group auth-info">
                        <span>Статус: ${statusText}</span>
                        <br>
                        <span>Зарегистрирован: ${createdAt}</span>
                    </div>
                    <button type="submit" class="auth-submit" data-js="profile-submit">Сохранить</button>
                </form>
                <div class="auth-links" style="justify-content: center;">
                    <a href="#" data-js="profile-password">Изменить пароль</a>
                </div>
            </div>
        `;
        this.element = wrapper;
        return wrapper;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    bindEvents(container) {
        console.log('[BaseAuthProfile] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        this.form = root.querySelector('[data-js="profile-form"]');
        this.errorEl = root.querySelector('[data-js="profile-error"]');
        this.successEl = root.querySelector('[data-js="profile-success"]');
        this.loginInput = root.querySelector('[data-js="profile-login"]');
        this.nameInput = root.querySelector('[data-js="profile-name"]');
        this.emailInput = root.querySelector('[data-js="profile-email"]');
        this.submitBtn = root.querySelector('[data-js="profile-submit"]');
        this.passwordLink = root.querySelector('[data-js="profile-password"]');

        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSubmit();
            });
        }

        if (this.passwordLink) {
            this.passwordLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.onCancel) this.onCancel();
                document.dispatchEvent(new CustomEvent('auth:show-password'));
            });
        }

        if (this.nameInput) {
            this.nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.emailInput) this.emailInput.focus();
                }
            });
        }

        if (this.emailInput) {
            this.emailInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._handleSubmit();
                }
            });
        }
    }

    async _handleSubmit() {
        console.log('[BaseAuthProfile] _handleSubmit()');
        const name = this.nameInput?.value?.trim() || '';
        const email = this.emailInput?.value?.trim() || '';

        // Check if anything changed
        const currentName = this.user?.name || '';
        const currentEmail = this.user?.email || '';

        if (name === currentName && email === currentEmail) {
            this._showError('Нет изменений для сохранения');
            return;
        }

        this._setLoading(true);
        this._hideError();
        this._hideSuccess();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson('/core/auth/profile', {
                method: 'PUT',
                body: {
                    name: name || undefined,
                    email: email || undefined,
                },
            });

            if (data.success) {
                const updatedUser = data.data?.user || data.data;
                if (this.onSuccess) {
                    this.onSuccess({ user: updatedUser });
                }
                this._showSuccess(data.message || 'Профиль успешно обновлён');
                if (this.user) {
                    this.user.name = updatedUser.name;
                    this.user.email = updatedUser.email;
                }
                setTimeout(() => {
                    if (this.onCancel) this.onCancel();
                }, 1500);
            } else {
                this._showError(data.message || 'Ошибка обновления профиля');
            }

        } catch (error) {
            console.error('[BaseAuthProfile] Profile update error:', error);
            this._showError(error.message || 'Ошибка обновления профиля');
        }

        this._setLoading(false);
    }

    _showError(message) {
        console.log('[BaseAuthProfile] _showError()', message);
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
        console.log('[BaseAuthProfile] _showSuccess()', message);
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
            this.submitBtn.textContent = loading ? 'Сохранение...' : 'Сохранить';
        }
    }

    _closeModal() {
        if (this.onCancel) this.onCancel();
    }

    /**
     * Whether the component is initialized.
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Wait for init to complete.
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[BaseAuthProfile] destroy()');

        // Restore the title that was on screen before we opened.
        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}