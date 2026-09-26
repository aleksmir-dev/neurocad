// neurocad/core/engine/lib/word/editor/effects/registry.js

/**
 * Registry — loading effect definitions and registering them as
 * GrapesJS blocks.
 *
 * Responsibilities
 * ----------------
 *   1. loadEffects(instance)
 *      Fetch the effect list from GET /editor/effects. The API is
 *      the single source of truth (backed by effects/registry.json
 *      on the backend). On failure — returns an empty list; the
 *      editor still works, just without effects. There is no
 *      bundled fallback: a stale fallback list would silently hide
 *      the real error.
 *
 *   2. registerBlock(instance, effect)
 *      Register a single effect as a GrapesJS block. If the caller
 *      passes `_moveToTop: true`, the block's DOM node is moved to the
 *      FIRST position inside its category after GrapesJS renders it
 *      (see reorder.moveBlockToTop). Used for newly created effects so
 *      they appear at the top of the list, not at the bottom.
 *
 *   3. registerAll(instance)
 *      Fetch the list and register every effect in order. Called once
 *      from index.js → register().
 *
 *   4. registerOne(instance, effect)
 *      Register a single effect without a reload. Used by
 *      llm/chat/create.js after a successful POST. Passes
 *      `_moveToTop: true` so the new block appears at the top, and
 *      schedules a deferred `refreshPanelState` so the new block gets
 *      its `is-active` class once GrapesJS has rendered it.
 *
 *   5. unregisterOne(instance, effectId)
 *      Remove a single effect from the palette without a reload.
 *      Reserved for a future "delete effect" flow.
 *
 *   6. relabelOne(instance, effectId, payload)
 *      Update the label, hint and/or SVG icon of an EXISTING effect
 *      block in the palette. The id, the CSS and the class on the
 *      canvas are NOT touched. Used by llm/chat/edit.js after a
 *      successful `effect_rename` round-trip: the model proposes a
 *      new human-readable label and a new SVG icon, and the palette
 *      block is refreshed in place.
 *
 * The module uses:
 *   instance.bm          — GrapesJS BlockManager
 *   instance._blocks     — Map: id → { block, title, builtin }
 *   instance.category    — the "Эффекты" category label
 *   instance._mod.panel  — for findBlockEl / refreshPanelState
 *   instance._mod.reorder — for moveBlockToTop
 *
 * No static imports. All modules are loaded via the same versioned
 * dynamic import chain as the rest of the effects/*.js package.
 */

// Effects editor API base (relative to origin).
const EFFECTS_API = '/core/engine/lib/word/editor/effects';

/**
 * Register every effect from the API.
 * Called once from index.js → register().
 *
 * @param {EffectBlocks} instance
 */
export async function registerAll(instance) {
    const effects = await loadEffects(instance);
    console.log('[EffectBlocks] effects to register:', effects.length);

    effects.forEach(effect => registerBlock(instance, effect));
}

/**
 * Fetch the effect list from the API.
 *
 * The API is the single source of truth. There is no bundled
 * fallback: on failure we return an empty list, and the palette
 * simply stays empty. This makes API problems visible instead of
 * silently substituting a stale, hardcoded list.
 *
 * @param {EffectBlocks} instance
 * @returns {Promise<Array<{id: string, label: string, hint: string, media: string, builtin: boolean}>>}
 */
export async function loadEffects(instance) {
    try {
        const url = `${EFFECTS_API}${qs(instance)}`;
        console.log('[EffectBlocks] GET', url);

        const fetchJson = window.coreEngine?.fetchJson;
        if (!fetchJson) throw new Error('coreEngine.fetchJson not available');

        const data = await fetchJson(url);
        if (data && data.success && Array.isArray(data.data)) {
            console.log('[EffectBlocks] loaded from API:', data.data.length);
            return data.data.map(e => ({
                id: e.id,
                label: e.label,
                hint: e.hint || e.label,
                media: e.media || '',
                builtin: !!e.builtin,
            }));
        }

        console.warn('[EffectBlocks] unexpected payload', data);
        throw new Error('unexpected payload');
    } catch (e) {
        console.warn('[EffectBlocks] API load failed:', e);
        return [];
    }
}

/**
 * Register a single effect as a GrapesJS block.
 *
 * @param {EffectBlocks} instance
 * @param {Object} effect — { id, label, hint, media, builtin, _moveToTop? }
 */
export function registerBlock(instance, effect) {
    const title = effect.hint || effect.label;

    const block = instance.bm.add(effect.id, {
        label: effect.label,
        category: instance.category,
        media: effect.media,
        content: '',        // no HTML — effect is a class only
        activate: false,    // do not switch to this block after click
        attributes: { title },
    });

    instance._blocks.set(effect.id, {
        block,
        title,
        builtin: !!effect.builtin,
    });

    // For newly created effects: move the block to the top of its
    // category after GrapesJS renders it. Initial registration (during
    // registerAll) does NOT set this flag, so the effects keep the
    // order returned by the server.
    if (effect._moveToTop) {
        instance._mod.reorder.moveBlockToTop(instance, effect.id);
    }
}

