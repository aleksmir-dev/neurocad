// app/core/engine/lib/word/editor/blocks/manifest.js

/**
 * Blocks manifest — single source of truth for the block library.
 *
 * Each entry:
 *   name — exported class name (must match `export class <name>` in JS file)
 *   js   — JS file name (relative to blocks/)
 *   css  — CSS file name (relative to blocks/), optional
 *
 * Adding a new block = adding one entry here.
 * All consumers (index.js, grapes.js, word.js) read this list.
 *
 * ORDER MATTERS:
 *   - The order of entries in BLOCKS_MANIFEST defines the order of
 *     categories in the Blocks panel (GrapesJS creates the category on
 *     the first block that belongs to it) AND the order in which the
 *     block CSS files are injected into the canvas <head>.
 *   - Layout comes LAST on purpose: its CSS (layout.css) may override
 *     shared classes and must be loaded after all other block CSS.
 *
 * Block categories (defined inside each JS module):
 *   elements.js — atoms: headings, text, lists, buttons, image,
 *                 divider, quote, badge, card, icon.
 *   ready.js    — ready-made sections: hero, features, steps,
 *                 text-image, image-text, gallery, faq, cta,
 *                 contacts, footer.
 *   layout.js   — grids and shells: container, section,
 *                 2/3/4/auto columns, flex-shell.
 */

export const BLOCKS_MANIFEST = [
    { name: 'ElementBlocks',  js: 'elements.js',    css: 'elements.css'    },
    { name: 'ReadyBlocks',    js: 'ready.js',       css: 'ready.css'       },
    { name: 'LayoutBlocks',   js: 'layout.js',      css: 'layout.css'      },
];

/**
 * Legacy CSS — files that are loaded into the canvas and the public
 * page for backward compatibility with already-published pages, but
 * are NOT registered as blocks (their JS is not loaded, they are not
 * shown in the panel).
 *
 * Add a file here when a block is removed from BLOCKS_MANIFEST but its
 * classes are still used on existing pages.
 *
 * Remove entries during a major revision when analytics show no
 * published page uses the old classes anymore.
 */
export const LEGACY_CSS = [
    // 'old-blocks.css',
];

/** Base path — relative to the site root. */
export const BLOCKS_BASE = '/static/core/engine/lib/word/editor/blocks';

/** Editor CSS base path (canvas.css, content.css live here). */
export const EDITOR_CSS_BASE = '/static/core/engine/lib/word/editor/css';

/**
 * All block CSS URLs, in order, with cache-busting version.
 *
 * Active blocks first (in manifest order), then legacy files.
 *
 * @param {string|number} [version]
 * @returns {string[]}
 */
export function blockCssUrls(version) {
    const v = version ? `?v=${version}` : '';

    const active = BLOCKS_MANIFEST
        .filter(b => b.css)
        .map(b => `${BLOCKS_BASE}/${b.css}${v}`);

    const legacy = LEGACY_CSS
        .map(css => `${BLOCKS_BASE}/${css}${v}`);

    return [...active, ...legacy];
}