// app/static/core/engine/engine.js

/**
 * Единый класс приложения:
 * - точка входа
 * - фабрика модулей
 * - загрузка конфигов и компонентов
 */
class CoreEngine {
    constructor(moduleName) {
        console.log('[CoreEngine] Конструктор вызван, moduleName:', moduleName);

        this.moduleName = moduleName || 'assistent';
        this.config = null;
        this.container = document.body;
        this.components = {};
        this.loadedConfigs = {};
        this.renderer = null;
        this.binder = null;
        this.static_version = '';

        // ===== Парсинг URL =====
        // /core/engine/aleksmir.ru/page/20260809/182504
        //   parts = ["core", "engine", "aleksmir.ru", "page", "20260809", "182504"]
        //   rest = ["aleksmir.ru", "page", "20260809", "182504"]
        //
        // Правило: сегменты только из цифр → параметры.
        //          Всё до первого числа → pathParts.
        //          Всё после → paramsList.
        const parts = window.location.pathname.split('/').filter(Boolean);
        const rest = parts.slice(2);   // без "core", "engine"

        this.pathParts = [];
        this.paramsList = [];
        let inParams = false;

        for (const part of rest) {
            if (!inParams && /^\d+$/.test(part)) {
                inParams = true;
            }
            if (inParams) {
                this.paramsList.push(part);
            } else {
                this.pathParts.push(part);
            }
        }

        // Если pathParts пустой (запрос к корню /core/engine/) — ставим дефолт
        if (this.pathParts.length === 0) {
            this.pathParts = [this.moduleName];
        }

        // Если один сегмент (модуль) — добавить дубль: X → X/X
        // (потому что модуль хранится как mod/X/X.json)
        if (this.pathParts.length === 1) {
            this.pathParts = [this.pathParts[0], this.pathParts[0]];
        }

        // Полный путь для API: pathParts + paramsList
        this.configPath = [...this.pathParts, ...this.paramsList].join('/');

        // ===== Базовый URL модуля =====
        // /core/engine/aleksmir.ru
        // Используется для построения ссылок на страницы: {baseUrl}/page/{date}/{time}
        this.baseUrl = '/core/engine/' + this.pathParts[0];

        console.log('[CoreEngine] pathParts:', this.pathParts);
        console.log('[CoreEngine] paramsList:', this.paramsList);
        console.log('[CoreEngine] configPath:', this.configPath);
        console.log('[CoreEngine] baseUrl:', this.baseUrl);

        this.authRequired = document.body.dataset.authRequired === 'true';
        this.authRedirect = document.body.dataset.authRedirect || null;

        console.log('[CoreEngine] authRequired:', this.authRequired);
        console.log('[CoreEngine] Вызов init()...');

        this.init();
    }

    async init() {
        console.log('[CoreEngine] init() START');
        try {
            console.log('[CoreEngine] Загрузка Renderer и Binder...');
            await this.loadRendererAndBinder();
            console.log('[CoreEngine] Renderer и Binder загружены');

            console.log('[CoreEngine] Загрузка конфига...');
            await this.loadConfig();
            console.log('[CoreEngine] Конфиг загружен:', this.config);

            if (this.authRequired) {
                console.log('[CoreEngine] Инъекция auth пропсов...');
                this._injectAuthProps(this.config);
            }

            console.log('[CoreEngine] Разрешение рефов...');
            await this.resolveRefs(this.config);
            console.log('[CoreEngine] Рефы разрешены');

            console.log('[CoreEngine] Загрузка компонентов...');
            await this.loadComponents();
            console.log('[CoreEngine] Компоненты загружены:', Object.keys(this.components));

            console.log('[CoreEngine] Запуск рендера...');
            await this.renderer.render(this.config, this.components);
            console.log('[CoreEngine] Рендер завершен');

            console.log('[CoreEngine] Запуск биндинга...');
            this.binder.bindAll(this.config);
            console.log('[CoreEngine] Биндинг завершен');

            console.log('[CoreEngine] init() COMPLETE');
        } catch (error) {
            console.error('[CoreEngine] Ошибка инициализации:', error);
            this.showError();
        }
    }

    _injectAuthProps(config) {
        if (!config) return;

        if (config.component === 'base') {
            config.authRequired = this.authRequired;
            if (this.authRedirect) {
                config.authRedirect = this.authRedirect;
            }
            return;
        }

        if (config.components && Array.isArray(config.components)) {
            for (const component of config.components) {
                if (component.component === 'base') {
                    component.authRequired = this.authRequired;
                    if (this.authRedirect) {
                        component.authRedirect = this.authRedirect;
                    }
                    break;
                }
            }
        }
    }

    async loadRendererAndBinder() {
        console.log('[CoreEngine] loadRendererAndBinder() START');
        const rendererUrl = `/static/core/engine/renderer.js${this.static_version ? '?v=' + this.static_version : ''}`;
        const binderUrl = `/static/core/engine/binder.js${this.static_version ? '?v=' + this.static_version : ''}`;

        console.log('[CoreEngine] Загрузка renderer:', rendererUrl);
        console.log('[CoreEngine] Загрузка binder:', binderUrl);

        try {
            const [{ Renderer }, { Binder }] = await Promise.all([
                import(rendererUrl),
                import(binderUrl)
            ]);

            this.renderer = new Renderer();
            this.binder = new Binder();
            console.log('[CoreEngine] loadRendererAndBinder() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] Ошибка загрузки Renderer/Binder:', error);
            throw error;
        }
    }

