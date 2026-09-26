// neurocad/core/engine/lib/word/editor/images/panel.js

/**
 * Panel — DOM state of the "Изображения" palette.
 *
 * Image blocks are plain GrapesJS blocks: no active state, no edit
 * button, no service buttons. So this module is intentionally minimal:
 * it just provides a refreshPanelState hook so index.js can call it
 * without conditional logic, and so future features (search, filter,
 * grouping by source) have a place to live.
 *
 * No DOM patching here today.
 */

/**
 * Refresh the panel state.
 *
 * Today: no-op. Kept as a hook for symmetry with effects/panel.js and
 * so index.js can always call it unconditionally.
 *
 * @param {ImageBlocks} instance
 */
export function refreshPanelState(instance) {
    // no-op
}

/**
 * Find a block's DOM element by its title.
 *
 * Kept for parity with effects/panel.js — used by future features
 * (e.g. moving a newly created image to the top of the category).
 *
 * @param {ImageBlocks} instance
 * @param {string} title
 * @returns {HTMLElement|null}
 */
export function findBlockEl(instance, title) {
    if (!instance || !title) return null;

    const panel = instance.editor?.getContainer?.();
    if (!panel) return null;

    const nodes = panel.querySelectorAll('.gjs-block');
    for (const node of nodes) {
        const titleAttr = node.getAttribute('title');
        if (titleAttr === title) return node;
    }
    return null;
}