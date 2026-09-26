// neurocad/core/engine/lib/word/editor/effects/index.js

/**
 * EffectBlocks — effect library for GrapesJS.
 *
 * Registers a "Эффекты" category in the block panel. Each entry is a
 * block whose click APPLIES one effect class to the currently selected
 * element (or removes it if already applied).
 *
 * Split into modules under editor/effects/:
 *
 *   header.js    — "+" button in the category header, inline error,
 *                  toast fallback
 *   panel.js     — DOM state of the palette: findBlockEl,
 *                  syncEditButton, refreshPanelState
 *   reorder.js   — moveBlockToTop / verifyTopPosition for newly
 *                  created blocks
 *   toggle.js    — apply / remove an effect class on the selection
 *   edit.js      — edit session (startEdit / saveEdit / cancelEdit /
 *                  finishEdit + getters/setters)
 *   create.js    — create session (onCreateClick / applyDraft… /
 *                  finalizePending / cancelPending / syncServiceButtons)
 *   registry.js  — load from API, register blocks, registerOne /
 *                  unregisterOne / relabelOne
 *
 * This file is the orchestrator. It owns:
 *
 *   - the shared state fields (_blocks, _activeEffect, _editingEffect,
 *     _pendingEffect, _categoryButton);
 *   - the dynamic import of all modules in `register()`;
 *   - the editor event subscriptions (block:click, selection change,
 *     word:effect-create-start);
 *   - thin public wrappers over the modules, used by llm/chat/*.js.
 *
 * Nothing else lives here. All behaviour is in the modules.
 *
 * Dynamic imports
 * ---------------
 * All modules in this package are loaded DYNAMICALLY with ?v=<version>
 * so that the browser cache is invalidated when the static assets
 * change. This is why index.js contains no static imports — a static
 * `import ... from './header.js'` would be cached forever by the
 * browser (same URL, no version query).
 *
 * The single source of truth for the effect list is the backend API
 * (GET /editor/effects, backed by effects/registry.json). There is
 * no bundled manifest — every module in this package is loaded
 * dynamically and versioned.
 *
 * Public API (used by llm/chat/*.js through editor._effectBlocks):
 *
 *   getActiveEffect()            — id of the effect on the selection
 *   getEditingEffect()           — { id, draftCss } or null
 *   getDraftCss()                — string or null
 *   setDraftCss(css)             — update the draft
 *   getPendingEffect()           — { pendingId, draft, title } or null
 *
 *   startEdit(id) / saveEdit(id) / cancelEdit(id) / finishEdit(id)
 *   isEditing(id)
 *
 *   applyDraftToPendingBlock(draft)
 *   finalizePending(effect)
 *   cancelPending()
 *
 *   registerOne(effect) / unregisterOne(effectId)
 *
 *   relabelOne(id, { label, hint, media })
 *      — update the label, hint and/or SVG icon of an existing
 *        effect block in the palette. The id, the CSS and the class
 *        on the canvas are NOT touched. Used by llm/chat/edit.js
 *        after a successful `effect_rename` round-trip.
 */
export class EffectBlocks {
    /**
     * @param {Object} editor — GrapesJS instance
     */
    constructor(editor) {
        this.editor = editor;
        this.bm = editor.BlockManager;
        this.category = 'Эффекты';

        // Registered effects. Map: id → { block, title, builtin }.
        this._blocks = new Map();

        // Effect applied to the currently selected element, or null.
        this._activeEffect = null;

        // Effect being edited via the chat, or null.
        // Shape: { id: string, draftCss: string }
        this._editingEffect = null;

        // Pending effect being CREATED via the chat, or null.
        // Shape: {
        //   pendingId: 'fx-pending-<random>',
        //   draft:     { id, label, hint, css, media } | null,
        //   title:     'Новый эффект',
        // }
        this._pendingEffect = null;

        // Bound handlers — for destroy()
        this._onBlockClick = null;
        this._onSelectionChange = null;
        this._onCreateStart = null;

        // Category header "+" button (once created).
        this._categoryButton = null;

        // Filled in register() — holds the loaded modules.
        //   { header, panel, reorder, toggle, edit, create, registry }
        this._mod = null;
    }

