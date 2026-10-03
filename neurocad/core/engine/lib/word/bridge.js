// app/core/engine/lib/word/bridge.js

/**
 * Bridge — glue between Word (page view) and GrapesJS Editor.
 *
 * Responsibilities:
 *   - openEditor: switch Word widget into edit mode, mount Editor.
 *   - closeEditor: destroy Editor and restore the article view.
 *
 * Template handling:
 *   If the page has template_id, the base template HTML is rendered
 *   OUTSIDE the GrapesJS iframe (in .editor-template), and GrapesJS
 *   mounts only into the [data-slot="content"] placeholder.
 *   This way the template layout is visible but not editable.
 *
 *   If the page has no template, GrapesJS mounts into .editor-canvas
 *   directly — same as before.
 *
 * Save vs auto-save:
 *   - onSave      — manual save (toolbar / Ctrl+S). Persists and
 *                   closes the editor.
 *   - onAutoSave  — background auto-save. Persists only; the editor
 *                   stays open and untouched.
 *
 * Empty-article tutorial:
 *   When the editor is opened for an EMPTY article (no content), a
 *   short three-step walkthrough (toolbar → area-left → area-right,
 *   see ./editor/tutorial.js) is shown. It runs every time, with no
 *   "never show again" flag.
 *
 *   The tutorial CSS (./editor/tutorial.css) is loaded here, right
 *   before the JS module is imported. This guarantees the bubble is
 *   styled on the very first paint — otherwise it would render as a
 *   bare <div> until some other code happens to pull the stylesheet
 *   in. Loading is guarded by a <link> check so we do not append
 *   duplicates on every editor open.
 *
 * Race protection:
 *   Editor init is async (dynamic imports, GrapesJS init). If the user
 *   cancels while init is still running, we must NOT create a new Editor
 *   after close. A monotonic token `word._editorToken` guards against this:
 *   each open/close increments the token, and openEditor checks the token
 *   after each await boundary.
 */

/**
 * Path to the tutorial stylesheet, relative to /static/.
 * Kept in one place so the <link> guard and loadCSS() call cannot drift.
 */
const TUTORIAL_CSS_PATH = 'core/engine/lib/word/editor/tutorial.css';

/**
 * Ensure the tutorial stylesheet is in the document exactly once.
 *
 * coreEngine.loadCSS() may or may not be idempotent depending on the
 * build; we guard here anyway so repeated editor opens do not append
 * duplicate <link> tags. The check matches both the absolute
 * (/static/...) and versioned (?v=...) forms.
 */
