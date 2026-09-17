// app/core/engine/lib/base/base.js

/**
 * Базовый компонент — каркас приложения
 * Рендерит структуру страницы и управляет отображением блоков
 */
export class Base {
    constructor(container, props = {}) {
        console.log('[Base] Конструктор вызван');
        this.container = container;
        this.props = props;

        this.demo = props.demo || false;
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
        this.demoInstance = null;
        this.savedContent = null;
        this.redirectUrl = null;
        this.childComponents = [];

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Флаг: идет процесс аутентификации (блокирует renderContent)
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
            await this._loadModules();
            this._initialized = true;
            console.log('[Base] _init() COMPLETE');
        } catch (error) {
            console.error('[Base] Ошибка инициализации:', error);
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
                { BaseDemo },
                { createModal }
            ] = await Promise.all([
                import(`./header.js?v=${version}`),
                import(`./auth/auth.js?v=${version}`),
                import(`./demo.js?v=${version}`),
                import(`./modal/index.js?v=${version}`)
            ]);

            this.modules.Header = Header;
            this.modules.BaseAuth = BaseAuth;
            this.modules.BaseDemo = BaseDemo;
            this.modules.createModal = createModal;

            this.header = new Header({
                logoText: this.props.logoText || '⚡ Ассистент',
                title: this.props.title || null,
                menu: this.props.menu || null,
                auth: null
            });

            await this.header.init();
            this.render();
            await this._initAuth();
        } catch (error) {
            console.error('[Base] Ошибка загрузки модулей:', error);
            throw error;
        }
    }

    async _initAuth() {
        console.log('[Base] _initAuth()');
        const { BaseAuth, BaseDemo } = this.modules;

        if (this.showChat) {
            await this._initChat();
        }

        this.auth = new BaseAuth();

        if (window.coreEngine) {
            window.coreEngine.auth = this.auth;
        }

        if (this.header) {
            this.header.setAuth(this.auth);
        }

        // ===== Обработка изменения авторизации =====
        document.addEventListener('auth:changed', (e) => {
            const { user, isAuthenticated } = e.detail;
            console.log('[Base] auth:changed', { user, isAuthenticated });

            this._updateAuthUI(user, isAuthenticated);
            if (this.header) {
                this.header.setUser(isAuthenticated ? user : null);
            }

            if (isAuthenticated) {
                // Разблокируем renderContent после успешного логина
                this._isAuthenticating = false;
                this.renderContent();
            }
            if (isAuthenticated && this.authRequired) {
                this.onAuthSuccess();
            }
        });

        // ===== Обработка неавторизованного доступа (401) =====
        document.addEventListener('auth:unauthorized', () => {
            console.log('[Base] auth:unauthorized — блокируем renderContent');
            // Блокируем renderContent, чтобы Nav/Cards не рендерились поверх формы входа
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

        if (this.demo) {
            this.demoInstance = new BaseDemo(this);
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
            console.error('[Base] Ошибка загрузки чата:', error);
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
            console.log('[Base] Идет аутентификация, пропускаем renderContent');
            return;
        }

        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) {
            console.error('[Base] center не найден');
            return;
        }

        const renderer = window.coreEngine?.renderer;
        if (!renderer) {
            console.error('[Base] renderer не найден');
            center.innerHTML = '';
            return;
        }

        console.log('[Base] components:', this.components);
        console.log('[Base] content:', this.content);

        // ===== ШАГ 1: рендерим компоненты в скрытый staging,
        // чтобы их живой DOM не был уничтожен при сборке финального HTML =====
        const staging = document.createElement('div');
        staging.style.display = 'none';
        document.body.appendChild(staging);

        // Уничтожаем предыдущие экземпляры при повторном рендере
        if (this.childComponents && this.childComponents.length) {
            for (const inst of this.childComponents) {
                try {
                    if (inst && typeof inst.destroy === 'function') inst.destroy();
                } catch (e) {
                    console.warn('[Base] Ошибка destroy дочернего компонента:', e);
                }
            }
        }
        this.childComponents = [];

        const componentElements = {};

        if (this.components && this.components.length > 0) {
            for (const comp of this.components) {
                const alias = comp.alias || comp.component;
                console.log('[Base] Рендеринг компонента:', alias);
                try {
                    const element = await renderer.renderComponent(comp, staging);
                    if (element) {
                        componentElements[alias] = element;

                        // Если renderer положил инстанс в __instance — сохраняем
                        if (element.__instance) {
                            this.childComponents.push(element.__instance);
                        }

                        console.log(`[Base] Компонент ${alias} отрендерен`);
                    } else {
                        console.warn('[Base] Компонент не отрендерен:', alias);
                    }
                } catch (error) {
                    console.error('[Base] Ошибка рендеринга компонента:', error);
                }
            }
        }

        // ===== ШАГ 2: собираем финальный DOM, вставляя ЖИВЫЕ элементы вместо {{alias}} =====
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

                // Ищем все текстовые узлы, содержащие {{...}}
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
                                console.log(`[Base] Вставка живого элемента для {{${alias}}}`);
                                parent.insertBefore(el, refNode);
                                delete componentElements[alias];
                            } else {
                                console.warn(`[Base] Маркер {{${alias}}} не найден`);
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

        // ===== ШАГ 3: компоненты без маркера — добавляем в конец center =====
        for (const [alias, element] of Object.entries(componentElements)) {
            if (element) {
                console.log('[Base] Добавление неиспользованного компонента в DOM:', alias);
                center.appendChild(element);
            }
        }

        staging.remove();

        console.log('[Base] renderContent() завершен');
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

    openModal(type, title, message, options = {}) {
        const modal = this.modules.createModal(type);
        if (!modal) {
            console.warn(`[Base] Неизвестный тип модалки: ${type}`);
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
                console.warn(`[Base] Неизвестный тип модалки: ${type}`);
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
        if (this.childComponents && this.childComponents.length) {
            for (const inst of this.childComponents) {
                try {
                    if (inst && typeof inst.destroy === 'function') inst.destroy();
                } catch (e) {
                    console.warn('[Base] Ошибка destroy дочернего компонента:', e);
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
        if (this.demoInstance) {
            if (typeof this.demoInstance.destroy === 'function') {
                this.demoInstance.destroy();
            }
            this.demoInstance = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}