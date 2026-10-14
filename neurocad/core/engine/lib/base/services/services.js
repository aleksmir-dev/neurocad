// neurocad/core/engine/lib/base/services/services.js

/**
 * BaseServices — services landing page.
 *
 * Rendered into area-center by Base.showServices() when the URL
 * carries ?page=services on the current module.
 *
 * Provides navigation to service sections:
 *   - Бэкапы   — SUPERADMIN ONLY (backup config, schedules, history).
 *   - Панель   — SUPERADMIN ONLY (subsystems status). (later)
 *   - Метрики  — SUPERADMIN ONLY (metrics journal). (later)
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
 *
 * <module> is window.coreEngine.baseUrl — e.g. /core/engine/admin.
 *
 * Access
 * ------
 * The whole "Сервисы" page is shown to SUPERADMIN ONLY. The menu
 * item is hidden for regular users; BasePages.showServices() also
 * guards the call. The API endpoints behind each service enforce
 * the same rule server-side.
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
     * Whether the current user may see the services page at all.
     * Superadmin-only.
     */
    _canSee() {
        return this.user?.is_superadmin === true;
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
     * Add an entry here to expose a new service. Access rules are
     * enforced server-side; hiding items here is UX only.
     */
    _services() {
        return [
            {
                id: 'backup',
                title: 'Бэкапы',
                desc: 'Резервное копирование, расписания, история',
            },
            // { id: 'panel', title: 'Панель', desc: '...' },     // later
            // { id: 'metrics', title: 'Метрики', desc: '...' },  // later
        ];
    }

    render() {
        console.log('[BaseServices] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Сервисы', 'Сервисы');
        }

        // If no access — show a simple message.
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

        const itemsHtml = this._services().map(s => `
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