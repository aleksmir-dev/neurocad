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
 *   - 403 → throw Error('Insufficient permissions.');
 *   - non-2xx → throw Error with detail/message from the response;
 *   - success: false → also throw Error.
 *
 * skipAuthRedirect:
 *   For auth pages (login, register, restore, password) — on 401 there is
 *   no need to show the login form (it is already open), and no need to
 *   emit auth:unauthorized recursively. Pass `skipAuthRedirect: true` —
 *   fetchJson simply throws an Error with status=401.
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
 * Throws:  Error with .status and .data (if the server returned JSON).
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

    // ---- 401: session expired ----
    if (response.status === 401) {
        if (!skipAuthRedirect) {
            _handleUnauthorized();
        }
        const err = new Error('Session expired. Please log in again.');
        err.status = 401;
        throw err;
    }

    // ---- 403: forbidden ----
    if (response.status === 403) {
        const detail = await _readDetail(response);
        const err = new Error(detail || 'Insufficient permissions.');
        err.status = 403;
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
        const detail =
            (data && (data.detail || data.message)) ||
            `HTTP ${response.status}`;
        const err = new Error(detail);
        err.status = response.status;
        err.data = data;
        throw err;
    }

    // ---- 2xx, but success: false ----
    if (data && data.success === false) {
        const detail = data.message || data.detail || 'Error';
        const err = new Error(detail);
        err.status = response.status;
        err.data = data;
        throw err;
    }

    return data;
}


// ============================================
// INTERNAL
// ============================================

async function _readDetail(response) {
    try {
        const data = await response.json();
        return data && (data.detail || data.message);
    } catch (e) {
        return null;
    }
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