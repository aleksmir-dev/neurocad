// neurocad/core/engine/lib/word/editor/effects/live.js

/**
 * Live effect draft — apply CSS to a single effect on the fly,
 * without touching the file on disk.
 *
 * How it works
 * ------------
 * At init, GrapesJS loads each effect as a <link> in the iframe <head>:
 *
 *     <link rel="stylesheet"
 *           href="/static/.../effects/fx/fx-shadow-top-n.css?v=...">
 *
 * When the user starts editing an effect, we:
 *   1. read the current CSS of that effect from the server
 *      (GET /editor/effects/<id>.css — see chat.js);
 *   2. inject a <style id="fx-draft-<id>"> into the iframe <head>
 *      with that CSS — this OVERRIDES the <link> (later in the head,
 *      same specificity, so it wins);
 *   3. keep updating the <style> textContent as the LLM returns new
 *      CSS drafts.
 *
 * The <link> is NOT touched. When the user saves:
 *   1. PUT /editor/effects/<id> with the final CSS;
 *   2. remove the <style> draft;
 *   3. update the <link href> with a new ?v= — the file on disk is
 *      fresh now, and the new ?v= busts the browser cache.
 *
 * When the user cancels:
 *   1. remove the <style> draft — the original <link> is still there,
 *      so the effect reverts to what it was.
 *
 * Creating a new effect
 * ---------------------
 * The flow above assumes the effect already has a <link>. A brand-new
 * effect has none — the file didn't exist when the editor loaded. So
 * after the user confirms a draft and the server POSTs a fresh
 * /editor/effects/<id>.css, chat.js calls `addEffectLink(...)` to
 * inject the <link> into the iframe. From that point on the effect
 * behaves like any other: it can be edited with the same draft flow.
 *
 * Deleting an effect calls `removeEffectLink(...)` — the <link> is
 * removed from the iframe.
 *
 * Nothing is written to disk here. All persistence is in the route.
 *
 * No static imports. No dependencies on other modules — the caller
 * (chat.js) provides the GrapesJS instance via `instance`.
 */

// ============================================
// CONSTANTS
// ============================================

// URL prefix for effect CSS files inside the iframe. Matches what
// GrapesLoader.canvasCss and word.js use on the public page.
// Kept in sync manually — both sides point to /static/...
const EFFECTS_CSS_BASE = '/static/core/engine/lib/word/editor/effects';

// ============================================
// HELPERS
// ============================================

/**
 * Return the iframe document of the GrapesJS canvas, or null.
 */
function _getDoc(instance) {
    try {
        return instance?.Canvas?.getDocument?.() || null;
    } catch (_) {
        return null;
    }
}

/**
 * Find the <link> element for the given effect in the iframe <head>.
 *
 * The link is matched by suffix, because the href carries ?v=...:
 *   /static/.../effects/fx/fx-shadow-top-n.css?v=abc123
 */
function _findLink(doc, effectId) {
    if (!doc) return null;
    const suffix = `/effects/fx/${effectId}.css`;
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes(suffix)) return link;
    }
    return null;
}

/**
 * Find or create the <style> element for the given effect draft.
 *
 * The <style> is inserted right after the effect's <link>, so it
 * overrides it (same specificity, later in document order).
 */
function _ensureStyle(doc, effectId) {
    const styleId = `fx-draft-${effectId}`;

    let style = doc.getElementById(styleId);
    if (style) return style;

    style = doc.createElement('style');
    style.id = styleId;
    style.setAttribute('data-fx-draft', effectId);

    // Insert right after the <link> of this effect, if found.
    // Otherwise — at the end of <head>.
    const link = _findLink(doc, effectId);
    if (link && link.parentNode) {
        link.parentNode.insertBefore(style, link.nextSibling);
    } else {
        doc.head.appendChild(style);
    }

    return style;
}

/**
 * Remove the draft <style> for the given effect, if present.
 */
function _removeStyle(doc, effectId) {
    if (!doc) return;
    const style = doc.getElementById(`fx-draft-${effectId}`);
    if (style && style.parentNode) {
        style.parentNode.removeChild(style);
    }
}

/**
 * Bump the ?v= of the <link> for the given effect. Forces the browser
 * to refetch the file.
 */
function _bumpLinkVersion(doc, effectId) {
    if (!doc) return;
    const link = _findLink(doc, effectId);
    if (!link) return;

    const href = link.getAttribute('href') || '';
    if (!href) return;

    // Keep the URL, replace only ?v=...
    const base = href.split('?')[0];
    const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    link.setAttribute('href', `${base}?v=${v}`);
}

