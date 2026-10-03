// app/static/core/engine/engine.js

/**
 * CoreEngine — application entry point.
 *
 * Responsibilities:
 *   - parse URL (path + params)
 *   - load renderer / binder / config / components
 *   - expose shared utilities (loadCSS, fetchJson, auth, base)
 *   - orchestrate the initial render + bind
 *
 * engine.js is a GENERIC loader: it does NOT know about any
 * specific module (auth, profile, word, ...). Anything that a
 * module needs from the URL travels down as generic query params
 * in `props.params` — the module itself decides what to do with
 * them.
 */
class CoreEngine {
    constructor(moduleName) {
        console.log('[CoreEngine] Constructor called, moduleName:', moduleName);

        this.moduleName = moduleName || 'assistent';
        this.config = null;
        this.container = document.body;
        this.components = {};
        this.loadedConfigs = {};
        this.renderer = null;
        this.binder = null;
        this.static_version = '';

        // Shared HTTP utility. Loaded in loadApi().
        // Available everywhere as window.coreEngine.fetchJson.
        this.fetchJson = null;

        // ===== URL parsing =====
        // /core/engine/aleksmir.ru/page/20260809/182504
        //   parts = ["core", "engine", "aleksmir.ru", "page", "20260809", "182504"]
        //   rest  = ["aleksmir.ru", "page", "20260809", "182504"]
        //
        // Rule: all-digit segments → params.
        //       everything before the first digit → pathParts.
        //       everything after → paramsList.
        const parts = window.location.pathname.split('/').filter(Boolean);
        const rest = parts.slice(2);   // drop "core", "engine"

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

        // Empty pathParts (request to /core/engine/) — use default.
        if (this.pathParts.length === 0) {
            this.pathParts = [this.moduleName];
        }

        // Single segment (module) — duplicate: X → X/X
        // (module config lives at mod/X/X.json).
        if (this.pathParts.length === 1) {
            this.pathParts = [this.pathParts[0], this.pathParts[0]];
        }

        // ===== Config path =====
        // If the template gave us an explicit config_path via
        // <body data-config-path="...">, use it. Otherwise fall back
        // to the path computed from the URL.
        const configPathOverride = document.body.dataset.configPath || null;
        this.configPath = configPathOverride
            || [...this.pathParts, ...this.paramsList].join('/');

        // ===== Module base URL =====
        // /core/engine/aleksmir.ru
        // Used to build page links: {baseUrl}/page/{date}/{time}
        this.baseUrl = '/core/engine/' + this.pathParts[0];

        console.log('[CoreEngine] pathParts:', this.pathParts);
        console.log('[CoreEngine] paramsList:', this.paramsList);
        console.log('[CoreEngine] configPath:', this.configPath);
        console.log('[CoreEngine] baseUrl:', this.baseUrl);

        this.authRequired = document.body.dataset.authRequired === 'true';
        this.authRedirect = document.body.dataset.authRedirect || null;

        // ===== Query params =====
        // All GET parameters from the URL, forwarded as-is to every
        // component via props.params. engine.js does not interpret
        // them — that is the job of the component that owns the
        // feature (e.g. Base reads `auth` and `section` for the
        // profile). This keeps engine.js free of any module-specific
        // knowledge: adding a new module with its own query params
        // never requires touching this file.
        this.params = Object.fromEntries(
            new URLSearchParams(window.location.search)
        );

        // ===== Nav instance =====
        // If the template set data-nav-id (e.g. on page-view URLs
        // like /core/engine/pages/<nav_id>/...), every component
        // that expects props.nav_id gets it injected below.
        const navIdRaw = document.body.dataset.navId || null;
        this.navId = (navIdRaw != null && navIdRaw !== '')
            ? Number(navIdRaw)
            : null;

        console.log('[CoreEngine] authRequired:', this.authRequired);
        console.log('[CoreEngine] params:', this.params);
        console.log('[CoreEngine] navId:', this.navId);
        console.log('[CoreEngine] Calling init()...');

        this.init();
    }

    async init() {
        console.log('[CoreEngine] init() START');
        try {
            console.log('[CoreEngine] Loading shared API...');
            await this.loadApi();
            console.log('[CoreEngine] Shared API loaded');

            console.log('[CoreEngine] Loading Renderer and Binder...');
            await this.loadRendererAndBinder();
            console.log('[CoreEngine] Renderer and Binder loaded');

            console.log('[CoreEngine] Loading config...');
            await this.loadConfig();
            console.log('[CoreEngine] Config loaded:', this.config);

            const hasParams = Object.keys(this.params).length > 0;
            if (this.authRequired || hasParams || this.navId != null) {
                console.log('[CoreEngine] Injecting runtime props...');
                this._injectRuntimeProps(this.config);
            }

            console.log('[CoreEngine] Resolving refs...');
            await this.resolveRefs(this.config);
            console.log('[CoreEngine] Refs resolved');

            console.log('[CoreEngine] Loading components...');
            await this.loadComponents();
            console.log('[CoreEngine] Components loaded:', Object.keys(this.components));

            console.log('[CoreEngine] Rendering...');
            await this.renderer.render(this.config, this.components);
            console.log('[CoreEngine] Render complete');

            console.log('[CoreEngine] Binding...');
            this.binder.bindAll(this.config);
            console.log('[CoreEngine] Bind complete');

            console.log('[CoreEngine] init() COMPLETE');
        } catch (error) {
            console.error('[CoreEngine] Init error:', error);
            this.showError();
        }
    }

