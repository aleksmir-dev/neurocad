// app/core/engine/lib/word/editor/blocks/index.js

/**
 * BlocksRegistry — registers the GrapesJS block library.
 *
 * Reads BLOCKS_MANIFEST and dynamically imports each block module,
 * then calls register() on the exported class.
 *
 * Categories (defined inside each JS module):
 *   elements.js — atoms: headings, text, lists, buttons, image,
 *                 divider, quote, badge, card.
 *   layout.js   — grids and shells: container, 2/3/4/auto columns,
 *                 flex-shell.
 *   ready.js    — ready-made sections: hero, features, steps,
 *                 text-image, image-text, gallery, faq, cta,
 *                 contacts, footer.
 *
 * In addition to the block categories, this registry installs two
 * libraries:
 *
 *   EffectBlocks (../effects/index.js) — clicking an effect toggles
 *     a CSS class on the currently selected element. Exposed in the
 *     panel as "Эффекты".
 *
 *   ImageBlocks (../images/index.js) — clicking an image inserts an
 *     <img> block into the canvas. Exposed as "Изображения". The
 *     images come from the server registry (images/registry.json),
 *     filled automatically when the LLM generates SVGs on step 4 of
 *     the create flow.
 *
 * Both instances are stored on the GrapesJS instance:
 *   editor._effectBlocks
 *   editor._imageBlocks
 *
 * so other modules (llm/chat.js) can reach them without re-importing
 * the classes. This is the only wiring point.
 *
 * Adding a new block = adding one entry to manifest.js.
 * All consumers (grapes.js, word.js) read the same manifest.
 *
 * Cache note:
 *   manifest.js is imported DYNAMICALLY with ?v=static_version.
 *   A static `import ... from './manifest.js'` would be cached by the
 *   browser forever (same URL, no version) — the manifest would not
 *   update after edits until a hard reload. Do not add a static
 *   import here.
 *
 * Collapse behaviour:
 *   Categories are pre-created with `open: false` BEFORE any block is
 *   added. GrapesJS keeps this flag when it renders the category DOM
 *   and when it re-renders after new blocks — so the state survives
 *   re-renders.
 *
 * API note:
 *   GrapesJS 0.21.x BlockManager has no addCategory / getCategory.
 *   The Backbone collection of categories is exposed as
 *   `bm.categories` (lowercase). `bm.Categories` (uppercase) is the
 *   model class, not the collection. We use `bm.categories.add/get`
 *   directly.
 *
 *   Order in CATEGORY_ORDER = order of categories in the panel.
 *
 * Effects library note:
 *   EffectBlocks.register() is async: it fetches the effect list
 *   from GET /editor/effects. We MUST await it, otherwise the
 *   "Эффекты" category would be empty when the editor renders the
 *   panel for the first time.
 *
 * Images library note:
 *   ImageBlocks.register() is async: it fetches the image list from
 *   GET /editor/images. Same rule — await it.
 */

export class BlocksRegistry {
    /**
     * @param {Object} editorInstance — GrapesJS instance (grapesjs.init(...))
     */
    constructor(editorInstance) {
        this.editor = editorInstance;
    }

