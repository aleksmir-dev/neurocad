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
    }

    setAuth(auth) {
        this.auth = auth;
        if (this.menu) {
            this.menu.setAuth(auth);
        }
    }

    render() {
        if (!this.logo || !this.title || !this.menu) {
            return '<header class="core-engine-lib-base-header">Загрузка...</header>';
        }

        const menuHtml = this.menu.render();

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
            </header>
        `;
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
    }
}