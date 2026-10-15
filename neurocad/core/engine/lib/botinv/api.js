// neurocad/core/engine/lib/botinv/api.js

/**
 * BaseBotInvApi — HTTP client for the inventory module.
 *
 * Thin wrapper around the /core/engine/lib/botinv/* endpoints.
 * No state, no side effects — every method returns a Promise that
 * resolves with `data` from the response envelope:
 *
 *     { "success": true, "data": ... }
 *
 * On error the Promise rejects with an Error whose message is the
 * server-provided `detail` (a human-readable Russian string) when
 * available, or a generic fallback otherwise.
 *
 * The base path is fixed — it matches the backend mount point.
 * See core/engine/lib/route.py (botinv_router is included with
 * prefix "/lib" under the engine root) and botinv/route.py
 * (APIRouter(prefix="/botinv")).
 *
 * Export is special: /sheets/{id}/export streams a binary .xlsx
 * with Content-Disposition: attachment. It does NOT go through
 * _request() — exportSheetUrl() returns a plain URL that the
 * caller hands to the browser (window.location.href or an
 * <a download>), so the browser itself downloads the file with
 * the filename the server set.
 */
export class BaseBotInvApi {
    constructor(baseUrl = null) {
        this._base = baseUrl || '/core/engine/lib/botinv';
    }

    // ========================================
    // LOW-LEVEL REQUEST
    // ========================================

    /**
     * Send an HTTP request and unwrap the response envelope.
     *
     * @param {string} path — endpoint path, e.g. "/active"
     * @param {object} opts — fetch options (method, json, formData)
     * @returns {Promise<any>} — the `data` field from the envelope
     */
    async _request(path, opts = {}) {
        const url = this._base + path;

        const fetchOpts = {
            method: opts.method || 'GET',
            credentials: 'same-origin',
            headers: {
                ...(opts.headers || {}),
            },
        };

        // JSON body (for POST/PATCH with a JSON payload).
        if (opts.json !== undefined) {
            fetchOpts.headers['Content-Type'] = 'application/json';
            fetchOpts.body = JSON.stringify(opts.json);
        }

        // FormData body (for file upload).
        if (opts.formData !== undefined) {
            fetchOpts.body = opts.formData;
            // Do NOT set Content-Type — the browser sets the
            // multipart boundary automatically.
        }

        let response;
        try {
            response = await fetch(url, fetchOpts);
        } catch (err) {
            throw new Error('Сеть недоступна. Проверьте подключение.');
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (err) {
            // Non-JSON response — likely 500 with an HTML body.
            throw new Error(`Ошибка сервера (${response.status})`);
        }

        if (!response.ok) {
            // FastAPI puts a human-readable message into `detail`.
            // It may be a string or an object.
            const detail = payload?.detail;
            let msg = `Ошибка ${response.status}`;
            if (typeof detail === 'string') {
                msg = detail;
            } else if (detail && typeof detail === 'object' && detail.message) {
                msg = detail.message;
            }
            throw new Error(msg);
        }

        // Envelope: { success: true, data: ... }
        if (payload && typeof payload === 'object' && 'data' in payload) {
            return payload.data;
        }
        return payload;
    }

    // ========================================
    // SHEETS
    // ========================================

    /**
     * Active sheet + its items.
     * Returns { sheet: {...} | null, items: [...] }.
     */
    async getActive() {
        return this._request('/active');
    }

    /**
     * All non-deleted sheets of the user's botinv nav.
     */
    async listSheets() {
        return this._request('/sheets');
    }

    /**
     * Upload a new sheet from an Excel/CSV file.
     *
     * @param {File} file — the file object from an <input type="file">
     * @param {string} name — sheet name
     * @param {string} batchDate — ISO date, "YYYY-MM-DD"
     * @returns {Promise<object>} — the new sheet dict
     */
    async importSheet(file, name, batchDate) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', name);
        fd.append('batch_date', batchDate);
        return this._request('/sheets/import', {
            method: 'POST',
            formData: fd,
        });
    }

    /**
     * Make a sheet the active one for its nav.
     */
    async activateSheet(sheetId) {
        return this._request(`/sheets/${sheetId}/activate`, {
            method: 'POST',
        });
    }

    /**
     * Rename a sheet and/or change its date.
     */
    async updateSheet(sheetId, { name = null, batchDate = null } = {}) {
        const body = {};
        if (name !== null) body.name = name;
        if (batchDate !== null) body.batch_date = batchDate;
        return this._request(`/sheets/${sheetId}`, {
            method: 'PATCH',
            json: body,
        });
    }

    /**
     * Soft-delete a sheet.
     */
    async deleteSheet(sheetId) {
        return this._request(`/sheets/${sheetId}`, { method: 'DELETE' });
    }

    /**
     * All items of a sheet.
     */
    async listItems(sheetId) {
        return this._request(`/sheets/${sheetId}/items`);
    }

    /**
     * URL for downloading a sheet as .xlsx.
     *
     * The export endpoint returns a binary file with
     * Content-Disposition: attachment — it is NOT a JSON envelope,
     * so it cannot go through _request(). The caller is expected
     * to trigger a browser download (window.location.href, an
     * <a download>, or fetch + blob).
     *
     * Returns the full URL, ready to be used as an href.
     */
    exportSheetUrl(sheetId) {
        return `${this._base}/sheets/${sheetId}/export`;
    }

    // ========================================
    // BOT
    // ========================================

    /**
     * Validate a room against the active sheet.
     *
     * @param {string} room — the room number (without the leading #)
     * @returns {Promise<object>} — { status, message, current_room }
     */
    async changeRoom(room) {
        return this._request('/room', {
            method: 'POST',
            json: { room },
        });
    }

    /**
     * Find an item by inv_num and mark it.
     *
     * The item can be identified in two ways:
     *
     *   - invNum alone — the backend tries an exact
     *     case-insensitive match, then a substring search. If the
     *     substring matches more than one item, the response has
     *     status "ambiguous" and carries a `candidates` array.
     *
     *   - invNum + chosenId — the user picked a candidate from a
     *     previous "ambiguous" response. When chosenId is set, the
     *     backend ignores invNum and looks the item up by primary
     *     key. The frontend still sends invNum, for logging and as
     *     a fallback — the schema requires it.
     *
     * @param {string} invNum — inventory number (or its fragment)
     * @param {string|null} currentRoom — the current room (from localStorage)
     * @param {number|null} chosenId — id picked from a previous
     *                                 "ambiguous" response
     * @returns {Promise<object>} — {
     *     status, message, item, current_room,
     *     candidates, total_matches,
     * }
     */
    async mark(invNum, currentRoom, chosenId = null) {
        const body = {
            inv_num: invNum,
            current_room: currentRoom || null,
        };
        if (chosenId !== null && chosenId !== undefined) {
            body.chosen_id = chosenId;
        }
        return this._request('/mark', {
            method: 'POST',
            json: body,
        });
    }
}