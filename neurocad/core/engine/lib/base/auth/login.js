// app/core/engine/lib/base/auth/login.js

export class BaseAuthLogin {
    constructor(options = {}) {
        console.log('[BaseAuthLogin] Конструктор вызван');
        this.options = options;
        this.onSuccess = options.onSuccess || null;
        this.onSwitchToRegister = options.onSwitchToRegister || null;
        this.onSwitchToRestore = options.onSwitchToRestore || null;
        this.element = null;
        this.captcha = null;
        this.Captcha = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Загружаем CSS
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/login.css');
        }

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuthLogin] _init() START');
        try {
            await this._loadCaptcha();
            this._initialized = true;
            console.log('[BaseAuthLogin] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthLogin] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    async render() {
        console.log('[BaseAuthLogin] render() начат');
        
        // Ждем инициализацию
        if (this._initPromise) {
            await this._initPromise;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-login';
        wrapper.innerHTML = `
            <div class="auth-modal-body">
                <div class="auth-error" data-js="login-error" style="display:none;"></div>
                <form class="auth-form" data-js="login-form">
                    <div class="auth-group">
                        <label class="auth-label">Логин</label>
                        <input type="text" class="auth-input" data-js="login-username" placeholder="Введите логин" autofocus>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Пароль</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="login-password" placeholder="Введите пароль">
                            <button type="button" class="auth-toggle-password" data-js="toggle-password">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group" data-js="captcha-container">
                        <!-- Капча будет вставлена сюда -->
                    </div>
                    <button type="submit" class="auth-submit" data-js="login-submit">Войти</button>
                </form>
                <div class="auth-links">
                    <a href="#" data-js="login-register">Регистрация</a>
                    <a href="#" data-js="login-restore">Забыли пароль?</a>
                </div>
            </div>
        `;
        this.element = wrapper;

        console.log('[BaseAuthLogin] после рендера, вызываю _renderCaptcha()');
        this._renderCaptcha();
        console.log('[BaseAuthLogin] render() завершён, captcha:', this.captcha);

        return wrapper;
    }

    async _loadCaptcha() {
        console.log('[BaseAuthLogin] _loadCaptcha() вызван');
        try {
            const module = await import('./captcha.js');
            this.Captcha = module.BaseAuthCaptcha;
            console.log('[BaseAuthLogin] captcha.js загружен, this.Captcha:', !!this.Captcha);
        } catch (error) {
            console.error('[BaseAuthLogin] Error loading captcha:', error);
            throw error;
        }
    }

    _renderCaptcha() {
        console.log('[BaseAuthLogin] _renderCaptcha() вызван');
        const container = this.element?.querySelector('[data-js="captcha-container"]');
        console.log('[BaseAuthLogin] container:', container);
        console.log('[BaseAuthLogin] this.Captcha:', !!this.Captcha);

        if (!container) {
            console.warn('[BaseAuthLogin] Контейнер для капчи не найден');
            return;
        }
        if (!this.Captcha) {
            console.warn('[BaseAuthLogin] this.Captcha не загружен');
            return;
        }

        this.captcha = new this.Captcha({
            onRefresh: () => {
                console.log('[BaseAuthLogin] Капча обновлена');
            }
        });
        console.log('[BaseAuthLogin] Экземпляр капчи создан:', !!this.captcha);

        const captchaElement = this.captcha.render();
        console.log('[BaseAuthLogin] captchaElement:', captchaElement);
        container.appendChild(captchaElement);
        this.captcha.bindEvents(container);
        console.log('[BaseAuthLogin] Капча добавлена в DOM');
    }

    bindEvents(container) {
        console.log('[BaseAuthLogin] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        const form = root.querySelector('[data-js="login-form"]');
        const errorEl = root.querySelector('[data-js="login-error"]');
        const usernameInput = root.querySelector('[data-js="login-username"]');
        const passwordInput = root.querySelector('[data-js="login-password"]');
        const submitBtn = root.querySelector('[data-js="login-submit"]');
        const toggleBtn = root.querySelector('[data-js="toggle-password"]');
        const registerLink = root.querySelector('[data-js="login-register"]');
        const restoreLink = root.querySelector('[data-js="login-restore"]');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSubmit(usernameInput, passwordInput, errorEl, submitBtn);
            });
        }

        if (toggleBtn && passwordInput) {
            toggleBtn.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;
                toggleBtn.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        if (registerLink) {
            registerLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.onSwitchToRegister) this.onSwitchToRegister();
            });
        }

        if (restoreLink) {
            restoreLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.onSwitchToRestore) this.onSwitchToRestore();
            });
        }

        if (usernameInput) {
            usernameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (passwordInput) passwordInput.focus();
                }
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (form) form.dispatchEvent(new Event('submit'));
                }
            });
        }

        if (this.captcha && typeof this.captcha.bindEvents === 'function') {
            this.captcha.bindEvents(root);
        }
    }

    async _handleSubmit(usernameInput, passwordInput, errorEl, submitBtn) {
        console.log('[BaseAuthLogin] _handleSubmit()');
        const login = usernameInput?.value.trim() || '';
        const password = passwordInput?.value || '';

        if (!login || !password) {
            if (errorEl) {
                errorEl.textContent = 'Заполните все поля';
                errorEl.style.display = 'block';
            }
            return;
        }

        if (this.captcha) {
            const captchaResult = this.captcha.validate();
            if (!captchaResult.valid) {
                if (errorEl) {
                    errorEl.textContent = captchaResult.message || 'Неверный ответ капчи';
                    errorEl.style.display = 'block';
                }
                if (typeof this.captcha.refresh === 'function') {
                    this.captcha.refresh();
                }
                return;
            }
        }

        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';
        }

        try {
            const response = await fetch('/core/auth/login', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ login, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка входа');
            }

            if (data.success) {
                const user = data.data?.user || data.data;
                if (this.onSuccess) {
                    this.onSuccess(user);
                }
            } else {
                throw new Error(data.message || 'Неверный логин или пароль');
            }

        } catch (error) {
            console.error('[BaseAuthLogin] Ошибка входа:', error);
            if (errorEl) {
                errorEl.textContent = error.message || 'Неверный логин или пароль';
                errorEl.style.display = 'block';
            }
            if (this.captcha && typeof this.captcha.refresh === 'function') {
                this.captcha.refresh();
            }
        }

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Войти';
        }
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
        console.log('[BaseAuthLogin] destroy()');
        if (this.captcha && typeof this.captcha.destroy === 'function') {
            this.captcha.destroy();
            this.captcha = null;
        }
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}