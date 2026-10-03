// app/core/engine/lib/base/auth/auth.js

/**
 * BaseAuth — core auth state manager.
 *
 * Holds the current user, exposes AUTH pages (login / register /
 * restore / password), and listens to auth events:
 *
 *   auth:login         → set user, save session, emit auth:changed
 *   auth:logout        → run the full logout flow (with confirm)
 *   auth:update        → update user, save session, emit auth:changed
 *   auth:unauthorized  → clear user, clear session, emit auth:changed,
 *                        show login form
 *   auth:show-password → open password-change page
 *   auth:registered    → post-registration side effects
 *                        (currently: ensure a Balance row exists)
 *
 * `auth` vs `page`
 * ----------------
 * This module is strictly about AUTHENTICATION. It owns the forms
 * that a user needs to prove who they are:
 *
 *   login / register / restore / password
 *
 * It does NOT own the user-facing pages that live inside the app
 * shell once the user is authenticated — those belong to
 * BasePages (base/pages.js):
 *
 *   profile / setup  (+ sub-pages: balance, domain, llm, ...)
 *
 * The URL scheme reflects that split:
 *
 *   <module>?auth=login      → BaseAuth.showLogin()
 *   <module>?auth=register   → BaseAuth.showRegister()
 *   <module>?auth=restore    → BaseAuth.showRestore()
 *   <module>?auth=password   → BaseAuth.showPassword()
 *
 *   <module>?page=profile    → Base.showProfile('main')
 *   <module>?page=setup      → Base.showSetup('main')
 *
 * `?auth=profile` is NOT a thing — profile is not an auth form.
 * See base/pages.js for the app pages.
 *
 * The `auth:unauthorized` event is emitted by fetchJson on 401
 * (see base/auth/api.js) — this is how session expiry propagates
 * through the app without every module knowing about auth.
 *
 * The `auth:registered` event is emitted by the registration form
 * (base/auth/register.js) right after a successful register +
 * auto-login. The form neither knows nor cares who listens. This
 * module listens and performs the side effects that make a new
 * user usable.
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

        // auth:registered — emitted by the registration form
        // (base/auth/register.js) after a successful register +
        // auto-login. Post-registration side effects happen here.
        document.addEventListener('auth:registered', (e) => {
            this._handleRegistered(e.detail);
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
     * Post-registration side effects.
     *
     * The registration form only announces the fact (auth:registered).
     * Everything the new user needs to exist cleanly — currently just
     * a Balance row — is created here.
     *
     * Fire-and-forget: a failure must NOT break the registration flow.
     * The balance row is also created lazily on first use (media
     * upload / page create / LLM call), so a hiccup here is not fatal.
     */
    async _handleRegistered(detail) {
        console.log('[BaseAuth] _handleRegistered()', detail);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) return;

            await fetchJson('/core/engine/lib/balance/ensure', {
                method: 'POST',
                skipAuthRedirect: true,   // best-effort side effect
            });
            console.log('[BaseAuth] balance ensured for new user');
        } catch (err) {
            console.warn('[BaseAuth] balance ensure failed:', err);
        }
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
     * 2. POST /core/auth/login/logout to kill the server-side session.
     *    Note the "/login/logout" path: the backend mounts logout
     *    under the login router (see core/auth/login/route.py —
     *    APIRouter(prefix="/login")), so the effective URL is
     *    /auth/login/logout, not /auth/logout.
     * 3. Local cleanup: clear user, clear session, emit auth:changed.
     * 4. Hard redirect to the module home (window.coreEngine.baseUrl,
     *    e.g. /core/engine/admin) so the engine boots fresh in a
     *    guest state.
     *
     * Why replace() and not reload():
     *   reload() keeps the current URL — e.g. /core/engine/admin/page/5/
     *   20261003/105847. The page would boot in guest mode, but its
     *   URL still points at an article that no longer has an owner:
     *   the area-center stays empty, and any stale caption ("Статья 2")
     *   set by the previous page remains on screen.
     *
     *   location.replace(home) swaps the current history entry for the
     *   module home. The "Back" button then goes to whatever the user
     *   visited before the article, not to the article itself — no way
     *   to return to a page they no longer own.
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
        //
        // NOTE: the URL is /core/auth/login/logout, not /core/auth/logout.
        // The backend mounts logout under the login router (see
        // core/auth/login/route.py: APIRouter(prefix="/login")), so the
        // effective path is /auth/login/logout. Hitting /auth/logout
        // returns 404 and leaves the cookie in place — which then makes
        // the next page load resolve nav_id from the OLD session, and
        // Pages loads the previous user's catalog.
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson('/core/auth/login/logout', {
                method: 'POST',
                skipAuthRedirect: true,   // logging out is not an auth failure
            });
        } catch (error) {
            console.error('[BaseAuth] Logout error:', error);
        }

        this._handleLogoutLocal();

        // Hard redirect to the module home (e.g. /core/engine/admin).
        // replace() — not reload() — so the logged-out page does not
        // stay in history: pressing Back must not return the user to
        // a page they no longer own.
        const home = window.coreEngine?.baseUrl || '/';
        window.location.replace(home);
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