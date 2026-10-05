// app/core/engine/lib/word/editor/grapes/index.js

/**
 * GrapesLoader — load and init GrapesJS.
 *
 * Split into modules under editor/grapes/:
 *   config.js    — buildConfig (buildContextMenu lives locally)
 *   link.js      — registerLinkType, registerLinkCommand
 *   page-link.js — registerPageLinkTrait
 *   scope.js     — makeScopeClassHandler
 *   empty.js     — bindEmptyPCleanup
 *   undo.js      — bindUndoFilter
 *   traits.js    — registerBodyTraits
 *
 * Internal modules are loaded DYNAMICALLY with ?v=static_version
 * so static versioning is not broken. Inside the modules themselves
 * there are NO static imports of each other.
 *
 * Effects CSS
 * -----------
 * The list of effect CSS files is NOT hardcoded here. After loading
 * the editor, `load()` fetches the current effect list from
 * GET /editor/effects and appends each fx/<id>.css to `canvasCss`.
 *
 * If the API fails, the loader just has no effect CSS — but the
 * editor still works. There is no bundled fallback: the API is the
 * single source of truth.
 *
 * Block UI CSS
 * ------------
 * The block panel UI styles used to live in editor/css/blocks.css.
 * They have moved to editor/blocks/blocks.css — next to the block
 * modules they describe (elements.js, layout.js, ready.js).
 *
 * It is NOT part of `cssFiles` (that array is for editor/css/*.css).
 * Instead it is loaded separately as `this.blocksUiCss` in load().
 *
 * Auto-id for sections
 * --------------------
 * Every top-level <section> gets a unique `id="i-XXXXXX"` attribute
 * the moment it is added to the canvas (from the block panel, from
 * the LLM's three-step flow, from paste, from anywhere).
 *
 * Why: GrapesJS by default opens the StyleManager on the first class
 * of the selected component — usually `.section` — which is shared
 * by ALL sections. Changing a background then paints EVERY section
 * on the page. Giving each section a unique id and letting the
 * StyleManager target `#id` keeps single-section edits local: the
 * user changes a background, only that one section changes.
 *
 * Cloned sections get a FRESH id — so a copy never inherits the
 * original's per-section styling.
 *
 * Asset picker (replaces built-in Asset Manager)
 * ----------------------------------------------
 * By default, GrapesJS opens its own Asset Manager modal when the
 * user double-clicks an <img> in the canvas (and in several other
 * paths). That modal is a small grid with a URL input and a
 * "Drop files here" zone — it cannot show tabs, cannot show the
 * LLM-generated logos, and cannot be styled like the rest of the
 * app.
 *
 * We replace it: `_bindAssetPicker()` overwrites the built-in
 * `open-assets` command with our own, which opens BaseAssets (the
 * shared full-screen picker with tabs «Медиатека» / «Логотипы»).
 * GrapesJS resolves commands by id, and the last registration for
 * a given id wins — so every built-in path that would have opened
 * the default modal now goes through us.
 *
 * The BaseAssets instance itself lives on the parent Editor
 * (editor.js → this._assets = new AssetsManager(this)).
 *
 * Call order:
 *   const loader = new GrapesLoader(editor, options);
 *   await loader.load();
 *   const instance = loader.init();
 *   ...
 *   loader.destroy(instance);
 */