/**
 * Add a single effect to the palette without a reload.
 *
 * Called by llm/chat/create.js after a successful POST. The new block
 * is inserted at the TOP of the category so the user sees it
 * immediately.
 *
 * `refreshPanelState` is called HERE and then DEFERRED (via rAF) a few
 * times. Why: `bm.add` creates the Backbone model synchronously, but
 * GrapesJS renders the block DOM asynchronously. The synchronous call
 * will not find the block's DOM node, so `is-active` will not be set
 * on it. The deferred calls pick it up as soon as it is painted.
 *
 * This is what makes the new block appear "selected" (is-active) right
 * after save — the effect class is already on the selected element
 * (applied by llm/chat/create.js → handleDraft), so refreshPanelState
 * just needs to see the block in the DOM to mark it active.
 *
 * @param {EffectBlocks} instance
 * @param {Object} effect — { id, label, hint, media, builtin }
 */
export function registerOne(instance, effect) {
    if (!effect || !effect.id) return;

    if (instance._blocks.has(effect.id)) {
        console.warn('[EffectBlocks] registerOne: already registered', effect.id);
        return;
    }

    registerBlock(instance, { ...effect, _moveToTop: true });

    // Synchronous pass — may be a no-op if the DOM is not painted yet.
    instance._mod.panel.refreshPanelState(instance);

    // Deferred passes — catch the block once GrapesJS has painted it.
    scheduleRefresh(instance, effect.id);

    console.log('[EffectBlocks] registered new effect:', effect.id);
}

/**
 * Remove a single effect from the palette without a reload.
 *
 * Reserved for a future "delete effect" flow — nothing in the current
 * UI calls this yet.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function unregisterOne(instance, effectId) {
    const entry = instance._blocks.get(effectId);
    if (!entry) return;

    const blockEl = instance._mod.panel.findBlockEl(instance, entry.title);
    if (blockEl && blockEl.parentNode) {
        blockEl.parentNode.removeChild(blockEl);
    }
    try { instance.bm.remove(effectId); } catch (_) {}

    instance._blocks.delete(effectId);

    console.log('[EffectBlocks] unregistered effect:', effectId);
}

/**
 * Update the label, hint and/or SVG icon of an EXISTING effect block
 * in the palette.
 *
 * The id, the CSS and the class on the canvas are NOT touched. This
 * is used by llm/chat/edit.js after a successful `effect_rename`
 * round-trip: the model proposes a new human-readable label and a new
 * SVG icon, and we simply refresh the block in the palette.
 *
 * Steps:
 *   1. Look up the entry in `instance._blocks`. If it does not exist
 *      (block was never registered), no-op.
 *   2. Update the Backbone model in place:
 *        - block.set('label', newLabel)
 *        - block.set('media', newMedia)   — only if media was passed
 *        - block.set('attributes', {...prev, title: newTitle})
 *      `newTitle` is `hint || label`, matching how registerBlock
 *      computes the title.
 *   3. Update the entry in `instance._blocks` — its `title` field
 *      must match the new title, otherwise every DOM lookup that goes
 *      through findBlockEl will fail afterwards.
 *   4. Find the block DOM node and update it directly:
 *        - <img>/<svg> inside .gjs-block__media → replace with newMedia
 *        - the label text inside .gjs-block-label → new label
 *        - the `title` attribute → new title
 *      GrapesJS may or may not re-render the block after a `.set()`;
 *      this direct pass guarantees the change is visible regardless.
 *   5. Call `refreshPanelState` so any dependent UI (edit buttons,
 *      active state) is re-synced.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 * @param {{ label?: string, hint?: string, media?: string }} payload
 */
