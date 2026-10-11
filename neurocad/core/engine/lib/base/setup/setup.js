// neurocad/core/engine/lib/base/setup/setup.js

/**
 * BaseSetup — setup landing page.
 *
 * Rendered into area-center by Base.showSetup('main') when the URL
 * carries ?page=setup on the current module.
 *
 * Provides navigation to setup sections:
 *   - LLM settings   — SUPERADMIN ONLY (API keys, models, limits).
 *   - Creatives      — every authenticated user (per-user creatives
 *                      and placements).
 *
 * Each section is a REAL <a href="..."> link — not a JS action — so
 * the URL changes, F5 works, the browser Back button works, and a
 * link can be bookmarked or shared. The navigation itself triggers a
 * full page reload; Base._initAuth() reads ?page= and ?section= on
 * load and opens the right component.
 *
 * URL scheme
 * ----------
 * Every section has its own URL on the CURRENT module:
 *
 *   <module>?page=setup                      → this landing page
 *   <module>?page=setup&section=llm          → LLM settings (superadmin)
 *   <module>?page=creatives                  → Creatives page (all users)
 *
 * <module> is window.coreEngine.baseUrl — e.g. /core/engine/admin.
 *
 * Access
 * ------
 * The landing page itself is shown to every authenticated user.
 * Individual items are filtered by role:
 *
 *   - "Настройки LLM" — visible only if user.is_superadmin === true.
 *   - "Креативы"      — visible to every authenticated user.
 *
 * Hiding an item is a UX convenience, NOT a security boundary —
 * the API endpoints behind LLM settings enforce the superadmin
 * check server-side. A user who types ?page=setup&section=llm
 * manually will load the component, but its API calls will be
 * rejected with 403.
 *
 * Props:
 *   - section        {string}   — 'main' (always 'main' for this component)
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved; sets the caption
 *   - restoreCaption {Function} — (saved) => void; restores the caption
 *
 * Caption: BaseSetup saves the current header/tab title on open and
 * restores it on destroy, so navigating into setup does not permanently
 * overwrite the title of the page the user came from.
 *
 * Note: the page has no visible <h1> title — the header already shows
 * "Настройки" (via setCaption), so duplicating it in the body would
 * be redundant.
 */
export class BaseSetup {
    constructor(options = {}) {
        console.log('[BaseSetup] Constructor called');

        this.options = options;
        this.section = options.section || 'main';
        this.user = options.user || null;

        // Caption helpers — provided by Base via options.
        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;

        // Saved caption state — filled in render(), used in destroy().
        this._savedCaption = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseSetup] _init() START');
        try {
            // Nothing to load yet — placeholder for future data
            this._initialized = true;
            console.log('[BaseSetup] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseSetup] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    _loadCSS() {
        console.log('[BaseSetup] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/setup/setup.css');
        }
    }

    /**
     * Whether the current user may see the LLM settings section.
     *
     * Superadmin-only. Used only to filter the menu item; the API
     * endpoints behind LLM settings enforce the same rule server-side.
     */
    _canSeeLlm() {
        return this.user?.is_superadmin === true;
    }

    /**
     * Base URL of the current module, e.g. /core/engine/admin.
     * Used to build section URLs. Kept local so BaseSetup does not
     * depend on Menu or any other component.
     */
    _moduleBaseUrl() {
        return window.coreEngine?.baseUrl
            || (document.body.dataset.module
                ? `/core/engine/${document.body.dataset.module}`
                : '/core/engine/default');
    }

    /**
     * URL of a setup section on the current module.
     *
     *   _sectionUrl('llm')        →  <module>?page=setup&section=llm
     *   _sectionUrl('creatives')  →  <module>?page=creatives
     *
     * The special "creatives" section is NOT a sub-page of setup —
     * it is its own top-level page (?page=creatives). Every other
     * section stays under ?page=setup&section=<name>.
     */
    _sectionUrl(name) {
        const base = this._moduleBaseUrl();

        if (name === 'creatives') {
            return `${base}?page=creatives`;
        }

        return `${base}?page=setup&section=${name}`;
    }

    render() {
        console.log('[BaseSetup] render()');

        // Save current title, set our own.
        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Настройки', 'Настройки');
        }

        // LLM section — superadmin only. Hidden entirely for regular
        // users: the <a> is not rendered into the DOM at all (not
        // just display:none), so it cannot be trivially revealed
        // through DevTools.
        const llmItemHtml = this._canSeeLlm()
            ? `
                <a class="setup-menu-item" href="${this._sectionUrl('llm')}">
                    <span class="setup-menu-item-body">
                        <span class="setup-menu-item-title">Настройки LLM</span>
                        <span class="setup-menu-item-desc">API-ключи, модели, лимиты провайдеров</span>
                    </span>
                    <span class="setup-menu-item-arrow">→</span>
                </a>
            `
            : '';

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-setup';
        wrapper.innerHTML = `
            <div class="setup-body">
                <header class="setup-header">
                    <p class="setup-subtitle">Управление параметрами приложения</p>
                </header>

                <nav class="setup-menu">
                    ${llmItemHtml}

                    <a class="setup-menu-item" href="${this._sectionUrl('creatives')}">
                        <span class="setup-menu-item-body">
                            <span class="setup-menu-item-title">Креативы</span>
                            <span class="setup-menu-item-desc">Рекламные материалы и их размещение на страницах</span>
                        </span>
                        <span class="setup-menu-item-arrow">→</span>
                    </a>
                </nav>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    /**
     * No JS listeners needed.
     *
     * Both items are real <a href> links — the browser follows them
     * natively. No data-action, no onNavigate, no preventDefault.
     * This is deliberate: it keeps the URLs shareable and the Back
     * button working, and it means BaseSetup cannot silently break
     * if its click handlers are lost on a re-render.
     */
    bindEvents(container) {
        console.log('[BaseSetup] bindEvents() — nothing to bind (links only)');
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
        console.log('[BaseSetup] destroy()');

        // Restore the title that was on screen before we opened.
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