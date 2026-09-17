// app/core/engine/lib/base/auth/auth.js

/**
 * Базовый класс авторизации
 * Управляет состоянием пользователя и формами
 */
export class BaseAuth {
    constructor(props = {}) {
        console.log('[BaseAuth] Конструктор вызван');
        this.props = props;

        this.user = null;
        this.isAuthenticated = false;
        this.container = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseAuth] _init() START');
        try {
            this._restoreSession();
            this._bindEvents();
            this._initialized = true;
            console.log('[BaseAuth] _init() COMPLETE, isAuthenticated:', this.isAuthenticated);
        } catch (error) {
            console.error('[BaseAuth] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    _restoreSession() {
        console.log('[BaseAuth] _restoreSession()');
        try {
            const saved = sessionStorage.getItem('auth_user');
            if (saved) {
                this.user = JSON.parse(saved);
                this.isAuthenticated = true;
                console.log('[BaseAuth] Сессия восстановлена из sessionStorage');
            } else {
                console.log('[BaseAuth] Сессия не найдена в sessionStorage');
            }
        } catch (error) {
            console.error('[BaseAuth] Error restoring session:', error);
            this.user = null;
            this.isAuthenticated = false;
        }
    }

    _saveSession() {
        console.log('[BaseAuth] _saveSession()');
        try {
            if (this.user) {
                sessionStorage.setItem('auth_user', JSON.stringify(this.user));
            } else {
                sessionStorage.removeItem('auth_user');
            }
        } catch (error) {
            console.error('[BaseAuth] Error saving session:', error);
        }
    }

    _clearSession() {
        console.log('[BaseAuth] _clearSession()');
        try {
            sessionStorage.removeItem('auth_user');
            sessionStorage.removeItem('auth_redirect_url');
        } catch (error) {
            console.error('[BaseAuth] Error clearing session:', error);
        }
    }

    _bindEvents() {
        console.log('[BaseAuth] _bindEvents()');
        document.addEventListener('auth:login', (e) => {
            this._handleLogin(e.detail);
        });

        document.addEventListener('auth:logout', () => {
            this._handleLogout();
        });

        document.addEventListener('auth:update', (e) => {
            if (e.detail.user) {
                this.user = e.detail.user;
                this._saveSession();
                this._emit('auth:changed', { user: this.user, isAuthenticated: true });
            }
        });

        document.addEventListener('auth:unauthorized', () => {
            this._handleUnauthorized();
        });

        document.addEventListener('auth:show-password', () => {
            this.showPassword();
        });
    }

    _handleLogin(data) {
        console.log('[BaseAuth] _handleLogin()');
        this.user = data.user || data;
        this.isAuthenticated = true;
        this._saveSession();
        this._clearContainer();
        this._emit('auth:changed', { user: this.user, isAuthenticated: true });
    }

    _handleLogout() {
        console.log('[BaseAuth] _handleLogout()');
        this.user = null;
        this.isAuthenticated = false;
        this._clearSession();
        this._clearContainer();
        this._emit('auth:changed', { user: null, isAuthenticated: false });
    }

    _handleUnauthorized() {
        console.log('[BaseAuth] _handleUnauthorized()');
        
        // Сбрасываем состояние авторизации
        this.user = null;
        this.isAuthenticated = false;
        this._clearSession();
        this._emit('auth:changed', { user: null, isAuthenticated: false });
        
        // Показываем форму входа
        this.showLogin();
    }

    _showMessage(message) {
        console.log('[BaseAuth] _showMessage()', message);
        const event = new CustomEvent('core:message', {
            detail: { message, type: 'warning' }
        });
        document.dispatchEvent(event);
    }

    _emit(event, detail) {
        const customEvent = new CustomEvent(event, { detail, bubbles: true });
        document.dispatchEvent(customEvent);
    }

    // ===== ИСПРАВЛЕНО: правильный селектор =====
    _getContainer() {
        if (!this.container) {
            this.container = document.querySelector('.core-engine-lib-base-area-center');
        }
        return this.container;
    }

    _clearContainer() {
        const container = this._getContainer();
        if (container) {
            container.innerHTML = '';
        }
    }

    async _renderForm(component, options = {}) {
        console.log('[BaseAuth] _renderForm()');
        const container = this._getContainer();

        if (!container) {
            console.error('[BaseAuth] Контейнер area-center не найден');
            return null;
        }

        container.innerHTML = '';

        const instance = new component(options);
        
        if (instance._initPromise) {
            await instance._initPromise;
        }
        
        const element = await instance.render();
        container.appendChild(element);
        
        if (typeof instance.bindEvents === 'function') {
            instance.bindEvents(container);
        }

        return instance;
    }

    async showLogin() {
        console.log('[BaseAuth] showLogin()');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseAuthLogin } = await import(`./login.js?v=${version}`);
            await this._renderForm(BaseAuthLogin, {
                onSuccess: (user) => {
                    this._handleLogin(user);
                },
                onSwitchToRegister: () => {
                    this.showRegister();
                },
                onSwitchToRestore: () => {
                    this.showRestore();
                }
            });
        } catch (err) {
            console.error('[BaseAuth] Ошибка загрузки login.js:', err);
        }
    }

    async showRegister() {
        console.log('[BaseAuth] showRegister()');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseAuthRegister } = await import(`./register.js?v=${version}`);
            await this._renderForm(BaseAuthRegister, {
                onSuccess: (user) => {
                    this._handleLogin(user);
                },
                onSwitchToLogin: () => {
                    this.showLogin();
                }
            });
        } catch (err) {
            console.error('[BaseAuth] Ошибка загрузки register.js:', err);
        }
    }

    async showRestore() {
        console.log('[BaseAuth] showRestore()');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseAuthRestore } = await import(`./restore.js?v=${version}`);
            await this._renderForm(BaseAuthRestore, {
                onSuccess: () => {
                    this.showLogin();
                },
                onSwitchToLogin: () => {
                    this.showLogin();
                }
            });
        } catch (err) {
            console.error('[BaseAuth] Ошибка загрузки restore.js:', err);
        }
    }

    async showPassword() {
        console.log('[BaseAuth] showPassword()');
        if (!this.isAuthenticated) {
            this.showLogin();
            return;
        }

        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseAuthPassword } = await import(`./password.js?v=${version}`);
            await this._renderForm(BaseAuthPassword, {
                user: this.user,
                onSuccess: () => {
                    this._clearContainer();
                }
            });
        } catch (err) {
            console.error('[BaseAuth] Ошибка загрузки password.js:', err);
        }
    }

    async showProfile() {
        console.log('[BaseAuth] showProfile()');
        if (!this.isAuthenticated) {
            this.showLogin();
            return;
        }

        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseAuthProfile } = await import(`./profile.js?v=${version}`);
            await this._renderForm(BaseAuthProfile, {
                user: this.user,
                onSuccess: (data) => {
                    this.user = data.user;
                    this._saveSession();
                    this._emit('auth:changed', { user: this.user, isAuthenticated: true });
                    this._clearContainer();
                }
            });
        } catch (err) {
            console.error('[BaseAuth] Ошибка загрузки profile.js:', err);
        }
    }

    showPage(container) {
        console.log('[BaseAuth] showPage()', container);
        this.container = container;
        this.showLogin();
    }

    getUser() {
        return this.user;
    }

    isAuth() {
        return this.isAuthenticated;
    }

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    async logout() {
        console.log('[BaseAuth] logout()');
        try {
            await fetch('/core/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
        } catch (error) {
            console.error('[BaseAuth] Logout error:', error);
        }
        this._handleLogout();
        setTimeout(() => {
            window.location.reload();
        }, 100);
    }

    destroy() {
        console.log('[BaseAuth] destroy()');
        this._clearContainer();
        this.container = null;
        this.user = null;
        this.isAuthenticated = false;
        this._initialized = false;
        this._initPromise = null;
    }
}