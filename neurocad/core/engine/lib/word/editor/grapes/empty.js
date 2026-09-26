// app/core/engine/lib/word/editor/grapes/empty.js

/**
 * Auto-remove the empty <p> placeholder.
 *
 * GrapesJS inserts <p></p> as a placeholder for an empty canvas.
 * It takes vertical space and breaks full-height layouts.
 *
 * As soon as any real component lands in the wrapper (body), drop
 * the empty <p> — but only if it is truly empty (no content, no
 * children). User-authored paragraphs are left alone.
 *
 * Safety notes:
 *   - the component may already be removed (e.g. we removed it in a
 *     previous iteration of the same handler, or GrapesJS is tearing
 *     down the tree during a drag). Guard against that.
 *   - wrapper.components() may not be a Backbone collection in some
 *     versions — use .each only if it exists.
 *   - child.components() returns a collection; .length on it is safe,
 *     but double-check it is truthy.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks.
 */

/**
 * Bind the empty <p> cleanup to component:add.
 *
 * @param {Object} instance — GrapesJS instance
 * @returns {Function} the handler, so it can be detached in destroy()
 */
export function bindEmptyPCleanup(instance) {
    const handler = (component) => {
        try {
            // --- Guards: component may be gone ---
            if (!component) return;
            if (typeof component.parent !== 'function') return;

            const parent = component.parent();
            const wrapper = instance.getWrapper();

            // React only when adding directly into the wrapper (body)
            if (!parent || parent !== wrapper) return;

            // --- Guard: wrapper.components() may be missing ---
            if (typeof wrapper.components !== 'function') return;

            const children = wrapper.components();
            if (!children || typeof children.each !== 'function') return;

            // Collect first, then remove — mutating the collection
            // while iterating can skip items or re-enter the handler.
            const toRemove = [];

            children.each((child) => {
                if (!child || child === component) return;
                if (typeof child.get !== 'function') return;

                // Already removed from the tree
                if (child.removed || !child.collection) return;

                const tag = child.get('tagName');
                const content = String(child.get('content') || '').trim();

                let hasChildren = false;
                const comps = child.components && child.components();
                if (comps && typeof comps.length === 'number') {
                    hasChildren = comps.length > 0;
                }

                const isEmptyP = tag === 'p'
                    && !content
                    && !hasChildren;

                if (isEmptyP) {
                    toRemove.push(child);
                }
            });

            toRemove.forEach((child) => {
                if (child && !child.removed) {
                    child.remove();
                    console.log('[GrapesLoader] removed empty <p> placeholder');
                }
            });
        } catch (e) {
            // Cleanup is best-effort: never let it break the drop
            // or the editor flow.
            console.warn('[GrapesLoader] empty <p> cleanup failed:', e);
        }
    };

    instance.on('component:add', handler);
    return handler;
}