export class GrapesLoader {
    /**
     * @param {Editor} editor — parent Editor
     * @param {Object} options — { styleManagerSectors: Array }
     */
    constructor(editor, options = {}) {
        this.editor = editor;
        this.options = options;

        this.baseUrl = '/static/libs/grapesjs-0.21.13';

        // Our CSS for the editor UI (main document).
        // Everything in editor/css/.
        this.cssBase = '/static/core/engine/lib/word/editor/css';
        this.cssFiles = [
            'layout.css',
            'toolbar.css',
            // 'blocks.css' is intentionally NOT here — see blocksUiCss
            // below. It has moved to editor/blocks/.
            'styles.css',
            'assets.css',
            'resizer.css',
            'io.css',
            'theme.css',
            'responsive.css',
        ];

        // Block-panel UI CSS — lives next to the block modules.
        // Loaded separately in load() (step 2b).
        this.blocksUiCss = '/static/core/engine/lib/word/editor/blocks/blocks.css';

        // Our CSS for the iframe canvas.
        // ORDER MATTERS: each next file overrides the previous one
        // at equal specificity.
        this.cssCanvasBase = '/static/core/engine/lib/word/editor/css';
        this.effectsBase = '/static/core/engine/lib/word/editor/effects';
        this.blocksBase = '/static/core/engine/lib/word/editor/blocks';

        this.canvasCss = [
            `${this.cssCanvasBase}/canvas.css`,
            `${this.cssCanvasBase}/content.css`,

            // Effects are appended in load() — from GET /editor/effects.
            // Block CSS is appended in load() from blocks/manifest.js.
        ];

        // Scope class for the iframe body
        this.scopeClass = 'core-engine-lib-word-blocks';

        // Filled in load() — holds functions from grapes/*.js
        this._mod = null;

        // Handler refs — for destroy()
        this._frameLoadHandler = null;
        this._emptyPHandler = null;
        this._undoFilterHandler = null;
        this._undoUpdateHandler = null;

        // Auto-id handlers — for destroy()
        this._autoIdHandler = null;
        this._autoIdCloneHandler = null;
    }

    // ============================================
    // LOAD RESOURCES
    // ============================================

    /**
     * Load all external resources and our grapes/*.js modules.
     *
     * Order:
     *   1. grapes.min.css
     *   2. our UI CSS (one <link> each, editor/css/*)
     *   2b. block-panel UI CSS (editor/blocks/blocks.css)
     *   3. grapes.min.js
     *   4. grapesjs-blocks-basic.min.js
     *   5. GET /editor/effects → effect CSS paths
     *   6. blocks/manifest.js → block CSS paths
     *   7. our grapes/*.js modules (dynamic, versioned)
     */
    async load() {
        console.log('[GrapesLoader] Loading resources');

        const version = window.coreEngine?.static_version || Date.now();
        const v = (p) => `${p}?v=${version}`;

        // 1. GrapesJS CSS — base
        this._loadStylesheet(`${this.baseUrl}/grapes.min.css`);

        // 2. Our CSS — one <link> per file
        this.cssFiles.forEach((file) => {
            this._loadStylesheet(v(`${this.cssBase}/${file}`));
        });

        // 2b. Block-panel UI CSS — lives in editor/blocks/, not css/.
        this._loadStylesheet(v(this.blocksUiCss));

        // 3. GrapesJS JS
        await this._loadScript(`${this.baseUrl}/grapes.min.js`);

        // 4. grapesjs-blocks-basic JS
        await this._loadScript(`${this.baseUrl}/grapesjs-blocks-basic.min.js`);

        // 5. Effects — fetch the list from the API and append
        //    /static/.../effects/fx/<id>.css for every effect.
        //    If the API fails, no effect CSS is loaded — the API is
        //    the single source of truth, there is no bundled fallback.
        await this._loadEffects(version);

        // 6. blocks/manifest.js — dynamic, versioned.
        //    If it fails, canvasCss keeps canvas/content/effects only.
        try {
            const mod = await import(v('../blocks/manifest.js'));
            const blockCss = mod.blockCssUrls ? mod.blockCssUrls(null) : [];
            this.canvasCss.push(...blockCss);
            console.log('[GrapesLoader] block CSS appended:', blockCss.length);
        } catch (err) {
            console.warn('[GrapesLoader] blocks/manifest.js not loaded:', err);
        }

        // 7. Our grapes/*.js modules — dynamic, versioned.
        //    Paths are RELATIVE TO THIS FILE (editor/grapes/index.js),
        //    so './config.js', './undo.js', etc.
        const [
            configMod,
            linkMod,
            pageLinkMod,
            scopeMod,
            emptyMod,
            undoMod,
            traitsMod,
        ] = await Promise.all([
            import(v('./config.js')),
            import(v('./link.js')),
            import(v('./page-link.js')),
            import(v('./scope.js')),
            import(v('./empty.js')),
            import(v('./undo.js')),
            import(v('./traits.js')),
        ]);

        this._mod = {
            buildConfig: configMod.buildConfig,
            registerLinkType: linkMod.registerLinkType,
            registerLinkCommand: linkMod.registerLinkCommand,
            registerPageLinkTrait: pageLinkMod.registerPageLinkTrait,
            makeScopeClassHandler: scopeMod.makeScopeClassHandler,
            bindEmptyPCleanup: emptyMod.bindEmptyPCleanup,
            bindUndoFilter: undoMod.bindUndoFilter,
            registerBodyTraits: traitsMod.registerBodyTraits,
        };

        console.log('[GrapesLoader] grapes/* modules loaded');
    }

