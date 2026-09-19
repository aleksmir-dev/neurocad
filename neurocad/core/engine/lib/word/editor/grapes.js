// app/core/engine/lib/word/editor/grapes.js

/**
 * GrapesLoader — load and init GrapesJS.
 *
 * Tasks:
 *   1. Load GrapesJS CSS/JS from /static/libs/grapesjs-0.21.13/.
 *   2. Load OUR CSS files (editor UI) — one <link> each.
 *      All are loaded AFTER grapes.min.css so they override.
 *   3. Load grapesjs-blocks-basic plugin.
 *   4. Inside canvas (GrapesJS iframe) load canvas.css — block styles,
 *      so buttons/cards/grids look the same as on the site.
 *      Without it, iframe has no our classes, and buttons look "naked".
 *   5. Build config and call grapesjs.init().
 *   6. After init — reset inline styles on blocks set by GrapesJS.
 *   7. Register 'link' component type with traits (href, target) —
 *      so links can be set on buttons and other elements.
 *
 * No editor logic here — only "bootstrap and run".
 * Everything DOM-related is done by WidgetsBuilder.
 */
export class GrapesLoader {
    /**
     * @param {Editor} editor — parent Editor (we take DOM refs and API from it)
     * @param {Object} options — { styleManagerSectors: Array }
     */
    constructor(editor, options = {}) {
        this.editor = editor;
        this.options = options;

        this.baseUrl = '/static/libs/grapesjs-0.21.13';

        // Our CSS for editor UI (main document)
        this.cssBase = '/static/core/engine/lib/word/editor/css';
        this.cssFiles = [
            'layout.css',
            'toolbar.css',
            'blocks.css',
            'styles.css',
            'assets.css',
            'resizer.css',
            'theme.css',
            'responsive.css',
        ];

        // Our CSS for iframe canvas (block styles only)
        this.canvasCss = '/static/core/engine/lib/word/editor/css/canvas.css';
    }

    // ============================================
    // LOAD RESOURCES
    // ============================================

    /**
     * Load all external resources.
     *
     * ORDER:
     *   1. grapes.min.css  — base GrapesJS styles.
     *   2. Our CSS (one <link> each) — AFTER, so they override.
     *   3. grapes.min.js
     *   4. grapesjs-blocks-basic.min.js
     */
    async load() {
        console.log('[GrapesLoader] Loading resources');

        const version = window.coreEngine?.static_version || Date.now();

        // 1. GrapesJS CSS — base
        this._loadStylesheet(`${this.baseUrl}/grapes.min.css`);

        // 2. Our CSS — each file as a separate <link>.
        //    They come after grapes.min.css, so they win by cascade
        //    at equal specificity (no !important).
        this.cssFiles.forEach((file) => {
            const href = `${this.cssBase}/${file}?v=${version}`;
            this._loadStylesheet(href);
        });

        // 3. GrapesJS JS
        await this._loadScript(`${this.baseUrl}/grapes.min.js`);

        // 4. grapesjs-blocks-basic JS
        await this._loadScript(`${this.baseUrl}/grapesjs-blocks-basic.min.js`);
    }