    /**
     * Load the shared HTTP utility (fetchJson) from base/auth/api.js
     * with cache-busting version.
     *
     * After this, `window.coreEngine.fetchJson(url, options)` is
     * available everywhere — no static imports, no per-module
     * dynamic import() calls.
     */
    async loadApi() {
        console.log('[CoreEngine] loadApi() START');
        const url = `/static/core/engine/lib/base/auth/api.js${this.static_version ? '?v=' + this.static_version : ''}`;

        try {
            const mod = await import(url);
            this.fetchJson = mod.fetchJson;
            console.log('[CoreEngine] loadApi() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] loadApi() error:', error);
            throw error;
        }
    }

    /**
     * Inject runtime-only props into the config before rendering.
     *
     * Runtime props fall into two categories:
     *
     *   1. System flags read from <body data-*>:
     *        - authRequired   → Base
     *        - authRedirect   → Base
     *        - nav_id         → Word, Pages, and any other component
     *                            that needs to scope API calls to a nav
     *
     *   2. Generic query params from the URL, forwarded as-is:
     *        - params         → any component that owns a feature
     *                            keyed by a query param (e.g. Base
     *                            reads `auth` and `section`).
     *
     * The WHOLE component tree is walked (root + every nested
     * component in `config.components`), so that child components
     * like `pages` and `word` also receive `nav_id` and `params`.
     * Components that do not understand a given prop simply ignore it.
     */
    _injectRuntimeProps(config) {
        if (!config) return;

        const hasParams = Object.keys(this.params).length > 0;

        const injectInto = (obj) => {
            // Auth flags (system-level)
            obj.authRequired = this.authRequired;
            if (this.authRedirect) {
                obj.authRedirect = this.authRedirect;
            }
            // Nav scoping (system-level)
            if (this.navId != null) {
                obj.nav_id = this.navId;
            }
            // Generic query params — merged into any existing params
            // the component may already carry from its config.
            if (hasParams) {
                obj.params = { ...(obj.params || {}), ...this.params };
            }
        };

        const walk = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.component) {
                injectInto(obj);
            }
            if (Array.isArray(obj.components)) {
                obj.components.forEach(walk);
            }
        };

        walk(config);
    }

    async loadRendererAndBinder() {
        console.log('[CoreEngine] loadRendererAndBinder() START');
        const rendererUrl = `/static/core/engine/renderer.js${this.static_version ? '?v=' + this.static_version : ''}`;
        const binderUrl = `/static/core/engine/binder.js${this.static_version ? '?v=' + this.static_version : ''}`;

        console.log('[CoreEngine] Loading renderer:', rendererUrl);
        console.log('[CoreEngine] Loading binder:', binderUrl);

        try {
            const [{ Renderer }, { Binder }] = await Promise.all([
                import(rendererUrl),
                import(binderUrl)
            ]);

            this.renderer = new Renderer();
            this.binder = new Binder();
            console.log('[CoreEngine] loadRendererAndBinder() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] Renderer/Binder load error:', error);
            throw error;
        }
    }

    async loadConfig() {
        console.log('[CoreEngine] loadConfig() START');

        // configPath comes from data-config-path (if set) or from
        // the URL (computed in the constructor).
        // URL without .json: /core/engine/api/<configPath>
        const url = `/core/engine/api/${this.configPath}`;
        console.log('[CoreEngine] Loading config:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load config: ${url}, status: ${response.status}`);
            }
            this.config = await response.json();
            console.log('[CoreEngine] loadConfig() SUCCESS');
        } catch (error) {
            console.error('[CoreEngine] Config load error:', error);
            throw error;
        }
    }

    async resolveRefs(config) {
        if (!config) return;

        if (config.components && Array.isArray(config.components)) {
            for (let i = 0; i < config.components.length; i++) {
                const item = config.components[i];
                if (item.$ref) {
                    console.log('[CoreEngine] Resolving ref:', item.$ref);
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
            console.log('[CoreEngine] Ref already loaded:', refPath);
            return this.loadedConfigs[refPath];
        }

        const url = `/core/engine/block/${refPath}`;
        console.log('[CoreEngine] Loading ref:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load config: ${refPath}, status: ${response.status}`);
            }
            const config = await response.json();
            this.loadedConfigs[refPath] = config;
            console.log('[CoreEngine] Ref loaded:', refPath);
            return config;
        } catch (error) {
            console.error('[CoreEngine] Ref load error:', error);
            throw error;
        }
    }

    async loadComponents() {
        console.log('[CoreEngine] loadComponents() START');
        const componentPaths = this.collectComponentPaths(this.config);
        console.log('[CoreEngine] Components to load:', componentPaths);

        if (componentPaths.length === 0) {
            console.warn('[CoreEngine] No components to load');
            return;
        }

        const loadPromises = componentPaths.map(({ name }) => {
            return new Promise(async (resolve, reject) => {
                if (this.components[name]) {
                    console.log('[CoreEngine] Component already loaded:', name);
                    resolve();
                    return;
                }

                try {
                    const url = `/static/core/engine/lib/${name}/${name}.js${this.static_version ? '?v=' + this.static_version : ''}`;
                    console.log('[CoreEngine] Loading component:', name, 'from', url);

                    const module = await import(url);
                    console.log('[CoreEngine] Module loaded:', name, module);

                    const ComponentClass = module.default ||
                                           module[`${name.charAt(0).toUpperCase() + name.slice(1)}`] ||
                                           module[name];

                    if (!ComponentClass) {
                        throw new Error(`Class for component ${name} not found`);
                    }

                    console.log('[CoreEngine] Class found:', name, ComponentClass);
                    this.components[name] = ComponentClass;

                    if (!window.coreEngine.components) {
                        window.coreEngine.components = {};
                    }
                    window.coreEngine.components[name] = ComponentClass;

                    resolve();
                } catch (error) {
                    console.error(`[CoreEngine] Component load error ${name}:`, error);
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
        console.log('[CoreEngine] Showing error');
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

// Log file load
console.log('[CoreEngine] engine.js loaded');