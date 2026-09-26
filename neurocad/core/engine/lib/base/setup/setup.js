// neurocad/core/engine/lib/base/setup/setup.js

/**
 * BaseSetup — setup landing page.
 *
 * Rendered into area-center by Base.showSetup('main').
 * Provides navigation to setup sections (currently: LLM).
 *
 * Props:
 *   - section        {string}   — 'main' (always 'main' for this component)
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved; sets the caption
 *   - restoreCaption {Function} — (saved) => void; restores the caption
 *   - onNavigate     {Function} — (section) => void, switches to another section
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
        this.onNavigate = options.onNavigate || null;

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

    render() {
        console.log('[BaseSetup] render()');

        // Save current title, set our own.
        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Настройки', 'Настройки');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-setup';
        wrapper.innerHTML = `
            <div class="setup-body">
                <header class="setup-header">
                    <p class="setup-subtitle">Управление параметрами приложения</p>
                </header>

                <nav class="setup-menu">
                    <button type="button" class="setup-menu-item" data-action="llm">
                        <span class="setup-menu-item-body">
                            <span class="setup-menu-item-title">Настройки LLM</span>
                            <span class="setup-menu-item-desc">API-ключи, модели, лимиты провайдеров</span>
                        </span>
                        <span class="setup-menu-item-arrow">→</span>
                    </button>
                </nav>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    bindEvents(container) {
        console.log('[BaseSetup] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        const llmBtn = root.querySelector('[data-action="llm"]');
        if (llmBtn) {
            llmBtn.addEventListener('click', () => {
                if (typeof this.onNavigate === 'function') {
                    this.onNavigate('llm');
                }
            });
        }
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