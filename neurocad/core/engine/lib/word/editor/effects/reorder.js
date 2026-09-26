// neurocad/core/engine/lib/word/editor/effects/reorder.js

/**
 * Reorder — move a newly created block to the TOP of its category.
 *
 * Why this exists
 * ---------------
 * GrapesJS has no public API for reordering blocks inside a category.
 * The underlying Backbone.Collection is re-rendered from its own
 * internal order, so inserting a model or manipulating `models` does
 * nothing visible. The only reliable path is DOM manipulation.
 *
 * The problem with a simple DOM move
 * ----------------------------------
 * `bm.add()` creates the Backbone model synchronously, but GrapesJS
 * renders the block DOM asynchronously, and it also re-renders the
 * whole category container when new blocks appear. So:
 *
 *   - the block we want to move may not be in the DOM yet;
 *   - our insertBefore can be overwritten by a subsequent re-render.
 *
 * Three-layer defence
 * -------------------
 *   1. moveBlockToTop — poll the DOM via requestAnimationFrame (up to
 *      40 frames, ~0.7 s). The first time the block is found with a
 *      parent, insert it as the first child.
 *
 *   2. attachObserver — after the first successful move, install a
 *      MutationObserver on the container. Whenever GrapesJS re-renders
 *      the child list and the block is no longer first, it is moved
 *      back IMMEDIATELY (not on a timer). The observer disconnects
 *      itself after IDLE_TIMEOUT_MS with no mutations — we do not keep
 *      it forever.
 *
 *   3. verifyTopPosition — a slow fallback that runs a few times
 *      (~1.5 s) in case the observer did not fire (e.g. GrapesJS
 *      re-rendered the container without a childList mutation on the
 *      observed node, which should not happen, but is cheap to guard).
 *
 * Callers
 * -------
 *   registry.registerBlock — for a real effect, looked up in
 *                            instance._blocks by id.
 *   create.onCreateClick   — for the PENDING block, which is NOT in
 *                            instance._blocks (it is not a real
 *                            effect). In that case the caller passes
 *                            the title explicitly as the third
 *                            argument.
 *
 * No static imports — see the note in ./index.js.
 */

//: How long the MutationObserver stays alive after the last mutation.
//: Once the container goes quiet for this long, we assume GrapesJS
//: has finished re-rendering and disconnect to avoid a permanent leak.
const IDLE_TIMEOUT_MS = 5000;

//: One observer per EffectBlocks instance, stored in a WeakMap so it
//: does not keep the instance alive and does not collide between
//: multiple editor instances.
const _observers = new WeakMap();

/**
 * Move a block's DOM node to the FIRST position inside its category
 * container.
 *
 * The title of the block is resolved in this order:
 *   1. `explicitTitle`, if the caller passed one (pending block);
 *   2. `instance._blocks.get(effectId).title` (regular effect);
 *   3. `instance._pendingEffect.title` (last-resort fallback, in case
 *      the caller forgot to pass `explicitTitle` while a pending
 *      block exists).
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId — id of the block to move
 * @param {string} [explicitTitle] — title to use for the DOM lookup;
 *        required when the block is not present in `instance._blocks`
 *        (e.g. the pending block)
 */
export function moveBlockToTop(instance, effectId, explicitTitle) {
    const entry = instance._blocks.get(effectId);
    const title = explicitTitle
        || (entry ? entry.title : null)
        || instance._pendingEffect?.title
        || null;
    if (!title) return;

    const findBlockEl = makeFinder(instance);

    let attempts = 0;

    const tryMove = () => {
        attempts++;

        const blockEl = findBlockEl(title);
        if (blockEl && blockEl.parentNode) {
            const parent = blockEl.parentNode;
            if (parent.firstChild !== blockEl) {
                parent.insertBefore(blockEl, parent.firstChild);
            }
            console.log(
                `[EffectBlocks] moved block to top: ${effectId} ` +
                `(after ${attempts} frame(s))`
            );

            // First success — install a MutationObserver so any future
            // re-render of the container is handled immediately.
            attachObserver(instance, effectId, title, parent);

            // Belt-and-braces: a slow fallback in case the observer
            // did not fire (should not happen, but cheap to guard).
            verifyTopPosition(instance, effectId, title);
            return;
        }

        if (attempts < 40) {
            requestAnimationFrame(tryMove);
        } else {
            console.warn(
                `[EffectBlocks] moveBlockToTop: block not found ` +
                `after ${attempts} frames — ${effectId}`
            );
        }
    };

    requestAnimationFrame(tryMove);
}

