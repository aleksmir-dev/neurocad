// app/core/engine/lib/base/header.js

/**
 * Header — top bar of the Base shell.
 *
 * Owns three sub-components:
 *   - Logo  — brand mark on the left
 *   - Title — page/module title in the centre
 *   - Menu  — right-side navigation and user actions
 *
 * Layout (see header.css):
 *   <header class="core-engine-lib-base-header">
 *     <div class="core-engine-lib-base-header-inner">
 *       {logo} {title} {menu} {burger}
 *     </div>
 *   </header>
 *
 * Impersonation bar
 * -----------------
 * When the current session was started through the admin
 * "Войти под пользователем" button, the JWT carries `imp_by`
 * (see core/auth/dependencies.py) and get_current_user() puts
 * it on the user dict as `impersonated_by`. In that case we
 * render a thin yellow bar right below the main header, with
 * the target login and a "Вернуться" button that calls
 * POST /core/auth/impersonate/stop and reloads the page.
 *
 * The bar is rendered from the same render() as the header —
 * no extra sub-component, no extra CSS file: the bar's markup
 * and its styles live in header.html + header.css.
 *
 * Lifecycle:
 *   1. new Header(props)   — stores props, starts loading header.css.
 *   2. await header.init() — loads Logo / Title / Menu modules and
 *                            creates the sub-component instances.
 *   3. header.render()     — returns the header HTML string.
 *   4. header.bindEvents() — attaches one-off event listeners.
 *
 * `props.module`
 * --------------
 * The current module name (e.g. "admin", "editor") is read from the
 * page JSON and forwarded to Logo, so that clicking the brand mark
 * goes to /core/engine/<module>/ rather than to "/". This matters on
 * custom-domain and subdomain deployments, where "/" triggers the
 * owner's home-page redirect. If `module` is missing, Logo falls
 * back to "admin".
 *
 * Re-render on setUser()
 * ----------------------
 * `Base.render()` calls `Header.render()` once, at a point when the
 * authentication session has not necessarily been restored yet: on
 * a cold load, BaseAuth is created AFTER the header is rendered, so
 * `this.user` is still null on the first pass. The impersonation
 * bar — which depends on this.user — is therefore rendered as an
 * empty string and never appears.
 *
 * When BaseAuth later calls `header.setUser(user)`, we must redraw.
 * `setUser()` therefore ends with `_rerender()`, which replaces the
 * current <header> node in the DOM with a freshly rendered version
 * and re-runs bindEvents() for the nodes that were recreated.
 *
 * `_rerender()` is a no-op when the header is not in the DOM yet
 * (e.g. called before Base.render() appended it) — safe to call
 * from setUser() in every case.
 *
 * IMPORTANT — WHEN bindEvents IS CALLED
 * -------------------------------------
 * `Base.render()` rewrites `document.body.innerHTML` and then calls
 * `Header.bindEvents()`. `Base._initAuth()` also calls
 * `Header.bindEvents()` — but it may return early (for ?auth=,
 * ?page=, ?section=), in which case bindEvents() is NOT called.
 *
 * Historically this meant:
 *   - the menu never received its delegated click handler,
 *   - the "Выход" / "Вход" / "Настройки" buttons silently stopped
 *     working on pages that return early from `_initAuth`
 *     (e.g. ?page=profile),
 *   - after any re-render the listener was lost entirely.
 *
 * The fix has two parts:
 *   1. `Menu.bindEvents()` now attaches its listener to `document`,
 *      not to the menu container. A document-bound listener survives
 *      every `Base.render()`.
 *   2. `Header.init()` calls `Menu.bindEvents()` immediately after
 *      creating the Menu instance. This guarantees the listener is
 *      attached even if `Base._initAuth()` returns early and never
 *      calls `Header.bindEvents()`.
 *
 * The `Header._menuEventsBound` flag prevents duplicate attachments
 * for the "click outside closes the mobile menu" handler.
 *
 * The impersonation "Вернуться" button uses the same document-level
 * delegation trick: its click handler is attached once, on document,
 * and matches the button by class. After every Base.render() the
 * button node is fresh, but the listener on document survives.
 */