    /**
     * Load category modules from the manifest and call register() on each.
     */
    async register() {
        console.log('[BlocksRegistry] Регистрация блоков');

        const version = window.coreEngine?.static_version || Date.now();

        // Dynamic import — must carry ?v= so the browser does not serve
        // a stale manifest from the cache.
        const { BLOCKS_MANIFEST } = await import(`./manifest.js?v=${version}`);

        const modules = await Promise.all(
            BLOCKS_MANIFEST.map(b => import(`./${b.js}?v=${version}`))
        );

        const bm = this.editor.BlockManager;
        const categories = bm.categories;

        // ===== Pre-create categories with open:false =====
        //
        // `bm.categories` is the Backbone.Collection of categories.
        // Adding a model here creates the category eagerly, with the
        // `open` flag we need — so it is born collapsed and stays
        // collapsed when blocks are added into it.
        //
        // Order of CATEGORY_ORDER = order of categories in the panel.
        const CATEGORY_ORDER = [
            'Элементы',
            'Секции',
            'Разметка',
            'Эффекты',
            'Изображения',
        ];

        if (categories && typeof categories.add === 'function') {
            CATEGORY_ORDER.forEach((label) => {
                const existing = typeof categories.get === 'function'
                    ? categories.get(label)
                    : null;

                if (existing) {
                    existing.set('open', false);
                } else {
                    categories.add({ id: label, label, open: false });
                }
            });

            console.log('[BlocksRegistry][DEBUG] categories pre-created:',
                bm.getCategories().map(c => ({
                    id: c.id,
                    label: c.get('label'),
                    open: c.get('open'),
                }))
            );
        } else {
            // Fallback — patch bm.add to force open:false on first hit
            // of each category (used if `bm.categories` is missing).
            console.warn('[BlocksRegistry] bm.categories not available — using bm.add patch');

            const seen = new Set();
            const origAdd = bm.add.bind(bm);
            bm.add = (id, opts = {}) => {
                if (opts && typeof opts.category === 'string') {
                    const cat = opts.category;
                    if (!seen.has(cat)) {
                        seen.add(cat);
                        opts = {
                            ...opts,
                            category: { id: cat, label: cat, open: false },
                        };
                    }
                }
                return origAdd(id, opts);
            };
        }

        // ===== Register blocks from manifest =====
        modules.forEach((mod, i) => {
            const { name, js } = BLOCKS_MANIFEST[i];
            const Cls = mod[name];
            if (!Cls) {
                console.warn(`[BlocksRegistry] Класс ${name} не найден в ${js}`);
                return;
            }

            console.log(`[BlocksRegistry][DEBUG] → register ${name} (${js})`);
            new Cls(bm).register();
        });

        // ===== Register effects library =====
        //
        // Effects live in ../effects/index.js. They register their own
        // "Эффекты" category and, unlike blocks, they do NOT insert any
        // HTML — a click toggles the `fx-*` class on the currently
        // selected component.
        //
        // register() is async: it fetches the list from
        // GET /editor/effects. We MUST await it so the palette is
        // fully populated before the editor renders the panel.
        //
        // The instance is stored on the GrapesJS instance as
        // `editor._effectBlocks`, so llm/chat.js can call
        // `.finishEdit()` / `.cancelEdit()` / `.registerOne()` /
        // `.getEditingEffect()` without re-importing the class.
        try {
            const effectsMod = await import(`../effects/index.js?v=${version}`);
            const { EffectBlocks } = effectsMod;
            if (EffectBlocks) {
                console.log('[BlocksRegistry][DEBUG] → register EffectBlocks (effects/index.js)');
                const effectBlocks = new EffectBlocks(this.editor);
                await effectBlocks.register();
                this.editor._effectBlocks = effectBlocks;
            } else {
                console.warn('[BlocksRegistry] EffectBlocks class not found in ../effects/index.js');
            }
        } catch (err) {
            console.warn('[BlocksRegistry] effects/index.js not loaded:', err);
        }

        // ===== Register images library =====
        //
        // Images live in ../images/index.js. They register their own
        // "Изображения" category. Unlike effects, a click INSERTS an
        // <img> block into the canvas — the standard GrapesJS block
        // behaviour, no custom click handler.
        //
        // The list comes from the server registry (GET /editor/images,
        // backed by images/registry.json), which is populated when the
        // LLM generates SVGs on step 4 of the create flow.
        //
        // register() is async: it fetches the list from the API. We
        // MUST await it so the palette is fully populated before the
        // editor renders the panel.
        //
        // The instance is stored on the GrapesJS instance as
        // `editor._imageBlocks`, for the same reason as _effectBlocks.
        try {
            const imagesMod = await import(`../images/index.js?v=${version}`);
            const { ImageBlocks } = imagesMod;
            if (ImageBlocks) {
                console.log('[BlocksRegistry][DEBUG] → register ImageBlocks (images/index.js)');
                const imageBlocks = new ImageBlocks(this.editor);
                await imageBlocks.register();
                this.editor._imageBlocks = imageBlocks;
            } else {
                console.warn('[BlocksRegistry] ImageBlocks class not found in ../images/index.js');
            }
        } catch (err) {
            console.warn('[BlocksRegistry] images/index.js not loaded:', err);
        }

        // ===== DEBUG: final state =====
        console.log('[BlocksRegistry][DEBUG] AFTER all modules — categories:',
            bm.getCategories().map(c => ({
                id: c.id,
                label: c.get('label'),
                open: c.get('open'),
            }))
        );

        console.log('[BlocksRegistry] Все категории зарегистрированы:', BLOCKS_MANIFEST.length);
    }
}