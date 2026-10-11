// app/core/engine/lib/pages/utils.js

/**
 * Small utilities for the Pages component.
 *
 * Everything in this module is a PURE function or a thin wrapper
 * around an external dependency (coreEngine, BaseModal*). No state,
 * no side effects beyond the ones the caller explicitly requests.
 *
 * The module is loaded dynamically from pages.js with ?v=<version>:
 *
 *     const { apiUrl, canEdit, ... } = await import(
 *         `./utils.js?v=${version}`
 *     );
 *
 * No static imports — every dependency (coreEngine, base/modal)
 * is resolved lazily at call time. This matches the rest of the
 * project: nothing here knows about the file layout, only about
 * the public API it consumes.
 *
 * Naming convention
 * -----------------
 * The functions take a `pages` instance (the Pages component) as
 * their first argument when they need to read/write its state
 * (navId, _publicPagesUrl, templates, etc.). They do NOT use `this`.
 * That keeps them easy to test in isolation and easy to reason
 * about — the caller decides which Pages instance to operate on.
 */

// ============================================
// API URL
// ============================================

/**
 * Build a URL to the pages API with nav_id attached (if known).
 *
 * BaseCards appends endpoint paths to `apiBase` as-is, so we keep
 * `apiBase` clean and put nav_id directly into each endpoint string.
 * When navId is null, the backend resolves the nav from the session
 * — no query parameter needed.
 *
 * `parent_id` is NOT added here — Pages loads its list itself (see
 * pages.js → _loadFromServer) and adds parent_id explicitly from
 * `cardsInstance.parentId`. BaseCards' own api.js handles parent_id
 * for ITS requests, but Pages bypasses that for the initial list
 * load.
 *
 * Also used by PagesTitle (passed in as `getApiUrl`) so the
 * nav-name endpoints get the exact same ?nav_id= handling.
 *
 * @param {Object}  pages
 * @param {string}  endpoint
 * @param {string}  [extraQuery='']
 * @returns {string}
 */
export function apiUrl(pages, endpoint, extraQuery = '') {
    const sep = endpoint.includes('?') ? '&' : '?';
    const navPart = pages.navId != null
        ? `nav_id=${encodeURIComponent(pages.navId)}`
        : '';
    const extra = extraQuery ? `&${extraQuery}` : '';

    if (!navPart && !extra) return endpoint;
    if (!navPart) return `${endpoint}${sep}${extra}`;
    if (!extra) return `${endpoint}${sep}${navPart}`;
    return `${endpoint}${sep}${navPart}${extra}`;
}


// ============================================
// PERMISSIONS
// ============================================

/**
 * Whether the current user can edit pages (open the editor, save,
 * use the toolbar).
 *
 * Any authenticated user qualifies; guests do not.
 *
 * The check tries several auth shapes so it works regardless of
 * how BaseAuth exposes state.
 *
 * @returns {boolean}
 */
export function canEdit() {
    const auth = window.coreEngine?.auth;
    if (!auth) return false;

    if (typeof auth.isAuth === 'function' && auth.isAuth()) {
        return true;
    }
    if (typeof auth.isAuthenticated === 'boolean' && auth.isAuthenticated) {
        return true;
    }
    if (typeof auth.getUser === 'function') {
        return auth.getUser() != null;
    }
    return false;
}

/**
 * Whether the current user is a superadmin.
 *
 * Kept for callers that specifically need superadmin-only behaviour.
 * is_superadmin may come from the backend as bool, int (0/1) or
 * string ("0"/"1"), so all three are accepted.
 *
 * @returns {boolean}
 */
export function isSuperadmin() {
    const auth = window.coreEngine?.auth;
    if (!auth) return false;

    if (typeof auth.isSuperadmin === 'function') {
        return !!auth.isSuperadmin();
    }
    if (typeof auth.getUser === 'function') {
        const user = auth.getUser();
        if (!user) return false;
        const v = user.is_superadmin;
        return v === true || v === 1 || v === "1";
    }
    return false;
}


// ============================================
// DATES
// ============================================

/**
 * Format ISO datetime to YYYYMMDD (for URL paths).
 *
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
    try {
        const d = new Date(isoString);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    } catch (e) {
        console.warn('[Pages utils] Date format error:', e);
        return '';
    }
}

/**
 * Format ISO datetime to HHMMSS (for URL paths).
 *
 * @param {string} isoString
 * @returns {string}
 */
