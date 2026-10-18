// app/core/engine/lib/pages/loader.js

/**
 * Data loaders for the Pages component.
 *
 * Split out of pages.js to keep that file focused on orchestration.
 * Every function here is a plain async function that takes the
 * Pages instance as its first argument and reads / writes its
 * state:
 *
 *   pages._apiUrl(endpoint, query)  — URL builder (delegates to utils)
 *   pages.cardsInstance             — the BaseCards instance (may
 *                                     be null during _init)
 *   pages.props.items               — the current item list
 *   pages.props.nav_id              — optional nav scope
 *   pages._templates                — filled by loadTemplates
 *   pages._creatives                — filled by loadCreatives
 *   pages._publicPagesUrl           — filled by loadPublicPagesUrl
 *
 * Called from Pages._init() and Pages._reload() with the same
 * `pages` object — pages.js only handles when to call them, not
 * how. All HTTP goes through window.coreEngine.fetchJson.
 *
 * Error policy: every loader swallows its own errors and leaves
 * the target field in a safe state (usually []). A failed list
 * request is not worth blocking the whole catalog — the caller
 * always gets a usable object back.
 *
 * No static imports — the caller passes the URLs in, so this file
 * does not depend on ./utils.js or any other sibling module.
 *
 * User-facing strings are in Russian. Code comments, docstrings
 * and identifiers are in English.
 */

// ============================================
// LIST
// ============================================

/**
 * Load the list of items for the CURRENT folder level.
 *
 * `pages.cardsInstance.parentId` is the source of truth:
 *   - null / undefined → `parent_id=` (empty) → backend returns
 *     ONLY the root level (parent_id IS NULL);
 *   - a real id        → `parent_id=<id>` → children of that
 *     folder.
 *
 * Before BaseCards exists (during the very first _init()),
 * `pages.cardsInstance` is null — we send the empty parent_id,
 * which is correct: the catalog always opens at the root.
 *
 * The result is written into pages.props.items. On any failure
 * (network, non-success response) the list is set to [].
 */
export async function loadFromServer(pages) {
    console.log('[Pages] loadFromServer()');

    const parentId = pages.cardsInstance?.parentId;

    const extra = (parentId != null)
        ? `parent_id=${encodeURIComponent(parentId)}`
        : 'parent_id=';

    const url = pages._apiUrl('/core/engine/lib/pages/list', extra);
    console.log('[Pages] loadFromServer() url =', url);

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        const result = await fetchJson(url);

        if (result.success) {
            pages.props.items = result.data || [];
            console.log('[Pages] Loaded from server:', pages.props.items.length);
        } else {
            console.warn('[Pages] Response without success:', result);
            pages.props.items = [];
        }
    } catch (error) {
        console.error('[Pages] List load error:', error);
        pages.props.items = [];
    }
}

// ============================================
// TEMPLATES
// ============================================

/**
 * Load the list of templates (is_template=1) for the
 * "Наследовать от" dropdown.
 *
 * Called from Pages._init() and Pages._reload() — the latter so a
 * template created in another tab shows up on the next reload,
 * without a full page refresh.
 *
 * Result is written into pages._templates. On any failure the
 * array is cleared.
 */
export async function loadTemplates(pages) {
    console.log('[Pages] loadTemplates()');

    try {
        const url = pages._apiUrl('/core/engine/lib/pages/list', 'is_template=1');
        const fetchJson = window.coreEngine?.fetchJson;
        const result = await fetchJson(url);

        if (result.success) {
            pages._templates = result.data || [];
            console.log('[Pages] Loaded templates:', pages._templates.length);
        } else {
            console.warn('[Pages] Templates response without success:', result);
            pages._templates = [];
        }
    } catch (error) {
        console.error('[Pages] Templates load error:', error);
        pages._templates = [];
    }
}

// ============================================
// CREATIVES
// ============================================

/**
 * Load the list of creatives for the "Креатив" dropdown.
 *
 * Loaded from /core/engine/lib/creatives/list — the same endpoint
 * the Creatives admin page uses. Both active and inactive
 * creatives are returned. The select shows "(неактивен)" next to
 * archived ones, so the user can keep an archived creative
 * attached to a page without being confused by its presence in
 * the list.
 *
 * Called from Pages._init() and Pages._reload() — the latter so a
 * creative created in another tab shows up on the next reload.
 *
 * Result is written into pages._creatives. On any failure the
 * array is cleared.
 */
export async function loadCreatives(pages) {
    console.log('[Pages] loadCreatives()');

    try {
        const fetchJson = window.coreEngine?.fetchJson;
        const result = await fetchJson('/core/engine/lib/creatives/list');

        if (result.success) {
            pages._creatives = result.data || [];
            console.log('[Pages] Loaded creatives:', pages._creatives.length);
        } else {
            console.warn('[Pages] Creatives response without success:', result);
            pages._creatives = [];
        }
    } catch (error) {
        console.error('[Pages] Creatives load error:', error);
        pages._creatives = [];
    }
}

// ============================================
// PUBLIC CATALOG URL
// ============================================

/**
 * Load the ABSOLUTE public catalog URL for the current user from
 * `profile/domain` (`pages_url` field).
 *
 * Called from Pages._init() BEFORE BaseCards is constructed, so
 * extraToolbarButtons already carries the final href when the
 * toolbar is rendered.
 *
 * Result is written into pages._publicPagesUrl. On any failure the
 * default '/pages' value set in the constructor is kept.
 */
export async function loadPublicPagesUrl(pages) {
    try {
        const fetchJson = window.coreEngine?.fetchJson;
        if (!fetchJson) return;

        const res = await fetchJson('/core/engine/lib/base/profile/domain/');
        const url = res?.data?.pages_url;
        if (res?.success && typeof url === 'string' && url) {
            pages._publicPagesUrl = url;
            console.log('[Pages] public catalog URL:', url);
        } else {
            console.warn('[Pages] pages_url not present in domain response');
        }
    } catch (e) {
        console.warn('[Pages] pages_url fetch failed, using /pages', e);
    }
}