function _ensureTutorialCss() {
    const href = `/static/${TUTORIAL_CSS_PATH}`;

    // Already present (any version) — nothing to do.
    const existing = document.querySelector(
        `link[rel="stylesheet"][href^="${href}"]`
    );
    if (existing) return;

    if (window.coreEngine?.loadCSS) {
        window.coreEngine.loadCSS(TUTORIAL_CSS_PATH);
    } else {
        // Fallback — coreEngine not ready yet. Should not happen in
        // practice because openEditor() runs after Word._init().
        console.warn('[Word] coreEngine.loadCSS not available — appending <link> manually');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}

/**
 * Open the GrapesJS editor inside the Word widget.
 *
 * @param {Object} word — Word instance
 * @returns {Promise<void>}
 */
export async function openEditor(word) {
    console.log('[Word] Opening GrapesJS editor');

    // Race token — invalidated by closeEditor
    word._editorToken = (word._editorToken || 0) + 1;
    const myToken = word._editorToken;

    word.isEditing = true;
    word.toolbarEl?.classList.add('core-engine-lib-word-toolbar-hidden');
    word._clearAllResizers();

    // Clear widget content (keep toolbar and widget itself)
    if (word.widgetContentEl) {
        while (word.widgetContentEl.firstChild) {
            word.widgetContentEl.removeChild(word.widgetContentEl.firstChild);
        }
    } else {
        console.warn('[Word] widgetContentEl not found — re-rendering');
        await word._view.render(word);
    }

    // ===== Load base template (if any) =====
    // Render template HTML into .editor-template, replace [data-slot="content"]
    // with the .editor-slot placeholder. GrapesJS will mount into that slot.
    const templateId = word.pageData?.template_id;
    let templateHtml = null;

    if (templateId) {
        const template = await word._data.loadTemplateById(word, templateId);

        // Race check — the editor could be closed during template load
        if (word._editorToken !== myToken) {
            console.log('[Word] Editor was closed during template load — aborting open');
            return;
        }

        if (template && template.content) {
            templateHtml = template.content;
            console.log('[Word] Template loaded for editor:', templateId);
        } else {
            console.warn('[Word] Template not loaded — editor opens without layout');
        }
    }

    // Lazy-load Editor with cache-busting version
    const version = window.coreEngine?.static_version || Date.now();
    const { loadEditor } = await import(`./editor/index.js?v=${version}`);
    const Editor = await loadEditor();

    // ★ Check: was the editor closed while we were loading?
    if (word._editorToken !== myToken) {
        console.log('[Word] Editor was closed during load — aborting open');
        return;
    }

    // ===== Create Editor instance =====
    word.editorInstance = new Editor(word.widgetContentEl, {
        title: word.pageData?.title || 'Страница',
        html: word.pageData?.content || '',
        project: word.pageData?.content_json
            ? word._utils.safeJsonParse(word.pageData.content_json)
            : null,
        pageId: word.pageId,
        pageData: word.pageData,

        // Template HTML — Editor renders it into .editor-template before
        // GrapesJS init, and mounts into .editor-slot.
        templateHtml: templateHtml,

        // Manual save: persist AND close the editor.
        onSave: async (data) => {
            await word._saveContent(data);
        },

        // Auto-save: persist only. Do NOT close the editor.
        onAutoSave: async (data) => {
            await word._autoSaveContent(data);
        },

        onCancel: () => {
            closeEditor(word);
        },
    });

    await word.editorInstance.waitForInit();

    // Second race check — Editor could be closed during init too
    if (word._editorToken !== myToken) {
        console.log('[Word] Editor was closed during init — destroying');
        try {
            word.editorInstance?.destroy?.();
        } catch (e) {
            console.warn('[Word] destroy after race error:', e);
        }
        word.editorInstance = null;
        return;
    }

    // ===== Empty-article tutorial =====
    // Shown when the article has no content. Runs on EVERY open of an
    // empty page — no "never show again" flag. Destroyed together with
    // the editor (see closeEditor).
    _maybeStartTutorial(word, version);
}

/**
 * Show the tutorial if the article is empty.
 *
 * "Empty" uses the same notion as Word._isContentEmpty(): HTML is
 * stripped, style tags are ignored, whitespace is collapsed.
 *
 * The tutorial is stored on `word._editorTutorial` so closeEditor()
 * can tear it down cleanly.
 *
 * CSS is loaded BEFORE the JS module so the bubble is styled on the
 * very first paint. _ensureTutorialCss() is idempotent — repeated
 * editor opens do not append duplicate <link> tags.
 *
 * @param {Object} word
 * @param {string|number} version — cache-busting version
 */
async function _maybeStartTutorial(word, version) {
    if (!word._isContentEmpty || !word._isContentEmpty()) return;

    try {
        // 1. CSS first — the bubble must be styled on the very first paint.
        _ensureTutorialCss();

        // 2. Then the JS module (versioned dynamic import).
        const { EditorTutorial } = await import(
            `./editor/tutorial.js?v=${version}`
        );

        word._editorTutorial = new EditorTutorial();
        word._editorTutorial.start();
    } catch (e) {
        console.warn('[Word] EditorTutorial load failed:', e);
    }
}

/**
 * Close the GrapesJS editor and restore the article view.
 *
 * Safe against:
 *   - destroy() throwing (wrapped in try/catch)
 *   - stale widgetContentEl (re-queried before use)
 *   - pending openEditor (token invalidated at the top)
 *
 * @param {Object} word — Word instance
 */
export async function closeEditor(word) {
    console.log('[Word] Closing GrapesJS editor');

    // ★ Invalidate any pending openEditor
    word._editorToken = (word._editorToken || 0) + 1;

    // ★ Tear down the tutorial (if any) — the editor is going away.
    if (word._editorTutorial) {
        try {
            word._editorTutorial.stop();
        } catch (e) {
            console.warn('[Word] tutorial.stop() error:', e);
        }
        word._editorTutorial = null;
    }

    word.toolbarEl?.classList.remove('core-engine-lib-word-toolbar-hidden');

    // Destroy editor safely — never let errors break the cleanup
    if (word.editorInstance?.destroy) {
        try {
            word.editorInstance.destroy();
        } catch (e) {
            console.warn('[Word] editor.destroy() error:', e);
        }
    }
    word.editorInstance = null;
    word.isEditing = false;

    // Remove any remaining resizer handles
    word._clearAllResizers();

    // Re-query widgetContentEl — it may be stale after re-render
    const wc = word.container?.querySelector('.core-engine-lib-word-widget-content');
    if (wc) word.widgetContentEl = wc;

    // Restore article (guaranteed)
    if (word.widgetContentEl) {
        while (word.widgetContentEl.firstChild) {
            word.widgetContentEl.removeChild(word.widgetContentEl.firstChild);
        }
        const article = await word._view.buildArticle(word);
        word.widgetContentEl.appendChild(article);
    } else {
        await word._view.render(word);
    }

    console.log('[Word] Editor closed, article restored');
}