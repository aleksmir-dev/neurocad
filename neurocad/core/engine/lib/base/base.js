// app/core/engine/lib/base/base.js

/**
 * Base component — application shell.
 *
 * Responsibilities:
 *   - render the shell (header, area-left/center/right, footer);
 *   - load the auth / modal / caption modules;
 *   - react to auth state changes (auth:changed, auth:unauthorized);
 *   - load and render the page config components into area-center.
 *
 * Delegated concerns (loaded dynamically in _loadModules):
 *   - areas.js        → BaseAreas         (renderInArea / teardownAreas / side areas)
 *   - pages.js        → BasePages         (showProfile / showSetup / showAuthPage)
 *   - chat.js         → BaseChatController (chat panel lifecycle)
 *
 * Public API kept stable for external callers (auth.js, menu.js, …):
 *   base.renderInArea(ComponentClass, options)
 *   base.teardownAreas()
 *   base.showProfile(section)
 *   base.showSetup(section)
 *   base.openChat() / base.closeChat()
 *
 * Runtime params:
 *   Generic query params from the URL are forwarded by CoreEngine
 *   as `props.params`. Base interprets the ones it owns:
 *
 *     - `auth`    — which AUTH form to open (login / register /
 *                   restore / password). Strictly authentication.
 *
 *     - `page`    — which APP page to open (profile / setup).
 *
 *     - `section` — a sub-page inside `page`:
 *                     page=profile → section=balance / domain / ...
 *                     page=setup   → section=llm / ...
 *
 *   `auth` and `page` are independent:
 *
 *     ?auth=login                            → login form
 *     ?auth=register                         → register form
 *     ?page=profile                          → profile landing
 *     ?page=profile&section=balance          → profile → balance
 *     ?page=setup                            → setup landing
 *     ?page=setup&section=llm                → setup → llm
 *
 *   `<body data-auth-form>` / `<body data-page>` /
 *   `<body data-section>` are kept as fallbacks for server-rendered
 *   pages that do not go through the URL query at all.
 *
 * Reload after login
 * ------------------
 * After a successful login (auth:changed with isAuthenticated=true)
 * the page is fully reloaded. This is deliberate:
 *
 *   - `<body data-nav-id>` is rendered by the SERVER, before login.
 *     After logout + login (without a reload) it still carries the
 *     value from the pre-login render — which may be empty, or the
 *     previous user's nav. Word/Pages then build article URLs like
 *     /core/engine/admin/page/<date>/<time> instead of
 *     /core/engine/admin/page/<nav_id>/<date>/<time>, and the page
 *     fails to load.
 *
 *   - A full reload re-renders the shell with the new session, so
 *     data-nav-id (and any other server-driven data-* attribute)
 *     matches the authenticated user.
 *
 * The reload happens ONLY when the URL has no ?auth= left. If the
 * URL still carries ?auth=<form>, it is first stripped and the
 * navigation itself reloads the page — one reload per login.
 */
export class Base {
    constructor(container, props = {}) {
        console.log('[Base] Constructor called');
        this.container = container;
        this.props = props;

        this.showChat = props.showChat === true;
        this.authRequired = props.authRequired || false;
        this.authRedirect = props.authRedirect || null;

        // Query params forwarded by engine.js as-is. Base interprets
        // the ones it owns (auth, page, section). Fallbacks read the
        // <body data-*> attributes set by the server-rendered page.
        this.params = props.params || {};

        // `auth` — which AUTH form to open (login / register /
        // restore / password). Strictly authentication; not profile.
        this.authForm = this.params.auth
            || document.body.dataset.authForm
            || null;

        // `page` — which APP page to open (profile / setup).
        this.page = this.params.page
            || document.body.dataset.page
            || null;

        // `section` — a sub-page inside `page`.
        this.section = this.params.section
            || document.body.dataset.section
            || null;

        this.content = props.content || null;
        this.components = props.components || [];

        this.showHeader = props.showHeader !== false;
        this.showFooter = props.showFooter !== false;
        this.showLeft = props.showLeft !== false;
        this.showRight = props.showRight !== false;

        this.modules = {};
        this.header = null;
        this.headerEl = null;
        this.footerEl = null;
        this.leftEl = null;
        this.rightEl = null;
        this.centerEl = null;
        this.auth = null;
        this.chat = null;
        this.savedContent = null;
        this.redirectUrl = null;
        this.childComponents = [];

        // Active "page" instance rendered into area-center (profile, setup, ...).
        // Not the same as childComponents — those come from the config.
        this.areaInstance = null;

        // Delegated managers — created in _loadModules().
        this.areas = null;
        this.pages = null;
        this.chatController = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Flag: authentication in progress (blocks renderContent)
        this._isAuthenticating = false;

        // Caption helpers (loaded in _loadModules).
        this._setCaption = null;
        this._restoreCaption = null;

        document.body.style.display = 'none';

        this._loadBaseCSS();

        this._initPromise = this._init();
    }

