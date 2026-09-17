// app/core/engine/lib/base/auth/restore.js

export class BaseAuthRestore {
    constructor(options = {}) {
        console.log('[BaseAuthRestore] Конструктор вызван');
        this.options = options;
        this.onSuccess = options.onSuccess || null;
        this.onCancel = options.onCancel || null;
        this.onSwitchToLogin = options.onSwitchToLogin || null;
        this.element = null;
        this.isLoading = false;
        this.isConfirmStep = false;
        this.token = null;
        this.captcha = null;
        this.Captcha = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuthRestore] _init() START');
        try {
            await this._loadCaptcha();
            this._initialized = true;
            console.log('[BaseAuthRestore] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthRestore] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    _loadCSS() {
        console.log('[BaseAuthRestore] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/restore.css');
        }
    }

    async render() {
        console.log('[BaseAuthRestore] render() начат');
        
        // Ждем инициализацию
        if (this._initPromise) {
            await this._initPromise;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-restore';
        wrapper.innerHTML = `
            <div class="auth-modal-body">
                <div class="auth-error" data-js="restore-error" style="display:none;"></div>
                <div class="auth-success" data-js="restore-success" style="display:none;"></div>

                <!-- Шаг 1: Запрос восстановления -->
                <form class="auth-form" data-js="restore-request-form">
                    <div class="auth-group">
                        <label class="auth-label">Email или логин</label>
                        <input type="text" class="auth-input" data-js="restore-email" placeholder="Введите email или логин" autofocus>
                    </div>
                    <div class="auth-group" data-js="captcha-container">
                        <!-- Капча будет вставлена сюда -->
                    </div>
                    <button type="submit" class="auth-submit" data-js="restore-request-submit">Отправить</button>
                </form>

                <!-- Шаг 2: Установка нового пароля -->
                <form class="auth-form" data-js="restore-confirm-form" style="display:none;">
                    <div class="auth-group">
                        <label class="auth-label">Новый пароль</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="restore-password" placeholder="Минимум 6 символов">
                            <button type="button" class="auth-toggle-password" data-js="toggle-password">👁️</button>
                        </div>
                    </div>
                    <div class="auth-group">
                        <label class="auth-label">Подтверждение пароля</label>
                        <div class="auth-password-wrapper">
                            <input type="password" class="auth-input" data-js="restore-password-confirm" placeholder="Повторите пароль">
                            <button type="button" class="auth-toggle-password" data-js="toggle-password-confirm">👁️</button>
                        </div>
                    </div>
                    <button type="submit" class="auth-submit" data-js="restore-confirm-submit">Изменить пароль</button>
                </form>

                <div class="auth-links">
                    <a href="#" data-js="restore-login">Вспомнили пароль? Войти</a>
                </div>
            </div>
        `;
        this.element = wrapper;

        this._renderCaptcha();

        console.log('[BaseAuthRestore] render() завершён');
        return wrapper;
    }

    async _loadCaptcha() {
        console.log('[BaseAuthRestore] _loadCaptcha() вызван');
        try {
            const module = await import('./captcha.js');
            this.Captcha = module.BaseAuthCaptcha;
            console.log('[BaseAuthRestore] captcha.js загружен, this.Captcha:', !!this.Captcha);
        } catch (error) {
            console.error('[BaseAuthRestore] Error loading captcha:', error);
            throw error;
        }
    }

    _renderCaptcha() {
        console.log('[BaseAuthRestore] _renderCaptcha() вызван');
        const container = this.element?.querySelector('[data-js="captcha-container"]');
        if (!container || !this.Captcha) return;

        this.captcha = new this.Captcha({
            onRefresh: () => {
                console.log('[BaseAuthRestore] Капча обновлена');
            }
        });
        container.appendChild(this.captcha.render());
        this.captcha.bindEvents(container);
        console.log('[BaseAuthRestore] Капча добавлена в DOM');
    }

    bindEvents(container) {
        console.log('[BaseAuthRestore] bindEvents() вызван');
        const root = container || this.element;
        if (!root) return;

        this.requestForm = root.querySelector('[data-js="restore-request-form"]');
        this.confirmForm = root.querySelector('[data-js="restore-confirm-form"]');
        this.emailInput = root.querySelector('[data-js="restore-email"]');
        this.passwordInput = root.querySelector('[data-js="restore-password"]');
        this.passwordConfirmInput = root.querySelector('[data-js="restore-password-confirm"]');
        this.requestSubmit = root.querySelector('[data-js="restore-request-submit"]');
        this.confirmSubmit = root.querySelector('[data-js="restore-confirm-submit"]');
        this.errorEl = root.querySelector('[data-js="restore-error"]');
        this.successEl = root.querySelector('[data-js="restore-success"]');
        this.loginLink = root.querySelector('[data-js="restore-login"]');
        this.toggleBtn = root.querySelector('[data-js="toggle-password"]');
        this.toggleConfirmBtn = root.querySelector('[data-js="toggle-password-confirm"]');

        if (this.requestForm) {
            this.requestForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleRequest();
            });
        }

