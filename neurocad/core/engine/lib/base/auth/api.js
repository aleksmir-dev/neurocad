// core/engine/lib/base/auth/api.js

/**
 * api.js — single entry point for HTTP requests from the client.
 *
 * Lives in base/auth because the primary job is 401 handling:
 * when the session expires, it clears sessionStorage, emits
 * `auth:unauthorized` (BaseAuth shows the login form), and throws
 * an Error so the caller does not continue.
 *
 * Wraps fetch:
 *   - credentials: 'include'  (session cookies);
 *   - Accept: application/json;
 *   - auto-serialize body (unless it's a string or FormData);
 *   - 401 → sessionStorage.clear() + auth:unauthorized + throw
 *          (unless `skipAuthRedirect: true` was passed);
 *   - 403 → throw Error with detail/message from the response;
 *   - non-2xx → throw Error with detail/message from the response;
 *   - success: false → also throw Error.
 *
 * Structured errors
 * -----------------
 * `detail` in the response body can be either:
 *
 *   1. A plain string — the older shape, still used by many
 *      endpoints ("Некорректное имя домена" and so on).
 *
 *   2. An object — the newer shape, used when the UI needs to
 *      render more than a message:
 *
 *          {
 *            "code":    "pages_exhausted",
 *            "message": "У вас тариф Free. …",
 *            "action":  { "label": "…", "href": "…" }
 *          }
 *
 *   In both cases the caller gets:
 *     - err.message — a string, ready to display (from
 *       `detail.message` if detail is an object, else from
 *       `detail` itself, else from a status-based fallback);
 *     - err.detail  — the raw detail (string OR object), so a
 *       component that understands the shape can read
 *       `err.detail.code` / `err.detail.action`.
 *
 *   This is what BaseCardsEdit._showSubmitError() relies on to
 *   render the "Перейти к балансу" link when the tariff limit is
 *   hit. Other components can ignore `err.detail` entirely and
 *   just use `err.message`.
 *
 * skipAuthRedirect:
 *   For auth pages (login, register, restore, password) — on 401 there is
 *   no need to show the login form (it is already open), and no need to
 *   emit auth:unauthorized recursively. Pass `skipAuthRedirect: true` —
 *   fetchJson simply throws an Error with status=401.
 *
 *   In that case fetchJson does NOT invent a message. It reads whatever
 *   the server returned in `detail` / `message` and throws an Error with
 *   that text (possibly empty). The caller decides what to show — e.g.
 *   the login form ignores the message on 401 and shows "Неверный логин
 *   или пароль" on its own.
 *
 *   This matters because the same status code means different things in
 *   different contexts:
 *     - regular request → session expired in the background;
 *     - POST /core/auth/login → wrong username or password;
 *     - POST /core/auth/restore → invalid restore code;
 *     - POST /core/auth/password → wrong current password.
 *   The generic "Session expired. Please log in again." message only fits
 *   the first case.
 *
 * Usage:
 *   // The utility is loaded once by CoreEngine.loadApi()
 *   // and exposed as window.coreEngine.fetchJson.
 *
 *   const fetchJson = window.coreEngine.fetchJson;
 *
 *   // Regular GET — 401 shows the login form:
 *   const data = await fetchJson('/core/engine/lib/nav/list?section=2');
 *
 *   // PUT with a JSON body:
 *   const data = await fetchJson('/core/engine/lib/word/5', {
 *       method: 'PUT',
 *       body: { content: '...', css: '...' },
 *   });
 *
 *   // Auth pages — do not show the login form on 401:
 *   const data = await fetchJson('/core/auth/login', {
 *       method: 'POST',
 *       body: { login, password },
 *       skipAuthRedirect: true,
 *   });
 *
 * Returns: parsed JSON (object) — whatever the server returned.
 * Throws:  Error with .status, .data and .detail.
 */

