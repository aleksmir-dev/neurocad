// app/core/engine/lib/module/module.js

/**
 * Module component.
 * Renders a ready page config received from the backend.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 */
export class Module {
    constructor(container, props = {}) {
        console.log('[Module] Constructor called');
        console.log('[Module] props:', props);

        this.container = container;
        this.props = props;

        // The backend has already assembled everything:
        // default_page + extend. So props already contains
        // the complete page config.
        this.pageConfig = props;
        this.isLoading = false;
        this.error = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Start async init
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Module] _init() START');
        try {
            // Load CSS
            await this._loadCSS();

            // Check auth if required
            if (this.pageConfig.auth_required) {
                await this._checkAuth();
            }

            // Load module data if there is an API URL
            if (this.pageConfig.apiUrl) {
                await this._loadData();
            }

            // Render the page
            await this.render();

            this._initialized = true;
            console.log('[Module] _init() COMPLETE');
        } catch (error) {
            console.error('[Module] Init error:', error);
            this._initialized = false;
            // Show error
            this._showError(error.message || 'Module load error');
        }
    }

    async _loadCSS() {
        console.log('[Module] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/module/module.css');
        }
    }

    async _checkAuth() {
        console.log('[Module] _checkAuth()');
        const auth = window.coreEngine?.auth;
        if (!auth) {
            console.warn('[Module] Auth not found');
            return;
        }

        // Wait for Auth init
        if (auth._initPromise) {
            await auth._initPromise;
        }

        if (!auth.isAuth()) {
            console.log('[Module] Auth required');
            this.error = 'Для доступа к этому модулю необходимо войти';
            if (typeof auth.showLogin === 'function') {
                auth.showLogin();
            }
            throw new Error('Auth required');
        }
    }

    async _loadData() {
        console.log('[Module] _loadData()');
        this.isLoading = true;
        this.error = null;

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(this.pageConfig.apiUrl);

            if (data.success && data.data) {
                // Merge server data into page config
                this.pageConfig = { ...this.pageConfig, ...data.data };
                console.log('[Module] Module data loaded');
            }
        } catch (error) {
            console.error('[Module] Data load error:', error);
            this.error = error.message;
        } finally {
            this.isLoading = false;
        }
    }

    async render() {
        console.log('[Module] render() called');
        console.log('[Module] pageConfig:', this.pageConfig);

        // If there is an error — show it
        if (this.error) {
            this._showError(this.error);
            return;
        }

        // If loading
        if (this.isLoading) {
            this.container.innerHTML = `
                <div class="core-engine-lib-module-loading">
                    <div class="core-engine-lib-module-loading-spinner"></div>
                    <p>Загрузка модуля...</p>
                </div>
            `;
            return;
        }

        const renderer = window.coreEngine?.renderer;
        if (!renderer) {
            console.error('[Module] Renderer not found');
            this.container.innerHTML = `
                <div class="core-engine-lib-module-error">
                    <div class="core-engine-lib-module-error-icon">❌</div>
                    <h2>Ошибка</h2>
                    <p>Renderer не найден</p>
                </div>
            `;
            return;
        }

        try {
            // Wait for the page render
            await renderer.renderToContainer(this.pageConfig, this.container);
            console.log('[Module] Page rendered');
        } catch (error) {
            console.error('[Module] Render error:', error);
            this._showError('Ошибка рендеринга страницы');
        }
    }

    _showError(message) {
        console.log('[Module] _showError()', message);
        this.container.innerHTML = `
            <div class="core-engine-lib-module-error">
                <div class="core-engine-lib-module-error-icon">⚠️</div>
                <h2 class="core-engine-lib-module-error-title">Ошибка загрузки модуля</h2>
                <p class="core-engine-lib-module-error-text">${this._escapeHtml(message)}</p>
                <button class="core-engine-lib-module-error-retry" data-js="module-retry">Повторить</button>
            </div>
        `;

        const retryBtn = this.container.querySelector('[data-js="module-retry"]');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this._init();
            });
        }
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update module config.
     */
    update(props) {
        console.log('[Module] update()', props);
        this.pageConfig = { ...this.pageConfig, ...props };
        this.render();
    }

    /**
     * Reload the module.
     */
    async reload() {
        console.log('[Module] reload()');
        if (this.pageConfig.apiUrl) {
            await this._loadData();
        }
        await this.render();
    }

    /**
     * Whether the component is initialized.
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Wait for init to complete.
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[Module] destroy()');
        if (this.container) {
            this.container.innerHTML = '';
        }
        this._initialized = false;
        this._initPromise = null;
    }
}