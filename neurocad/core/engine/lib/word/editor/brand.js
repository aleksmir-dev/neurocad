// neurocad/core/engine/lib/word/editor/brand.js

/**
 * Footer brand patcher.
 *
 * Substitutes the real public host of the site owner into any
 * [data-footer-brand] element that the user drops into the canvas.
 *
 * IMPORTANT — only on drop, never on load.
 *   The core-footer block (see blocks/ready.js) ships with the
 *   placeholder "© 2026 site.ru". This module patches it ONLY when
 *   the user drags the core-footer block from the block panel into
 *   the canvas. It NEVER touches:
 *     - pages loaded from the backend (setComponents / loadProjectData)
 *     - components the user edited by hand
 *     - anything else that already exists in the canvas
 *
 *   Why not `component:add`:
 *     component:add fires for BOTH — drag-and-drop AND project load.
 *     Patching on component:add would silently rewrite the user's
 *     own text every time the page is reopened. That is exactly what
 *     we must NOT do.
 *
 *   Why not `block:drag:stop`:
 *     With the native HTML5 drag-and-drop engine (nativeDnd, enabled
 *     by default in GrapesJS 0.13.5+), the block:drag:* events do
 *     NOT fire — see GrapesJS issue #765. The officially recommended
 *     replacement is `canvas:drop`.
 *
 *   Why `canvas:drop` is safe:
 *     It fires when a component is dropped into the canvas. When the
 *     drop comes from the block panel (i.e. the user dragged a
 *     block), the dataTransfer argument is a real DataTransfer
 *     object. When the project is being loaded, `canvas:drop` does
 *     not fire at all — loading goes through setComponents /
 *     loadProjectData, not through the drop path. As an extra
 *     guard, we also bail out early if dataTransfer is falsy.
 *
 * Copyright year is FIXED at 2026 (year of first publication).
 * Bumping it annually is not required — copyright does not expire
 * and does not need to be renewed.
 *
 * This module is loaded dynamically with the usual `?v=` cache
 * buster — see editor.js → _init(). No static imports anywhere.
 */

/**
 * Subscribe to `canvas:drop` on the given GrapesJS instance and
 * patch [data-footer-brand] elements inside the newly dropped
 * component.
 *
 * @param {Object} editorInstance — the parent Editor (has .editor
 *                                  = GrapesJS instance, and
 *                                  .publicHost = real public host)
 */
export function bindFooterBrand(editorInstance) {
    if (!editorInstance || !editorInstance.editor) return;

    const host = editorInstance.publicHost;
    if (!host) {
        console.log('[Brand] publicHost not set — footer brand will keep its placeholder');
        return;
    }

    const gjs = editorInstance.editor;

    // `canvas:drop` signature (GrapesJS 0.21.x):
    //   (dataTransfer, model) — the DataTransfer of the drop and the
    //   component that was added to the canvas.
    gjs.on('canvas:drop', (dataTransfer, model) => {
        try {
            // Defensive guard: if there is no DataTransfer, this is
            // not a user-driven drop from the block panel. Bail out.
            if (!dataTransfer) return;
            if (!model) return;

            // model.find(selector) returns an array and includes the
            // model itself when it matches the selector.
            const targets = model.find('[data-footer-brand]');
            if (!targets || !targets.length) return;

            const text = `© 2026 ${host}`;

            targets.forEach((el) => {
                if (!el || typeof el.set !== 'function') return;

                // `removed` is a METHOD in GrapesJS 0.21.x — call it.
                if (typeof el.removed === 'function' && el.removed()) return;

                // A text component stores its visible text in a child
                // component. Clear the children first, otherwise the
                // old placeholder text stays visible.
                const comps = typeof el.components === 'function'
                    ? el.components()
                    : null;
                if (comps && typeof comps.reset === 'function') {
                    comps.reset();
                }

                el.set('content', text);
            });

            console.log('[Brand] footer brand patched:', text);
        } catch (e) {
            console.warn('[Brand] footer brand patch failed:', e);
        }
    });

    console.log('[Brand] footer brand bound (canvas:drop)');
}