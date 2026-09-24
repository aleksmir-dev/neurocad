// app/core/engine/lib/word/editor/dataloader.js

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
 *   - _grapes       {GrapesLoader} — for _registerBodyStyleTraits
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
     * GrapesLoader._registerBodyStyleTraits are lost. Re-invoke it.
     *
     * GrapesLoader._registerBodyStyleTraits is idempotent:
     *   - it registers trait types only once (checks getType);
     *   - it always re-assigns traits on the current wrapper.
     */
    _reapplyBodyTraits() {
        const ed = this.editor;

        try {
            if (!ed._grapes) return;

            if (typeof ed._grapes._registerBodyStyleTraits === 'function') {
                ed._grapes._registerBodyStyleTraits(ed.editor);
                console.log('[DataLoader] body traits re-applied after data load');
            } else {
                console.warn('[DataLoader] _registerBodyStyleTraits not found on GrapesLoader');
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