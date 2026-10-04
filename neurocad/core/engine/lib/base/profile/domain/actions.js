// neurocad/core/engine/lib/base/profile/domain/actions.js

/**
 * Submit actions for the domain page.
 *
 * Each function takes the BaseProfileDomain instance (`ctx`) plus
 * whatever DOM node it needs, performs the HTTP call, updates the
 * instance's UI state, and triggers a re-render.
 *
 * Why plain functions and not methods:
 *   The class in domain.js only orchestrates — it imports these
 *   functions dynamically (with a `?v=` cache-buster, like every
 *   other module in the project) and calls them with `this` as the
 *   first argument. Keeping them outside the class means the HTTP
 *   logic is testable in isolation and does not bloat domain.js.
 *
 * Contract with domain.js:
 *   - read state:   ctx._submitting, ctx._homeSaving
 *   - write state:  ctx._submitting, ctx._lastError, ctx._lastAddInfo,
 *                   ctx._homeSaving, ctx._homeError, ctx._homeSaved
 *   - re-render:    ctx._rerender()
 *   - reload data:  ctx._reload()
 *   - API base:     ctx._apiBase (a getter, returns the string)
 *
 * No imports — the only external dependency is window.coreEngine,
 * which is always present by the time the domain page renders.
 */

/**
 * POST /domain/add with the value from the [data-js="domain-input"]
 * field. Updates ctx._lastAddInfo (drives the DNS / Caddy result
 * block) and ctx._lastError.
 *
 * @param {object} ctx   — the BaseProfileDomain instance
 * @param {HTMLElement} root — the current page root (for querySelector)
 */
export async function submitAdd(ctx, root) {
    if (ctx._submitting) return;

    const input = root.querySelector('[data-js="domain-input"]');
    const domain = (input?.value || '').trim().toLowerCase();

    ctx._lastError = null;

    if (!domain) {
        ctx._lastError = 'Введите домен';
        ctx._rerender();
        return;
    }

    ctx._submitting = true;
    ctx._lastAddInfo = null;
    ctx._rerender();

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        const data = await fetchJson(`${ctx._apiBase}/add`, {
            method: 'POST',
            body: { domain },
        });
        ctx._lastAddInfo = data.data || null;
        console.log('[BaseProfileDomain] Add result:', ctx._lastAddInfo);
    } catch (err) {
        console.error('[BaseProfileDomain] Add error:', err);
        // The server returns detail on 400 / 409 — the error message
        // is already human-readable Russian.
        ctx._lastError = err?.message || 'Не удалось подключить домен';
    }

    ctx._submitting = false;
    await ctx._reload();
}

/**
 * DELETE /domain/remove — clear the custom domain slot.
 *
 * On success the backend also:
 *   - resets robots_3 back to OPEN (subdomain becomes crawlable again);
 *   - schedules the Caddy certificate for deletion (with a grace period).
 * Both are invisible here — the following _reload() picks up the new
 * state via GET /domain/.
 *
 * @param {object} ctx — the BaseProfileDomain instance
 */
export async function submitRemove(ctx) {
    if (ctx._submitting) return;

    ctx._submitting = true;
    ctx._lastError = null;
    ctx._lastAddInfo = null;
    ctx._rerender();

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        await fetchJson(`${ctx._apiBase}/remove`, { method: 'DELETE' });
    } catch (err) {
        console.error('[BaseProfileDomain] Remove error:', err);
        ctx._lastError = err?.message || 'Не удалось отключить домен';
    }

    ctx._submitting = false;
    await ctx._reload();
}

/**
 * POST /domain/home — set users.home_page_id to the selected page.
 *
 * Shows a transient "Сохранено" badge for ~2 s, then clears it.
 * The badge is rendered by cards.js when ctx._homeSaved is true;
 * this function is the only place that flips it.
 *
 * @param {object} ctx   — the BaseProfileDomain instance
 * @param {HTMLElement} root — the current page root (for querySelector)
 */
export async function submitHomeSave(ctx, root) {
    if (ctx._homeSaving) return;

    const select = root.querySelector('[data-js="home-select"]');
    const raw = select?.value;
    const pageId = parseInt(raw, 10);

    if (!Number.isFinite(pageId)) {
        ctx._homeError = 'Выберите страницу';
        ctx._homeSaved = false;
        ctx._rerender();
        return;
    }

    ctx._homeSaving = true;
    ctx._homeError = null;
    ctx._homeSaved = false;
    ctx._rerender();

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        await fetchJson(`${ctx._apiBase}/home`, {
            method: 'POST',
            body: { page_id: pageId },
        });
        ctx._homeSaved = true;
        console.log('[BaseProfileDomain] Home page set:', pageId);
    } catch (err) {
        console.error('[BaseProfileDomain] Home save error:', err);
        ctx._homeError = err?.message || 'Не удалось сохранить';
    }

    ctx._homeSaving = false;
    await ctx._reload();

    // Auto-clear the "Сохранено" badge after a moment.
    if (ctx._homeSaved) {
        setTimeout(() => {
            ctx._homeSaved = false;
            // Only redraw if the element is still on screen.
            if (ctx.element && ctx.element.isConnected) {
                ctx._rerender();
            }
        }, 2000);
    }
}

/**
 * DELETE /domain/home — reset users.home_page_id to NULL.
 *
 * After this the "/" redirect on the user's subdomain falls back to
 * the first page by datetime — same behavior as before the home
 * page was ever set.
 *
 * @param {object} ctx — the BaseProfileDomain instance
 */
export async function submitHomeClear(ctx) {
    if (ctx._homeSaving) return;

    ctx._homeSaving = true;
    ctx._homeError = null;
    ctx._homeSaved = false;
    ctx._rerender();

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        await fetchJson(`${ctx._apiBase}/home`, { method: 'DELETE' });
        console.log('[BaseProfileDomain] Home page cleared');
    } catch (err) {
        console.error('[BaseProfileDomain] Home clear error:', err);
        ctx._homeError = err?.message || 'Не удалось сбросить';
    }

    ctx._homeSaving = false;
    await ctx._reload();
}