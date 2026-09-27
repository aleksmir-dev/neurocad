// neurocad/core/engine/lib/word/data.js

/**
 * Word data loading — fetch page by id or by date/time.
 * Pure functions, take `word` instance for context (qs, pageId).
 *
 * Uses window.coreEngine.fetchJson — loaded once by CoreEngine.loadApi().
 *
 * URL schemas:
 *   /core/engine/pages/<nav_id>/<date>/<time>   — page view URL
 *     engine.paramsList = [<nav_id>, <date>, <time>]
 *
 *   /core/engine/lib/word/item/<page_id>        — load by page id
 *   /core/engine/lib/word/bydatetime/<date>/<time>?nav_id=<id>
 *     — load by date/time within a nav instance
 */

/**
 * Load page by URL params (nav_id/date/time from coreEngine.paramsList).
 * Sets word.pageData and word.pageId.
 *
 * URL: /core/engine/pages/<nav_id>/<date>/<time>
 * paramsList = [<nav_id>, <date>, <time>]
 *
 * @returns {Promise<boolean>} true if loaded, false if no params
 */
export async function loadByParams(word) {
    const engine = window.coreEngine;
    const params = engine?.paramsList || [];
    const fetchJson = engine?.fetchJson;

    // paramsList layout for the new URL schema:
    //   [0] → nav_id
    //   [1] → date   (YYYYMMDD)
    //   [2] → time   (HHMMSS)
    const navId = params[0] || null;
    const date  = params[1] || null;
    const time  = params[2] || null;

    if (!navId || !date || !time) {
        console.log('[Word] URL params missing');
        return false;
    }

    console.log(`[Word] Loading by date/time: nav=${navId} ${date} ${time}`);

    // nav_id comes from the URL itself here, so we don't use word._qs.
    // This avoids sending ?nav_id= twice (once from the path, once
    // from the query string).
    const url = `/core/engine/lib/word/bydatetime/${date}/${time}?nav_id=${encodeURIComponent(navId)}`;

    let result;
    try {
        result = await fetchJson(url);
    } catch (err) {
        if (err.status === 404) {
            throw new Error('Page not found');
        }
        throw err;
    }

    if (!result.success) {
        throw new Error(result.message || 'Page load error');
    }

    word.pageData = result.data;
    word.pageId = result.data.id;
    console.log('[Word] Page loaded:', word.pageData.title);
    return true;
}

/**
 * Load page by word.pageId.
 *
 * URL: /core/engine/lib/word/item/<page_id>?nav_id=<id>
 * nav_id comes from word._qs (see word.js constructor).
 */
export async function loadById(word) {
    console.log(`[Word] Loading by id: ${word.pageId}`);

    const fetchJson = window.coreEngine?.fetchJson;
    const url = `/core/engine/lib/word/item/${word.pageId}${word._qs}`;

    let result;
    try {
        result = await fetchJson(url);
    } catch (err) {
        if (err.status === 404) {
            throw new Error('Page not found');
        }
        throw err;
    }

    if (!result.success) {
        throw new Error(result.message || 'Page load error');
    }

    word.pageData = result.data;
    console.log('[Word] Page loaded:', word.pageData.title);
}

/**
 * Load a template page by id (for template_id resolution).
 * Does NOT touch word.pageData — returns the raw page object.
 *
 * URL: /core/engine/lib/word/item/<id>?nav_id=<id>
 * nav_id comes from word._qs. Template must belong to the same
 * nav as the page — the backend enforces this.
 *
 * @param {Object} word
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function loadTemplateById(word, id) {
    if (!id) return null;

    console.log(`[Word] Loading template id: ${id}`);

    const fetchJson = window.coreEngine?.fetchJson;
    const url = `/core/engine/lib/word/item/${id}${word._qs}`;

    let result;
    try {
        result = await fetchJson(url);
    } catch (err) {
        if (err.status === 404) {
            console.warn(`[Word] Template ${id} not found`);
            return null;
        }
        console.warn(`[Word] Template load error:`, err.message);
        return null;
    }

    if (!result.success || !result.data) {
        console.warn(`[Word] Template ${id} — bad response`);
        return null;
    }

    return result.data;
}