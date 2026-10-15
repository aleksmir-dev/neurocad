// neurocad/core/engine/lib/base/services/services.js

/**
 * BaseServices — services landing page.
 *
 * Rendered into area-center by Base.showServices() when the URL
 * carries ?page=services on the current module.
 *
 * Provides navigation to service sections:
 *   - Бэкапы         — SUPERADMIN ONLY (backup config, schedules, history).
 *   - Инвентаризация — SUPERADMIN OR users with use_botinv = True.
 *   - Панель         — SUPERADMIN ONLY (subsystems status). (later)
 *   - Метрики        — SUPERADMIN ONLY (metrics journal). (later)
 *
 * Each section is a REAL <a href="..."> link — not a JS action — so
 * the URL changes, F5 works, the browser Back button works, and a
 * link can be bookmarked or shared. The navigation triggers a full
 * page reload; Base._initAuth() reads ?page= and ?section= on load
 * and opens the right component.
 *
 * URL scheme
 * ----------
 * Every section has its own URL on the CURRENT module:
 *
 *   <module>?page=services                       → this landing page
 *   <module>?page=services&section=backup        → Backup page
 *   <module>?page=services&section=botinv        → Inventory page
 *
 * <module> is window.coreEngine.baseUrl — e.g. /core/engine/admin.
 *
 * Access
 * ------
 * The landing page is shown to:
 *   - superadmins (they see every service);
 *   - users with use_botinv = True (they see only the inventory).
 *
 * The menu item in the header is hidden for regular users;
 * BasePages.showServices() enforces the same rule and additionally
 * gates section=backup to superadmin-only. The API endpoints behind
 * each service enforce the same rules server-side.
 *
 * The per-item visibility in _services() mirrors the server-side
 * rules — it is a UX convenience, not the source of truth.
 *
 * Styles / FOUC
 * -------------
 * The component's stylesheet (services.css) is loaded in _init(),
 * which is awaited by BaseAreas.renderInArea BEFORE render() runs.
 * That means the <link> is not only appended to <head> — it has
 * actually fired `load` and is in effect. By the time the element
 * reaches area-center and Base._initAuth reveals the body, the
 * page is fully styled.
 */
export class BaseServices {
    constructor(options = {}) {
        console.log('[BaseServices] Constructor called');

        this.options = options;
        this.section = options.section || 'main';
        this.user = options.user || null;

        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;

        this._savedCaption = null;

        this._initialized = false;
        this._initPromise = null;

        // _loadCSS() runs inside _init(), awaited by renderInArea
        // before render() — that is what prevents FOUC.
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseServices] _init() START');
        try {
            await this._loadCSS();
            this._initialized = true;
            console.log('[BaseServices] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseServices] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadCSS() {
        console.log('[BaseServices] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            await window.coreEngine.loadCSS('core/engine/lib/base/services/services.css');
        }
    }

    /**
     * Whether the current user may see the services landing page.
     *
     * True for superadmins and for users with use_botinv = True.
     * A regular user without any flag never reaches this page —
     * BasePages.showServices() stops them earlier, and the header
     * menu does not render the "Сервисы" item for them.
     */
    _canSee() {
        return this.user?.is_superadmin === true
            || this.user?.use_botinv === true;
    }

    /**
     * Whether the current user is a superadmin.
     * Tolerates bool / int / string forms — the backend may send
     * is_superadmin as true / 1 / "1".
     */
    _isSuperadmin() {
        const v = this.user?.is_superadmin;
        return v === true || v === 1 || v === '1';
    }

    /**
     * Whether the current user is allowed to use the inventory.
     */
    _canBotInv() {
        return this.user?.use_botinv === true;
    }

    /**
     * Base URL of the current module, e.g. /core/engine/admin.
     */
    _moduleBaseUrl() {
        return window.coreEngine?.baseUrl
            || (document.body.dataset.module
                ? `/core/engine/${document.body.dataset.module}`
                : '/core/engine/default');
    }

    /**
     * URL of a service section on the current module.
     *
     *   _sectionUrl('backup')  →  <module>?page=services&section=backup
     */
    _sectionUrl(name) {
        const base = this._moduleBaseUrl();
        return `${base}?page=services&section=${name}`;
    }

    /**
     * The list of services shown on this page.
     *
     * Each item is filtered by the current user's flags:
     *   - backup — superadmin only;
     *   - botinv — superadmin or use_botinv = True.
     *
     * The same rules are enforced server-side (BasePages.showServices
     * for the routing, botinv/route.py for the API). Hiding items
     * here is UX only.
     */
    _services() {
        const items = [];

        // Backup — superadmin only.
        if (this._isSuperadmin()) {
            items.push({
                id: 'backup',
                title: 'Бэкапы',
                desc: 'Резервное копирование, расписания, история',
            });
        }

        // Inventory — superadmin or use_botinv = True.
        if (this._isSuperadmin() || this._canBotInv()) {
            items.push({
                id: 'botinv',
                title: 'Инвентаризация',
                desc: 'Ведомости, обход по кабинетам, отчёты',
            });
        }

        return items;
    }

    render() {
        console.log('[BaseServices] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Сервисы', 'Сервисы');
        }

        // No access — deny.
        if (!this._canSee()) {
            const denied = document.createElement('div');
            denied.className = 'core-engine-lib-base-services';
            denied.innerHTML = `
                <div class="services-body">
                    <div class="services-denied">Доступ только для супер-админа</div>
                </div>
            `;
            this.element = denied;
            return denied;
        }

        // Access is granted, but the user has no service items
        // visible — show an empty state instead of a blank menu.
        const services = this._services();
        if (services.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'core-engine-lib-base-services';
            empty.innerHTML = `
                <div class="services-body">
                    <div class="services-denied">Нет доступных сервисов</div>
                </div>
            `;
            this.element = empty;
            return empty;
        }

        const itemsHtml = services.map(s => `
            <a class="services-menu-item" href="${this._sectionUrl(s.id)}">
                <span class="services-menu-item-body">
                    <span class="services-menu-item-title">${s.title}</span>
                    <span class="services-menu-item-desc">${s.desc}</span>
                </span>
                <span class="services-menu-item-arrow">→</span>
            </a>
        `).join('');

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-services';
        wrapper.innerHTML = `
            <div class="services-body">
                <header class="services-header">
                    <p class="services-subtitle">Управление сервисами приложения</p>
                </header>

                <nav class="services-menu">
                    ${itemsHtml}
                </nav>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    /**
     * No JS listeners needed.
     *
     * Every item is a real <a href> link — the browser follows it
     * natively. No data-action, no onNavigate, no preventDefault.
     * This keeps URLs shareable, the Back button working, and means
     * BaseServices cannot silently break if its click handlers are
     * lost on a re-render.
     */
    bindEvents(container) {
        console.log('[BaseServices] bindEvents() — nothing to bind (links only)');
    }

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }

    destroy() {
        console.log('[BaseServices] destroy()');

        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this._initialized = false;
        this._initPromise = null;
    }
}