/**
 * Verify the block is still at the top; if not, move it again.
 *
 * Slow fallback — the primary mechanism is the MutationObserver
 * installed by attachObserver. This function exists in case the
 * observer did not fire (e.g. the container was replaced, not
 * re-rendered).
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 * @param {string} title — block title, used for the DOM lookup
 * @param {number} [checksLeft=15] — internal retry counter
 */
export function verifyTopPosition(instance, effectId, title, checksLeft = 15) {
    const findBlockEl = makeFinder(instance);

    setTimeout(() => {
        if (checksLeft <= 0) return;

        const blockEl = findBlockEl(title);
        if (!blockEl || !blockEl.parentNode) return;

        const parent = blockEl.parentNode;
        if (parent.firstChild === blockEl) {
            verifyTopPosition(instance, effectId, title, checksLeft - 1);
            return;
        }

        // Moved back — fix it.
        parent.insertBefore(blockEl, parent.firstChild);
        console.log(`[EffectBlocks] moved block back to top: ${effectId}`);
        verifyTopPosition(instance, effectId, title, checksLeft - 1);
    }, 100);
}

// ============================================
// OBSERVER
// ============================================

/**
 * Attach a MutationObserver to the block container.
 *
 * Whenever GrapesJS re-renders the child list of the container
 * (adds, removes, or moves block nodes), the observer fires. If the
 * target block is not the first child — move it back.
 *
 * The observer disconnects itself after IDLE_TIMEOUT_MS without any
 * mutations, so it does not stay alive forever. A new call to
 * attachObserver (from a subsequent moveBlockToTop) replaces the old
 * observer if one is still active.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 * @param {string} title
 * @param {HTMLElement} container — the parent node of the block
 */
function attachObserver(instance, effectId, title, container) {
    if (!container) return;

    // Disconnect a previous observer for this instance, if any.
    const prev = _observers.get(instance);
    if (prev) {
        try { prev.observer.disconnect(); } catch (_) {}
        clearTimeout(prev.timer);
        _observers.delete(instance);
    }

    const findBlockEl = makeFinder(instance);

    // Local flag to avoid a feedback loop: our own insertBefore
    // triggers another mutation, which would call enforce() again.
    let fixing = false;

    const enforce = () => {
        if (fixing) return;
        fixing = true;
        try {
            const blockEl = findBlockEl(title);
            if (blockEl && blockEl.parentNode === container) {
                if (container.firstChild !== blockEl) {
                    container.insertBefore(blockEl, container.firstChild);
                    console.log(
                        `[EffectBlocks] moved block back to top (observer): ${effectId}`
                    );
                }
            }
        } finally {
            fixing = false;
        }
    };

    const observer = new MutationObserver(() => {
        enforce();
        bumpIdleTimer();
    });

    observer.observe(container, { childList: true, subtree: false });

    // Idle timeout — disconnect when the container goes quiet.
    let timer = null;
    const bumpIdleTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            try { observer.disconnect(); } catch (_) {}
            _observers.delete(instance);
            console.log(
                `[EffectBlocks] observer detached after idle: ${effectId}`
            );
        }, IDLE_TIMEOUT_MS);
    };
    bumpIdleTimer();

    _observers.set(instance, { observer, timer });

    console.log(`[EffectBlocks] observer attached: ${effectId}`);
}

// ============================================
// INTERNAL
// ============================================

/**
 * Build a `findBlockEl(title)` closure for the given instance.
 *
 * This module deliberately does not import ./panel.js — the finder
 * is the same one-liner, and duplicating it here keeps the module
 * dependency-free (no risk of a circular import when the whole
 * effects/ package is loaded dynamically).
 *
 * @param {EffectBlocks} instance
 * @returns {(title: string) => HTMLElement|null}
 */
function makeFinder(instance) {
    return function findBlockEl(title) {
        if (!title) return null;

        let root = null;
        try {
            root = instance.bm.getContainer?.()
                || instance.bm.getContainerEl?.()
                || null;
        } catch (_) {
            root = null;
        }
        if (!root) root = document;

        const esc = cssEscape(title);
        return root.querySelector(`.gjs-block[title="${esc}"]`);
    };
}

/**
 * CSS.escape may not exist in very old browsers; GrapesJS 0.21
 * supports modern browsers, but be defensive.
 *
 * @param {string} s
 * @returns {string}
 */
function cssEscape(s) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
    }
    return String(s).replace(/["\\]/g, '\\$&');
}