export class Header {
    constructor(props) {
        this.props = props;
        this.logo = null;
        this.title = null;
        this.menu = null;
        this.user = props.user || null;
        this.auth = props.auth || null;
        this.initialized = false;

        // Guard for the document-level "click outside" listener that
        // closes the mobile menu. Header.bindEvents() may be called
        // more than once (Base._initAuth + Base.render); without
        // this flag every call would add another listener to
        // `document`, leaking memory and firing closeMobile()
        // multiple times per click.
        this._menuEventsBound = false;

        // Guard for the document-level listener that handles the
        // "Вернуться" button in the impersonation bar. Same idea:
        // one listener per Header instance, on document, idempotent.
        this._impersonateEventsBound = false;

        this._loadCSS();
    }

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/header.css');
        }
    }

    async init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        const version = window.coreEngine?.static_version || Date.now();

        const [
            { Logo },
            { Title },
            { Menu }
        ] = await Promise.all([
            import(`./logo.js?v=${version}`),
            import(`./title.js?v=${version}`),
            import(`./menu.js?v=${version}`)
        ]);

        // `module` comes from the page JSON (props.module) and is
        // forwarded to Logo so the brand mark links to
        // /core/engine/<module>/ instead of "/". Logo falls back to
        // "admin" if `module` is missing.
        this.logo = new Logo(this.props.logoText, this.props.module);
        this.title = new Title(this.props.title);
        this.menu = new Menu({
            items: this.props.menu,
            user: this.user,
            auth: this.auth
        });

        // Attach the menu's delegated click listener NOW, not later.
        //
        // Base._initAuth() has early returns for ?auth=, ?page= and
        // ?section= — for those URLs it never reaches the
        // `header.bindEvents()` call at the bottom of the method.
        // If we waited for that call, the menu would be dead on
        // every profile / setup / auth page.
        //
        // Menu.bindEvents() is idempotent (guarded by Menu._bound),
        // so calling it here and again from Header.bindEvents() is
        // safe — the second call is a no-op.
        if (this.menu) {
            this.menu.bindEvents();
        }
    }

    setUser(user) {
        this.user = user;
        if (this.menu) {
            this.menu.setUser(user);
        }

        // Re-render so that user-dependent parts of the header
        // (currently: the impersonation bar) reflect the new value.
        // On a cold load, Base.render() draws the header before
        // BaseAuth has restored the session, so this.user was null
        // at that point; setUser() is called later with the real
        // user and the header must be redrawn to show the bar.
        this._rerender();
    }

    setAuth(auth) {
        this.auth = auth;
        if (this.menu) {
            this.menu.setAuth(auth);
        }
    }

    /**
     * Whether the current session is impersonated.
     *
     * The flag lives on the user object that get_current_user()
     * returns; Base passes it down through Header.setUser().
     * It is not stored anywhere in the DB — it comes from the JWT
     * and lives only for the duration of the session.
     */
    _isImpersonating() {
        return !!(this.user && this.user.impersonated_by);
    }

    render() {
        if (!this.logo || !this.title || !this.menu) {
            return '<header class="core-engine-lib-base-header">Загрузка...</header>';
        }

        const menuHtml = this.menu.render();
        const impersonationHtml = this._renderImpersonationBar();

        return `
            <header class="core-engine-lib-base-header">
                <div class="core-engine-lib-base-header-inner">
                    ${this.logo.render()}
                    ${this.title.render()}
                    <div class="core-engine-lib-base-menu" data-js="menu">
                        ${menuHtml}
                    </div>
                    <button class="core-engine-lib-base-burger" data-js="burger">☰</button>
                </div>
                ${impersonationHtml}
            </header>
        `;
    }

    /**
     * Render the yellow bar shown while impersonating.
     *
     * Returns an empty string in normal sessions, so render() does
     * not have to branch.
     */
    _renderImpersonationBar() {
        if (!this._isImpersonating()) {
            return '';
        }

        const login = (this.user && this.user.login) || '?';

        return `
            <div class="core-engine-lib-base-impersonation-bar" data-js="impersonation-bar">
                <span class="core-engine-lib-base-impersonation-text">
                    Вы вошли под пользователем <b>${this._escape(login)}</b>
                </span>
                <button type="button"
                        class="core-engine-lib-base-impersonation-stop"
                        data-action="impersonate-stop">
                    Вернуться
                </button>
            </div>
        `;
    }

    /**
     * Re-render the header in place, replacing the current <header>
     * node in the DOM with a freshly rendered version. Called from
     * setUser() so that changes to this.user — in particular, going
     * in or out of impersonation — are reflected immediately.
     *
     * The burger button node is recreated by render(); its listener
     * is attached in bindEvents() without an idempotency guard, so
     * calling bindEvents() here re-attaches the burger listener to
     * the fresh node. The document-level listeners (menu outside-click,
     * impersonate-stop) are guarded by _menuEventsBound /
     * _impersonateEventsBound and will not be duplicated.
     *
     * Does nothing if the header is not in the DOM yet (e.g. called
     * before Base.render() appended it) — safe in every case.
     */
    _rerender() {
        const current = document.querySelector('.core-engine-lib-base-header');
        if (!current) return;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.render();
        const fresh = wrapper.firstElementChild;
        if (!fresh) return;

        current.replaceWith(fresh);
        this.bindEvents();
    }

    /**
     * Attach event listeners that do NOT survive a body rewrite.
     *
     * The menu's own delegated listener lives on `document` and is
     * attached in `init()` — it survives every re-render and does
     * not need to be re-attached here.
     *
     * What remains is:
     *   - Title's own listeners (rare; usually none).
     *   - The burger button — `render()` recreates it on every
     *     `Base.render()`, so the listener must be re-attached.
     *   - The "click outside closes the mobile menu" listener — also
     *     needs re-attaching, but ONLY ONCE per Header instance,
     *     because it lives on `document` and `document` does not
     *     get rewritten.
     *   - The impersonation "Вернуться" button — handled the same
     *     way as the menu: one listener on document, matched by
     *     data-action. The button node is fresh after every
     *     Base.render(), but the listener on document survives.
     */
    bindEvents() {
        if (this.title) {
            this.title.bindEvents();
        }

        // Idempotent — Menu.bindEvents() is a no-op after the first
        // successful call. Kept here so that if some future caller
        // removes the call from `init()`, the menu still gets its
        // listener attached somewhere.
        if (this.menu) {
            this.menu.bindEvents();
        }

        // The burger button is recreated by `render()` on every
        // `Base.render()`. Re-attach its listener here. There is no
        // idempotency guard on purpose: the old button node is gone
        // with the old DOM, so the old listener is gone too.
        const burger = document.querySelector('[data-js="burger"]');
        if (burger) {
            burger.addEventListener('click', () => {
                if (this.menu) {
                    this.menu.toggleMobile();
                }
            });
        }

        // "Click outside closes the mobile menu" — one listener per
        // Header instance, on `document`. Guarded because
        // bindEvents() may be called multiple times (init + every
        // Base.render()), and each call would otherwise add another
        // duplicate listener.
        if (!this._menuEventsBound) {
            this._menuEventsBound = true;

            document.addEventListener('click', (e) => {
                if (!this.menu || !this.menu.isOpen) return;

                const menuEl = document.querySelector('[data-js="menu"]');
                const burgerEl = document.querySelector('[data-js="burger"]');

                const isClickInside =
                    menuEl?.contains(e.target) ||
                    burgerEl?.contains(e.target);

                if (!isClickInside) {
                    this.menu.closeMobile();
                }
            });
        }

        // "Вернуться" in the impersonation bar — one listener per
        // Header instance, on document, matched by data-action.
        // The button is recreated on every Base.render(), but the
        // listener lives on document and survives.
        if (!this._impersonateEventsBound) {
            this._impersonateEventsBound = true;

            document.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="impersonate-stop"]');
                if (!btn) return;

                e.preventDefault();
                this._handleStopImpersonate();
            });
        }
    }

    /**
     * Stop the current impersonated session and reload the page.
     *
     * The backend rewrites the HttpOnly `access_token` cookie to
     * a normal admin session and returns { success: true }. We do
     * not see the token here (HttpOnly by design) — we only check
     * the flag and reload so every component re-reads the new
     * session.
     *
     * sessionStorage.clear()
     * ----------------------
     * BaseAuth keeps the current user in sessionStorage. After
     * stopping impersonation the cookie already carries the admin
     * again, but sessionStorage still holds the impersonated user
     * (id, login, is_superadmin), so on the next page load the UI
     * would render a mix: the backend sees the admin, the frontend
     * believes it is still impersonating.
     *
     * Clearing sessionStorage before reloading forces
     * auth._restoreSession() to re-read the session from the (now
     * updated) cookie instead of trusting stale data. Mirrors the
     * same fix in balance.js::_handleImpersonate.
     */
    async _handleStopImpersonate() {
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const res = await fetchJson('/core/auth/impersonate/stop', {
                method: 'POST',
            });

            if (!res || !res.success) {
                console.warn('[Header] impersonate/stop returned failure');
                return;
            }

            // Drop the cached user so auth._restoreSession() re-reads
            // the session from the (now updated) cookie on reload.
            try {
                sessionStorage.clear();
            } catch (e) {
                // sessionStorage may be unavailable in some privacy
                // modes — ignore and rely on the reload alone.
            }

            // Reload so the whole UI re-reads the new session.
            window.location.reload();
        } catch (err) {
            console.error('[Header] impersonate/stop failed:', err);
        }
    }

    /**
     * Escape a string for safe interpolation into HTML.
     * Mirrors the helper used elsewhere in the codebase.
     */
    _escape(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}