export function formatTime(isoString) {
    try {
        const d = new Date(isoString);
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}${mi}${ss}`;
    } catch (e) {
        console.warn('[Pages utils] Time format error:', e);
        return '';
    }
}


// ============================================
// ARTICLE NUMBERING
// ============================================

/**
 * Compute the next article number from a list of existing items.
 *
 * Looks for titles of the form "Статья N" (case-insensitive) and
 * returns max(N) + 1. Defaults to 1 when no such title exists.
 *
 * @param {Array} items
 * @returns {number}
 */
export function nextArticleNumber(items) {
    let max = 0;

    for (const item of items) {
        const title = String(item.title || '');
        const m = title.match(/^Статья\s+(\d+)/i);
        if (m) {
            const num = parseInt(m[1], 10);
            if (num > max) max = num;
        }
    }

    return max + 1;
}


// ============================================
// PAYLOAD NORMALIZATION
// ============================================

/**
 * Patch a BaseCards instance so its _addItem / _updateItem normalize
 * payload values before they hit the API.
 *
 * The form (BaseCardsEdit) submits everything as strings. The
 * backend expects:
 *   - checkboxes as 0/1 (not true/false),
 *   - selects / numbers as int or null (not "" / "5").
 *
 * This is a runtime patch: we replace `cards._addItem` and
 * `cards._updateItem` on the instance with wrapped versions. The
 * originals are kept via .bind(cards) so `this` inside them still
 * points at the BaseCards instance.
 *
 * @param {Object} pages — Pages instance (reads pages.cardsInstance)
 */
export function patchPayloadNormalization(pages) {
    const cards = pages.cardsInstance;
    if (!cards) return;

    const fields = cards.fields || [];

    const normalize = (data) => {
        if (!data || typeof data !== 'object') return data;

        const out = { ...data };

        for (const field of fields) {
            const key = field.key;
            if (!(key in out)) continue;

            const v = out[key];

            switch (field.type) {
                case 'checkbox':
                    out[key] = v ? 1 : 0;
                    break;

                case 'select': {
                    if (v === '' || v === null || v === undefined) {
                        out[key] = null;
                    } else if (field.valueType === 'number') {
                        const n = Number(v);
                        out[key] = Number.isNaN(n) ? null : n;
                    }
                    break;
                }

                case 'number': {
                    if (v === '' || v === null || v === undefined) {
                        out[key] = null;
                    } else {
                        const n = Number(v);
                        out[key] = Number.isNaN(n) ? null : n;
                    }
                    break;
                }

                default:
                    break;
            }
        }

        return out;
    };

    const origAdd = cards._addItem.bind(cards);
    cards._addItem = async (data) => origAdd(normalize(data));

    const origUpdate = cards._updateItem.bind(cards);
    cards._updateItem = async (id, data) => origUpdate(id, normalize(data));

    console.log('[Pages utils] patchPayloadNormalization() applied');
}


// ============================================
// MODALS — thin wrappers
// ============================================

/**
 * Show the project's styled confirmation dialog and resolve to
 * true / false.
 *
 * Uses BaseModalConfirm via the shared modal factory — NOT
 * window.confirm().
 *
 * The factory returns a callback-driven instance. We wrap it in a
 * Promise so callers can simply `await` the user's choice.
 *
 * Edge cases:
 *   - factory returns null (unknown type) — resolve false and log
 *     a warning. The caller falls through and does nothing.
 *   - the modal is destroyed in both branches of the Promise, so no
 *     DOM leaks.
 *
 * @param {string} text
 * @param {string} [title]
 * @param {string} [okText]
 * @param {string} [cancelText]
 * @returns {Promise<boolean>}
 */
export async function confirm(text, title, okText, cancelText) {
    try {
        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `../base/modal/index.js?v=${version}`
        );

        const modal = await createModal('confirm');
        if (!modal) {
            console.warn('[Pages utils] confirm modal unavailable');
            return false;
        }

        const result = await new Promise((resolve) => {
            modal.setOnOk(() => resolve(true));
            modal.setOnCancel(() => resolve(false));
            modal.open(
                text || '',
                title || 'Подтверждение',
                okText || 'ОК',
                cancelText || 'Отмена',
            );
        });

        modal.destroy();
        return result;
    } catch (e) {
        console.error('[Pages utils] confirm modal error:', e);
        return false;
    }
}

/**
 * Show the project's styled message dialog.
 *
 * Uses BaseModalMessage via the shared modal factory — NOT
 * window.alert().
 *
 * Resolves when the user closes the dialog (its single OK button).
 * Never rejects.
 *
 * @param {string} text
 * @param {string} [title]
 * @returns {Promise<void>}
 */
export async function message(text, title) {
    try {
        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `../base/modal/index.js?v=${version}`
        );

        const modal = await createModal('message');
        if (!modal) {
            console.warn('[Pages utils] message modal unavailable');
            return;
        }

        await new Promise((resolve) => {
            // BaseModalMessage's API mirrors BaseModalConfirm: an OK
            // callback closes the dialog. We resolve on OK only — the
            // modal has no Cancel button.
            modal.setOnOk(() => resolve());
            modal.open(text || '', title || 'Сообщение');
        });

        modal.destroy();
    } catch (e) {
        console.error('[Pages utils] message modal error:', e);
    }
}