        if (this.confirmForm) {
            this.confirmForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleConfirm();
            });
        }

        if (this.loginLink) {
            this.loginLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.onSwitchToLogin) this.onSwitchToLogin();
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

        if (this.emailInput) {
            this.emailInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._handleRequest();
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
                    this._handleConfirm();
                }
            });
        }

        if (this.captcha && typeof this.captcha.bindEvents === 'function') {
            this.captcha.bindEvents(root);
        }

        this._checkTokenInUrl();
    }

    _checkTokenInUrl() {
        console.log('[BaseAuthRestore] _checkTokenInUrl()');
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (token) {
            this.token = token;
            this._switchToConfirmStep();
        }
    }

    _switchToConfirmStep() {
        console.log('[BaseAuthRestore] _switchToConfirmStep()');
        this.isConfirmStep = true;
        if (this.requestForm) this.requestForm.style.display = 'none';
        if (this.confirmForm) {
            this.confirmForm.style.display = 'flex';
            this.confirmForm.classList.add('active');
        }
        if (this.emailInput) this.emailInput.value = '';
        this._hideError();
        this._hideSuccess();

        setTimeout(() => {
            if (this.passwordInput) this.passwordInput.focus();
        }, 100);
    }

    async _handleRequest() {
        console.log('[BaseAuthRestore] _handleRequest()');
        const email = this.emailInput?.value?.trim() || '';

        if (!email) {
            this._showError('Введите email или логин');
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
        this._hideSuccess();

        try {
            const response = await fetch('/core/auth/restore/request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    login_or_email: email
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка восстановления');
            }

            if (data.success) {
                this._showSuccess(data.message || 'Инструкция отправлена на email');
                
                if (data.data && data.data.token) {
                    this.token = data.data.token;
                    setTimeout(() => {
                        this._switchToConfirmStep();
                    }, 2000);
                }
            } else {
                throw new Error(data.message || 'Ошибка восстановления');
            }

        } catch (error) {
            console.error('[BaseAuthRestore] Ошибка запроса восстановления:', error);
            this._showError(error.message || 'Ошибка соединения. Попробуйте позже.');
            if (this.captcha && typeof this.captcha.refresh === 'function') {
                this.captcha.refresh();
            }
        }

        this._setLoading(false);
    }

    async _handleConfirm() {
        console.log('[BaseAuthRestore] _handleConfirm()');
        const password = this.passwordInput?.value || '';
        const passwordConfirm = this.passwordConfirmInput?.value || '';

        if (!password || !passwordConfirm) {
            this._showError('Заполните все поля');
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

        if (!this.token) {
            this._showError('Токен не найден. Запросите восстановление заново.');
            return;
        }

        this._setLoading(true);
        this._hideError();
        this._hideSuccess();

        try {
            const response = await fetch('/core/auth/restore/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    token: this.token,
                    new_password: password,
                    new_password_confirm: passwordConfirm
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка восстановления');
            }

            if (data.success) {
                if (this.onSuccess) {
                    this.onSuccess();
                }
                this._showSuccess(data.message || 'Пароль успешно изменён');
                setTimeout(() => {
                    if (this.onSwitchToLogin) this.onSwitchToLogin();
                }, 2000);
            } else {
                throw new Error(data.message || 'Ошибка восстановления');
            }

        } catch (error) {
            console.error('[BaseAuthRestore] Ошибка подтверждения восстановления:', error);
            this._showError(error.message || 'Ошибка восстановления. Попробуйте позже.');
        }

        this._setLoading(false);
    }

    _showError(message) {
        console.log('[BaseAuthRestore] _showError()', message);
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
        console.log('[BaseAuthRestore] _showSuccess()', message);
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
        if (this.requestSubmit) {
            this.requestSubmit.disabled = loading;
            this.requestSubmit.textContent = loading ? 'Отправка...' : 'Отправить';
        }
        if (this.confirmSubmit) {
            this.confirmSubmit.disabled = loading;
            this.confirmSubmit.textContent = loading ? 'Изменение...' : 'Изменить пароль';
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
        console.log('[BaseAuthRestore] destroy()');
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