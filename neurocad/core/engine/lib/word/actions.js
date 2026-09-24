// app/core/engine/lib/word/actions.js

/**
 * Word actions — high-level operations.
 * All utilities via word._utils.
 */

/**
 * Write page title into the app header (.core-engine-lib-base-title).
 */
export function setHeaderTitle(word, retries = 5) {
    const el = document.querySelector('.core-engine-lib-base-title');

    if (!el) {
        if (retries > 0) {
            setTimeout(() => setHeaderTitle(word, retries - 1), 50);
        } else {
            console.warn('[Word] .core-engine-lib-base-title not found in header');
        }
        return;
    }

    if (word._originalHeaderTitle === null) {
        word._originalHeaderTitle = el.textContent;
    }

    el.textContent = word.pageData?.title || '';
}

/**
 * Go back to the admin panel.
 */
export function goBack(word) {
    console.log('[Word] Going back to admin');

    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '/core/engine/default/';
    }
}

/**
 * Open public version of the page in a new tab.
 */
export function openPublicPage(word) {
    console.log('[Word] Opening public page');

    const datetime = word.pageData?.datetime;
    if (!datetime) {
        console.warn('[Word] No datetime — cannot open public page');
        return;
    }

    const date = word._utils.formatDateShort(datetime);
    const time = word._utils.formatTimeShort(datetime);

    if (!date || !time) {
        console.warn('[Word] Failed to format date/time');
        return;
    }

    const url = `/page/${date}/${time}`;
    console.log('[Word] Public URL:', url);

    window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Save content from the editor.
 *
 * HTML and CSS are sent as separate fields:
 *   content      = HTML (no <style>)
 *   content_json = GrapesJS project JSON (string)
 *   css          = CSS from editor.getCss()
 *
 * Throws an Error with `.status` set to the HTTP status code —
 * so callers can distinguish 401 (session expired) from other errors.
 */
export async function saveContent(word, data) {
    console.log('[Word] Saving content for id:', word.pageId);

    if (!word.pageId) {
        throw new Error('Unknown page id');
    }

    const html = data.html || '';
    const css = (data.css || '').trim();

    const url = `/core/engine/lib/word/${word.pageId}${word._qs}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            content: html,
            content_json: JSON.stringify(data.project),
            css: css,
        }),
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errorData = await response.json();
            detail = errorData.detail || '';
        } catch (e) {
            // не JSON — игнорим
        }

        const err = new Error(detail || `HTTP ${response.status}`);
        err.status = response.status;
        err.data = detail;
        throw err;
    }

    // Update local state so next render uses fresh values
    word.pageData.content = html;
    word.pageData.content_json = JSON.stringify(data.project);
    word.pageData.css = css;

    console.log('[Word] Content saved (HTML + CSS separate)');

    // Close editor
    const version = window.coreEngine?.static_version || Date.now();
    const mod = await import(`./bridge.js?v=${version}`);
    await mod.closeEditor(word);
}

/**
 * List snapshots for the current page (metadata only, no html/content_json/css).
 *
 * GET /core/engine/lib/word/{page_id}/history?module=<name>
 *
 * @param {Object} word — Word instance
 * @returns {Promise<Array>} — [{ id, action, note, created_at }, ...]
 */
export async function listHistory(word) {
    console.log('[Word] Loading history for id:', word.pageId);

    if (!word.pageId) {
        throw new Error('Unknown page id');
    }

    const url = `/core/engine/lib/word/${word.pageId}/history${word._qs}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errorData = await response.json();
            detail = errorData.detail || '';
        } catch (e) {
            // не JSON
        }
        const err = new Error(detail || `HTTP ${response.status}`);
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    return json.data || [];
}

/**
 * Get one full snapshot (html + content_json + css).
 *
 * GET /core/engine/lib/word/{page_id}/history/{hist_id}?module=<name>
 *
 * @param {Object} word — Word instance
 * @param {number} histId — snapshot id
 * @returns {Promise<Object>} — { id, page_id, html, content_json, css, action, note, created_at }
 */
export async function getHistoryItem(word, histId) {
    console.log('[Word] Loading history item:', histId);

    if (!word.pageId) {
        throw new Error('Unknown page id');
    }

    const url = `/core/engine/lib/word/${word.pageId}/history/${histId}${word._qs}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errorData = await response.json();
            detail = errorData.detail || '';
        } catch (e) {
            // не JSON
        }
        const err = new Error(detail || `HTTP ${response.status}`);
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    return json.data;
}

/**
 * Roll the page back to the given snapshot.
 *
 * POST /core/engine/lib/word/{page_id}/rollback/{hist_id}?module=<name>
 *
 * Also updates local pageData with the rolled-back values, so the
 * next render (article view / editor) uses the restored state.
 *
 * @param {Object} word — Word instance
 * @param {number} histId — snapshot id
 * @returns {Promise<Object>} — { id, title, content, content_json, css, updated_at }
 */
export async function rollback(word, histId) {
    console.log('[Word] Rollback to snapshot:', histId);

    if (!word.pageId) {
        throw new Error('Unknown page id');
    }

    const url = `/core/engine/lib/word/${word.pageId}/rollback/${histId}${word._qs}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        credentials: 'include',
    });

    if (!response.ok) {
        let detail = '';
        try {
            const errorData = await response.json();
            detail = errorData.detail || '';
        } catch (e) {
            // не JSON
        }
        const err = new Error(detail || `HTTP ${response.status}`);
        err.status = response.status;
        throw err;
    }

    const json = await response.json();
    const data = json.data;

    // Update local state so next render uses restored values
    if (data && word.pageData) {
        if (data.content !== undefined) word.pageData.content = data.content;
        if (data.content_json !== undefined) word.pageData.content_json = data.content_json;
        if (data.css !== undefined) word.pageData.css = data.css;
    }

    return data;
}