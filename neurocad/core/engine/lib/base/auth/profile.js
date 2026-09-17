// app/core/engine/lib/base/auth/profile.js

export class BaseAuthProfile {
    constructor(options = {}) {
        console.log('[BaseAuthProfile] Конструктор вызван');
        this.options = options;
        this.user = options.user || null;
        this.onSuccess = options.onSuccess || null;
        this.onCancel = options.onCancel || null;
        this.element = null;
        this.isLoading = false;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuthProfile] _init() START');
        try {
            // Если нужно загрузить данные профиля с сервера
            if (!this.user) {
                await this._loadUserData();
            }
            this._initialized = true;
            console.log('[BaseAuthProfile] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthProfile] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadUserData() {
        console.log('[BaseAuthProfile] _loadUserData()');
        try {
            const response = await fetch('/core/auth/profile', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    this.user = data.data.user || data.data;
                    console.log('[BaseAuthProfile] Данные пользователя загружены');
                }
            }
        } catch (error) {
            console.error('[BaseAuthProfile] Ошибка загрузки данных пользователя:', error);
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
        
        // Экранируем значения для безопасности
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
        console.log('[BaseAuthProfile] bindEvents() вызван');
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

        // Проверяем, есть ли изменения
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
            const response = await fetch('/core/auth/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: name || undefined,
                    email: email || undefined
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка обновления профиля');
            }

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
            console.error('[BaseAuthProfile] Ошибка обновления профиля:', error);
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
     * Проверяет, инициализирован ли компонент
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Ожидает завершения инициализации
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[BaseAuthProfile] destroy()');
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}