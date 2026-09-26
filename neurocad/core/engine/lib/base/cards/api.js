// app/core/engine/lib/base/cards/api.js

/**
 * CRUD operations for BaseCards.
 *
 * All functions take `cards` (a BaseCards instance) as first argument.
 * All network functions are async.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Error shape (thrown by fetchJson):
 *   err.status  — HTTP status code (401, 403, 404, 500, ...)
 *   err.data    — raw JSON body from server (if any)
 *   err.message — human-readable message
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
 * Create item.
 */
export async function addItem(cards, data) {
    const url = buildUrl(cards, cards.apiEndpoints.create);
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'POST',
        body: data,
    });
}

/**
 * Update item.
 */
export async function updateItem(cards, id, data) {
    const url = buildUrl(cards, cards.apiEndpoints.update, { id });
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'PUT',
        body: data,
    });
}

/**
 * Delete item.
 */
export async function deleteItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.delete, { id });
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'DELETE',
    });
}

/**
 * Restore item.
 */
export async function restoreItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.restore, { id });
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'POST',
    });
}