    _loadBaseCSS() {
        console.log('[Base] _loadBaseCSS()');
        const version = window.coreEngine?.static_version || Date.now();

        const cssFiles = [
            'core/engine/lib/base/css/00_variables.css',
            'core/engine/lib/base/css/01_reset.css',
            'core/engine/lib/base/css/02_fonts.css',
            'core/engine/lib/base/css/03_layout.css',
            'core/engine/lib/base/css/04_blocks.css',
            'core/engine/lib/base/css/05_widgets.css',
            'core/engine/lib/base/css/06_buttons.css',
            'core/engine/lib/base/css/07_mobile.css',
        ];

        cssFiles.forEach(path => {
            const href = `/static/${path}?v=${version}`;
            const existing = document.querySelector(`link[href="${href}"]`);
            if (existing) return;

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        });
    }

    async _init() {
        console.log('[Base] _init() START');
        try {
            await this._loadModules();
            this._initialized = true;
            console.log('[Base] _init() COMPLETE');
        } catch (error) {
            console.error('[Base] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadModules() {
        console.log('[Base] _loadModules()');
        const version = window.coreEngine?.static_version || Date.now();

        try {
            const [
                { Header },
                { BaseAuth },
                { createModal },
                { setCaption, restoreCaption },
                { BaseAreas },
                { BasePages },
                { BaseChatController },
            ] = await Promise.all([
                import(`./header.js?v=${version}`),
                import(`./auth/auth.js?v=${version}`),
                import(`./modal/index.js?v=${version}`),
                import(`./caption.js?v=${version}`),
                import(`./areas.js?v=${version}`),
                import(`./pages.js?v=${version}`),
                import(`./chat.js?v=${version}`),
            ]);

            this.modules.Header = Header;
            this.modules.BaseAuth = BaseAuth;
            this.modules.createModal = createModal;
            this.modules.setCaption = setCaption;
            this.modules.restoreCaption = restoreCaption;
            this.modules.BaseAreas = BaseAreas;
            this.modules.BasePages = BasePages;
            this.modules.BaseChatController = BaseChatController;

            this._setCaption = setCaption;
            this._restoreCaption = restoreCaption;

            // Delegated managers.
            this.areas = new BaseAreas(this);
            this.pages = new BasePages(this);
            this.chatController = new BaseChatController(this);

            this.header = new Header({
                logoText: this.props.logoText || '⚡ Нейрокад',
                title: this.props.title || null,
                menu: this.props.menu || null,
                auth: null
            });

            await this.header.init();
            this.render();
            await this._initAuth();
        } catch (error) {
            console.error('[Base] Module load error:', error);
            throw error;
        }
    }

    async _initAuth() {
        console.log('[Base] _initAuth()');
        const { BaseAuth } = this.modules;

        if (this.showChat) {
            await this.chatController.init();
        }

        this.auth = new BaseAuth();

        this.auth.setCaption = this._setCaption;
        this.auth.restoreCaption = this._restoreCaption;

        if (window.coreEngine) {
            window.coreEngine.auth = this.auth;
            window.coreEngine.base = this;
        }

        if (this.header) {
            this.header.setAuth(this.auth);
        }

        // ===== React to auth state changes =====
        document.addEventListener('auth:changed', (e) => {
            const { user, isAuthenticated } = e.detail;
            console.log('[Base] auth:changed', { user, isAuthenticated });

            this._updateAuthUI(user, isAuthenticated);
            if (this.header) {
                this.header.setUser(isAuthenticated ? user : null);
            }

            if (isAuthenticated) {
                // If the URL still carries ?auth=<form> (from a shareable
                // register/login link), strip it and do a full reload to
                // the clean URL. This mirrors a normal link navigation:
                //   - the URL no longer contains the auth marker,
                //   - pressing F5 loads the real page instead of the form.
                try {
                    const u = new URL(window.location.href);
                    if (u.searchParams.has('auth')) {
                        u.searchParams.delete('auth');
                        console.log('[Base] hard redirect to clean URL:', u.toString());
                        window.location.replace(u.toString());
                        return;   // page is reloading
                    }
                } catch (err) {
                    console.warn('[Base] failed to strip ?auth= from URL:', err);
                }

                // No ?auth= left in the URL — but the page still carries
                // the HTML from BEFORE login. In particular,
                // `<body data-nav-id>` was rendered for the guest session
                // and is empty (or holds the previous user's nav after
                // logout+login without a reload). Word/Pages then build
                // article URLs without the /page/<nav_id>/ segment, and
                // the article fails to load.
                //
                // Do a full reload so the server re-renders the shell
                // for the authenticated user: data-nav-id, data-auth-form
                // and every other server-driven data-* attribute will
                // match the new session.
                //
                // This runs once per login. If ?auth= was present, the
                // branch above already returned and the navigation itself
                // reloads the page — no double reload.
                console.log('[Base] auth:changed → full reload for fresh server render');
                window.location.reload();
                return;
            }

            if (isAuthenticated && this.authRequired) {
                this.onAuthSuccess();
            }
        });

        // ===== React to unauthorized access (401) =====
        document.addEventListener('auth:unauthorized', () => {
            console.log('[Base] auth:unauthorized — tearing down the active page');

            this._isAuthenticating = true;

            try {
                this.areas._destroyAreaInstance();
            } catch (e) {
                console.warn('[Base] auth:unauthorized: _destroyAreaInstance error:', e);
            }
            try {
                this.areas._clearSideAreas();
            } catch (e) {
                console.warn('[Base] auth:unauthorized: _clearSideAreas error:', e);
            }
        });

        if (this.auth._initPromise) {
            await this.auth._initPromise;
        }

        const user = this.auth.getUser();
        const isAuthenticated = this.auth.isAuth();

        this._updateAuthUI(user, isAuthenticated);
        if (this.header) {
            this.header.setUser(isAuthenticated ? user : null);
        }

        // ===== 1. Auth form requested =====
        // Comes from ?auth=<form> (via props.params.auth) or from
        // <body data-auth-form>. Only login / register / restore /
        // password — `profile` is not an auth form anymore.
        if (this.authForm) {
            const map = {
                login:    () => this.auth.showLogin(),
                register: () => this.auth.showRegister(),
                restore:  () => this.auth.showRestore(),
                password: () => this.auth.showPassword(),
            };
            const fn = map[this.authForm];
            if (fn) {
                this._isAuthenticating = true;
                fn();
                document.body.style.display = 'flex';
                document.body.style.flexDirection = 'column';
                return;
            }
            console.warn('[Base] Unknown auth form:', this.authForm);
        }

        // ===== 2. App page requested =====
        // Comes from ?page=<name> (via props.params.page) or from
        // <body data-page>. profile / setup. If the user is not
        // authenticated, the login form is shown instead; once the
        // user logs in, the reload (see auth:changed) re-runs the
        // whole init with the session in place.
        if (this.page) {
            if (!isAuthenticated) {
                console.log('[Base] page requested but not authenticated — showing login');
                this._isAuthenticating = true;
                this.auth.showLogin();
                document.body.style.display = 'flex';
                document.body.style.flexDirection = 'column';
                return;
            }

            document.body.style.display = 'flex';
            document.body.style.flexDirection = 'column';
            this._openPage(this.page, this.section);
            return;
        }

        // ===== 3. Default flow =====
        if (this.authRequired) {
            if (!isAuthenticated) {
                this.pages.showAuthPage();
            } else {
                this.renderContent();
            }
        } else {
            this.renderContent();
        }

        if (this.header && typeof this.header.bindEvents === 'function') {
            this.header.bindEvents();
        }

        document.body.style.display = 'flex';
        document.body.style.flexDirection = 'column';
    }

    /**
     * Open an app page (profile / setup) with an optional section.
     *
     * Centralises the page → BasePages mapping so both _initAuth()
     * and the auth:changed handler stay in sync.
     *
     * @param {string} page — 'profile' | 'setup'
     * @param {string|null} section — sub-page inside `page`
     */
    _openPage(page, section = null) {
        console.log('[Base] _openPage()', { page, section });

        if (page === 'profile') {
            this.showProfile(section || 'main');
            return;
        }
        if (page === 'setup') {
            this.showSetup(section || 'main');
            return;
        }
        console.warn('[Base] Unknown page:', page);
    }

    _updateAuthUI(user, isAuthenticated) {
        const actionIcon = document.querySelector('.core-engine-lib-base-action-icon');
        if (actionIcon) {
            if (isAuthenticated && user) {
                actionIcon.textContent = '🔒';
                actionIcon.dataset.action = 'logout';
            } else {
                actionIcon.textContent = '🔓';
                actionIcon.dataset.action = 'auth';
            }
        }

        const usernameEl = document.querySelector('.core-engine-lib-base-username');
        if (usernameEl) {
            if (isAuthenticated && user) {
                usernameEl.textContent = user.name || user.login || 'Пользователь';
            } else {
                usernameEl.textContent = 'Гость';
            }
        }
    }

    // ============================================
    // PUBLIC DELEGATES — area / pages / chat
    // ============================================

    /**
     * Mount a component into area-center. Delegates to BaseAreas.
     * Kept here so external callers (auth.js, menu.js) don't change.
     */
    renderInArea(ComponentClass, options = {}) {
        if (!this.areas) {
            console.warn('[Base] renderInArea called before init');
            return null;
        }
        return this.areas.renderInArea(ComponentClass, options);
    }

    /**
     * Destroy the active area-center page (with confirmClose) and
     * clear side areas. Delegates to BaseAreas.
     */
    teardownAreas() {
        if (!this.areas) return true;
        return this.areas.teardownAreas();
    }

    /**
     * Open a profile page. Delegates to BasePages.
     */
    showProfile(section = 'main') {
        if (!this.pages) {
            console.warn('[Base] showProfile called before init');
            return null;
        }
        return this.pages.showProfile(section);
    }

    /**
     * Open a setup page (superadmin only). Delegates to BasePages.
     */
    showSetup(section = 'main') {
        if (!this.pages) {
            console.warn('[Base] showSetup called before init');
            return null;
        }
        return this.pages.showSetup(section);
    }

    /**
     * Show the auth fallback page. Delegates to BasePages.
     */
    showAuthPage() {
        if (!this.pages) return;
        return this.pages.showAuthPage();
    }

    /**
     * Open the chat panel. Delegates to BaseChatController.
     */
    openChat() {
        if (!this.chatController) return;
        this.chatController.open();
    }

    /**
     * Close the chat panel. Delegates to BaseChatController.
     */
    closeChat() {
        if (!this.chatController) return;
        this.chatController.close();
    }

    // ============================================
    // RENDER CONTENT
    // ============================================

    async renderContent() {
        console.log('[Base] renderContent()');

        if (this._isAuthenticating) {
            console.log('[Base] Auth in progress, skipping renderContent');
            return;
        }

        // Restore side areas visibility (they may have been hidden on 401).
        if (this.areas) {
            this.areas._restoreSideAreas();
        }

        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) {
            console.error('[Base] center not found');
            return;
        }

        const renderer = window.coreEngine?.renderer;
        if (!renderer) {
            console.error('[Base] renderer not found');
            center.innerHTML = '';
            return;
        }

        console.log('[Base] components:', this.components);
        console.log('[Base] content:', this.content);

        // ===== STEP 1: render components into a hidden staging area =====
        const staging = document.createElement('div');
        staging.style.display = 'none';
        document.body.appendChild(staging);

        if (this.childComponents && this.childComponents.length) {
            for (const inst of this.childComponents) {
                try {
                    if (inst && typeof inst.destroy === 'function') inst.destroy();
                } catch (e) {
                    console.warn('[Base] Child component destroy error:', e);
                }
            }
        }
        this.childComponents = [];

        const componentElements = {};

        if (this.components && this.components.length > 0) {
            for (const comp of this.components) {
                const alias = comp.alias || comp.component;
                console.log('[Base] Rendering component:', alias);
                try {
                    const element = await renderer.renderComponent(comp, staging);
                    if (element) {
                        componentElements[alias] = element;

                        if (element.__instance) {
                            this.childComponents.push(element.__instance);
                        }

                        console.log(`[Base] Component ${alias} rendered`);
                    } else {
                        console.warn('[Base] Component not rendered:', alias);
                    }
                } catch (error) {
                    console.error('[Base] Component render error:', error);
                }
            }
        }

        // ===== STEP 2: assemble final DOM =====
        center.innerHTML = '';

        if (this.content) {
            let html = this.content;
            if (typeof this.content === 'function') {
                html = this.content();
            }

            if (typeof html === 'string') {
                const template = document.createElement('template');
                template.innerHTML = html;
                const fragment = template.content;

                const walker = document.createTreeWalker(
                    fragment,
                    NodeFilter.SHOW_TEXT,
                    null
                );

                const textNodes = [];
                let node;
                while ((node = walker.nextNode())) {
                    if (node.nodeValue && node.nodeValue.includes('{{')) {
                        textNodes.push(node);
                    }
                }

                for (const textNode of textNodes) {
                    const parts = textNode.nodeValue.split(/(\{\{[^}]+\}\})/g);
                    if (parts.length === 1) continue;

                    const parent = textNode.parentNode;
                    const refNode = textNode;

                    for (const part of parts) {
                        const m = part.match(/^\{\{([^}]+)\}\}$/);
                        if (m) {
                            const alias = m[1].trim();
                            const el = componentElements[alias];
                            if (el) {
                                console.log(`[Base] Inserting live element for {{${alias}}}`);
                                parent.insertBefore(el, refNode);
                                delete componentElements[alias];
                            } else {
                                console.warn(`[Base] Marker {{${alias}}} not found`);
                                parent.insertBefore(document.createTextNode(part), refNode);
                            }
                        } else if (part) {
                            parent.insertBefore(document.createTextNode(part), refNode);
                        }
                    }

                    parent.removeChild(refNode);
                }

                center.appendChild(fragment);
            }
        }

