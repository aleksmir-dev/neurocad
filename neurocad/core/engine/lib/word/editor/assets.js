// app/core/engine/lib/word/editor/assets.js

/**
 * AssetsManager — GrapesJS media library integration.
 *
 * Responsibilities:
 *   1. Load the list of uploaded images from the backend
 *      GET /core/engine/lib/word/assets
 *      and add them to editor.AssetManager.
 *
 *   2. New file uploads go through GrapesJS AssetManager itself —
 *      the config (grapes.js) sets:
 *        upload: '/core/engine/lib/word/assets/upload'
 *      GrapesJS handles drag & drop and the "upload" button.
 *
 * Backend response shape:
 *   { success: true, data: [{ src, name, type }, ...] }
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Notes:
 *   - Errors are logged, not thrown — the editor must open even
 *     if the media library is empty or the server is unavailable.
 */
export class AssetsManager {
    constructor(editor) {
        this.editor = editor;              // parent Editor instance
        this.api = editor._assetsApi;      // '/core/engine/lib/word/assets'
    }

    /**
     * Load existing assets and add them to the GrapesJS AssetManager.
     */
    async load() {
        console.log('[AssetsManager] Loading assets:', this.api);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(this.api);

            // Support both response shapes:
            //   { success: true, data: [...] }  — our backend
            //   [...]                            — raw array
            const items = Array.isArray(json)
                ? json
                : (json && Array.isArray(json.data) ? json.data : []);

            if (items.length === 0) {
                console.log('[AssetsManager] No assets');
                return;
            }

            // GrapesJS instance lives at editor.editor
            const gjs = this.editor.editor;
            if (!gjs) {
                console.warn('[AssetsManager] GrapesJS not initialized yet');
                return;
            }

            gjs.AssetManager.add(items);
            console.log(`[AssetsManager] Added assets: ${items.length}`);
        } catch (e) {
            console.warn('[AssetsManager] Failed to load assets:', e);
        }
    }
}