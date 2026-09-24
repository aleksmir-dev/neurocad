// app/core/engine/lib/base/base.js

/**
 * Base component — application shell.
 * Renders page structure and manages block visibility.
 */
export class Base {
    constructor(container, props = {}) {
        console.log('[Base] Constructor called');
        this.container = container;
        this.props = props;

        this.showChat = props.showChat === true;
        this.authRequired = props.authRequired || false;
        this.authRedirect = props.authRedirect || null;
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

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Flag: authentication in progress (blocks renderContent)
        this._isAuthenticating = false;

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
            // Set page title from props (if provided)
            if (this.props.title) {
                document.title = this.props.title;
            }

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
                { createModal }
            ] = await Promise.all([
                import(`./header.js?v=${version}`),
                import(`./auth/auth.js?v=${version}`),
                import(`./modal/index.js?v=${version}`)
            ]);

            this.modules.Header = Header;
            this.modules.BaseAuth = BaseAuth;
            this.modules.createModal = createModal;

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
            await this._initChat();
        }

        this.auth = new BaseAuth();

        if (window.coreEngine) {
            window.coreEngine.auth = this.auth;
            // Base owns area-center. Register self so auth / menu /
            // other components can render pages into area-center
            // via the shared renderInArea() method.
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
                // Unblock renderContent after successful login
                this._isAuthenticating = false;
                this.renderContent();
            }
            if (isAuthenticated && this.authRequired) {
                this.onAuthSuccess();
            }
        });

        // ===== React to unauthorized access (401) =====
        document.addEventListener('auth:unauthorized', () => {
            console.log('[Base] auth:unauthorized — blocking renderContent');
            // Block renderContent so Nav/Cards don't render over the login form
            this._isAuthenticating = true;
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

        if (this.authRequired) {
            if (!isAuthenticated) {
                this.showAuthPage();
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

    async _initChat() {
        console.log('[Base] _initChat()');
        const version = window.coreEngine?.static_version || Date.now();

        const href = `/static/core/engine/lib/base/chat/chat.css?v=${version}`;
        const existing = document.querySelector(`link[href="${href}"]`);
        if (!existing) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }

        try {
            const module = await import(`./chat/chat.js?v=${version}`);
            this.chat = new module.BaseChat();
            this._updateChatMode();
            this._chatMediaQuery = window.matchMedia('(min-width: 1024px)');
            this._chatMediaQuery.addEventListener('change', () => {
                this._updateChatMode();
            });
        } catch (error) {
            console.error('[Base] Chat load error:', error);
        }
    }

    _updateChatMode() {
        if (!this.chat) return;
        const isDesktop = window.innerWidth >= 1024;
        if (isDesktop && this.showRight && this.showChat) {
            if (this.rightEl) {
                this.chat.attach(this.rightEl);
            }
        } else if (this.showChat) {
            if (this.chat.isSidebarMode) {
                if (this.chat.container && this.chat.container.parentNode) {
                    this.chat.container.remove();
                    document.body.appendChild(this.chat.container);
                }
                this.chat.isSidebarMode = false;
                this.chat.container.classList.remove('sidebar-mode');
                this.chat.container.classList.add('hidden');
                this.chat.container.style.display = 'none';
            }
        }
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

    async renderContent() {
        console.log('[Base] renderContent()');

        if (this._isAuthenticating) {
            console.log('[Base] Auth in progress, skipping renderContent');
            return;
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

        // ===== STEP 1: render components into a hidden staging area,
        // so their live DOM isn't destroyed when we assemble the final HTML =====
        const staging = document.createElement('div');
        staging.style.display = 'none';
        document.body.appendChild(staging);

        // Destroy previous instances on re-render
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

                        // If renderer put the instance into __instance — keep it
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

        // ===== STEP 2: assemble final DOM, inserting LIVE elements instead of {{alias}} =====
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

                // Find all text nodes containing {{...}}
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

        // ===== STEP 3: components without a marker — append at the end of center =====
        for (const [alias, element] of Object.entries(componentElements)) {
            if (element) {
                console.log('[Base] Appending unused component to DOM:', alias);
                center.appendChild(element);
            }
        }

        staging.remove();

        console.log('[Base] renderContent() complete');
    }

    showAuthPage() {
        console.log('[Base] showAuthPage()');
        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) return;

        this.savedContent = center.innerHTML;

        if (this.authRedirect) {
            this.redirectUrl = this.authRedirect;
        } else {
            this.redirectUrl = window.location.pathname;
        }
        sessionStorage.setItem('auth_redirect_url', this.redirectUrl);

        if (this.auth) {
            this.auth.showPage(center);
        }
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
                <div class="core-engine-lib-base-footer-inner">Подвал</div>
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
            this.footerEl.style.display = this.showFooter ? 'block' : 'none';
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
            if (this.auth) this.auth.showProfile();
        }
    }

    /**
     * Render a component into area-center.
     *
     * Used by auth (login/register/profile), setup pages, and any other
     * page that replaces the whole center area with its own content.
     *
     * Destroys the previous areaInstance (if any) before rendering a new one.
     * The instance is tracked in this.areaInstance — separate from
     * childComponents (which come from the config and are destroyed in
     * renderContent()).
     *
     * @param {Function} ComponentClass — component constructor
     * @param {Object} options          — props passed to the constructor
     * @returns {Promise<Object|null>}  — component instance or null on failure
     */
    async renderInArea(ComponentClass, options = {}) {
        console.log('[Base] renderInArea()');

        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) {
            console.error('[Base] area-center not found');
            return null;
        }

        // Destroy previous page instance
        if (this.areaInstance) {
            try {
                if (typeof this.areaInstance.destroy === 'function') {
                    this.areaInstance.destroy();
                }
            } catch (e) {
                console.warn('[Base] areaInstance destroy error:', e);
            }
            this.areaInstance = null;
        }

        center.innerHTML = '';

        let instance;
        try {
            instance = new ComponentClass(options);

            if (instance._initPromise) {
                await instance._initPromise;
            }

            const element = await instance.render();
            center.appendChild(element);

            if (typeof instance.bindEvents === 'function') {
                instance.bindEvents(center);
            }
        } catch (e) {
            console.error('[Base] renderInArea error:', e);
            center.innerHTML = `
                <div style="padding:40px;text-align:center;color:#dc2626;">
                    <div style="font-size:32px;margin-bottom:12px;">❌</div>
                    <div>Не удалось загрузить страницу</div>
                </div>
            `;
            return null;
        }

        this.areaInstance = instance;
        return instance;
    }

    /**
     * Open a setup page in area-center.
     *
     * Available to superadmin only. The guard is checked here (server-side
     * permissions are enforced on the API endpoints).
     *
     * Two sections, two separate components:
     *   - 'main' → setup/setup.js   (BaseSetup)     — setup landing page
     *   - 'llm'  → setup/llm/llm.js (BaseSetupLlm)  — LLM settings page
     *
     * Each component navigates back via onNavigate(section).
     *
     * @param {string} section — 'main' (default) or 'llm'
     */
    async showSetup(section = 'main') {
        console.log('[Base] showSetup()', section);

        const user = this.auth?.getUser?.();
        const isSuperadmin = user?.is_superadmin === true;
        if (!isSuperadmin) {
            console.warn('[Base] showSetup: access denied (not superadmin)');
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();

        let ComponentClass = null;
        try {
            if (section === 'llm') {
                const mod = await import(`./setup/llm/llm.js?v=${version}`);
                ComponentClass = mod.BaseSetupLlm;
            } else {
                const mod = await import(`./setup/setup.js?v=${version}`);
                ComponentClass = mod.BaseSetup;
            }
        } catch (err) {
            console.error('[Base] showSetup import error:', err);
            return;
        }

        if (!ComponentClass) {
            console.error('[Base] showSetup: component class not found for section', section);
            return;
        }

        await this.renderInArea(ComponentClass, {
            section,
            user,
            onNavigate: (nextSection) => this.showSetup(nextSection),
        });
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

    openChat() {
        if (this.chat) {
            const isDesktop = window.innerWidth >= 1024;
            if (isDesktop && this.showRight) {
                if (this.rightEl) {
                    this.rightEl.style.display = 'flex';
                }
                if (this.chat.container) {
                    this.chat.container.style.display = 'flex';
                }
            } else {
                this.chat.open();
            }
        }
    }

    closeChat() {
        if (this.chat) this.chat.close();
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

        // Destroy active area page instance
        if (this.areaInstance) {
            try {
                if (typeof this.areaInstance.destroy === 'function') {
                    this.areaInstance.destroy();
                }
            } catch (e) {
                console.warn('[Base] areaInstance destroy error:', e);
            }
            this.areaInstance = null;
        }

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
        if (this.chat) {
            if (typeof this.chat.destroy === 'function') {
                this.chat.destroy();
            }
            this.chat = null;
        }
        if (this.auth) {
            if (typeof this.auth.destroy === 'function') {
                this.auth.destroy();
            }
            this.auth = null;
        }
        if (this._chatMediaQuery) {
            this._chatMediaQuery.removeEventListener('change', this._updateChatMode);
            this._chatMediaQuery = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}