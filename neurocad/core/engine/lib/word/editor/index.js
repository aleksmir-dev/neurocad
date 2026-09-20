// app/core/engine/lib/word/editor/index.js

/**
 * GrapesJS editor entry point.
 *
 * Dynamically loads the Editor class from editor.js with a version query,
 * so the browser does not serve a stale cached copy after updates.
 *
 * Usage (from word.js):
 *
 *   const version = window.coreEngine?.static_version || Date.now();
 *   const { loadEditor } = await import(`./editor/index.js?v=${version}`);
 *   const Editor = await loadEditor();
 *
 *   this.editorInstance = new Editor(container, props);
 */

export async function loadEditor() {
    const version = window.coreEngine?.static_version || Date.now();
    const { Editor } = await import(`./editor.js?v=${version}`);
    return Editor;
}