    async loadConfig() {
        console.log('[CoreEngine] loadConfig() START');

        // configPath уже вычислен в конструкторе.
        // URL без .json: /core/engine/api/aleksmir.ru/page/20260809/182504
        const url = `/core/engine/api/${this.configPath}`;
        console.log('[CoreEngine] Загрузка конфига:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Не удалось загрузить конфиг: ${url}, статус: ${response.status}`);
            }
            this.config = await response.json();
            console.log('[CoreEngine] loadConfig() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] Ошибка загрузки конфига:', error);
            throw error;
        }
    }

    async resolveRefs(config) {
        if (!config) return;

        if (config.components && Array.isArray(config.components)) {
            for (let i = 0; i < config.components.length; i++) {
                const item = config.components[i];
                if (item.$ref) {
                    console.log('[CoreEngine] Разрешение рефа:', item.$ref);
                    const refConfig = await this.loadRefConfig(item.$ref);
                    config.components[i] = refConfig;
                }
                if (config.components[i] && config.components[i].components) {
                    await this.resolveRefs(config.components[i]);
                }
            }
        }
    }

    async loadRefConfig(refPath) {
        if (this.loadedConfigs[refPath]) {
            console.log('[CoreEngine] Реф уже загружен:', refPath);
            return this.loadedConfigs[refPath];
        }

        const url = `/core/engine/block/${refPath}`;
        console.log('[CoreEngine] Загрузка рефа:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Не удалось загрузить конфиг: ${refPath}, статус: ${response.status}`);
            }
            const config = await response.json();
            this.loadedConfigs[refPath] = config;
            console.log('[CoreEngine] Реф загружен:', refPath);
            return config;
        } catch (error) {
            console.error('[CoreEngine] Ошибка загрузки рефа:', error);
            throw error;
        }
    }

    async loadComponents() {
        console.log('[CoreEngine] loadComponents() START');
        const componentPaths = this.collectComponentPaths(this.config);
        console.log('[CoreEngine] Найдены компоненты для загрузки:', componentPaths);

        if (componentPaths.length === 0) {
            console.warn('[CoreEngine] Нет компонентов для загрузки');
            return;
        }

        const loadPromises = componentPaths.map(({ name }) => {
            return new Promise(async (resolve, reject) => {
                if (this.components[name]) {
                    console.log('[CoreEngine] Компонент уже загружен:', name);
                    resolve();
                    return;
                }

                try {
                    const url = `/static/core/engine/lib/${name}/${name}.js${this.static_version ? '?v=' + this.static_version : ''}`;
                    console.log('[CoreEngine] Загрузка компонента:', name, 'по URL:', url);

                    const module = await import(url);
                    console.log('[CoreEngine] Модуль загружен:', name, module);

                    const ComponentClass = module.default ||
                                           module[`${name.charAt(0).toUpperCase() + name.slice(1)}`] ||
                                           module[name];

                    if (!ComponentClass) {
                        throw new Error(`Класс для компонента ${name} не найден`);
                    }

                    console.log('[CoreEngine] Класс найден:', name, ComponentClass);
                    this.components[name] = ComponentClass;

                    if (!window.coreEngine.components) {
                        window.coreEngine.components = {};
                    }
                    window.coreEngine.components[name] = ComponentClass;

                    resolve();
                } catch (error) {
                    console.error(`[CoreEngine] Ошибка загрузки компонента ${name}:`, error);
                    reject(error);
                }
            });
        });

        try {
            await Promise.all(loadPromises);
            console.log('[CoreEngine] loadComponents() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] loadComponents() ERROR:', error);
            throw error;
        }
    }

    collectComponentPaths(config) {
        const paths = [];
        const visited = new Set();

        const traverse = (item) => {
            if (!item) return;

            if (item.component) {
                const name = item.component;
                if (!visited.has(name)) {
                    visited.add(name);
                    paths.push({ name });
                }
            }

            if (item.components && Array.isArray(item.components)) {
                for (const child of item.components) {
                    traverse(child);
                }
            }
        };

        traverse(config);
        return paths;
    }

    loadCSS(path) {
        const fullUrl = `/static/${path}${this.static_version ? '?v=' + this.static_version : ''}`;

        const existing = document.querySelector(`link[href="${fullUrl}"]`);
        if (existing) {
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = fullUrl;
        document.head.appendChild(link);
    }

    showError() {
        console.log('[CoreEngine] Показ ошибки');
        if (this.container) {
            this.container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:#dc2626;text-align:center;">
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <h2 style="font-size:20px;margin-bottom:8px;">Ошибка загрузки модуля</h2>
                    <p style="color:#64748b;">Не удалось загрузить конфигурацию модуля</p>
                    <p style="color:#94a3b8;font-size:13px;margin-top:8px;">${this.moduleName}</p>
                </div>
            `;
        }
    }
}

// Добавляем лог загрузки файла
console.log('[CoreEngine] Файл engine.js загружен');