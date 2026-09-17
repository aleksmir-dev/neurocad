// app/core/engine/lib/module/module.js

/**
 * Компонент модуля
 * Рендерит готовую страницу, полученную от бэкенда
 */
export class Module {
    constructor(container, props = {}) {
        console.log('[Module] Конструктор вызван');
        console.log('[Module] props:', props);
        
        this.container = container;
        this.props = props;

        // Бэкенд уже собрал всё: default_page + extend
        // Поэтому props уже содержит готовый конфиг страницы
        this.pageConfig = props;
        this.isLoading = false;
        this.error = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Module] _init() START');
        try {
            // Загружаем CSS
            await this._loadCSS();
            
            // Проверяем авторизацию, если требуется
            if (this.pageConfig.auth_required) {
                await this._checkAuth();
            }
            
            // Загружаем данные модуля, если есть API
            if (this.pageConfig.apiUrl) {
                await this._loadData();
            }
            
            // Рендерим страницу
            await this.render();
            
            this._initialized = true;
            console.log('[Module] _init() COMPLETE');
        } catch (error) {
            console.error('[Module] Ошибка инициализации:', error);
            this._initialized = false;
            // Показываем ошибку
            this._showError(error.message || 'Ошибка загрузки модуля');
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
            console.warn('[Module] Auth не найден');
            return;
        }

        // Ждем инициализацию Auth
        if (auth._initPromise) {
            await auth._initPromise;
        }

        if (!auth.isAuth()) {
            console.log('[Module] Требуется авторизация');
            this.error = 'Для доступа к этому модулю необходимо войти';
            if (typeof auth.showLogin === 'function') {
                auth.showLogin();
            }
            throw new Error('Требуется авторизация');
        }
    }

    async _loadData() {
        console.log('[Module] _loadData()');
        this.isLoading = true;
        this.error = null;

        try {
            const response = await fetch(this.pageConfig.apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.data) {
                // Обновляем конфиг страницы данными с сервера
                this.pageConfig = { ...this.pageConfig, ...data.data };
                console.log('[Module] Данные модуля загружены');
            }
        } catch (error) {
            console.error('[Module] Ошибка загрузки данных:', error);
            this.error = error.message;
        } finally {
            this.isLoading = false;
        }
    }

    async render() {
        console.log('[Module] render() вызван');
        console.log('[Module] pageConfig:', this.pageConfig);

        // Если есть ошибка, показываем её
        if (this.error) {
            this._showError(this.error);
            return;
        }

        // Если загрузка
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
            console.error('[Module] Renderer не найден');
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
            // Ждем рендеринг страницы
            await renderer.renderToContainer(this.pageConfig, this.container);
            console.log('[Module] Страница отрендерена');
        } catch (error) {
            console.error('[Module] Ошибка рендеринга:', error);
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
     * Обновить конфиг модуля
     */
    update(props) {
        console.log('[Module] update()', props);
        this.pageConfig = { ...this.pageConfig, ...props };
        this.render();
    }

    /**
     * Перезагрузить модуль
     */
    async reload() {
        console.log('[Module] reload()');
        if (this.pageConfig.apiUrl) {
            await this._loadData();
        }
        await this.render();
    }

    /**
     * Проверяет, инициализирован ли компонент
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Ожидает завершения инициализации
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