    /**
     * Fetch the list of effect CSS files and append them to canvasCss.
     *
     * Source: GET /editor/effects
     *
     * No fallback. If the API fails, no effect CSS is loaded — the
     * canvas keeps canvas.css + content.css + block CSS. This is
     * intentional: the API (backed by effects/registry.json) is the
     * single source of truth for the effect list.
     *
     * @param {string|number} version — static_version for cache busting
     */
    async _loadEffects(version) {
        let effectIds = [];

        try {
            const qs = this._qsForEffects();
            const url = `/core/engine/lib/word/editor/effects${qs}`;
            console.log('[GrapesLoader] GET', url);

            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) throw new Error('coreEngine.fetchJson not available');

            const data = await fetchJson(url);
            if (data && data.success && Array.isArray(data.data)) {
                effectIds = data.data
                    .map(e => e.id)
                    .filter(Boolean);
                console.log('[GrapesLoader] effects loaded from API:', effectIds.length);
            } else {
                throw new Error('unexpected payload');
            }
        } catch (e) {
            console.warn('[GrapesLoader] effects API failed:', e);
            effectIds = [];
        }

        // ---- Append CSS paths ----
        for (const id of effectIds) {
            this.canvasCss.push(`${this.effectsBase}/fx/${id}.css`);
        }

