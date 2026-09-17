// app/core/engine/lib/base/auth/register.js

export class BaseAuthRegister {
    constructor(options = {}) {
        console.log('[BaseAuthRegister] Конструктор вызван');
        this.options = options;
        this.onSuccess = options.onSuccess || null;
        this.onCancel = options.onCancel || null;
        this.onSwitchToLogin = options.onSwitchToLogin || null;
        this.element = null;
        this.isLoading = false;
        this.captcha = null;
        this.Captcha = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        console.log('[BaseAuthRegister] constructor, onSwitchToLogin:', this.onSwitchToLogin);

        this._loadCSS();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuthRegister] _init() START');
        try {
            await this._loadCaptcha();
            this._initialized = true;
            console.log('[BaseAuthRegister] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthRegister] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    _loadCSS() {
        console.log('[BaseAuthRegister] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/register.css');
        }
    }

    async render() {
        console.log('[BaseAuthRegister] render() начат');
        
        // Ждем инициализацию
        if (this._initPromise) {
            await this._initPromise;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-register';
        wrapper.innerHTML = `
            <div class="auth-modal-body">
                <div class="auth-error" data-js="register-error" style="display:none;"></div>
                <form class="auth-form" data-js="register-form">
                    <div class="auth-group">
                        <label class="auth-label">Логин</label>
                        <input type="text" class="auth-input" data-js="register-login" placeholder="Придумайте логин" autofocus>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Имя</label>
                        <input type="text" class="auth-input" data-js="register-name" placeholder="Ваше имя">
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Email</label>
                        <input type="email" class="auth-input" data-js="register-email" placeholder="your@email.com">
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Пароль</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="register-password" placeholder="Минимум 6 символов">
                            <button type="button" class="auth-toggle-password" data-js="toggle-password">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Подтверждение пароля</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="register-password-confirm" placeholder="Повторите пароль">
                            <button type="button" class="auth-toggle-password" data-js="toggle-password-confirm">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group" data-js="captcha-container">
                        <!-- Капча будет вставлена сюда -->
                    </div>
                    <button type="submit" class="auth-submit" data-js="register-submit">Зарегистрироваться</button>
                </form>
                <div class="auth-links">
                    <a href="#" data-js="register-login-link">Уже есть аккаунт? Войти</a>
                </div>
            </div>
        `;
        this.element = wrapper;

        this._renderCaptcha();

        console.log('[BaseAuthRegister] render() завершён, onSwitchToLogin:', this.onSwitchToLogin);

        return wrapper;
    }

    async _loadCaptcha() {
        console.log('[BaseAuthRegister] _loadCaptcha() вызван');
        try {
            const module = await import('./captcha.js');
            this.Captcha = module.BaseAuthCaptcha;
            console.log('[BaseAuthRegister] captcha.js загружен, this.Captcha:', !!this.Captcha);
        } catch (error) {
            console.error('[BaseAuthRegister] Error loading captcha:', error);
            throw error;
        }
    }

    _renderCaptcha() {
        console.log('[BaseAuthRegister] _renderCaptcha() вызван');
        const container = this.element?.querySelector('[data-js="captcha-container"]');
        if (!container || !this.Captcha) return;

        this.captcha = new this.Captcha({
            onRefresh: () => {
                console.log('[BaseAuthRegister] Капча обновлена');
            }
        });
        container.appendChild(this.captcha.render());
        this.captcha.bindEvents(container);
        console.log('[BaseAuthRegister] Капча добавлена в DOM');
    }

    bindEvents(container) {
        console.log('[BaseAuthRegister] bindEvents() вызван');
        const root = container || this.element;
        if (!root) return;

        console.log('[BaseAuthRegister] bindEvents() вызван');

        this.form = root.querySelector('[data-js="register-form"]');
        this.errorEl = root.querySelector('[data-js="register-error"]');
        this.loginInput = root.querySelector('[data-js="register-login"]');
        this.nameInput = root.querySelector('[data-js="register-name"]');
        this.emailInput = root.querySelector('[data-js="register-email"]');
        this.passwordInput = root.querySelector('[data-js="register-password"]');
        this.passwordConfirmInput = root.querySelector('[data-js="register-password-confirm"]');
        this.submitBtn = root.querySelector('[data-js="register-submit"]');
        this.loginLink = root.querySelector('[data-js="register-login-link"]');
        this.toggleBtn = root.querySelector('[data-js="toggle-password"]');
        this.toggleConfirmBtn = root.querySelector('[data-js="toggle-password-confirm"]');

        console.log('[BaseAuthRegister] loginLink найден:', !!this.loginLink);

        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSubmit();
            });
        }

        if (this.loginLink) {
            this.loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('[BaseAuthRegister] Клик по ссылке "Уже есть аккаунт?"');
                console.log('[BaseAuthRegister] this.onSwitchToLogin:', !!this.onSwitchToLogin);
                if (this.onSwitchToLogin) {
                    console.log('[BaseAuthRegister] Вызываю this.onSwitchToLogin()');
                    this.onSwitchToLogin();
                } else {
                    console.warn('[BaseAuthRegister] this.onSwitchToLogin не определён');
                }
            });
        }

        if (this.toggleBtn && this.passwordInput) {
            this.toggleBtn.addEventListener('click', () => {
                const type = this.passwordInput.type === 'password' ? 'text' : 'password';
                this.passwordInput.type = type;
                this.toggleBtn.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        if (this.toggleConfirmBtn && this.passwordConfirmInput) {
            this.toggleConfirmBtn.addEventListener('click', () => {
                const type = this.passwordConfirmInput.type === 'password' ? 'text' : 'password';
                this.passwordConfirmInput.type = type;
                this.toggleConfirmBtn.textContent = type === 'password' ? '👁️' : '🙈';
            });
        }

        if (this.loginInput) {
            this.loginInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.nameInput) this.nameInput.focus();
                }
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
                    if (this.passwordInput) this.passwordInput.focus();
                }
            });
        }

        if (this.passwordInput) {
            this.passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.passwordConfirmInput) this.passwordConfirmInput.focus();
                }
            });
        }

        if (this.passwordConfirmInput) {
            this.passwordConfirmInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._handleSubmit();
                }
            });
        }

        if (this.captcha && typeof this.captcha.bindEvents === 'function') {
            this.captcha.bindEvents(root);
        }
    }

    async _handleSubmit() {
        console.log('[BaseAuthRegister] _handleSubmit()');
        const login = this.loginInput?.value?.trim() || '';
        const name = this.nameInput?.value?.trim() || '';
        const email = this.emailInput?.value?.trim() || '';
        const password = this.passwordInput?.value || '';
        const passwordConfirm = this.passwordConfirmInput?.value || '';

        if (!login || !password || !passwordConfirm) {
            this._showError('Заполните обязательные поля');
            return;
        }

        if (password !== passwordConfirm) {
            this._showError('Пароли не совпадают');
            return;
        }

        if (password.length < 6) {
            this._showError('Пароль должен содержать минимум 6 символов');
            return;
        }

        if (this.captcha) {
            const captchaResult = this.captcha.validate();
            if (!captchaResult.valid) {
                this._showError(captchaResult.message || 'Неверный ответ капчи');
                if (typeof this.captcha.refresh === 'function') {
                    this.captcha.refresh();
                }
                return;
            }
        }

        this._setLoading(true);
        this._hideError();

        try {
            const response = await fetch('/core/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    login: login,
                    password: password,
                    password_confirm: passwordConfirm,
                    name: name || undefined,
                    email: email || undefined
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка регистрации');
            }

            if (data.success) {
                // После успешной регистрации автоматически входим
                const loginResponse = await fetch('/core/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        login: login,
                        password: password
                    })
                });

                const loginData = await loginResponse.json();

                if (loginResponse.ok && loginData.success) {
                    const user = loginData.data?.user || loginData.data;
                    if (this.onSuccess) {
                        this.onSuccess(user);
                    }
                } else {
                    this._showError('Регистрация прошла, но автоматический вход не удался. Попробуйте войти вручную.');
                    setTimeout(() => {
                        if (this.onSwitchToLogin) this.onSwitchToLogin();
                    }, 2000);
                }
            } else {
                throw new Error(data.message || 'Ошибка регистрации');
            }

        } catch (error) {
            console.error('[BaseAuthRegister] Ошибка регистрации:', error);
            this._showError(error.message || 'Ошибка регистрации');
            if (this.captcha && typeof this.captcha.refresh === 'function') {
                this.captcha.refresh();
            }
        }

        this._setLoading(false);
    }

    _showError(message) {
        console.log('[BaseAuthRegister] _showError()', message);
        if (this.errorEl) {
            this.errorEl.textContent = message;
            this.errorEl.style.display = 'block';
            this.errorEl.className = 'auth-error';
        }
    }

    _hideError() {
        if (this.errorEl) {
            this.errorEl.textContent = '';
            this.errorEl.style.display = 'none';
            this.errorEl.className = 'auth-error';
        }
    }

    _setLoading(loading) {
        this.isLoading = loading;
        if (this.submitBtn) {
            this.submitBtn.disabled = loading;
            this.submitBtn.textContent = loading ? 'Регистрация...' : 'Зарегистрироваться';
        }
    }

    _closeModal() {
        if (this.onCancel) {
            this.onCancel();
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
        console.log('[BaseAuthRegister] destroy()');
        if (this.captcha && typeof this.captcha.destroy === 'function') {
            this.captcha.destroy();
            this.captcha = null;
        }
        this._closeModal();
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}