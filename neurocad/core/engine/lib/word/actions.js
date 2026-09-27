// app/core/engine/lib/word/actions.js

/**
 * Word actions — high-level operations.
 * All utilities via word._utils.
 *
 * Uses window.coreEngine.fetchJson — loaded once by CoreEngine.loadApi().
 *
 * Scoping:
 *   Every word API request carries ?nav_id=<id> from word._qs
 *   (see word.js constructor). The single exception is the public
 *   page URL — there nav_id goes into the path, not the query.
 */

/**
 * Write page title into the app header (.core-engine-lib-base-title)
 * and into document.title.
 *
 * Uses the shared caption helper (word._setCaption) if available —
 * it saves the previous title, so the page can restore it on destroy.
 * Falls back to direct DOM write if the helper is not available.
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

    const title = word.pageData?.title || '';

    // Preferred path — shared caption helper.
    if (word._setCaption) {
        word._savedCaption = word._setCaption(title, title);
        return;
    }

    // Fallback — direct write, save the previous title on the word instance.
    if (word._originalHeaderTitle === null) {
        word._originalHeaderTitle = el.textContent;
    }
    el.textContent = title;
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
 *
 * URL schema:
 *   /page/<nav_id>/<date>/<time>
 *
 * nav_id comes from word.navId (injected via props). If it's missing,
 * we cannot build a valid public URL — bail out instead of guessing.
 */
export function openPublicPage(word) {
    console.log('[Word] Opening public page');

    const datetime = word.pageData?.datetime;
    if (!datetime) {
        console.warn('[Word] No datetime — cannot open public page');
        return;
    }

    if (word.navId == null) {
        console.warn('[Word] No nav_id — cannot build public URL');
        return;
    }

    const date = word._utils.formatDateShort(datetime);
    const time = word._utils.formatTimeShort(datetime);

    if (!date || !time) {
        console.warn('[Word] Failed to format date/time');
        return;
    }

    const url = `/page/${word.navId}/${date}/${time}`;
    console.log('[Word] Public URL:', url);

    window.open(url, '_blank', 'noopener,noreferrer');
}

// ============================================
// SAVE (manual + auto)
// ============================================

/**
 * Persist page content to the server.
 *
 * HTML and CSS are sent as separate fields:
 *   content      = HTML (no <style>)
 *   content_json = GrapesJS project JSON (string)
 *   css          = CSS from editor.getCss()
 *
 * Also updates local word.pageData so the next render uses
 * the fresh values without an extra GET.
 *
 * Throws an Error with `.status` set to the HTTP status code —
 * so callers can distinguish 401 (session expired) from other errors.
 *
 * @param {Object} word
 * @param {Object} data  — { html, css, project }
 */
async function _persistContent(word, data) {
    if (!word.pageId) {
        throw new Error('Unknown page id');
    }

    const html = data.html || '';
    const css = (data.css || '').trim();
    const projectJson = JSON.stringify(data.project);

    const url = `/core/engine/lib/word/${word.pageId}${word._qs}`;
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'PUT',
        body: {
            content: html,
            content_json: projectJson,
            css: css,
        },
    });

    // Update local state so the next render uses fresh values.
    word.pageData.content = html;
    word.pageData.content_json = projectJson;
    word.pageData.css = css;

    console.log('[Word] Content saved (HTML + CSS separate)');
}

/**
 * Manual save — called from the editor toolbar / Ctrl+S.
 *
 * Persists, then closes the editor.
 */
export async function saveContent(word, data) {
    console.log('[Word] Saving content for id:', word.pageId);

    await _persistContent(word, data);

    // Close editor
    const version = window.coreEngine?.static_version || Date.now();
    const mod = await import(`./bridge.js?v=${version}`);
    await mod.closeEditor(word);
}

/**
 * Auto-save — called from the editor's background auto-save.
 *
 * Persists only. The editor stays open and untouched.
 */
export async function autoSaveContent(word, data) {
    console.log('[Word] Auto-saving content for id:', word.pageId);

    await _persistContent(word, data);

    console.log('[Word] Auto-save done');
}

// ============================================
// HISTORY
// ============================================

/**
 * List snapshots for the current page (metadata only, no html/content_json/css).
 *
 * GET /core/engine/lib/word/{page_id}/history?nav_id=<id>
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
    const fetchJson = window.coreEngine?.fetchJson;
    const json = await fetchJson(url);

    return json.data || [];
}

/**
 * Get one full snapshot (html + content_json + css).
 *
 * GET /core/engine/lib/word/{page_id}/history/{hist_id}?nav_id=<id>
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
    const fetchJson = window.coreEngine?.fetchJson;
    const json = await fetchJson(url);

    return json.data;
}

/**
 * Roll the page back to the given snapshot.
 *
 * POST /core/engine/lib/word/{page_id}/rollback/{hist_id}?nav_id=<id>
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
    const fetchJson = window.coreEngine?.fetchJson;

    const json = await fetchJson(url, { method: 'POST' });
    const data = json.data;

    // Update local state so next render uses restored values
    if (data && word.pageData) {
        if (data.content !== undefined) word.pageData.content = data.content;
        if (data.content_json !== undefined) word.pageData.content_json = data.content_json;
        if (data.css !== undefined) word.pageData.css = data.css;
    }

    return data;
}