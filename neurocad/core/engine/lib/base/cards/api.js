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
 *
 * Folder mode
 * -----------
 * When `cards.folders === true`, every list request appends
 * `parent_id=<current parent>` to the query string. The parent is
 * `cards.parentId`:
 *   - null / undefined → no `parent_id` in the URL
 *     (the backend returns the root list);
 *   - a real id       → `parent_id=<id>` (the backend returns the
 *                        children of that folder).
 *
 * Only the `list` endpoint is affected. `create` / `update` /
 * `delete` / `restore` operate on a single card by id and are the
 * same as before. `parent_id` for a newly-created card goes in the
 * request BODY (as part of `initialData`), not in the URL.
 *
 * In non-folder mode nothing changes: no `parent_id` is appended,
 * URLs are exactly what they were before.
 *
 * User-facing strings are in Russian. Code comments, docstrings
 * and identifiers are in English.
 */

/**
 * Build URL from endpoint + params.
 *
 * Substitutes `{id}`, appends `section`, `contextField`, and
 * (optionally) `parent_id` and `is_delete` to the query string.
 *
 * Query parameters, in order:
 *   1. section            — if `cards.section` is set;
 *   2. contextField       — if `cards.contextId` is set;
 *   3. parent_id          — if `cards.folders === true` AND
 *                           `cards.parentId` is not null;
 *   4. is_delete=true     — if `cards.isDeletedMode === true`.
 *
 * Folder mode only affects param 3. Params 1, 2 and 4 are always
 * applied when their conditions hold, in any mode.
 */
export function buildUrl(cards, endpoint, params = {}) {
    let url = cards.apiBase + endpoint;
    if (params.id) url = url.replace('{id}', params.id);

    const queryParams = [];
    if (cards.section) queryParams.push(`section=${cards.section}`);
    if (cards.contextId) queryParams.push(`${cards.contextField}=${cards.contextId}`);

    // Folder mode: scope the list to the currently-open folder.
    // Only `list` uses parent_id; create/update/delete/restore are
    // by-id and never carry it.
    if (cards.folders === true
        && cards.parentId !== null
        && cards.parentId !== undefined) {
        queryParams.push(`parent_id=${encodeURIComponent(cards.parentId)}`);
    }

    if (cards.isDeletedMode) queryParams.push('is_delete=true');

    if (queryParams.length > 0) {
        url += (url.includes('?') ? '&' : '?') + queryParams.join('&');
    }
    return url;
}

/**
 * Create item.
 *
 * `parent_id` for the new card comes in the request body — it is
 * part of `data`, which BaseCards fills from `initialData` (see
 * cards.js → openCreateForm). The URL is not affected.
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
 *
 * Operates on a single card by id. `parent_id` MAY be present in
 * `data` if the consumer wants to move the card to another folder
 * — the backend decides whether to honour it.
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
 *
 * Operates on a single card by id. What happens to a deleted
 * folder's children is a backend decision — the UI does not send
 * anything beyond the id.
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
 *
 * Operates on a single card by id.
 */
export async function restoreItem(cards, id) {
    const url = buildUrl(cards, apiEndpointsRestore(cards), { id });
    const fetchJson = window.coreEngine?.fetchJson;

    await fetchJson(url, {
        method: 'POST',
    });
}

// Internal helper — kept for symmetry and readability.
function apiEndpointsRestore(cards) {
    return cards.apiEndpoints.restore;
}