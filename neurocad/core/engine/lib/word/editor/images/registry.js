// neurocad/core/engine/lib/word/editor/images/registry.js

/**
 * Registry — loading image definitions and registering them as
 * GrapesJS blocks.
 *
 * Responsibilities
 * ----------------
 *   1. loadImages(instance)
 *      Fetch the image list from GET /editor/images. The API is the
 *      single source of truth (backed by images/registry.json on the
 *      backend). On failure — returns an empty list; the editor still
 *      works, the palette is just empty.
 *
 *   2. registerBlock(instance, image)
 *      Register a single image as a GrapesJS block. The block's
 *      `content` is a full <img> tag pointing at the image's SVG file
 *      on /static/. No class is applied.
 *
 *   3. registerAll(instance)
 *      Fetch the list and register every image in order. Called once
 *      from index.js → register().
 *
 *   4. registerOne(instance, image)
 *      Register a single image without a reload. Used when the LLM
 *      creates a new image during a run.
 *
 *   5. unregisterOne(instance, imageId)
 *      Remove a single image from the palette without a reload.
 *
 * No static imports. Loaded via dynamic import in index.js.
 */

// Images editor API base (relative to origin).
const IMAGES_API = '/core/engine/lib/word/editor/images';

// Static base for the SVG files.
const IMAGES_STATIC_BASE =
    '/static/core/engine/lib/word/editor/images';

/**
 * Register every image from the API.
 * Called once from index.js → register().
 *
 * @param {ImageBlocks} instance
 */
export async function registerAll(instance) {
    const images = await loadImages(instance);
    console.log('[ImageBlocks] images to register:', images.length);

    images.forEach(image => registerBlock(instance, image));
}

/**
 * Fetch the image list from the API.
 *
 * The API is the single source of truth. On failure — empty list;
 * the palette stays empty. This makes API problems visible instead
 * of silently substituting a stale list.
 *
 * @param {ImageBlocks} instance
 * @returns {Promise<Array<{id: string, alt: string, file: string, source: string, builtin: boolean, order: number}>>}
 */
export async function loadImages(instance) {
    try {
        const url = `${IMAGES_API}${qs(instance)}`;
        console.log('[ImageBlocks] GET', url);

        const fetchJson = window.coreEngine?.fetchJson;
        if (!fetchJson) throw new Error('coreEngine.fetchJson not available');

        const data = await fetchJson(url);
        if (data && data.success && Array.isArray(data.data)) {
            console.log('[ImageBlocks] loaded from API:', data.data.length);
            return data.data.map(e => ({
                id: e.id,
                alt: e.alt || '',
                file: e.file,
                source: e.source || 'llm',
                builtin: !!e.builtin,
                order: typeof e.order === 'number' ? e.order : 100,
            }));
        }

        console.warn('[ImageBlocks] unexpected payload', data);
        throw new Error('unexpected payload');
    } catch (e) {
        console.warn('[ImageBlocks] API load failed:', e);
        return [];
    }
}

/**
 * Register a single image as a GrapesJS block.
 *
 * The block's content is a full <img> tag pointing at the SVG file.
 * The user can drag it into the canvas like any other block.
 *
 * @param {ImageBlocks} instance
 * @param {Object} image — { id, alt, file, source, builtin }
 */
export function registerBlock(instance, image) {
    if (!image || !image.id || !image.file) return;

    if (instance._blocks.has(image.id)) {
        console.warn('[ImageBlocks] registerBlock: already registered', image.id);
        return;
    }

    // Static URL for the SVG file.
    const url = `${IMAGES_STATIC_BASE}/${image.file}`;

    // Alt text: use the human description, fall back to the id.
    const alt = image.alt || image.id;

    // The content of the block is a complete <img> tag. The image
    // class matches what the editor's .image atom expects.
    const content = `<img class="image" src="${url}" alt="${escapeAttr(alt)}">`;

    const block = instance.bm.add(image.id, {
        label: image.alt || image.id,
        category: instance.category,
        media: `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;">`,
        content: content,
        activate: false,
        attributes: {
            title: image.alt || image.id,
        },
    });

    instance._blocks.set(image.id, {
        block,
        alt,
    });

    console.log('[ImageBlocks] registered:', image.id);
}

/**
 * Register a single image without a reload.
 *
 * @param {ImageBlocks} instance
 * @param {Object} image
 */
export function registerOne(instance, image) {
    if (!instance || !image || !image.id) return;
    registerBlock(instance, image);
}

/**
 * Remove a single image from the palette without a reload.
 *
 * @param {ImageBlocks} instance
 * @param {string} imageId
 */
export function unregisterOne(instance, imageId) {
    const entry = instance._blocks.get(imageId);
    if (!entry) return;

    try { instance.bm.remove(imageId); } catch (_) {}
    instance._blocks.delete(imageId);

    console.log('[ImageBlocks] unregistered:', imageId);
}

// ============================================
// INTERNAL
// ============================================

/**
 * Build the ?module=<name> query string for the images API.
 *
 * @param {ImageBlocks} instance
 * @returns {string}
 */
function qs(instance) {
    const moduleName = window.coreEngine?.moduleName
        || document.body.dataset.module
        || '';
    return moduleName
        ? `?module=${encodeURIComponent(moduleName)}`
        : '';
}

/**
 * Minimal attribute escaping for alt text.
 */
function escapeAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}