// neurocad/core/engine/lib/base/profile/domain/modals.js

/**
 * Modal openers for the domain page.
 *
 * Each function takes the BaseProfileDomain instance (`ctx`) and
 * does the lazy import + open. Every modal is created once per page
 * and reused across opens, so we store them on the instance
 * (`ctx._robotsModal`, `ctx._sitemapModal`, `ctx._legalModal`) —
 * that is the same behavior the old monolithic domain.js had.
 *
 * Why dynamic imports here (and not static at the top):
 *   Every module in the project is loaded with a `?v=<static_version>`
 *   cache-buster. Static `import { X } from './modal/robots/robots.js'`
 *   would pin the URL without a version, so browsers would keep
 *   serving the pre-deploy copy after an update. `await import(...)`
 *   with the version baked into the URL is what pages.js, title.js,
 *   logo.js and the old domain.js all use.
 *
 *   Modals are opened only when the user clicks a button, so the
 *   import also happens on demand — the initial page load does not
 *   pay for code that may never run.
 *
 * Contract with domain.js:
 *   - read state:   ctx.data (robots_2 / robots_3 / subdomain /
 *                             custom / policy / rules /
 *                             policy_default / rules_default)
 *   - write state:  ctx._robotsModal, ctx._sitemapModal,
 *                             ctx._legalModal
 *   - api base:     ctx._apiBase (getter, returns the string)
 *
 * No imports at the top — only the awaited imports inside the
 * functions themselves.
 *
 * Module layout
 * -------------
 * The modal classes live in subfolders under ./modal/:
 *
 *   ./modal/robots/robots.js    — RobotsModal
 *   ./modal/sitemap/sitemap.js  — SitemapModal
 *   ./modal/legal/legal.js      — LegalModal
 *
 * This file (modals.js) stays at the top level: it is the bridge
 * between the page (domain.js) and the modals, not a page and not
 * a modal itself.
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
        const { RobotsModal } = await import(`./modal/robots/robots.js?v=${version}`);

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
        const { SitemapModal } = await import(`./modal/sitemap/sitemap.js?v=${version}`);

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

/**
 * Open the legal-text editor (Policy or Rules).
 *
 * @param {object} ctx              — the BaseProfileDomain instance
 * @param {"policy"|"rules"} which  — target field:
 *   "policy" → users.policy (served at /policy on the user's host);
 *   "rules"  → users.rules  (served at /rules  on the user's host).
 *
 * The modal is a markdown editor with a small live preview, a
 * "Вставить шаблон" preset, and a "Сохранить" button that POSTs
 * to /domain/legal. On success it calls onSaved(which, savedText)
 * so we can update ctx.data.policy / ctx.data.rules without a
 * full reload of the domain card — the badge in the legal card
 * then flips from "Не задано" to "Заполнено" on the next render.
 *
 * When the user's field is empty (NULL, "", or whitespace-only),
 * the modal is seeded with the same universal fallback the public
 * /policy and /rules endpoints serve — see ctx.data.policy_default
 * and ctx.data.rules_default. The modal is told this via the third
 * argument to open() (isDefault = true), so it can render a hint
 * explaining that the text shown is the fallback currently
 * published on the site, and the user may keep it or replace it.
 *
 * Same lazy-import + reuse pattern as openRobotsModal: one
 * instance per page, reused across opens. This is why the modal
 * itself accepts `which` and `initialText` on every open() call
 * rather than at construction time — the same instance serves
 * both the Policy and the Rules row.
 */
export async function openLegalModal(ctx, which = 'policy') {
    console.log('[BaseProfileDomain] _openLegalModal()', which);

    // The user's own text for this document (may be NULL or "" —
    // both mean "not set").
    const userText = which === 'rules'
        ? ((ctx.data && ctx.data.rules) || '')
        : ((ctx.data && ctx.data.policy) || '');

    // The universal fallback — same text the public page serves
    // when the field is empty.
    const defaultText = which === 'rules'
        ? ((ctx.data && ctx.data.rules_default) || '')
        : ((ctx.data && ctx.data.policy_default) || '');

    // If the user has no text, seed the modal with the fallback
    // and tell it that what it shows is the fallback. If the user
    // does have text, show that text with no fallback hint.
    const isDefault = !String(userText).trim();
    const initialText = isDefault ? defaultText : userText;

    try {
        const version = window.coreEngine?.static_version || Date.now();
        const { LegalModal } = await import(`./modal/legal/legal.js?v=${version}`);

        // Reuse the modal instance if it's already created — a
        // fresh instance per click would leak the previous overlay
        // if the user clicked twice quickly.
        if (!ctx._legalModal) {
            ctx._legalModal = new LegalModal({
                onSaved: (savedWhich, savedText) => {
                    if (!ctx.data) return;
                    if (savedWhich === 'rules') {
                        ctx.data.rules = savedText;
                    } else {
                        ctx.data.policy = savedText;
                    }
                    console.log(`[BaseProfileDomain] ${savedWhich} saved`);
                },
            });
        }

        ctx._legalModal.open(which, initialText, isDefault);
    } catch (err) {
        console.error('[BaseProfileDomain] Failed to open legal modal:', err);
    }
}