        // ===== STEP 3: components without a marker =====
        for (const [alias, element] of Object.entries(componentElements)) {
            if (element) {
                console.log('[Base] Appending unused component to DOM:', alias);
                center.appendChild(element);
            }
        }

        staging.remove();

        console.log('[Base] renderContent() complete');
    }

    onAuthSuccess() {
        console.log('[Base] onAuthSuccess()');
        const redirectUrl = sessionStorage.getItem('auth_redirect_url') || this.redirectUrl || '/';
        sessionStorage.removeItem('auth_redirect_url');

        if (redirectUrl && redirectUrl !== window.location.pathname) {
            window.location.href = redirectUrl;
        } else {
            this.renderContent();
            const center = document.querySelector('.core-engine-lib-base-area-center');
            if (center && this.savedContent) {
                center.innerHTML = this.savedContent;
                this.savedContent = null;
            }
        }
    }

    render() {
        console.log('[Base] render()');
        document.body.innerHTML = `
            ${this.header ? this.header.render() : ''}
            <main class="core-engine-lib-base-main">
                <div class="core-engine-lib-base-main-inner">
                    <aside class="core-engine-lib-base-area-left"></aside>
                    <div class="core-engine-lib-base-area-center"></div>
                    <aside class="core-engine-lib-base-area-right"></aside>
                </div>
            </main>
            <footer class="core-engine-lib-base-footer">
                <div class="core-engine-lib-base-footer-inner">© 2026 NeuroCad - Смирнов Алексей Владимирович</div>
            </footer>            
        `;

        this.headerEl = document.querySelector('.core-engine-lib-base-header');
        this.footerEl = document.querySelector('.core-engine-lib-base-footer');
        this.leftEl = document.querySelector('.core-engine-lib-base-area-left');
        this.rightEl = document.querySelector('.core-engine-lib-base-area-right');
        this.centerEl = document.querySelector('.core-engine-lib-base-area-center');

        if (this.headerEl) {
            this.headerEl.style.display = this.showHeader ? 'flex' : 'none';
        }
        if (this.footerEl) {
            this.footerEl.style.display = this.showFooter ? 'flex' : 'none';
        }
        if (this.leftEl) {
            this.leftEl.style.display = this.showLeft ? 'flex' : 'none';
        }
        if (this.rightEl) {
            this.rightEl.style.display = this.showRight ? 'flex' : 'none';
        }

        this._bindAuthEvents();
    }

    _bindAuthEvents() {
        const actionIcon = document.querySelector('.core-engine-lib-base-action-icon');
        if (actionIcon) {
            actionIcon.removeEventListener('click', this._handleAuthClick);
            actionIcon.addEventListener('click', this._handleAuthClick.bind(this));
        }
    }

    _handleAuthClick(e) {
        const action = e.currentTarget.dataset.action;
        if (action === 'auth') {
            if (this.auth) this.auth.showLogin();
        } else if (action === 'logout') {
            if (this.auth) this.auth.logout();
        } else if (action === 'profile') {
            // Profile is an APP page, not an auth form. Open it via
            // the public delegate so it goes through BasePages.
            this.showProfile('main');
        }
    }

    async openModal(type, title, message, options = {}) {
        const modal = this.modules.createModal(type);
        if (!modal) {
            console.warn(`[Base] Unknown modal type: ${type}`);
            return;
        }

        switch (type) {
            case 'message':
                modal.open(message || 'Это тестовое сообщение.', title || 'Уведомление', options.okText || 'Понятно');
                modal.setOnOk(() => modal.destroy());
                break;
            case 'confirm':
                modal.open(message || 'Вы уверены?', title || 'Подтверждение', options.okText || 'Да', options.cancelText || 'Отмена');
                modal.setOnOk(() => modal.destroy());
                modal.setOnCancel(() => modal.destroy());
                break;
            case 'input':
                modal.open(title || 'Ввод', message || 'Введите значение:', options.placeholder || '');
                modal.setOnOk(() => modal.destroy());
                modal.setOnCancel(() => modal.destroy());
                break;
            case 'date':
                modal.open();
                modal.setOnOk(() => modal.destroy());
                break;
            case 'interval':
                modal.open();
                modal.setOnOk(() => modal.destroy());
                break;
            default:
                console.warn(`[Base] Unknown modal type: ${type}`);
        }
    }

    update(props) {
        console.log('[Base] update()');
        this.props = { ...this.props, ...props };
        this.showHeader = this.props.showHeader !== false;
        this.showFooter = this.props.showFooter !== false;
        this.showLeft = this.props.showLeft !== false;
        this.showRight = this.props.showRight !== false;
        this.showChat = this.props.showChat === true;
        this.authRequired = this.props.authRequired || false;
        this.content = this.props.content || null;
        this.components = this.props.components || [];
        this.render();
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

    destroy() {
        console.log('[Base] destroy()');

        // Destroy active area page instance + side areas.
        if (this.areas) {
            try {
                this.areas.destroy();
            } catch (e) {
                console.warn('[Base] areas.destroy error:', e);
            }
        }

        // Destroy chat.
        if (this.chatController) {
            try {
                this.chatController.destroy();
            } catch (e) {
                console.warn('[Base] chatController.destroy error:', e);
            }
        }

        // Destroy child components.
        if (this.childComponents && this.childComponents.length) {
            for (const inst of this.childComponents) {
                try {
                    if (inst && typeof inst.destroy === 'function') inst.destroy();
                } catch (e) {
                    console.warn('[Base] Child component destroy error:', e);
                }
            }
        }
        this.childComponents = [];

        document.body.innerHTML = '';

        if (this.auth) {
            if (typeof this.auth.destroy === 'function') {
                this.auth.destroy();
            }
            this.auth = null;
        }

        this.areas = null;
        this.pages = null;
        this.chatController = null;

        this._initialized = false;
        this._initPromise = null;
    }
}