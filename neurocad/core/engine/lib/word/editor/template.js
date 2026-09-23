// app/core/engine/lib/word/editor/template.js

/**
 * TemplateManager — base template rendering + slot height sync.
 *
 * Handles the "template mode" of the editor:
 *
 *   If a base template HTML is provided:
 *     - Rendered into .editor-template (outside GrapesJS iframe).
 *     - If the template contains [data-slot="content"], the slot is
 *       replaced by .editor-slot and GrapesJS mounts into it.
 *     - If the template has no slot, it is rendered as a read-only
 *       preview and GrapesJS mounts into .editor-canvas.
 *
 *   Device behavior:
 *     - desktop: template visible; slot lives inside .editor-template
 *       (when the template has a slot).
 *     - tablet / mobile: template hidden; slot is moved into
 *       .editor-canvas so the user can test how the slot content fits
 *       narrow viewports without the surrounding template layout.
 *       Applies only when the template has a slot.
 *
 *   Otherwise (no template):
 *     - GrapesJS mounts into .editor-canvas — same as before.
 *
 * Responsibility split:
 *   - TemplateManager renders HTML and manages visibility.
 *   - GrapesLoader decides where GrapesJS mounts (slot vs canvas).
 *
 * Also watches the iframe inside .editor-slot and resizes the slot
 * so it fits the iframe content (GrapesJS sets inline height: 100%,
 * which resolves to 0 inside a static template — the iframe collapses).
 *
 * Usage from Editor._init():
 *   this._templateMgr = new TemplateManager(this);
 *   this._templateMgr.render();          // after widgets.build()
 *   this._templateMgr.setupSlotResize(); // after grapesjs.init() (if template)
 *   this._templateMgr.setVisible(device === 'desktop');
 *
 * All state (template HTML, DOM refs, observers) lives in this class
 * — the parent Editor only holds a reference to the manager instance.
 */
export class TemplateManager {
    /**
     * @param {Object} editor — parent Editor instance. Must expose:
     *   - templateHtml {string|null}
     *   - templateEl   {HTMLElement|null}
     *   - slotEl       {HTMLElement|null}
     *   - canvasEl     {HTMLElement|null}
     *   - editor       {Object|null}   — GrapesJS instance (after init)
     */
    constructor(editor) {
        this.editor = editor;

        // Template visibility state
        // true  → template visible, slot inside template (desktop)
        // false → template hidden, slot moved to canvas (tablet/mobile)
        this._showTemplate = true;

        // Hidden placeholder that remembers the slot's original position
        // inside .editor-template when the slot is moved to canvas.
        this._slotPlaceholder = null;

        // ResizeObserver on iframe content (created in setupSlotResize).
        this._resizeObserver = null;

        // GrapesJS 'canvas:frame:load' handler reference (for detach).
        this._frameLoadHandler = null;
    }

    // ============================================
    // TEMPLATE RENDERING
    // ============================================

    /**
     * Render the base template HTML into .editor-template.
     *
     * The template is rendered as-is, without touching any slot:
     *   - If it contains [data-slot="content"], GrapesLoader will later
     *     replace that node with .editor-slot and mount GrapesJS into it.
     *   - If it has no slot, the template is shown as a read-only
     *     preview; GrapesJS keeps living in .editor-canvas.
     *
     * Adds the `.core-engine-lib-word-blocks` scope class to the
     * template container so that block CSS (which is scoped under that
     * class) applies to the template rendered outside the canvas iframe.
     *
     * Called only when editor.templateHtml is set (page has a template_id).
     * If not — .editor-template stays hidden and empty; GrapesJS mounts
     * into .editor-canvas directly.
     */
    render() {
        const { templateHtml, templateEl } = this.editor;

        if (!templateHtml) {
            console.log('[TemplateManager] No template — using plain canvas');
            return;
        }

        if (!templateEl) {
            console.warn('[TemplateManager] templateEl not found — skipping template render');
            return;
        }

        console.log('[TemplateManager] Rendering template into editor-template');

        // Scope the template with the same wrapper class used in the
        // canvas iframe and on the public page. Block CSS is scoped
        // under .core-engine-lib-word-blocks — without it,
        // .flex-shell / .grid / .hero selectors don't match.
        templateEl.classList.add('core-engine-lib-word-blocks');

        // Insert template HTML as-is. If it has [data-slot="content"],
        // GrapesLoader will mount the canvas into that node later.
        // TemplateManager does NOT touch the slot.
        templateEl.innerHTML = templateHtml;

        // Show the template (desktop by default)
        templateEl.hidden = false;
        this._showTemplate = true;

        console.log('[TemplateManager] Template rendered');
    }

