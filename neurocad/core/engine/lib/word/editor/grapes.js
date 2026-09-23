// app/core/engine/lib/word/editor/grapes.js

/**
 * GrapesLoader — load and init GrapesJS.
 *
 * Tasks:
 *   1. Load GrapesJS CSS/JS from /static/libs/grapesjs-0.21.13/.
 *   2. Load OUR CSS files (editor UI) — one <link> each.
 *      All are loaded AFTER grapes.min.css so they override.
 *   3. Load grapesjs-blocks-basic plugin.
 *   4. Inside canvas (GrapesJS iframe) load, in order:
 *        canvas.css        — canvas layout baseline
 *        theme.css         — content theme variables (--theme-*)
 *        content.css       — shared atoms (.btn, .card, .grid, ...)
 *        blocks/*.css      — block-specific classes (.hero, .flex-shell, ...)
 *      All are scoped under .core-engine-lib-word-blocks.
 *      Without them, block content looks "naked" in the editor.
 *      List of block CSS is taken from blocks/manifest.js (dynamic import).
 *   5. Build config and call grapesjs.init().
 *   6. After init — reset inline styles on blocks set by GrapesJS.
 *   7. Register 'link' component type with traits (href, target) —
 *      so links can be set on buttons and other elements.
 *   8. Add .core-engine-lib-word-blocks class to iframe body — single
 *      scope wrapper for the whole page content.
 *   9. Register body layout traits (Свойства panel) — height, display,
 *      flex-direction, padding, margin, overflow for the wrapper (body).
 *  10. Auto-remove empty <p> placeholder when a real block is added —
 *      GrapesJS inserts <p></p> for empty canvas; it takes vertical
 *      space and breaks full-height layouts.
 *  11. Filter the context menu (right-click on a component): keep only
 *      working items, replace the broken built-in "Link" with our own
 *      command that wraps the selected component in <a> and selects it
 *      (so the traits panel with href/target opens).
 *
 * Block categories (collapse behaviour):
 *   Categories are pre-created in BlocksRegistry.register() with the
 *   model flag `open: false` BEFORE any block is added. GrapesJS uses
 *   this flag when it renders the category DOM and when it re-renders
 *   after new blocks are added — so the state survives re-renders.
 *   No DOM patching here: click-to-toggle is standard GrapesJS and we
 *   do not interfere.
 *
 * Container selection:
 *   - If a template is set (editor.templateHtml), GrapesJS mounts ONLY
 *     when the rendered template contains [data-slot="content"].
 *     In that case the slot is replaced by editor.slotEl and GrapesJS
 *     mounts into it; the rest of the template stays outside the iframe.
 *   - If a template is set but has no slot — GrapesJS is NOT created
 *     at all. The template is shown as a read-only preview (no canvas,
 *     no editor panels acting on it).
 *   - Otherwise (no template) — GrapesJS mounts into editor.canvasEl.
 *
 * Canvas size:
 *   width: '100%' — GrapesJS fills the whole container width.
 *   height: '100%' — fills the whole container height.
 *   Device 'desktop' has width: '' (auto), so the iframe takes the
 *   full container width when width: '100%' is set here.
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

        // Our CSS for iframe canvas.
        // ORDER MATTERS: each file overrides the previous one at equal
        // specificity. Block-specific rules (blocks/*.css) come last,
        // so they can override shared classes (content.css).
        //
        // theme.css MUST come first: it defines the --theme-* variables
        // used by content.css and blocks/*.css.
        //
        // Block CSS list is appended in load() — from the dynamic
        // import of blocks/manifest.js (versioned import).
        this.cssCanvasBase = '/static/core/engine/lib/word/editor/css';
        this.blocksBase = '/static/core/engine/lib/word/editor/blocks';

        this.canvasCss = [
            `${this.cssCanvasBase}/canvas.css`,
            `${this.cssCanvasBase}/content.css`,
            // block CSS appended in load()
        ];

        // Scope class — single wrapper for the whole page content.
        // Added to iframe body on init and on every frame reload
        // (device change re-creates the iframe).
        this.scopeClass = 'core-engine-lib-word-blocks';

        // Keep reference to the frame:load handler so we can detach on destroy.
        this._frameLoadHandler = null;

        // Keep reference to the empty <p> cleanup handler so we can detach
        // on destroy.
        this._emptyPHandler = null;
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
     *
     * Also: dynamically import blocks/manifest.js (versioned), and
     * append block CSS paths to this.canvasCss — so init() picks them up.
     */
    async load() {
        console.log('[GrapesLoader] Loading resources');

        const version = window.coreEngine?.static_version || Date.now();

        // 1. GrapesJS CSS — base
        this._loadStylesheet(`${this.baseUrl}/grapes.min.css`);

        // 2. Our CSS — each file as a separate <link>.
        this.cssFiles.forEach((file) => {
            const href = `${this.cssBase}/${file}?v=${version}`;
            this._loadStylesheet(href);
        });

        // 3. GrapesJS JS
        await this._loadScript(`${this.baseUrl}/grapes.min.js`);

        // 4. grapesjs-blocks-basic JS
        await this._loadScript(`${this.baseUrl}/grapesjs-blocks-basic.min.js`);

        // 5. Load blocks manifest (dynamic, versioned) and append
        //    block CSS to canvasCss. If manifest fails — canvasCss
        //    stays with canvas.css + theme.css + content.css only
        //    (graceful degrade).
        try {
            const mod = await import(`./blocks/manifest.js?v=${version}`);
            const blockCss = mod.blockCssUrls
                ? mod.blockCssUrls(null)
                : [];
            this.canvasCss.push(...blockCss);
            console.log('[GrapesLoader] block CSS appended:', blockCss.length);
        } catch (err) {
            console.warn('[GrapesLoader] blocks/manifest.js not loaded:', err);
        }
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
     * Returns GrapesJS instance, or null if there is nothing to mount:
     *   - template is set but has no [data-slot="content"].
     * In that case the editor works in "preview only" mode — the
     * template is rendered read-only, no canvas is created.
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

        // ===== Choose container =====
        //
        // Three cases:
        //
        //   A. No template (templateHtml is empty):
        //      → mount into .editor-canvas (regular editor mode).
        //
        //   B. Template with [data-slot="content"]:
        //      → replace that slot with .editor-slot and mount into it.
        //        The rest of the template stays as an outer frame.
        //
        //   C. Template without a slot:
        //      → do NOT create GrapesJS. Render the template as a
        //        read-only preview. There is nothing to edit.
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

        // ===== Canvas styles (inside iframe) =====
        const canvasStyles = this.canvasCss.map(
            (path) => `${path}?v=${version}`
        );

        // ===== Config =====
        const config = {
            container: container,
            height: '100%',
            width: '100%',        // ← fills the whole container width
            fromElement: false,
            storageManager: false,

            plugins: plugins,
            pluginsOpts: {
                'grapesjs-blocks-basic': {
                    flexGrid: true,
                    // Separate category so the plugin does not create the
                    // "Разметка" category BEFORE our LayoutBlocks register.
                    // Otherwise the category order gets fixed by the plugin.
                    category: 'Basic',
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
            // Attached to the <head> of the iframe where blocks are rendered.
            // Scoped under .core-engine-lib-word-blocks — isolated namespace.
            canvas: {
                styles: canvasStyles,
            },

            // ===== Context menu filter =====
            // GrapesJS shows a context menu on right-click / double-click.
            // The built-in "Link" item does nothing useful (it expects an
            // active RichTextEditor with a text selection), so we drop it
            // and add our own command that wraps the component in <a> and
            // selects it — then the traits panel shows href/target.
            components: {
                contextMenu: (items) => {
                    const KEEP = [
                        'tlb-move',
                        'tlb-clone',
                        'tlb-delete',
                        'tlb-select-parent',
                    ];
                    const filtered = items.filter(i => KEEP.includes(i.id));

                    // Append our custom "Link" item.
                    filtered.push({
                        id: 'tlb-custom-link',
                        label: 'Ссылка',
                        command: 'tlb-custom-link',
                    });

                    return filtered;
                },
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

        // ===== StyleManager (right panel, below styles) =====
        if (e.stylesEl) {
            config.styleManager = {
                appendTo: e.stylesEl,
                sectors: this.options.styleManagerSectors || [],
            };
        }

        // ===== Init =====
        const instance = grapesjs.init(config);
        console.log('[GrapesLoader] GrapesJS initialized');

        // ===== Custom command: wrap component in <a> and select it =====
        // Replaces the broken built-in "Link" item.
        //
        // Behaviour:
        //   1. If the selected component is already an <a> — just select it
        //      (traits panel opens with href/target).
        //   2. Otherwise — wrap its content in <a href="#">, replace the
        //      component's content, then select the newly created <a>.
        instance.Commands.add('tlb-custom-link', {
            run(editor) {
                const selected = editor.getSelected();
                if (!selected) return;

                // Already a link — just select it.
                if (selected.get('tagName') === 'a') {
                    editor.select(selected);
                    return;
                }

                // Wrap in <a>.
                const html = selected.getEl()?.outerHTML || selected.toHTML();
                if (!html) return;

                // Replace the component's HTML with <a>…</a>.
                selected.replaceWith(`<a href="#">${html}</a>`);

                // Select the new <a>.
                const parent = selected.parent();
                if (parent) {
                    const links = parent.find('a');
                    if (links && links.length) {
                        editor.select(links[links.length - 1]);
                    }
                }
            },
        });

        // ===== Add scope class to iframe body =====
        // GrapesJS creates the iframe eagerly but fills its <body>
        // asynchronously. We don't poll — we subscribe to the events
        // that signal body readiness:
        //
        //   canvas:frame:load:body  — <body> is ready (main event)
        //   canvas:frame:load       — iframe loaded (fallback, body may be missing)
        //   load                    — editor fully initialized (final fallback)
        //
        // On device change GrapesJS re-creates the iframe, so
        // canvas:frame:load:body fires again — same handler, no extra code.
        this._frameLoadHandler = () => {
            this._applyScopeClass(instance);
        };

        instance.on('canvas:frame:load:body', this._frameLoadHandler);
        instance.on('canvas:frame:load', this._frameLoadHandler);
        instance.on('load', this._frameLoadHandler);

        // ===== Register 'link' type with traits (href, target) =====
        this._registerLinkType(instance);

        // ===== Reset block inline styles =====
        this._resetBlockInlineStyles(instance);

        // ===== Body layout traits (Свойства panel) =====
        this._registerBodyStyleTraits(instance);

        // ===== Auto-remove empty <p> placeholder =====
        this._bindEmptyPCleanup(instance);

        return instance;
    }

    /**
     * Add scope class to the iframe body.
     *
     * Called from event handlers — canvas:frame:load:body,
     * canvas:frame:load, load. No polling: if body is ready, the
     * event fires; if not, the next event fires later.
     *
     * GrapesJS re-creates the iframe on device change, so this must
     * run again on every 'canvas:frame:load:body' event.
     */
    _applyScopeClass(instance) {
        try {
            const doc = instance.Canvas?.getDocument?.();
            if (!doc || !doc.body) {
                // Body not ready yet — the next event will call us again.
                // Not an error, so no warning.
                return;
            }
            if (doc.body.classList.contains(this.scopeClass)) {
                return; // already applied — nothing to do
            }
            doc.body.classList.add(this.scopeClass);
            console.log('[GrapesLoader] scope class added to iframe body:', this.scopeClass);
        } catch (e) {
            console.warn('[GrapesLoader] failed to add scope class:', e);
        }
    }

    /**
     * Auto-remove the empty <p> placeholder when a real block is added.
     *
     * GrapesJS inserts <p></p> as a placeholder for an empty canvas.
     * It takes vertical space and breaks full-height layouts.
     *
     * As soon as any real component lands in the wrapper (body), drop
     * the empty <p> — but only if it's truly empty (no content, no
     * children). User-authored paragraphs are left alone.
     *
     * Notes on safety:
     *   - component may be already removed (e.g. we removed it in a
     *     previous iteration of this same handler, or GrapesJS is
     *     tearing down the tree during a drag). Guard against that.
     *   - wrapper.components() may not be a Backbone collection in
     *     some versions — we use .each only if it exists.
     *   - child.get('components') returns a collection; calling
     *     .length on it is safe, but we double-check it's truthy.
     */
    _bindEmptyPCleanup(instance) {
        this._emptyPHandler = (component) => {
            try {
                // --- Guards: component may be gone ---
                if (!component) return;
                if (typeof component.parent !== 'function') return;

                const parent = component.parent();
                const wrapper = instance.getWrapper();

                // React only when adding directly into the wrapper (body)
                if (!parent || parent !== wrapper) return;

                // --- Guard: wrapper.components() may be missing ---
                if (typeof wrapper.components !== 'function') return;

                const children = wrapper.components();
                if (!children || typeof children.each !== 'function') return;

                // Collect first, then remove — mutating the collection
                // while iterating can skip items or re-enter the handler.
                const toRemove = [];

                children.each((child) => {
                    if (!child || child === component) return;
                    if (typeof child.get !== 'function') return;

                    // Already removed from the tree
                    if (child.removed || !child.collection) return;

                    const tag = child.get('tagName');
                    const content = String(child.get('content') || '').trim();

                    let hasChildren = false;
                    const comps = child.components && child.components();
                    if (comps && typeof comps.length === 'number') {
                        hasChildren = comps.length > 0;
                    }

                    const isEmptyP = tag === 'p'
                        && !content
                        && !hasChildren;

                    if (isEmptyP) {
                        toRemove.push(child);
                    }
                });

                toRemove.forEach((child) => {
                    if (child && !child.removed) {
                        child.remove();
                        console.log('[GrapesLoader] removed empty <p> placeholder');
                    }
                });
            } catch (e) {
                // Cleanup is best-effort: never let it break the drop
                // or the editor flow. Log once at debug level.
                console.warn('[GrapesLoader] empty <p> cleanup failed:', e);
            }
        };

        instance.on('component:add', this._emptyPHandler);
    }

    /**
     * Register custom trait types and assign them to the wrapper (body).
     *
     * Idempotent:
     *   - trait types are registered only once (getType check);
     *   - traits are always (re-)assigned on the current wrapper —
     *     GrapesJS replaces the wrapper on loadProjectData / setComponents,
     *     so re-assignment is required after each data load.
     *
     * These traits live in the Traits panel (Свойства) and write
     * directly to the component's inline style (component.addStyle).
     * Selecting the body shows layout controls (height, display,
     * flex-direction, padding, margin, overflow) — like StyleManager,
     * but scoped to the wrapper only.
     */
    _registerBodyStyleTraits(instance) {
        try {
            const tm = instance.TraitManager;

            // --- Custom trait type: <select> that writes to style ---
            if (!tm.getType('body-style-select')) {
                tm.addType('body-style-select', {
                    createInput({ trait }) {
                        const options = trait.get('options') || [];
                        const el = document.createElement('select');
                        el.className = 'body-style-select';

                        const emptyOpt = document.createElement('option');
                        emptyOpt.value = '';
                        emptyOpt.textContent = '—';
                        el.appendChild(emptyOpt);

                        options.forEach((opt) => {
                            const o = document.createElement('option');
                            o.value = opt.id;
                            o.textContent = opt.name;
                            el.appendChild(o);
                        });

                        return el;
                    },
                    onEvent({ elInput, component }) {
                        const prop = this.target.get('bodyProp');
                        const value = elInput.value;
                        if (value) {
                            component.addStyle({ [prop]: value });
                        } else {
                            component.removeStyle(prop);
                        }
                    },
                    onUpdate({ elInput, component }) {
                        const prop = this.target.get('bodyProp');
                        const value = component.getStyle()[prop] || '';
                        elInput.value = value;
                    },
                });
            }

            // --- Custom trait type: integer input + unit select ---
            if (!tm.getType('body-style-integer')) {
                tm.addType('body-style-integer', {
                    createInput({ trait }) {
                        const units = trait.get('units') || ['px'];
                        const wrap = document.createElement('div');
                        wrap.className = 'body-style-integer';

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.placeholder = 'auto';
                        input.className = 'body-style-integer__input';

                        const unitSel = document.createElement('select');
                        unitSel.className = 'body-style-integer__unit';
                        units.forEach((u) => {
                            const o = document.createElement('option');
                            o.value = u;
                            o.textContent = u;
                            unitSel.appendChild(o);
                        });

                        wrap.appendChild(input);
                        wrap.appendChild(unitSel);
                        return wrap;
                    },
                    onEvent({ elInput, component }) {
                        const prop = this.target.get('bodyProp');
                        const input = elInput.querySelector('.body-style-integer__input');
                        const unitSel = elInput.querySelector('.body-style-integer__unit');
                        const raw = input.value.trim();
                        if (!raw) {
                            component.removeStyle(prop);
                            return;
                        }
                        const unit = unitSel.value || 'px';
                        const hasUnit = /[a-z%]+$/i.test(raw);
                        const value = hasUnit ? raw : `${raw}${unit}`;
                        component.addStyle({ [prop]: value });
                    },
                    onUpdate({ elInput, component }) {
                        const prop = this.target.get('bodyProp');
                        const input = elInput.querySelector('.body-style-integer__input');
                        const unitSel = elInput.querySelector('.body-style-integer__unit');
                        const value = component.getStyle()[prop] || '';

                        const m = value.match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
                        if (m) {
                            input.value = m[1];
                            if (m[2] && [...unitSel.options].some(o => o.value === m[2])) {
                                unitSel.value = m[2];
                            }
                        } else {
                            input.value = value;
                        }
                    },
                });
            }

            // --- Assign traits to wrapper (body) ---
            const wrapper = instance.getWrapper();
            if (!wrapper) {
                console.warn('[GrapesLoader] wrapper not available — body traits not assigned');
                return;
            }

            const bodyTraits = [
                {
                    type: 'body-style-integer',
                    name: 'height',
                    label: 'Высота',
                    bodyProp: 'height',
                    units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
                },
                {
                    type: 'body-style-integer',
                    name: 'min-height',
                    label: 'Мин. высота',
                    bodyProp: 'min-height',
                    units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
                },
                {
                    type: 'body-style-integer',
                    name: 'max-height',
                    label: 'Макс. высота',
                    bodyProp: 'max-height',
                    units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
                },
                {
                    type: 'body-style-select',
                    name: 'display',
                    label: 'Display',
                    bodyProp: 'display',
                    options: [
                        { id: 'block', name: 'block' },
                        { id: 'flex', name: 'flex' },
                        { id: 'grid', name: 'grid' },
                        { id: 'inline', name: 'inline' },
                        { id: 'inline-block', name: 'inline-block' },
                        { id: 'none', name: 'none' },
                    ],
                },
                {
                    type: 'body-style-select',
                    name: 'flex-direction',
                    label: 'Flex direction',
                    bodyProp: 'flex-direction',
                    options: [
                        { id: 'row', name: 'row' },
                        { id: 'row-reverse', name: 'row-reverse' },
                        { id: 'column', name: 'column' },
                        { id: 'column-reverse', name: 'column-reverse' },
                    ],
                },
                {
                    type: 'body-style-select',
                    name: 'justify-content',
                    label: 'Justify content',
                    bodyProp: 'justify-content',
                    options: [
                        { id: 'flex-start', name: 'flex-start' },
                        { id: 'flex-end', name: 'flex-end' },
                        { id: 'center', name: 'center' },
                        { id: 'space-between', name: 'space-between' },
                        { id: 'space-around', name: 'space-around' },
                        { id: 'space-evenly', name: 'space-evenly' },
                    ],
                },
                {
                    type: 'body-style-select',
                    name: 'align-items',
                    label: 'Align items',
                    bodyProp: 'align-items',
                    options: [
                        { id: 'stretch', name: 'stretch' },
                        { id: 'flex-start', name: 'flex-start' },
                        { id: 'flex-end', name: 'flex-end' },
                        { id: 'center', name: 'center' },
                        { id: 'baseline', name: 'baseline' },
                    ],
                },
                {
                    type: 'body-style-integer',
                    name: 'padding',
                    label: 'Внутренний отступ',
                    bodyProp: 'padding',
                    units: ['px', '%', 'em', 'rem'],
                },
                {
                    type: 'body-style-integer',
                    name: 'margin',
                    label: 'Внешний отступ',
                    bodyProp: 'margin',
                    units: ['px', '%', 'em', 'rem'],
                },
                {
                    type: 'body-style-select',
                    name: 'overflow',
                    label: 'Overflow',
                    bodyProp: 'overflow',
                    options: [
                        { id: 'visible', name: 'visible' },
                        { id: 'hidden', name: 'hidden' },
                        { id: 'scroll', name: 'scroll' },
                        { id: 'auto', name: 'auto' },
                    ],
                },
            ];

            wrapper.set('traits', bodyTraits);
            console.log('[GrapesLoader] body traits assigned:', bodyTraits.length);

        } catch (err) {
            console.warn('[GrapesLoader] failed to register body style traits:', err);
        }
    }

    /**
     * Detach canvas event handlers. Called from Editor.destroy().
     */
    destroy(instance) {
        if (this._frameLoadHandler && instance) {
            try {
                instance.off('canvas:frame:load:body', this._frameLoadHandler);
                instance.off('canvas:frame:load', this._frameLoadHandler);
                instance.off('load', this._frameLoadHandler);
            } catch (e) {
                // ignore
            }
        }
        this._frameLoadHandler = null;

        if (this._emptyPHandler && instance) {
            try {
                instance.off('component:add', this._emptyPHandler);
            } catch (e) {
                // ignore
            }
        }
        this._emptyPHandler = null;
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