export async function fetchJson(url, options = {}) {
    // Pull our own options out; pass the rest to fetch as-is.
    const { skipAuthRedirect = false, ...rest } = options;

    const opts = {
        credentials: 'include',
        headers: {
            'Accept': 'application/json',
            ...(rest.headers || {}),
        },
        ...rest,
    };

    // If body is an object (not a string, not FormData), serialize to JSON.
    if (
        opts.body &&
        typeof opts.body !== 'string' &&
        !(opts.body instanceof FormData)
    ) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
    }

    let response;
    try {
        response = await fetch(url, opts);
    } catch (e) {
        // Network errors: ERR_CONNECTION_REFUSED, DNS, CORS, etc.
        const err = new Error(`Network error: ${e.message}`);
        err.status = 0;
        throw err;
    }

    // ---- 401 ----
    //
    // Two completely different situations share this status code.
    //
    //   1. Regular request (skipAuthRedirect = false):
    //      the session expired in the background. We handle it
    //      globally — clear the local session, emit
    //      auth:unauthorized, BaseAuth shows the login form. The
    //      thrown Error carries a generic "session expired" text;
    //      it is mostly for the console and for callers that want
    //      to know why their request failed.
    //
    //   2. Auth page (skipAuthRedirect = true):
    //      the caller already knows it is on an auth page and does
    //      NOT want the global handling. 401 here means "wrong
    //      credentials" / "invalid restore code" / "wrong current
    //      password" — whatever the endpoint is. fetchJson does
    //      not invent a message; it forwards the server's detail
    //      (which may be empty) so the caller can show its own
    //      text. The login form, for instance, ignores the message
    //      on 401 and shows "Неверный логин или пароль".
    if (response.status === 401) {
        if (!skipAuthRedirect) {
            _handleUnauthorized();
            const err = new Error('Session expired. Please log in again.');
            err.status = 401;
            throw err;
        }

        const data = await _readJson(response);
        const rawDetail = (data && (data.detail || data.message)) || '';
        const message = _detailToMessage(rawDetail, '');
        const err = new Error(message);
        err.status = 401;
        err.data = data;
        err.detail = rawDetail;
        throw err;
    }

    // ---- 403: forbidden ----
    //
    // Used by endpoints that need to convey a specific business
    // reason, not just "no". Today: POST /pages/item when the
    // user has hit their tariff's page limit. The detail may be a
    // structured object; we keep the whole thing on err.detail so
    // a caller that understands the shape can render code/action.
    if (response.status === 403) {
        const data = await _readJson(response);
        const rawDetail = data && (data.detail || data.message);
        const message = _detailToMessage(rawDetail, 'Insufficient permissions.');
        const err = new Error(message);
        err.status = 403;
        err.data = data;
        err.detail = rawDetail;
        throw err;
    }

    // ---- Read the body (if any) ----
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        // Not JSON — leave data = null.
    }

    // ---- non-2xx: error ----
    if (!response.ok) {
        const rawDetail = (data && (data.detail || data.message));
        const message = _detailToMessage(rawDetail, `HTTP ${response.status}`);
        const err = new Error(message);
        err.status = response.status;
        err.data = data;
        err.detail = rawDetail;
        throw err;
    }

    // ---- 2xx, but success: false ----
    if (data && data.success === false) {
        const rawDetail = data.message || data.detail || 'Error';
        const message = _detailToMessage(rawDetail, 'Error');
        const err = new Error(message);
        err.status = response.status;
        err.data = data;
        err.detail = rawDetail;
        throw err;
    }

    return data;
}


// ============================================
// INTERNAL
// ============================================

/**
 * Read the response body as JSON. Returns null if the body is
 * empty or not valid JSON. The response stream is consumed —
 * callers must not call response.json() again on the same response.
 */
async function _readJson(response) {
    try {
        return await response.json();
    } catch (e) {
        return null;
    }
}

/**
 * Normalize a server-supplied `detail` value to a display string.
 *
 * `detail` can be:
 *   - undefined / null / '' — the fallback is returned;
 *   - a plain string        — returned as-is;
 *   - an object             — its `.message` field is used (or the
 *                             fallback if `.message` is missing).
 *
 * The object form is the newer structured-error shape:
 *     { code, message, action? }
 * used e.g. by POST /pages/item on 403 (tariff page limit reached).
 *
 * The caller normally passes `err.detail` (which may be a string or
 * an object) and reads `err.message` — both stay in sync:
 *     err.message = _detailToMessage(err.detail, fallback)
 */
function _detailToMessage(rawDetail, fallback) {
    if (!rawDetail) return fallback;
    if (typeof rawDetail === 'string') return rawDetail;
    if (typeof rawDetail === 'object' && typeof rawDetail.message === 'string') {
        return rawDetail.message;
    }
    return fallback;
}

function _handleUnauthorized() {
    // 1. Remember the current path — to return after login.
    try {
        sessionStorage.setItem('auth_redirect_url', window.location.pathname);
        sessionStorage.removeItem('auth_user');
    } catch (e) {
        // sessionStorage may be unavailable (private mode, etc.)
    }

    // 2. Emit the event — BaseAuth listens and shows the login form.
    document.dispatchEvent(new CustomEvent('auth:unauthorized'));
}