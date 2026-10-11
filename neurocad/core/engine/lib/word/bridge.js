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
 *
 *   Template CSS: because the template HTML lives in the PARENT
 *   document (not inside the GrapesJS iframe), its styles must be
 *   injected into the parent document <head>. We do that in
 *   _injectEditorTemplateCss() and remove it in closeEditor().
 *   Without this, the editor shows the nav/sidebar/footer stripped
 *   of their layout.
 *
 * Save vs auto-save:
 *   - onSave      — manual save (toolbar / Ctrl+S). Persists and
 *                   closes the editor.
 *   - onAutoSave  — background auto-save. Persists only; the editor
 *                   stays open and untouched.
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
 */
const TUTORIAL_CSS_PATH = 'core/engine/lib/word/editor/tutorial.css';

/**
 * id of the <style> tag that holds the base template CSS in the
 * parent document while the editor is open. Removed on close.
 */
const EDITOR_TEMPLATE_CSS_ID = 'word-editor-template-css';

/**
 * Ensure the tutorial stylesheet is in the document exactly once.
 */
function _ensureTutorialCss() {
    const href = `/static/${TUTORIAL_CSS_PATH}`;
    const existing = document.querySelector(
        `link[rel="stylesheet"][href^="${href}"]`
    );
    if (existing) return;

    if (window.coreEngine?.loadCSS) {
        window.coreEngine.loadCSS(TUTORIAL_CSS_PATH);
    } else {
        console.warn('[Word] coreEngine.loadCSS not available — appending <link> manually');
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}

/**
 * Inject the base template CSS into the parent document <head>.
 *
 * Why: the template HTML (nav, sidebar, footer) is rendered OUTSIDE
 * the GrapesJS iframe — in the parent document. Styles in the parent
 * document reach it; styles inside the iframe do not. So we drop a
 * <style> tag into <head>.
 *
 * Idempotent: any previous <style> with the same id is removed first.
 * Empty css → nothing is injected (and any previous tag is removed).
 */
function _injectEditorTemplateCss(css) {
    _clearEditorTemplateCss();
    if (!css) return;

    const styleEl = document.createElement('style');
    styleEl.id = EDITOR_TEMPLATE_CSS_ID;
    styleEl.setAttribute('data-js', 'word-editor-template-css');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
}

function _clearEditorTemplateCss() {
    document.getElementById(EDITOR_TEMPLATE_CSS_ID)?.remove();
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
    const templateId = word.pageData?.template_id;
    let templateHtml = null;
    let templateCss = '';

    if (templateId) {
        const template = await word._data.loadTemplateById(word, templateId);

        // Race check — the editor could be closed during template load
        if (word._editorToken !== myToken) {
            console.log('[Word] Editor was closed during template load — aborting open');
            return;
        }

        if (template && template.content) {
            templateHtml = template.content;
            templateCss = (template.css || '').trim();
            console.log('[Word] Template loaded for editor:', templateId,
                        '| template CSS length:', templateCss.length);
        } else {
            console.warn('[Word] Template not loaded — editor opens without layout');
        }
    }

    // ===== Inject template CSS into the parent document =====
    // The template HTML is rendered OUTSIDE the GrapesJS iframe,
    // so its CSS must live in the parent <head>. Removed on close.
    _injectEditorTemplateCss(templateCss);

    // Lazy-load Editor with cache-busting version
    const version = window.coreEngine?.static_version || Date.now();
    const { loadEditor } = await import(`./editor/index.js?v=${version}`);
    const Editor = await loadEditor();

    // ★ Check: was the editor closed while we were loading?
    if (word._editorToken !== myToken) {
        console.log('[Word] Editor was closed during load — aborting open');
        _clearEditorTemplateCss();
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

        templateHtml: templateHtml,

        onSave: async (data) => {
            await word._saveContent(data);
        },

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
        _clearEditorTemplateCss();
        return;
    }

    // ===== Empty-article tutorial =====
    _maybeStartTutorial(word, version);
}

/**
 * Show the tutorial if the article is empty.
 */
async function _maybeStartTutorial(word, version) {
    if (!word._isContentEmpty || !word._isContentEmpty()) return;

    try {
        _ensureTutorialCss();
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
 */
export async function closeEditor(word) {
    console.log('[Word] Closing GrapesJS editor');

    // ★ Invalidate any pending openEditor
    word._editorToken = (word._editorToken || 0) + 1;

    // ★ Tear down the tutorial (if any)
    if (word._editorTutorial) {
        try {
            word._editorTutorial.stop();
        } catch (e) {
            console.warn('[Word] tutorial.stop() error:', e);
        }
        word._editorTutorial = null;
    }

    // ★ Remove the template CSS we injected for the editor
    _clearEditorTemplateCss();

    word.toolbarEl?.classList.remove('core-engine-lib-word-toolbar-hidden');

    // Destroy editor safely
    if (word.editorInstance?.destroy) {
        try {
            word.editorInstance.destroy();
        } catch (e) {
            console.warn('[Word] editor.destroy() error:', e);
        }
    }
    word.editorInstance = null;
    word.isEditing = false;

    word._clearAllResizers();

    // Re-query widgetContentEl — it may be stale after re-render
    const wc = word.container?.querySelector('.core-engine-lib-word-widget-content');
    if (wc) word.widgetContentEl = wc;

    // Restore article
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