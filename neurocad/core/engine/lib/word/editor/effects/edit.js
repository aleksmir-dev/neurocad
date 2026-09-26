// neurocad/core/engine/lib/word/editor/effects/edit.js

/**
 * Edit session — the "edit effect" mode of EffectBlocks.
 *
 * When an effect is applied to the selected element, its block in the
 * panel shows a small edit button (tool-inline.svg). Clicking it starts
 * edit mode:
 *
 *   1. `startEdit(instance, effectId)`:
 *      - stores `instance._editingEffect = { id, draftCss: '' }`;
 *      - refreshes the panel so the button icon switches to save-inline
 *        and the block gets `is-editing`;
 *      - emits `word:effect-edit-start` — llm/chat/edit.js fetches the
 *        current CSS from the server and opens the edit session in the
 *        chat.
 *
 *   2. The user describes changes in the chat. The LLM returns new CSS.
 *      llm/chat/edit.js stores it in `instance._editingEffect.draftCss`
 *      via `setDraftCss` and applies it live to the iframe
 *      (live.js → applyDraft).
 *
 *   3. `saveEdit(instance, effectId)`:
 *      - emits `word:effect-edit-save` with the draft CSS;
 *      - llm/chat/edit.js PUTs the CSS to the server, then calls
 *        `finishEdit`.
 *
 *   4. `finishEdit(instance, effectId)`:
 *      - clears `instance._editingEffect`;
 *      - refreshes the panel (button icon switches back to tool-inline).
 *
 *   5. `cancelEdit(instance, effectId)`:
 *      - clears `instance._editingEffect`;
 *      - emits `word:effect-edit-cancel` — llm/chat/edit.js removes the
 *        draft `<style>` from the iframe (revertDraft).
 *
 * Public API used by llm/chat/edit.js and llm/chat/create.js:
 *   getEditingEffect(instance)
 *   getDraftCss(instance)
 *   setDraftCss(instance, css)
 *   isEditing(instance, effectId)
 *
 * All panel-related work goes through `instance._mod.panel`. All
 * editor events go through `instance.editor.trigger`.
 *
 * No static imports — see the note in ./index.js.
 */

// ============================================
// LIFECYCLE
// ============================================

/**
 * Start editing the given effect via the chat.
 *
 * If another effect is currently being edited, its session is
 * cancelled first (silently — cancelEdit emits the event).
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function startEdit(instance, effectId) {
    // Already editing this effect — nothing to do.
    if (instance._editingEffect
        && instance._editingEffect.id === effectId) {
        return;
    }

    // Another effect is being edited — cancel it first.
    if (instance._editingEffect) {
        cancelEdit(instance, instance._editingEffect.id);
    }

    instance._editingEffect = {
        id: effectId,
        draftCss: '',   // filled by llm/chat/edit.js via setDraftCss
    };

    instance._mod.panel.refreshPanelState(instance);

    console.log('[EffectBlocks] edit start:', effectId);
    instance.editor.trigger('word:effect-edit-start', { id: effectId });
}

/**
 * Save the current draft of the effect being edited.
 *
 * The actual persistence is done by llm/chat/edit.js — this function
 * only emits the event with the current draft CSS. After a successful
 * PUT, llm/chat/edit.js calls `finishEdit` to clear the session.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function saveEdit(instance, effectId) {
    if (!isEditing(instance, effectId)) {
        return;
    }

    const draft = instance._editingEffect.draftCss || '';

    console.log(
        '[EffectBlocks] edit save:',
        effectId,
        `${draft.length} bytes`
    );

    instance.editor.trigger('word:effect-edit-save', {
        id: effectId,
        css: draft,
    });
}

/**
 * Cancel editing (discard the draft). Does NOT write anything.
 *
 * Emits `word:effect-edit-cancel` — llm/chat/edit.js removes the draft
 * `<style>` from the iframe (revertDraft). Any live CSS changes are
 * discarded; the effect stays as it was.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function cancelEdit(instance, effectId) {
    if (!isEditing(instance, effectId)) {
        return;
    }

    console.log('[EffectBlocks] edit cancel:', effectId);

    const id = instance._editingEffect.id;
    instance._editingEffect = null;
    instance._mod.panel.refreshPanelState(instance);

    instance.editor.trigger('word:effect-edit-cancel', { id });
}

/**
 * Clear the edit session after a successful save.
 *
 * Called by llm/chat/edit.js after the server accepts the PUT.
 * Does NOT emit any event — the session is being finished, not
 * cancelled.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function finishEdit(instance, effectId) {
    if (!isEditing(instance, effectId)) {
        return;
    }

    instance._editingEffect = null;
    instance._mod.panel.refreshPanelState(instance);

    console.log('[EffectBlocks] edit finished:', effectId);
}

// ============================================
// PUBLIC — used by llm/chat/*.js
// ============================================

/**
 * True if the given effect is currently being edited.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 * @returns {boolean}
 */
export function isEditing(instance, effectId) {
    return !!(instance._editingEffect
        && instance._editingEffect.id === effectId);
}

/**
 * Current state of the edit session, or null.
 * Shape: { id, draftCss }
 *
 * @param {EffectBlocks} instance
 * @returns {{id: string, draftCss: string}|null}
 */
export function getEditingEffect(instance) {
    return instance._editingEffect;
}

/**
 * Current draft CSS of the effect being edited, or null.
 *
 * @param {EffectBlocks} instance
 * @returns {string|null}
 */
export function getDraftCss(instance) {
    return instance._editingEffect
        ? instance._editingEffect.draftCss
        : null;
}

/**
 * Update the draft CSS of the effect being edited.
 *
 * Called by llm/chat/edit.js after the server returns a new CSS, and
 * by llm/chat/create.js for the create flow (via the same field).
 *
 * @param {EffectBlocks} instance
 * @param {string} css
 */
export function setDraftCss(instance, css) {
    if (!instance._editingEffect) return;
    instance._editingEffect.draftCss = String(css || '');
}