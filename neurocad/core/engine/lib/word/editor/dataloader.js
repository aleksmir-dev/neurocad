// neurocad/core/engine/lib/word/editor/dataloader.js

/**
 * DataLoader — load initial data into GrapesJS and re-apply
 * post-load state (scope class, body traits).
 *
 * Responsibilities:
 *   1. loadInitial() — called once from Editor._init() after GrapesJS
 *      is ready. Loads the project:
 *        - preferred: full project JSON (getProjectData()) — keeps
 *          wrapper attributes and CSS rules tied to them;
 *        - fallback 1: separate HTML + css fields — HTML via
 *          setComponents, CSS via setStyle;
 *        - fallback 2: HTML with embedded <style> — extracted and
 *          applied to CssComposer manually, because GrapesJS ignores
 *          <style> in setComponents(html).
 *
 *      After a successful load the UndoManager is cleared — so
 *      hasUndo() reflects only user-driven changes, not the initial
 *      load itself. This is what makes the auto-save "dirty check"
 *      in Editor._hasUnsavedChanges() reliable.
 *
 *   2. applyRollback(data) — called from the history modal after a
 *      successful rollback. Reloads the project from the rolled-back
 *      snapshot (JSON or HTML + css) and re-applies post-load state.
 *
 * Post-load state:
 *   GrapesJS replaces the iframe <body> and the wrapper component
 *   during setComponents / loadProjectData. So after each load we must:
 *     - re-apply the scope class (.core-engine-lib-word-blocks) on
 *       <body> — otherwise block CSS rules do not match and blocks
 *       render unstyled;
 *     - re-apply the body-style traits — otherwise the Traits panel
 *       is empty when the wrapper is selected.
 *
 * Empty placeholder:
 *   A freshly created page is stored as <body><p></p></body>. This
 *   <p> is a GrapesJS canvas placeholder — it has no text, no
 *   children, and just takes vertical space. We remove it once,
 *   shortly after the data has been loaded — because component:add
 *   does NOT fire for content that comes in via setComponents /
 *   loadProjectData, only for content added by the user afterwards.
 *   The runtime cleanup in grapes/empty.js handles the latter case.
 *
 *   WHY DEFERRED (requestAnimationFrame):
 *     GrapesJS fills the wrapper asynchronously after setComponents.
 *     Immediately after the call, wrapper.components() may still be
 *     empty — the <p> placeholder appears on the next frame. A
 *     synchronous check would find nothing. We therefore defer the
 *     cleanup by two animation frames, which gives GrapesJS time to
 *     paint the new body.
 *
 *   Only DIRECT children of the wrapper (i.e. of <body>) are
 *   inspected. A nested <p></p> inside a .card or .hero is left
 *   alone — it may be intentional.
 *
 *   An empty placeholder can be <p></p>, <p> </p>, <p>&nbsp;</p> or
 *   <p><br></p> — all four are treated as empty.
 *
 * IMPORTANT — GrapesJS 0.21.x API:
 *   `component.removed` is a METHOD, not a boolean property. Writing
 *   `if (child.removed) return;` evaluates the function object itself
 *   — always truthy — and silently skips every component. Always call
 *   it: `child.removed()`. This applies to both the collection scan
 *   and the final removal loop below.
 *
 * Usage from Editor:
 *   this._dataLoader = new DataLoader(this);
 *   this._dataLoader.loadInitial();
 *   // ... later, after rollback:
 *   this._dataLoader.applyRollback(data);
 *
 * The loader needs from Editor:
 *   - editor        {Object}       — GrapesJS instance
 *   - initialHtml   {string}
 *   - initialProject {Object|null}
 *   - pageData      {Object|null}  — updated after rollback
 *   - _grapes       {GrapesLoader} — for registerBodyTraits (via _mod)
 *   - _scopeClass   {string}
 */
export class DataLoader {
    /**
     * @param {Object} editor — parent Editor instance
     */
    constructor(editor) {
        this.editor = editor;
    }

    // ============================================
    // INITIAL LOAD
    // ============================================