        if (effectIds.length) {
            console.log('[GrapesLoader] effect CSS appended:', effectIds.length);
        }
    }

    /**
     * ?module=<name> query string for the effects API.
     */
    _qsForEffects() {
        const moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        return moduleName
            ? `?module=${encodeURIComponent(moduleName)}`
            : '';
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
     *
     * Returns the GrapesJS instance, or null if there is nothing
     * to mount:
     *   - a template is set but has no [data-slot="content"].
     * In that case the editor runs in read-only preview mode.
     */
    init() {
        console.log('[GrapesLoader] init()');

        if (!this._mod) {
            throw new Error('[GrapesLoader] load() must be awaited before init()');
        }

        if (typeof grapesjs === 'undefined') {
            throw new Error('[GrapesLoader] grapesjs not loaded');
        }

        const e = this.editor;
        const m = this._mod;

        if (!e.canvasEl) {
            throw new Error('[GrapesLoader] e.canvasEl not found — WidgetsBuilder.build() not called?');
        }

        // ===== Choose container =====
        //
        //   A. No template → mount into .editor-canvas.
        //   B. Template with [data-slot="content"] → the slot is
        //      replaced by editor.slotEl, mount into it.
        //   C. Template without a slot → do NOT create GrapesJS,
        //      preview only.
        //
        let container = null;
        let containerKind = 'canvasEl';

        if (e.templateHtml) {
            const slotInTemplate = e.templateEl
                ? e.templateEl.querySelector('[data-slot="content"]')
                : null;

            if (!slotInTemplate || !e.slotEl) {
                console.log(
                    '[GrapesLoader] template has no [data-slot="content"] — ' +
                    'skipping GrapesJS init (preview only)'
                );
                return null;
            }

            slotInTemplate.replaceWith(e.slotEl);
            container = e.slotEl;
            containerKind = 'slotEl (inside template)';
        } else {
            container = e.canvasEl;
            containerKind = 'canvasEl';
        }

        console.log('[GrapesLoader] container:', containerKind);

        const version = window.coreEngine?.static_version || Date.now();

        // ===== Plugins =====
        const plugins = [];
        if (typeof grapesjsBlocksBasic !== 'undefined') {
            plugins.push(grapesjsBlocksBasic);
        }

        // ===== Canvas styles (inside the iframe) =====
        const canvasStyles = this.canvasCss.map(
            (path) => `${path}?v=${version}`
        );

        // ===== Config =====
        const config = m.buildConfig(this, container, canvasStyles, plugins);

        // ===== Init =====
        const instance = grapesjs.init(config);
        console.log('[GrapesLoader] GrapesJS initialized');

        // ===== tlb-custom-link command =====
        m.registerLinkCommand(instance);

        // ===== 'page-link' trait type =====
        // MUST run before registerLinkType — the 'link' type references
        // 'page-link' in its traits defaults.
        m.registerPageLinkTrait(instance);

        // ===== 'link' type with traits (href, target) =====
        m.registerLinkType(instance);

        // ===== Scope class on the iframe body =====
        // GrapesJS creates the iframe eagerly, but <body> is filled
        // asynchronously. Subscribe to readiness events:
        //   canvas:frame:load:body — body ready (main)
        //   canvas:frame:load      — iframe loaded (fallback)
        //   load                   — editor fully ready (final fallback)
        // On device change the iframe is re-created — the event fires again.
        const applyScopeClass = m.makeScopeClassHandler(this.scopeClass);

        this._frameLoadHandler = () => {
            applyScopeClass(instance);
        };

        instance.on('canvas:frame:load:body', this._frameLoadHandler);
        instance.on('canvas:frame:load', this._frameLoadHandler);
        instance.on('load', this._frameLoadHandler);

        // ===== Auto-id for top-level sections =====
        this._bindAutoId(instance);

        // ===== Reset block inline styles =====
        this._resetBlockInlineStyles(instance);

        // ===== Asset picker — replace built-in Asset Manager =====
        // Overwrites the built-in 'open-assets' command (triggered by
        // double-clicking an <img>, by the media icon in the traits
        // panel, and by any other built-in path) so it opens
        // BaseAssets instead of GrapesJS's own tiny modal.
        this._bindAssetPicker(instance);

        // ===== Body traits (Свойства) =====
        m.registerBodyTraits(instance);

        // ===== Auto-remove empty <p> =====
        this._emptyPHandler = m.bindEmptyPCleanup(instance);

        // ===== UndoManager filter =====
        const undo = m.bindUndoFilter(instance);
        if (undo) {
            this._undoFilterHandler = undo.record;
            this._undoUpdateHandler = undo.updateHandler;
        }

        return instance;
    }

    /**
     * Detach canvas listeners. Called from Editor.destroy().
     */
    destroy(instance) {
        if (!instance) return;

        const off = (evt, h) => {
            if (!h) return;
            try { instance.off(evt, h); } catch (_) { /* noop */ }
        };

        if (this._frameLoadHandler) {
            off('canvas:frame:load:body', this._frameLoadHandler);
            off('canvas:frame:load', this._frameLoadHandler);
            off('load', this._frameLoadHandler);
        }
        this._frameLoadHandler = null;

        if (this._emptyPHandler) {
            off('component:add', this._emptyPHandler);
        }
        this._emptyPHandler = null;

        if (this._undoFilterHandler) {
            off('component:add', this._undoFilterHandler);
            off('component:remove', this._undoFilterHandler);
            off('styleable:change', this._undoFilterHandler);
            off('rte:disable', this._undoFilterHandler);
        }
        this._undoFilterHandler = null;

        if (this._undoUpdateHandler) {
            off('component:update', this._undoUpdateHandler);
        }
        this._undoUpdateHandler = null;

        // Auto-id handlers
        if (this._autoIdHandler) {
            off('component:add', this._autoIdHandler);
        }
        this._autoIdHandler = null;

        if (this._autoIdCloneHandler) {
            off('component:clone', this._autoIdCloneHandler);
        }
        this._autoIdCloneHandler = null;
    }

    // ============================================
    // AUTO-ID FOR SECTIONS
    // ============================================

    /**
     * Attach a unique `id="i-XXXXXX"` to every top-level <section>
     * that is added to the canvas.
     *
     * WHY
     * ---
     * GrapesJS opens the StyleManager on the FIRST class of the
     * selected component. Sections all share `.section`, so editing
     * a background on one section actually edits `.section { ... }`
     * — i.e. every section on the page. Giving each section a unique
     * id and letting the StyleManager pick `#id` keeps per-section
     * edits local.
     *
     * WHAT WE DO
     * ----------
     *   - `component:add`   — add a fresh id if the section has none.
     *   - `component:clone` — regenerate the id on the copy, so a
     *                         duplicated section does not inherit
     *                         the original's `#id` styling.
     *
     * Existing ids are never overwritten. Non-section components
     * (div, h2, p, ...) are ignored.
     *
     * @param {Object} instance — GrapesJS instance
     */
    _bindAutoId(instance) {
        const TAG = 'section';
        const ID_PREFIX = 'i-';

        const genId = () => {
            // 6 chars, base36 — collisions are astronomically unlikely
            // for a page with dozens of sections. If the id is somehow
            // taken, retry a few times.
            for (let i = 0; i < 5; i++) {
                const candidate = ID_PREFIX
                    + Math.random().toString(36).slice(2, 8);
                if (!instance.getWrapper().find(`#${candidate}`).length) {
                    return candidate;
                }
            }
            // Extremely unlikely fallback: use a timestamp.
            return ID_PREFIX + Date.now().toString(36).slice(-6);
        };

        const ensureId = (component) => {
            try {
                if (!component) return;
                const tag = String(component.get('tagName') || '').toLowerCase();
                if (tag !== TAG) return;

                // Already has an id — leave it alone.
                if (component.getId && component.getId()) return;

                const uid = genId();
                const attrs = { ...(component.getAttributes() || {}) };
                attrs.id = uid;
                component.setAttributes(attrs);

                console.log('[GrapesLoader] auto-id added:', uid);
            } catch (e) {
                console.warn('[GrapesLoader] auto-id failed:', e);
            }
        };

        // ---- add ----
        this._autoIdHandler = (component) => {
            ensureId(component);
        };
        instance.on('component:add', this._autoIdHandler);

        // ---- clone: force a new id on the copy ----
        this._autoIdCloneHandler = (origin, cloned) => {
            try {
                if (!cloned) return;
                const tag = String(cloned.get('tagName') || '').toLowerCase();
                if (tag !== TAG) return;

                // Remove whatever id the clone inherited, then set a new one.
                const uid = genId();
                const attrs = { ...(cloned.getAttributes() || {}) };
                attrs.id = uid;
                cloned.setAttributes(attrs);

                console.log('[GrapesLoader] clone auto-id:', uid);
            } catch (e) {
                console.warn('[GrapesLoader] clone auto-id failed:', e);
            }
        };
        instance.on('component:clone', this._autoIdCloneHandler);

        // ---- also handle sections that were already on the canvas
        //      before this handler was attached (e.g. loaded from
        //      the DB with content_json) ----
        try {
            const wrapper = instance.getWrapper();
            if (wrapper) {
                const walk = (comp) => {
                    ensureId(comp);
                    const kids = comp.components ? comp.components() : null;
                    if (kids && kids.forEach) kids.forEach(walk);
                };
                walk(wrapper);
            }
        } catch (e) {
            console.warn('[GrapesLoader] pre-existing auto-id failed:', e);
        }
    }

    // ============================================
    // ASSET PICKER (replaces built-in Asset Manager)
    // ============================================

    /**
     * Intercept the built-in 'open-assets' command and route it to
     * BaseAssets instead of the GrapesJS Asset Manager modal.
     *
     * WHY
     * ---
     * By default, double-clicking an <img> in the canvas (and
     * several other built-in paths) calls
     * `editor.runCommand('open-assets')`, which opens GrapesJS's
     * own modal: a small grid, a URL input and a "Drop files here"
     * zone. It cannot show tabs, cannot show the LLM-generated
     * logos, and cannot be styled to match the rest of the app.
     *
     * WHAT WE DO
     * ----------
     * We register our OWN 'open-assets' command with the same id.
     * GrapesJS resolves commands by id, and the last registration
     * for a given id wins — so every built-in path that would
     * have opened the default modal now goes through us.
     *
     * Behaviour:
     *   - <img> selected                    → open BaseAssets,
     *                                         on pick set src;
     *   - component with background-image   → on pick set the style;
     *   - nothing selected                  → open BaseAssets;
     *                                         picking logs a warning
     *                                         (no target to apply to).
     *
     * The BaseAssets instance itself lives on the parent Editor
     * (editor.js → this._assets = new AssetsManager(this)). We
     * reach it via `this.editor._assets` — this GrapesLoader holds
     * a reference to the parent Editor in `this.editor`.
     *
     * @param {Object} instance — GrapesJS instance
     */
    _bindAssetPicker(instance) {
        const loader = this;   // for closures

        // Overwrite the built-in command. Same id → our version wins.
        instance.Commands.add('open-assets', {
            run(editor) {
                console.log('[GrapesLoader] open-assets intercepted → BaseAssets');

                const parentEditor = loader.editor;   // our Editor class
                const assets = parentEditor?._assets; // AssetsManager

                if (!assets || typeof assets.openPicker !== 'function') {
                    console.warn(
                        '[GrapesLoader] AssetsManager not ready — ' +
                        'BaseAssets cannot be opened yet'
                    );
                    return false;
                }

                // Try to figure out the target for the picked src.
                // Priority:
                //   1. currently selected component (GrapesJS selection);
                //   2. null — user opened the picker without a target.
                const selected = editor.getSelected();

                assets.openPicker({
                    sources: ['media', 'logos'],
                    initialSource: 'media',
                    onSelect: (src) => {
                        if (!src) return;

                        if (!selected) {
                            console.warn(
                                '[GrapesLoader] picked src but nothing ' +
                                'is selected — result discarded'
                            );
                            return;
                        }

                        // <img> — set src. This is the primary case
                        // (double-click on an image in the canvas).
                        if (selected.get('tagName') === 'img') {
                            selected.set('src', src);
                            // Force GrapesJS to re-render the trait
                            // input so the new value is visible in
                            // the panel too.
                            editor.TraitManager.render();
                            return;
                        }

                        // Any other component — try background-image.
                        // If the component already has a background-image
                        // style, we replace it. Otherwise we add one.
                        const style = selected.getStyle?.() || {};
                        if (style['background-image']) {
                            selected.addStyle({
                                'background-image': `url('${src}')`,
                            });
                            return;
                        }

                        // Fallback — component type is unknown for us.
                        // Log so it is visible in the console; do not
                        // silently discard.
                        console.warn(
                            '[GrapesLoader] picked src for unsupported ' +
                            'component type:',
                            selected.get('tagName')
                        );
                    },
                });

                return false;   // tell GrapesJS "we handled it"
            },
        });

        console.log('[GrapesLoader] open-assets command overridden');
    }

    /**
     * Remove inline width/float/margin from block cards that
     * GrapesJS sets at render time.
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