/**
 * Build a fresh ?v= cache-buster.
 */
function _freshVersion() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ============================================
// PUBLIC API — draft lifecycle (existing effect)
// ============================================

/**
 * Apply a draft CSS to the given effect inside the iframe.
 *
 * Called every time the LLM returns a new CSS for the effect.
 * Safe to call multiple times — the <style> is reused.
 *
 * @param {Object} instance — GrapesJS instance
 * @param {string} effectId — e.g. 'fx-shadow-top-n'
 * @param {string} css      — full CSS of the effect
 */
export function applyDraft(instance, effectId, css) {
    const doc = _getDoc(instance);
    if (!doc) {
        console.warn('[effects/live] applyDraft: no iframe document');
        return;
    }
    const style = _ensureStyle(doc, effectId);
    style.textContent = String(css || '');
    console.log(
        `[effects/live] draft applied: ${effectId} (${style.textContent.length} bytes)`
    );
}

/**
 * Commit the draft: remove the <style>, bump the <link> version.
 *
 * Call AFTER the server has accepted the PUT — the file on disk is
 * fresh now, and bumping ?v= forces the browser to fetch it.
 *
 * @param {Object} instance — GrapesJS instance
 * @param {string} effectId
 */
export function commitDraft(instance, effectId) {
    const doc = _getDoc(instance);
    if (!doc) {
        console.warn('[effects/live] commitDraft: no iframe document');
        return;
    }
    _removeStyle(doc, effectId);
    _bumpLinkVersion(doc, effectId);
    console.log(`[effects/live] draft committed: ${effectId}`);
}

/**
 * Discard the draft: remove the <style>. The <link> still points to
 * the last saved file — the effect reverts to its pre-edit state.
 *
 * @param {Object} instance — GrapesJS instance
 * @param {string} effectId
 */
export function revertDraft(instance, effectId) {
    const doc = _getDoc(instance);
    if (!doc) {
        console.warn('[effects/live] revertDraft: no iframe document');
        return;
    }
    _removeStyle(doc, effectId);
    console.log(`[effects/live] draft reverted: ${effectId}`);
}

// ============================================
// PUBLIC API — link lifecycle (new / deleted effect)
// ============================================

/**
 * Inject a <link> for a NEW effect into the iframe <head>.
 *
 * Called by chat.js after a successful POST /editor/effects. The file
 * is now on disk under /static/..., and this link makes the CSS
 * available inside the canvas so the effect can be applied.
 *
 * Idempotent: if a <link> for the same effect already exists, its
 * href is just bumped. Safe to call multiple times.
 *
 * @param {Object} instance — GrapesJS instance
 * @param {string} effectId — e.g. 'fx-shimmer-dots'
 * @returns {HTMLLinkElement|null}
 */
export function addEffectLink(instance, effectId) {
    const doc = _getDoc(instance);
    if (!doc) {
        console.warn('[effects/live] addEffectLink: no iframe document');
        return null;
    }

    const href = `${EFFECTS_CSS_BASE}/fx/${effectId}.css?v=${_freshVersion()}`;

    // If a link already exists — just refresh its href.
    let link = _findLink(doc, effectId);
    if (link) {
        link.setAttribute('href', href);
        console.log(`[effects/live] link refreshed: ${effectId}`);
        return link;
    }

    // Otherwise — create a new one at the end of <head>.
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-fx-link', effectId);

    doc.head.appendChild(link);

    console.log(`[effects/live] link added: ${effectId} → ${href}`);
    return link;
}

/**
 * Remove the <link> for the given effect from the iframe <head>.
 *
 * Called by chat.js after a successful DELETE /editor/effects. Also
 * removes any leftover draft <style> for the same effect.
 *
 * Safe to call if the link is already gone.
 *
 * @param {Object} instance — GrapesJS instance
 * @param {string} effectId
 */
export function removeEffectLink(instance, effectId) {
    const doc = _getDoc(instance);
    if (!doc) {
        console.warn('[effects/live] removeEffectLink: no iframe document');
        return;
    }

    // Remove the draft <style> if it's still hanging around.
    _removeStyle(doc, effectId);

    // Remove the <link>.
    const link = _findLink(doc, effectId);
    if (link && link.parentNode) {
        link.parentNode.removeChild(link);
        console.log(`[effects/live] link removed: ${effectId}`);
    }
}