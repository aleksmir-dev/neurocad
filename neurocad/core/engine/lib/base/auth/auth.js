// app/core/engine/lib/base/auth/auth.js

/**
 * BaseAuth — core auth state manager.
 *
 * Holds the current user, exposes auth pages (login / register /
 * restore / password / profile), and listens to auth events:
 *
 *   auth:login         → set user, save session, emit auth:changed
 *   auth:logout        → run the full logout flow (with confirm)
 *   auth:update        → update user, save session, emit auth:changed
 *   auth:unauthorized  → clear user, clear session, emit auth:changed,
 *                        show login form
 *   auth:show-password → open password-change page
 *
 * The `auth:unauthorized` event is emitted by fetchJson on 401
 * (see base/auth/api.js) — this is how session expiry propagates
 * through the app without every module knowing about auth.
 *
 * Caption: Base passes setCaption / restoreCaption down to every auth
 * form via _renderForm() options, so that forms can change the header /
 * tab title while they are on screen and restore it when destroyed.
 *
 * Logout vs 401
 * -------------
 * logout() — user-initiated. It first calls Base.teardownAreas(), which
 * may prompt the user via Word.confirmClose() if the editor has
 * unsaved changes. If the user cancels — logout is aborted: no server
 * call, session stays alive, editor stays open.
 *
 * 401 (auth:unauthorized) — session is already dead on the server.
 * We cannot save anything, so we tear down the active page directly
 * (no dialog) and show the login form.
 */
export class BaseAuth {
    constructor(props = {}) {
        console.log('[BaseAuth] Constructor called');
        this.props = props;

        this.user = null;
        this.isAuthenticated = false;
        this.container = null;

        // Caption helpers — set by Base in _initAuth().
        this.setCaption = null;
        this.restoreCaption = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Start async init
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
            console.error('[BaseAuth] Init error:', error);
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
                console.log('[BaseAuth] Session restored from sessionStorage');
            } else {
                console.log('[BaseAuth] No session in sessionStorage');
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

        // auth:logout — run the full logout flow (with confirm dialog
        // for unsaved changes). logout() is async, so we don't await
        // it here — the flow handles itself.
        document.addEventListener('auth:logout', () => {
            this.logout();
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

    /**
     * Forced teardown of the active area-center page — no confirm.
     *
     * Used by 401 only. The session is already dead on the server,
     * so there is nothing to save.
     *
     * Calls Base's low-level destroy helpers directly — NOT
     * teardownAreas(), which would prompt via confirmClose().
     */
    _forceTearDownAreas() {
        const base = window.coreEngine?.base;
        if (!base) return;

        try {
            if (typeof base._destroyAreaInstance === 'function') {
                base._destroyAreaInstance();
            }
        } catch (e) {
            console.warn('[BaseAuth] _destroyAreaInstance error:', e);
        }

        try {
            if (typeof base._clearSideAreas === 'function') {
                base._clearSideAreas();
            }
        } catch (e) {
            console.warn('[BaseAuth] _clearSideAreas error:', e);
        }
    }

    /**
     * Local cleanup after a successful logout (server call already done
     * or not needed). Does NOT touch area-center / side panels — that
     * has already been done by teardownAreas() before this point.
     */
    _handleLogoutLocal() {
        console.log('[BaseAuth] _handleLogoutLocal()');
        this.user = null;
        this.isAuthenticated = false;
        this._clearSession();
        this._clearContainer();
        this._emit('auth:changed', { user: null, isAuthenticated: false });
    }

    /**
     * 401 — session expired. Forced teardown, no dialog (cannot save
     * anyway), then show login form.
     */
    _handleUnauthorized() {
        console.log('[BaseAuth] _handleUnauthorized()');

        // Forced teardown — no confirm dialog. Session is dead.
        this._forceTearDownAreas();

        this.user = null;
        this.isAuthenticated = false;
        this._clearSession();
        this._emit('auth:changed', { user: null, isAuthenticated: false });

        // Show the login form
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

    // ===== Correct selector =====
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

    /**
     * Render an auth form into area-center.
     *
     * Before rendering, ask Base to tear down the previous page.
     * Base's teardownAreas() is async — if the previous page is the
     * Word editor with unsaved changes, it will prompt the user via
     * Word.confirmClose(). If the user cancels — we abort and do NOT
     * render the new form.
     *
     * @returns {Promise<Object|null>} — form instance, or null if the
     *                                   user cancelled the previous
     *                                   page's close.
     */
    async _renderForm(component, options = {}) {
        console.log('[BaseAuth] _renderForm()');
        const container = this._getContainer();

        if (!container) {
            console.error('[BaseAuth] area-center container not found');
            return null;
        }

        // Ask Base to tear down the previous area-center page and
        // clear area-left / area-right. This may show the "save before
        // close?" dialog if the previous page is the Word editor with
        // unsaved changes — if the user cancels, we abort.
        const base = window.coreEngine?.base;
        if (base && typeof base.teardownAreas === 'function') {
            try {
                const proceed = await base.teardownAreas();
                if (!proceed) {
                    console.log('[BaseAuth] _renderForm cancelled by user');
                    return null;
                }
            } catch (e) {
                console.warn('[BaseAuth] teardownAreas error:', e);
            }
        }

        // Pass caption helpers down to the form. Forms use them to
        // swap the header/tab title while on screen and restore it
        // when destroyed.
        options.setCaption = this.setCaption;
        options.restoreCaption = this.restoreCaption;

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
            console.error('[BaseAuth] login.js load error:', err);
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
            console.error('[BaseAuth] register.js load error:', err);
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
            console.error('[BaseAuth] restore.js load error:', err);
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
            console.error('[BaseAuth] password.js load error:', err);
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
            console.error('[BaseAuth] profile.js load error:', err);
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

    /**
     * User-initiated logout.
     *
     * 1. Ask Base to tear down the active page (async). If the editor
     *    has unsaved changes — the user is prompted via confirmClose().
     *    If the user cancels — abort: no server call, session stays
     *    alive, editor stays open.
     * 2. POST /core/auth/logout to kill the server-side session.
     * 3. Local cleanup: clear user, clear session, emit auth:changed.
     * 4. Reload the page (so the app boots fresh on the login form).
     */
    async logout() {
        console.log('[BaseAuth] logout()');

        // First — ask about unsaved changes and tear down the active
        // page. If the user cancels — abort without hitting the server.
        const base = window.coreEngine?.base;
        if (base && typeof base.teardownAreas === 'function') {
            try {
                const proceed = await base.teardownAreas();
                if (!proceed) {
                    console.log('[BaseAuth] Logout cancelled by user');
                    return;   // abort — no server call, session stays
                }
            } catch (e) {
                console.warn('[BaseAuth] teardownAreas error:', e);
            }
        }

        // Now it's safe to kill the session.
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson('/core/auth/logout', {
                method: 'POST',
                skipAuthRedirect: true,   // logging out is not an auth failure
            });
        } catch (error) {
            console.error('[BaseAuth] Logout error:', error);
        }

        this._handleLogoutLocal();

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
        this.setCaption = null;
        this.restoreCaption = null;
        this._initialized = false;
        this._initPromise = null;
    }
}