export function relabelOne(instance, effectId, payload) {
    if (!instance || !effectId) return;

    const entry = instance._blocks.get(effectId);
    if (!entry || !entry.block) {
        console.warn('[EffectBlocks] relabelOne: no block for', effectId);
        return;
    }

    const block = entry.block;

    // ---- resolve the new values ----
    const newLabel = (payload && payload.label)
        ? String(payload.label).trim()
        : (block.get('label') || effectId);

    const newHint = (payload && payload.hint)
        ? String(payload.hint).trim()
        : (block.get('hint') || newLabel);

    const newTitle = newHint || newLabel;

    const hasNewMedia = payload && Object.prototype.hasOwnProperty.call(payload, 'media');
    const newMedia = hasNewMedia ? String(payload.media || '').trim() : null;

    console.log('[EffectBlocks] relabelOne', {
        effectId,
        newLabel,
        newHint,
        newTitle,
        mediaLen: newMedia === null ? '(unchanged)' : newMedia.length,
    });

    // ---- 1. update the Backbone model ----
    try {
        block.set('label', newLabel);
        block.set('hint', newHint);

        if (newMedia !== null) {
            block.set('media', newMedia);
        }

        // Preserve other attributes, replace `title`.
        const prevAttrs = block.get('attributes') || {};
        block.set('attributes', { ...prevAttrs, title: newTitle });
    } catch (e) {
        console.warn('[EffectBlocks] relabelOne: block.set failed', e);
    }

    // ---- 2. update the entry in instance._blocks ----
    entry.title = newTitle;

    // ---- 3. update the DOM node in the palette directly ----
    const blockEl = instance._mod.panel.findBlockEl(instance, newTitle);
    if (!blockEl) {
        // If findBlockEl by newTitle fails (GrapesJS re-render raced us),
        // try by the OLD title to still find the node and fix it.
        const fallback = instance._mod.panel.findBlockEl(instance, newLabel);
        if (!fallback) {
            console.warn('[EffectBlocks] relabelOne: block DOM not found');
        } else {
            applyDomRelabel(fallback, newLabel, newTitle, newMedia);
        }
    } else {
        applyDomRelabel(blockEl, newLabel, newTitle, newMedia);
    }

    // ---- 4. re-sync the panel ----
    try {
        instance._mod.panel.refreshPanelState(instance);
    } catch (e) {
        console.warn('[EffectBlocks] relabelOne: refreshPanelState failed', e);
    }

    console.log('[EffectBlocks] relabeled effect:', effectId);
}

// ============================================
// INTERNAL
// ============================================

/**
 * Directly patch the block's DOM node in the palette.
 *
 * Replaces the media, the label text and the `title` attribute. Called
 * by relabelOne after the model has been updated.
 *
 * @param {HTMLElement} blockEl
 * @param {string} newLabel
 * @param {string} newTitle
 * @param {string|null} newMedia — if null, the media is left as-is
 */
function applyDomRelabel(blockEl, newLabel, newTitle, newMedia) {
    if (!blockEl) return;

    // ---- title attribute (used by findBlockEl) ----
    try {
        blockEl.setAttribute('title', newTitle);
        // Some GrapesJS versions render the title into a `data-title`
        // attribute instead; set both — harmless if unused.
        blockEl.setAttribute('data-title', newTitle);
    } catch (_) { /* ignore */ }

    // ---- label text ----
    try {
        const labelEl = blockEl.querySelector('.gjs-block-label');
        if (labelEl) {
            labelEl.textContent = newLabel;
        }
    } catch (_) { /* ignore */ }

    // ---- media (SVG) — only if a new media was provided ----
    if (newMedia !== null) {
        try {
            const mediaEl = blockEl.querySelector('.gjs-block__media');
            if (mediaEl) {
                mediaEl.innerHTML = newMedia;
            }
        } catch (_) { /* ignore */ }
    }
}

/**
 * Re-run `refreshPanelState` on the next few animation frames, until
 * the newly registered block's DOM node exists.
 *
 * GrapesJS may take several frames to paint a new block (especially
 * when a whole category is re-rendered). We poll up to ~40 frames
 * (~0.7 s), matching the retry budget in reorder.moveBlockToTop.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 * @param {number} [attempt=0]
 */
function scheduleRefresh(instance, effectId, attempt = 0) {
    const entry = instance._blocks.get(effectId);
    if (!entry) return;

    // Re-run the panel state — this is what sets `is-active` on the
    // block if its class is present on the selected element.
    instance._mod.panel.refreshPanelState(instance);

    const blockEl = instance._mod.panel.findBlockEl(instance, entry.title);
    if (blockEl) {
        // Block is in the DOM — one more pass to be safe (GrapesJS may
        // add a wrapper or re-render one more time after the first
        // paint), then stop.
        requestAnimationFrame(() => {
            instance._mod.panel.refreshPanelState(instance);
        });
        return;
    }

    if (attempt < 40) {
        requestAnimationFrame(() => scheduleRefresh(instance, effectId, attempt + 1));
    } else {
        console.warn(
            '[EffectBlocks] scheduleRefresh: block DOM not found after retries —',
            effectId
        );
    }
}

/**
 * Build the ?module=<name> query string for the effects API.
 *
 * @param {EffectBlocks} instance
 * @returns {string}
 */
function qs(instance) {
    const moduleName = window.coreEngine?.moduleName
        || document.body.dataset.module
        || '';
    return moduleName
        ? `?module=${encodeURIComponent(moduleName)}`
        : '';
}