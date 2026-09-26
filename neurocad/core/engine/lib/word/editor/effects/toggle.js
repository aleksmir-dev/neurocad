// neurocad/core/engine/lib/word/editor/effects/toggle.js

/**
 * Toggle — apply / remove effect classes on the selected element.
 *
 * Exports:
 *   toggleEffect(instance, effectId)   — click on an effect block
 *   clearAllEffects(instance)          — click on the "×" header button
 *
 * No static imports — see the note in ./index.js.
 */

/**
 * Toggle an effect class on the currently selected component.
 *
 * @param {EffectBlocks} instance
 * @param {string} effectId
 */
export function toggleEffect(instance, effectId) {
    const selected = instance.editor.getSelected();
    if (!selected) {
        instance._mod.header.toast('Выделите элемент на странице');
        return;
    }

    if (selected.get('type') === 'wrapper') {
        instance._mod.header.toast('Выделите элемент, а не всю страницу');
        return;
    }

    const classes = selected.getClasses() || [];
    const hasEffect = classes.includes(effectId);

    const next = classes.filter(c => !c.startsWith('fx-'));
    if (!hasEffect) {
        next.push(effectId);
    }

    applyClasses(instance, selected, next);

    console.log(
        '[EffectBlocks]',
        hasEffect ? 'removed' : 'applied',
        effectId
    );

    if (instance._editingEffect
        && hasEffect
        && instance._editingEffect.id === effectId) {
        instance._editingEffect = null;
    }

    instance._mod.panel.refreshPanelState(instance);
}

/**
 * Remove ALL effect classes from the selected element.
 *
 * Called by the "×" button in the category header (header.js).
 * Idempotent: if there are no `fx-*` classes, nothing happens.
 *
 * @param {EffectBlocks} instance
 */
export function clearAllEffects(instance) {
    const selected = instance.editor.getSelected();
    if (!selected) {
        instance._mod.header.toast('Выделите элемент на странице');
        return;
    }

    if (selected.get('type') === 'wrapper') {
        instance._mod.header.toast('Выделите элемент, а не всю страницу');
        return;
    }

    const classes = selected.getClasses() || [];
    const next = classes.filter(c => !c.startsWith('fx-'));

    if (next.length === classes.length) {
        console.log('[EffectBlocks] clearAllEffects: nothing to remove');
        return;
    }

    applyClasses(instance, selected, next);

    // If the effect being edited is gone, cancel the edit session.
    if (instance._editingEffect
        && !next.includes(instance._editingEffect.id)) {
        instance._editingEffect = null;
    }

    console.log('[EffectBlocks] cleared all effects');
    instance._mod.panel.refreshPanelState(instance);
}

// ============================================
// INTERNAL
// ============================================

/**
 * Apply a class list to the selection, wrapped in UndoManager.skip
 * so effect pickings do not pollute the undo history.
 */
function applyClasses(instance, selected, next) {
    const apply = () => selected.setClass(next);
    const um = instance.editor.UndoManager;
    if (um && typeof um.skip === 'function') {
        um.skip(apply);
    } else {
        apply();
    }
}