    /**
     * Load the modules, register effects, wire up the editor events.
     */
    async register() {
        console.log('[EffectBlocks] Регистрация');

        // ===== 1. Load the modules (dynamic, versioned) =====
        const version = window.coreEngine?.static_version || Date.now();
        const v = (p) => `${p}?v=${version}`;

        const [
            header,
            panel,
            reorder,
            toggle,
            edit,
            create,
            registry,
        ] = await Promise.all([
            import(v('./header.js')),
            import(v('./panel.js')),
            import(v('./reorder.js')),
            import(v('./toggle.js')),
            import(v('./edit.js')),
            import(v('./create.js')),
            import(v('./registry.js')),
        ]);

        this._mod = { header, panel, reorder, toggle, edit, create, registry };
        console.log('[EffectBlocks] modules loaded');

        // ===== 2. Register all effects =====
        await registry.registerAll(this);

        // ===== 3. Click handler =====
        // GrapesJS fires `block:click` when a block is clicked in the
        // panel. We intercept it here, apply / remove the class, and
        // (importantly) do NOT let the default "insert component" run.
        this._onBlockClick = (block, event) => {
            const blockId = block.get('id');

            // Pending block has a special id ('fx-pending-...'). It is
            // not a real effect — clicking it does nothing.
            if (this._pendingEffect
                && blockId === this._pendingEffect.pendingId) {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                return;
            }

            if (!this._blocks.has(blockId)) return;

            event?.preventDefault?.();
            event?.stopPropagation?.();

            // Service buttons (edit, save, close) handle their own clicks.
            const target = event?.target;
            if (target && target.closest && target.closest(
                '.fx-edit-btn, .fx-save-btn, .fx-close-btn'
            )) {
                return;
            }

            this._mod.toggle.toggleEffect(this, blockId);
        };

        this.editor.on('block:click', this._onBlockClick);

        // ===== 4. Selection change — refresh the palette =====
        this._onSelectionChange = () => {
            this._mod.panel.refreshPanelState(this);
        };

        this.editor.on('component:selected', this._onSelectionChange);
        this.editor.on('component:deselected', this._onSelectionChange);

        // ===== 5. Create start — emitted by header.js on "+" click =====
        // The click handler in header.js only emits the event; the
        // actual "start pending create" logic lives in create.js.
        this._onCreateStart = () => {
            this._mod.create.onCreateClick(this);
        };

        this.editor.on('word:effect-create-start', this._onCreateStart);

        // ===== 6. Category header "+" button =====
        this._mod.header.registerCategoryButton(this);

        // ===== 7. Initial paint =====
        this._mod.panel.refreshPanelState(this);
    }

    /**
     * Detach listeners. Called from Editor.destroy() if needed.
     */
    destroy() {
        if (this._onBlockClick) {
            try { this.editor.off('block:click', this._onBlockClick); } catch (_) {}
        }
        if (this._onSelectionChange) {
            try { this.editor.off('component:selected', this._onSelectionChange); } catch (_) {}
            try { this.editor.off('component:deselected', this._onSelectionChange); } catch (_) {}
        }
        if (this._onCreateStart) {
            try { this.editor.off('word:effect-create-start', this._onCreateStart); } catch (_) {}
        }
        if (this._categoryButton && this._categoryButton.parentNode) {
            this._categoryButton.parentNode.removeChild(this._categoryButton);
        }

        this._onBlockClick = null;
        this._onSelectionChange = null;
        this._onCreateStart = null;
        this._categoryButton = null;
    }

    // ============================================
    // PUBLIC — read-only accessors
    // ============================================

    getActiveEffect() {
        return this._activeEffect;
    }

    getEditingEffect() {
        return this._mod?.edit.getEditingEffect(this) ?? null;
    }

    getDraftCss() {
        return this._mod?.edit.getDraftCss(this) ?? null;
    }

    setDraftCss(css) {
        this._mod?.edit.setDraftCss(this, css);
    }

    getPendingEffect() {
        return this._mod?.create.getPendingEffect(this) ?? null;
    }

    // ============================================
    // PUBLIC — edit session
    // ============================================

    startEdit(effectId) {
        this._mod?.edit.startEdit(this, effectId);
    }

    saveEdit(effectId) {
        this._mod?.edit.saveEdit(this, effectId);
    }

    cancelEdit(effectId) {
        this._mod?.edit.cancelEdit(this, effectId);
    }

    finishEdit(effectId) {
        this._mod?.edit.finishEdit(this, effectId);
    }

    isEditing(effectId) {
        return this._mod?.edit.isEditing(this, effectId) ?? false;
    }

    // ============================================
    // PUBLIC — create session
    // ============================================

    applyDraftToPendingBlock(draft) {
        this._mod?.create.applyDraftToPendingBlock(this, draft);
    }

    finalizePending(effect) {
        this._mod?.create.finalizePending(this, effect);
    }

    cancelPending() {
        this._mod?.create.cancelPending(this);
    }

    // ============================================
    // PUBLIC — registry
    // ============================================

    registerOne(effect) {
        this._mod?.registry.registerOne(this, effect);
    }

    unregisterOne(effectId) {
        this._mod?.registry.unregisterOne(this, effectId);
    }

    /**
     * Update the label, hint and/or SVG icon of an existing effect
     * block in the palette — WITHOUT changing the id, the CSS or the
     * class on the canvas.
     *
     * Used by llm/chat/edit.js after a successful `effect_rename`
     * round-trip: the model proposes a new human-readable label and a
     * new SVG icon, and we simply refresh the block in the palette.
     *
     * @param {string} effectId
     * @param {{ label?: string, hint?: string, media?: string }} payload
     */
    relabelOne(effectId, payload) {
        this._mod?.registry.relabelOne(this, effectId, payload);
    }
}