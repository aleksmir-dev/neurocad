// neurocad/core/engine/lib/base/setup/setup.js

/**
 * BaseSetup — setup landing page.
 *
 * Rendered into area-center by Base.showSetup('main').
 * Provides navigation to setup sections (currently: LLM).
 *
 * Props:
 *   - section    {string}   — 'main' (always 'main' for this component)
 *   - user       {object}   — current user (from auth)
 *   - onNavigate {Function} — (section) => void, switches to another section
 */
export class BaseSetup {
    constructor(options = {}) {
        console.log('[BaseSetup] Constructor called');

        this.options = options;
        this.section = options.section || 'main';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.element = null;

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

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-setup';
        wrapper.innerHTML = `
            <div class="setup-body">
                <header class="setup-header">
                    <h1 class="setup-title">Настройки</h1>
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
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}