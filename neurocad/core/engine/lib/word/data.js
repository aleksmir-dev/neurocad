// app/core/engine/lib/word/data.js

/**
 * Word data loading — fetch page by id or by date/time.
 * Pure functions, take `word` instance for context (qs, pageId).
 */

/**
 * Load page by URL params (date/time from coreEngine.paramsList).
 * Sets word.pageData and word.pageId.
 *
 * @returns {Promise<boolean>} true if loaded, false if no params
 */
export async function loadByParams(word) {
    const engine = window.coreEngine;
    const params = engine?.paramsList || [];

    const date = params[0] || null;
    const time = params[1] || null;

    if (!date || !time) {
        console.log('[Word] URL params missing');
        return false;
    }

    console.log(`[Word] Loading by date/time: ${date} ${time}`);

    const url = `/core/engine/lib/word/bydatetime/${date}/${time}${word._qs}`;
    const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
    });

    if (response.status === 404) {
        throw new Error('Page not found');
    }

    if (!response.ok) {
        throw new Error(`Load error: ${response.status}`);
    }

    const result = await response.json();
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
 */
export async function loadById(word) {
    console.log(`[Word] Loading by id: ${word.pageId}`);

    const url = `/core/engine/lib/word/item/${word.pageId}${word._qs}`;
    const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
    });

    if (response.status === 404) {
        throw new Error('Page not found');
    }

    if (!response.ok) {
        throw new Error(`Load error: ${response.status}`);
    }

    const result = await response.json();
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
 * @param {Object} word
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function loadTemplateById(word, id) {
    if (!id) return null;

    console.log(`[Word] Loading template id: ${id}`);

    const url = `/core/engine/lib/word/item/${id}${word._qs}`;
    const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
    });

    if (response.status === 404) {
        console.warn(`[Word] Template ${id} not found`);
        return null;
    }

    if (!response.ok) {
        console.warn(`[Word] Template load error: ${response.status}`);
        return null;
    }

    const result = await response.json();
    if (!result.success || !result.data) {
        console.warn(`[Word] Template ${id} — bad response`);
        return null;
    }

    return result.data;
}