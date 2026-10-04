// neurocad/core/engine/lib/base/profile/domain/modals.js

/**
 * Modal openers for the domain page.
 *
 * Each function takes the BaseProfileDomain instance (`ctx`) and
 * does the lazy import + open. Both robots and sitemap modals are
 * created once per page and reused across opens, so we store them
 * on the instance (`ctx._robotsModal`, `ctx._sitemapModal`) — that
 * is the same behavior the old monolithic domain.js had.
 *
 * Why dynamic imports here (and not static at the top):
 *   Every module in the project is loaded with a `?v=<static_version>`
 *   cache-buster. Static `import { X } from './robots.js'` would pin
 *   the URL without a version, so browsers would keep serving the
 *   pre-deploy copy after an update. `await import(...)` with the
 *   version baked into the URL is what pages.js, title.js, logo.js
 *   and the old domain.js all use.
 *
 *   Modals are opened only when the user clicks a button, so the
 *   import also happens on demand — the initial page load does not
 *   pay for code that may never run.
 *
 * Contract with domain.js:
 *   - read state:   ctx.data (robots_2 / robots_3 / subdomain / custom)
 *   - write state:  ctx._robotsModal, ctx._sitemapModal
 *   - api base:     ctx._apiBase (getter, returns the string)
 *
 * No imports at the top — only the two awaited imports inside the
 * functions themselves.
 */

/**
 * Open the robots.txt editor.
 *
 * @param {object} ctx       — the BaseProfileDomain instance
 * @param {"2"|"3"} which    — target field:
 *   "3" → users.robots_3 (free subdomain);
 *   "2" → users.robots_2 (custom second-level domain).
 *
 * Before opening, the current domain is passed to the modal via
 * setDomain() so its "Открыть всем" preset can write the correct
 * Host line — the real hostname is known right here:
 *   - which = "3" → ctx.data.subdomain.subdomain
 *   - which = "2" → ctx.data.custom.domain
 *
 * On save the modal POSTs to /domain/robots, then calls
 * onSaved(which, savedText) so we can update robots_2 / robots_3
 * without a full reload of the domain card.
 */
export async function openRobotsModal(ctx, which = '2') {
    console.log('[BaseProfileDomain] _openRobotsModal()', which);

    const initialText = which === '3'
        ? ((ctx.data && ctx.data.robots_3) || '')
        : ((ctx.data && ctx.data.robots_2) || '');

    // The domain the user is editing. Used by the modal's
    // "Открыть всем" preset for the Host line.
    const domain = which === '3'
        ? ((ctx.data && ctx.data.subdomain && ctx.data.subdomain.subdomain) || '')
        : ((ctx.data && ctx.data.custom && ctx.data.custom.domain) || '');

    try {
        const version = window.coreEngine?.static_version || Date.now();
        const { RobotsModal } = await import(`./robots.js?v=${version}`);

        // Reuse the modal instance if it's already created — a
        // fresh instance per click would leak the previous overlay
        // if the user clicked twice quickly.
        if (!ctx._robotsModal) {
            ctx._robotsModal = new RobotsModal({
                onSaved: (savedWhich, savedText) => {
                    if (!ctx.data) return;
                    if (savedWhich === '3') {
                        ctx.data.robots_3 = savedText;
                    } else {
                        ctx.data.robots_2 = savedText;
                    }
                    console.log(`[BaseProfileDomain] robots_${savedWhich} saved`);
                },
            });
        }

        ctx._robotsModal.setDomain(domain);
        ctx._robotsModal.open(which, initialText);
    } catch (err) {
        console.error('[BaseProfileDomain] Failed to open robots modal:', err);
    }
}

/**
 * Open the read-only sitemap.xml viewer.
 *
 * The sitemap is generated on the fly from the current user's
 * `pages` table — nothing is stored. That's why the modal has no
 * "save" button: there is no state to persist, and refreshing the
 * modal always shows the current version.
 *
 * The modal fetches GET /domain/sitemap (admin-side path). It is
 * NOT the public /sitemap.xml: a relative fetch of the latter
 * would hit the ADMIN host when the admin is impersonating a
 * user.
 *
 * Same lazy-import + reuse pattern as openRobotsModal.
 *
 * @param {object} ctx — the BaseProfileDomain instance
 */
export async function openSitemapModal(ctx) {
    console.log('[BaseProfileDomain] _openSitemapModal()');

    try {
        const version = window.coreEngine?.static_version || Date.now();
        const { SitemapModal } = await import(`./sitemap.js?v=${version}`);

        if (!ctx._sitemapModal) {
            ctx._sitemapModal = new SitemapModal({
                apiUrl: `${ctx._apiBase}/sitemap`,
            });
        }

        await ctx._sitemapModal.open();
    } catch (err) {
        console.error('[BaseProfileDomain] Failed to open sitemap modal:', err);
    }
}