    /**
     * Load initial data into GrapesJS.
     * Called once from Editor._init().
     */
    loadInitial() {
        console.log('[DataLoader] Loading data');

        const ed = this.editor;
        const proj = ed.initialProject;
        const hasProject = !!(proj && (
            (proj.pages && proj.pages.length) ||
            (proj.styles && proj.styles.length) ||
            proj.components
        ));

        if (hasProject) {
            try {
                ed.editor.loadProjectData(proj);
                console.log('[DataLoader] JSON project loaded');
                this._reapplyPostLoad();
                this._scheduleRemoveEmptyPlaceholder();
                this._clearUndoHistory();
                return;
            } catch (e) {
                console.warn('[DataLoader] loadProjectData failed, falling back to HTML:', e);
            }
        }

        // No project JSON — load HTML + CSS separately.
        if (ed.initialHtml) {
            ed.editor.setComponents(ed.initialHtml);

            // New path: CSS comes from the separate `css` field.
            const pageCss = (ed.pageData?.css || '').trim();
            if (pageCss) {
                this._applyCss(pageCss);
                console.log('[DataLoader] HTML + separate CSS loaded');
            } else {
                // Legacy path: CSS embedded in HTML as <style>.
                this._applyStylesFromHtml(ed.initialHtml);
                console.log('[DataLoader] HTML loaded (+styles extracted from HTML)');
            }
        } else {
            console.log('[DataLoader] No data — setting empty paragraph');
            ed.editor.setComponents('<p></p>');
        }

        this._reapplyPostLoad();
        this._scheduleRemoveEmptyPlaceholder();
        this._clearUndoHistory();
    }

    // ============================================
    // ROLLBACK
    // ============================================

    /**
     * Apply a rollback result to the editor — reload the project
     * from the rolled-back snapshot.
     *
     * Called after the user confirms rollback in the history modal.
     * data = { id, title, content, content_json, css, updated_at }
     */
    applyRollback(data) {
        console.log('[DataLoader] Applying rollback result');

        const ed = this.editor;

        // Update page data so subsequent saves use the rolled-back state
        if (ed.pageData) {
            ed.pageData.content = data.content;
            ed.pageData.content_json = data.content_json;
            ed.pageData.css = data.css;
        }

        // Reload editor state from the rolled-back snapshot
        try {
            if (data.content_json) {
                const proj = JSON.parse(data.content_json);
                ed.editor.loadProjectData(proj);
                console.log('[DataLoader] Project reloaded from rollback');
            } else if (data.content) {
                ed.editor.setComponents(data.content);

                const snapshotCss = (data.css || '').trim();
                if (snapshotCss) {
                    this._applyCss(snapshotCss);
                    console.log('[DataLoader] HTML + separate CSS reloaded from rollback');
                } else {
                    // Legacy snapshot: CSS embedded in HTML as <style>.
                    this._applyStylesFromHtml(data.content);
                    console.log('[DataLoader] HTML reloaded from rollback (+styles extracted)');
                }
            }

            // GrapesJS replaced <body> and wrapper — re-apply post-load state.
            this._reapplyPostLoad();

            // Remove the empty <p></p> placeholder that GrapesJS may
            // have left in the freshly loaded body.
            this._scheduleRemoveEmptyPlaceholder();

            // Clear undo history — the rollback itself is not a
            // "user change" for auto-save purposes.
            this._clearUndoHistory();
        } catch (e) {
            console.error('[DataLoader] rollback reload error:', e);
        }
    }

    // ============================================
    // POST-LOAD STATE
    // ============================================

    /**
     * Re-apply scope class + body traits after a load.
     * Called at the end of loadInitial() and applyRollback().
     */
    _reapplyPostLoad() {
        this._reapplyScopeClass();
        this._reapplyBodyTraits();
    }

