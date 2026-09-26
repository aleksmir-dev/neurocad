// neurocad/core/engine/lib/word/editor/images/index.js

/**
 * ImageBlocks — generated-image library for GrapesJS.
 *
 * Registers an "Изображения" category in the block panel. Each entry
 * is a block whose click INSERTS an <img> tag pointing at the image's
 * SVG file. No class is applied, no selection is required — this is
 * the same mechanism as any other block in the panel.
 *
 * Split into modules under editor/images/:
 *
 *   registry.js — load from API, register blocks
 *   panel.js    — DOM state (refreshPanelState)
 *
 * This file is the orchestrator. It owns:
 *
 *   - the shared state fields (_blocks);
 *   - the dynamic import of all modules in `register()`;
 *   - thin public wrappers over the modules, used by llm/chat/*.js.
 *
 * Dynamic imports
 * ---------------
 * All modules are loaded DYNAMICALLY with ?v=<version>, like every
 * other module in the editor. No static imports.
 *
 * The single source of truth for the image list is the backend API
 * (GET /editor/images, backed by images/registry.json).
 *
 * Public API (used by llm/chat/*.js through editor._imageBlocks):
 *
 *   registerOne(image) / unregisterOne(imageId)
 */

export class ImageBlocks {
    /**
     * @param {Object} editor — GrapesJS instance
     */
    constructor(editor) {
        this.editor = editor;
        this.bm = editor.BlockManager;
        this.category = 'Изображения';

        // Registered images. Map: id → { block, alt }.
        this._blocks = new Map();

        // Filled in register() — holds the loaded modules.
        this._mod = null;
    }

    /**
     * Load the modules, register images.
     */
    async register() {
        console.log('[ImageBlocks] Регистрация');

        const version = window.coreEngine?.static_version || Date.now();
        const v = (p) => `${p}?v=${version}`;

        const [registry, panel] = await Promise.all([
            import(v('./registry.js')),
            import(v('./panel.js')),
        ]);

        this._mod = { registry, panel };
        console.log('[ImageBlocks] modules loaded');

        await registry.registerAll(this);

        // Initial paint (nothing to show yet — panel just ensures the
        // category exists; may be a no-op).
        this._mod.panel.refreshPanelState(this);
    }

    /**
     * Detach listeners. Called from Editor.destroy() if needed.
     *
     * No listeners are attached here — image blocks are plain
     * GrapesJS blocks, and GrapesJS handles their clicks internally.
     */
    destroy() {
        this._blocks.clear();
        this._mod = null;
    }

    // ============================================
    // PUBLIC — registry
    // ============================================

    registerOne(image) {
        this._mod?.registry.registerOne(this, image);
    }

    unregisterOne(imageId) {
        this._mod?.registry.unregisterOne(this, imageId);
    }
}