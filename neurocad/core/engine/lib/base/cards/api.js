// app/core/engine/lib/base/cards/api.js

/**
 * CRUD operations for BaseCards.
 *
 * All functions take `cards` (a BaseCards instance) as first argument.
 * All network functions are async.
 *
 * Error shape:
 *   err.status  — HTTP status code (401, 403, 404, 500, ...)
 *   err.detail  — raw detail object from server (if JSON)
 *   err.message — human-readable message (server's detail.message / detail / fallback)
 *
 * This lets callers (selection.js, cards.js) handle 401 centrally
 * — e.g. redirect to login — instead of crashing with a raw Error.
 */

/**
 * Build URL from endpoint + params.
 * Substitutes {id}, appends section / contextId / is_delete.
 */
export function buildUrl(cards, endpoint, params = {}) {
    let url = cards.apiBase + endpoint;
    if (params.id) url = url.replace('{id}', params.id);

    const queryParams = [];
    if (cards.section) queryParams.push(`section=${cards.section}`);
    if (cards.contextId) queryParams.push(`${cards.contextField}=${cards.contextId}`);
    if (cards.isDeletedMode) queryParams.push('is_delete=true');

    if (queryParams.length > 0) {
        url += (url.includes('?') ? '&' : '?') + queryParams.join('&');
    }
    return url;
}

/**
 * Parse a failed Response into a rich Error.
 *
 * Tries to read JSON body:
 *   - { detail: { message: "..." } }  — new format
 *   - { detail: "..." }               — FastAPI style
 *   - { message: "..." }              — fallback
 *   - otherwise                        — "HTTP <status>"
 *
 * @param {Response} response
 * @param {string} fallbackMessage
 * @returns {Promise<Error>}
 */
async function _errorFromResponse(response, fallbackMessage) {
    let detail = null;
    let message = `HTTP ${response.status}`;

    try {
        const data = await response.json();
        detail = data?.detail ?? data;

        if (data?.detail?.message) {
            message = data.detail.message;
        } else if (typeof data?.detail === 'string') {
            message = data.detail;
        } else if (data?.message) {
            message = data.message;
        }
    } catch (e) {
        // no JSON body — keep fallback
    }

    const err = new Error(message || fallbackMessage);
    err.status = response.status;
    err.detail = detail;
    return err;
}

/**
 * Create item.
 */
export async function addItem(cards, data) {
    const url = buildUrl(cards, cards.apiEndpoints.create);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw await _errorFromResponse(response, 'Failed to create item');
    }
}

/**
 * Update item.
 */
export async function updateItem(cards, id, data) {
    const url = buildUrl(cards, cards.apiEndpoints.update, { id });
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw await _errorFromResponse(response, 'Failed to update item');
    }
}

/**
 * Delete item.
 */
export async function deleteItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.delete, { id });
    const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
        throw await _errorFromResponse(response, 'Failed to delete item');
    }
}

/**
 * Restore item.
 */
export async function restoreItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.restore, { id });
    const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) {
        throw await _errorFromResponse(response, 'Failed to restore item');
    }
}