    /**
     * Schedule the empty <p> cleanup on the next two animation frames.
     *
     * GrapesJS fills the wrapper asynchronously after setComponents /
     * loadProjectData. Right after the call, wrapper.components() may
     * still be empty — the <p> placeholder appears on the next frame.
     * Two rAFs give GrapesJS enough time to paint the new body.
     *
     * Safe to call multiple times — each call schedules an independent
     * check, and the underlying _removeEmptyPlaceholder() is idempotent
     * (it removes only empty <p>s, and there are none left after the
     * first successful run).
     */
    _scheduleRemoveEmptyPlaceholder() {
        if (typeof requestAnimationFrame !== 'function') {
            // No rAF (very old browser / test env) — fall back to a
            // single setTimeout so the call still happens eventually.
            setTimeout(() => this._removeEmptyPlaceholder(), 0);
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._removeEmptyPlaceholder();
            });
        });
    }

    /**
     * Remove an empty <p></p> placeholder from the wrapper (<body>).
     *
     * A freshly created page is stored as <body><p></p></body>. That
     * <p> is a GrapesJS canvas placeholder — no text, no children.
     * It takes vertical space and breaks full-height layouts, so we
     * drop it once, shortly after the data has been loaded.
     *
     * Why here and not only in grapes/empty.js:
     *   The runtime cleanup in grapes/empty.js listens to
     *   `component:add`, which fires only for content the user (or
     *   the LLM) adds interactively. Content that arrives via
     *   setComponents / loadProjectData does NOT trigger
     *   `component:add` for the placeholder — so the placeholder
     *   survives the initial load and only disappears when the user
     *   adds the first real block.
     *
     *   This method runs after the load — so the placeholder is gone
     *   from the very first user-visible render.
     *
     * Safety:
     *   - only DIRECT children of the wrapper are inspected;
     *   - only <p> tags with no text and no child components are
     *     removed;
     *   - <p> </p>, <p>&nbsp;</p>, <p><br></p> also count as empty;
     *   - everything else is left untouched, including nested
     *     <p></p> inside sections (they might be intentional).
     *
     * IMPORTANT — GrapesJS 0.21.x API:
     *   `child.removed` is a METHOD. Calling `child.removed` (without
     *   parens) evaluates the function object itself — always truthy —
     *   and skips every component. Always call it: `child.removed()`.
     */
    _removeEmptyPlaceholder() {
        const ed = this.editor;

        try {
            const instance = ed.editor;
            if (!instance) return;

            const wrapper = instance.getWrapper?.();
            if (!wrapper) return;

            const children = wrapper.components?.();
            if (!children || typeof children.each !== 'function') return;

            // Collect first, then remove — mutating the collection
            // while iterating can skip items.
            const toRemove = [];

            children.each((child) => {
                if (!child || typeof child.get !== 'function') return;

                // `removed` is a METHOD in GrapesJS 0.21.x — call it.
                const isRemoved = typeof child.removed === 'function'
                    ? child.removed()
                    : !!child.removed;
                if (isRemoved || !child.collection) return;

                const tag = String(child.get('tagName') || '').toLowerCase();
                if (tag !== 'p') return;

                const raw = String(child.get('content') || '');
                if (!this._isEmptyContent(raw)) return;

                const comps = child.components && child.components();
                const hasChildren = comps
                    && typeof comps.length === 'number'
                    && comps.length > 0;
                if (hasChildren) return;

                toRemove.push(child);
            });

            toRemove.forEach((child) => {
                if (!child) return;
                const isRemoved = typeof child.removed === 'function'
                    ? child.removed()
                    : !!child.removed;
                if (!isRemoved) {
                    child.remove();
                }
            });

            if (toRemove.length) {
                console.log('[DataLoader] removed empty <p> placeholder:', toRemove.length);
            }
        } catch (e) {
            console.warn('[DataLoader] empty <p> cleanup failed:', e);
        }
    }

    /**
     * Return true if the given raw content string represents an empty
     * paragraph — no visible text, no images, no elements.
     *
     * Recognises:
     *   ""                — bare <p></p>
     *   "   "             — whitespace only
     *   "&nbsp;"          — non-breaking space
     *   "<br>" / "<br/>"  — line break only
     *   combinations of the above
     *
     * @param {string} raw — raw content of the component
     * @returns {boolean}
     */
    _isEmptyContent(raw) {
        if (!raw) return true;

        const stripped = raw
            .replace(/&nbsp;/gi, '')
            .replace(/<br\s*\/?>/gi, '')
            .trim();

        return stripped === '';
    }

    /**
     * Clear the UndoManager history.
     *
     * Called after a successful load (initial or rollback) so that
     * hasUndo() returns false — the load itself should not be treated
     * as an unsaved change by the auto-save dirty check.
     */
    _clearUndoHistory() {
        try {
            const um = this.editor.editor?.UndoManager;
            if (um && typeof um.clear === 'function') {
                um.clear();
                console.log('[DataLoader] UndoManager cleared');
            }
        } catch (e) {
            console.warn('[DataLoader] UndoManager.clear failed:', e);
        }
    }

    /**
     * Re-apply the .core-engine-lib-word-blocks class to the canvas <body>.
     *
     * Called after setComponents / loadProjectData — GrapesJS rebuilds
     * the iframe body during those operations, and the scope class is lost.
     * Without it, block CSS rules (.core-engine-lib-word-blocks .btn, ...)
     * do not match, and blocks render unstyled.
     */
    _reapplyScopeClass() {
        const ed = this.editor;

        try {
            const doc = ed.editor?.Canvas?.getDocument?.();
            if (!doc || !doc.body) return;

            if (!doc.body.classList.contains(ed._scopeClass)) {
                doc.body.classList.add(ed._scopeClass);
                console.log('[DataLoader] scope class re-applied after data load');
            }
        } catch (e) {
            console.warn('[DataLoader] scope class re-apply failed:', e);
        }
    }

    /**
     * Re-apply body (wrapper) traits after data load.
     *
     * GrapesJS replaces the wrapper component during loadProjectData /
     * setComponents, so the body-style traits registered in
     * editor/grapes/traits.js are lost. Re-invoke the module function.
     *
     * GrapesLoader splits its helpers into grapes/*.js modules, loaded
     * lazily and kept on `_grapes._mod`. The old method name
     * `_registerBodyStyleTraits` no longer exists on GrapesLoader — the
     * equivalent is `_mod.registerBodyTraits(instance)`.
     *
     * registerBodyTraits is idempotent:
     *   - it registers trait types only once (checks getType);
     *   - it always re-assigns traits on the current wrapper.
     */
    _reapplyBodyTraits() {
        const ed = this.editor;

        try {
            const grapes = ed._grapes;
            if (!grapes) return;

            const mod = grapes._mod;
            if (mod && typeof mod.registerBodyTraits === 'function') {
                mod.registerBodyTraits(ed.editor);
                console.log('[DataLoader] body traits re-applied after data load');
            } else {
                console.warn('[DataLoader] registerBodyTraits not available on GrapesLoader._mod');
            }
        } catch (e) {
            console.warn('[DataLoader] body traits re-apply failed:', e);
        }
    }

    /**
     * Apply a CSS string to GrapesJS CssComposer.
     *
     * Used for the new separate `css` field (page.css / snapshot.css).
     */
    _applyCss(css) {
        if (!css) return;

        try {
            this.editor.editor.setStyle(css);
            console.log('[DataLoader] CSS applied to CssComposer (separate field)');
        } catch (e) {
            console.warn('[DataLoader] setStyle failed:', e);
        }
    }

    /**
     * Extract <style>...</style> blocks from an HTML string and apply the
     * combined CSS to GrapesJS CssComposer.
     *
     * Legacy path — kept for old snapshots where CSS is still embedded
     * in the HTML.
     */
    _applyStylesFromHtml(html) {
        const matches = [...(html || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
        const css = matches.map(m => m[1]).join('\n').trim();

        if (!css) return;

        try {
            this.editor.editor.setStyle(css);
            console.log('[DataLoader] Inline <style> applied to CssComposer');
        } catch (e) {
            console.warn('[DataLoader] setStyle failed:', e);
        }
    }
}