    _loadStylesheet(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Script failed to load: ${src}`));
            document.head.appendChild(script);
        });
    }

    // ============================================
    // GRAPESJS INIT
    // ============================================

    /**
     * Build config and call grapesjs.init().
     * Returns GrapesJS instance.
     */
    init() {
        console.log('[GrapesLoader] init()');

        if (typeof grapesjs === 'undefined') {
            throw new Error('[GrapesLoader] grapesjs not loaded');
        }

        const e = this.editor;

        if (!e.canvasEl) {
            throw new Error('[GrapesLoader] e.canvasEl not found — WidgetsBuilder.build() not called?');
        }

        const version = window.coreEngine?.static_version || Date.now();

        // ===== Plugins =====
        const plugins = [];
        if (typeof grapesjsBlocksBasic !== 'undefined') {
            plugins.push(grapesjsBlocksBasic);
        }

        // ===== Config =====
        const config = {
            container: e.canvasEl,
            height: '100%',
            width: 'auto',
            fromElement: false,
            storageManager: false,

            plugins: plugins,
            pluginsOpts: {
                'grapesjs-blocks-basic': {
                    flexGrid: true,
                    category: 'Сетки',
                },
            },

            // Disable built-in panels — we have our own toolbar
            panels: { defaults: [] },

            // Devices
            deviceManager: {
                devices: [
                    { name: 'desktop', width: '' },
                    { name: 'tablet', width: '768px', widthMedia: '992px' },
                    { name: 'mobile', width: '375px', widthMedia: '480px' },
                ],
            },

            // Asset manager — bound to our API
            assetManager: {
                assets: [],
                upload: e._assetsUploadApi,
                uploadName: 'files',
                autoAdd: 1,
                dropzone: 1,
                openAssetsOnDrop: 1,
                headers: {},
                uploadText: 'Перетащите файлы сюда или нажмите для выбора',
                addBtnText: 'Добавить по ссылке',
                modalTitle: 'Медиатека',
            },

            // ===== CSS inside canvas iframe =====
            // These files are attached to the <head> of the iframe
            // where blocks are rendered. Without them, .core-btn,
            // .core-card etc. don't work — buttons look "naked".
            canvas: {
                styles: [
                    `${this.canvasCss}?v=${version}`,
                ],
            },
        };

        // ===== BlockManager =====
        if (e.blocksEl) {
            config.blockManager = {
                appendTo: e.blocksEl,
            };
        }

        // ===== TraitManager (right panel, above styles) =====
        if (e.traitsEl) {
            config.traitManager = {
                appendTo: e.traitsEl,
            };
        }

        // ===== StyleManager (right panel, below traits) =====
        if (e.stylesEl) {
            config.styleManager = {
                appendTo: e.stylesEl,
                sectors: this.options.styleManagerSectors || [],
            };
        }

        // ===== Init =====
        const instance = grapesjs.init(config);
        console.log('[GrapesLoader] GrapesJS initialized');

        // ===== Register 'link' type with traits (href, target) =====
        // By default GrapesJS provides traits for <a>, but does not
        // always show href in TraitManager. We override it explicitly.
        this._registerLinkType(instance);

        // ===== Reset block inline styles =====
        // GrapesJS in some versions sets inline width: 50%; float: left;
        // on .gjs-block at render. Inline style overrides CSS from editor.css,
        // so we remove it via JS — then our grid rules apply.
        this._resetBlockInlineStyles(instance);

        return instance;
    }

    /**
     * Register 'link' component type with traits (href, title, target).
     * Allows setting links on buttons and other elements.
     */
    _registerLinkType(instance) {
        try {
            instance.DomComponents.addType('link', {
                isComponent: (el) => el.tagName === 'A',
                model: {
                    defaults: {
                        traits: [
                            'id',
                            'title',
                            {
                                type: 'text',
                                name: 'href',
                                label: 'Ссылка (href)',
                                placeholder: '/page/... или https://...',
                            },
                            {
                                type: 'select',
                                name: 'target',
                                label: 'Открывать',
                                options: [
                                    { id: '', name: 'В текущем окне' },
                                    { id: '_blank', name: 'В новой вкладке' },
                                ],
                            },
                        ],
                    },
                },
            });
            console.log('[GrapesLoader] Link type registered');
        } catch (err) {
            console.warn('[GrapesLoader] Failed to register link type:', err);
        }
    }

    /**
     * Remove inline width/float/margin from block cards
     * that GrapesJS sets at render.
     */
    _resetBlockInlineStyles(instance) {
        try {
            const blocks = instance.BlockManager.getAll();
            blocks.forEach((block) => {
                const el = block.get('el');
                if (el && el.style) {
                    el.style.width = '';
                    el.style.maxWidth = '';
                    el.style.minWidth = '';
                    el.style.float = '';
                    el.style.margin = '';
                    el.style.flexBasis = '';
                }
            });
            console.log('[GrapesLoader] Block inline styles reset');
        } catch (e) {
            console.warn('[GrapesLoader] Failed to reset block inline styles:', e);
        }
    }
}