    /**
     * Show or hide the base template.
     *
     * Device switch:
     *   visible = true (desktop):
     *     - slot returns to its original position inside .editor-template
     *       (using the saved placeholder), then the placeholder is removed.
     *     - .editor-template is shown.
     *
     *   visible = false (tablet/mobile):
     *     - slot is moved into .editor-canvas so it fills the whole area.
     *     - a hidden placeholder is left in the template to remember the spot.
     *     - .editor-template is hidden.
     *
     * The method only acts when we are in "template mode" — i.e. the
     * slot is inside the template right now, OR we previously moved it
     * out and left a placeholder. If the template has no
     * [data-slot="content"] at all, this method does nothing — the
     * template stays visible as a preview, and slotEl stays in
     * .editor-canvas.
     *
     * After the change, slot height is re-synced to iframe content.
     */
    setVisible(visible) {
        const { templateHtml, templateEl, slotEl, canvasEl } = this.editor;

        if (!templateHtml || !templateEl || !slotEl) return;

        // Are we in template mode? Two cases:
        //   1. slotEl is currently inside .editor-template — first call.
        //   2. slotEl was moved out earlier; we left a hidden placeholder
        //      inside the template. This is the case after a
        //      tablet/mobile switch, and it must NOT block a return
        //      to desktop.
        const slotInTemplateNow = templateEl.contains(slotEl);
        const slotWasInTemplate = !!this._slotPlaceholder;
        const inTemplateMode = slotInTemplateNow || slotWasInTemplate;

        if (!inTemplateMode) return;

        if (this._showTemplate === visible) return;

        this._showTemplate = visible;

        if (visible) {
            // Restore: put slot back into template at placeholder position
            if (this._slotPlaceholder && this._slotPlaceholder.parentNode) {
                this._slotPlaceholder.parentNode.replaceChild(
                    slotEl,
                    this._slotPlaceholder
                );
            }
            this._slotPlaceholder = null;
            templateEl.hidden = false;
            templateEl.style.display = '';
        } else {
            // Hide: move slot into canvas, leave placeholder in template
            if (!this._slotPlaceholder) {
                this._slotPlaceholder = document.createElement('div');
                this._slotPlaceholder.style.display = 'none';
                this._slotPlaceholder.setAttribute('data-slot-placeholder', '');
            }

            if (slotEl.parentNode) {
                slotEl.parentNode.replaceChild(
                    this._slotPlaceholder,
                    slotEl
                );
            }

            canvasEl.appendChild(slotEl);
            templateEl.hidden = true;
            templateEl.style.display = 'none';
        }

        // Re-sync slot height after layout change
        setTimeout(() => this.syncSlotHeight(), 0);
    }

    // ============================================
    // SLOT HEIGHT SYNC
    // ============================================

    /**
     * Watch the iframe inside .editor-slot and resize it to fit content.
     *
     * Problem:
     *   GrapesJS sets inline `height: 100%` on its container.
     *   Inside a static template, the parent has no fixed height,
     *   so `100%` resolves to 0 — and the iframe collapses.
     *
     * Fix:
     *   1. Wait until the iframe appears inside .editor-slot.
     *   2. Measure iframe.contentDocument.body.scrollHeight.
     *   3. Set slot.style.height (inline) to that value.
     *   4. Set iframe.style.height = '100%' so it fills the slot.
     *   5. Watch for content changes (ResizeObserver) and re-sync.
     *   6. Re-sync after `canvas:frame:load` — GrapesJS re-creates the
     *      iframe on device change and may reset inline styles.
     *
     * Called only if the page has a template (templateHtml is set).
     */
    setupSlotResize() {
        const { slotEl, editor } = this.editor;

        if (!slotEl || !editor) {
            console.warn('[TemplateManager] setupSlotResize: slotEl or GrapesJS editor missing');
            return;
        }

        let attempts = 0;
        const maxAttempts = 30;

        const tryAttach = () => {
            attempts++;
            const iframe = slotEl?.querySelector('iframe');

            if (!iframe || !iframe.contentDocument?.body) {
                if (attempts < maxAttempts) {
                    setTimeout(tryAttach, 100);
                } else {
                    console.warn('[TemplateManager] iframe not found in .editor-slot after', maxAttempts, 'attempts');
                }
                return;
            }

            // Initial sync
            this.syncSlotHeight();

            // Watch for content changes
            try {
                this._resizeObserver = new ResizeObserver(() => this.syncSlotHeight());
                this._resizeObserver.observe(iframe.contentDocument.body);
                this._resizeObserver.observe(iframe);
                console.log('[TemplateManager] Slot resize observer attached');
            } catch (e) {
                console.warn('[TemplateManager] ResizeObserver not available:', e);
            }

            // Re-sync on canvas reload (device change, project load, ...)
            this._frameLoadHandler = () => {
                console.log('[TemplateManager] canvas:frame:load — re-syncing slot height');
                setTimeout(() => this.syncSlotHeight(), 0);
            };
            editor.on('canvas:frame:load', this._frameLoadHandler);
        };

        tryAttach();
    }

    /**
     * Sync .editor-slot height with the iframe's content height.
     *
     * Called by ResizeObserver and by `canvas:frame:load` handler.
     */
    syncSlotHeight() {
        const { slotEl } = this.editor;
        if (!slotEl) return;

        const iframe = slotEl.querySelector('iframe');
        if (!iframe || !iframe.contentDocument?.body) return;

        try {
            const h = iframe.contentDocument.body.scrollHeight;
            if (h > 0) {
                // Force slot height — overrides GrapesJS inline `height: 100%`.
                slotEl.style.height = h + 'px';
                slotEl.style.minHeight = h + 'px';
                // Make iframe fill the slot (GrapesJS sets iframe height internally).
                iframe.style.height = '100%';
            }
        } catch (e) {
            // cross-origin or detached — ignore
        }
    }

    // ============================================
    // DESTROY
    // ============================================

    /**
     * Detach observers and event handlers.
     * Called from Editor.destroy().
     */
    destroy() {
        if (this._resizeObserver) {
            try { this._resizeObserver.disconnect(); } catch (e) { /* ignore */ }
            this._resizeObserver = null;
        }

        if (this._frameLoadHandler && this.editor?.editor) {
            try {
                this.editor.editor.off('canvas:frame:load', this._frameLoadHandler);
            } catch (e) { /* ignore */ }
        }
        this._frameLoadHandler = null;

        this._slotPlaceholder = null;
        this._showTemplate = true;
    }
}