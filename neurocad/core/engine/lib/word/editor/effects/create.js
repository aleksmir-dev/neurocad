// neurocad/core/engine/lib/word/editor/effects/create.js

/**
 * Create session — the "create effect" mode of EffectBlocks.
 *
 * Flow
 * ----
 *   1. User clicks the "+" button in the "Эффекты" category header.
 *      header.js emits `word:effect-create-start`. index.js listens
 *      for that event and calls `onCreateClick(instance)`.
 *
 *   2. `onCreateClick`:
 *      - requires a selected element (and not the wrapper) — otherwise
 *        shows an inline error under the category header;
 *      - creates a PENDING block in the palette: a dashed-border block
 *        with a placeholder icon and two service buttons (save
 *        DISABLED, close);
 *      - stores `instance._pendingEffect = { pendingId, draft, title }`;
 *      - refreshes the panel so the pending block gets `is-active`.
 *
 *   3. User describes the effect in the chat. LLM returns a draft.
 *      llm/chat/create.js calls `applyDraftToPendingBlock(instance,
 *      draft)`, which:
 *      - stores the draft in `instance._pendingEffect.draft`;
 *      - replaces the placeholder icon with `draft.media`;
 *      - re-syncs the service buttons — enables the save button;
 *      - refreshes the panel again.
 *
 *   4a. User clicks SAVE. `syncServiceButtons` emits
 *       `word:effect-create-save`. llm/chat/create.js POSTs the draft
 *       to /editor/effects, then calls `finalizePending(instance,
 *       effect)`.
 *
 *   4b. User clicks CLOSE. `syncServiceButtons` emits
 *       `word:effect-create-cancel`. llm/chat/create.js reverts the
 *       draft CSS and the class on the element, then calls
 *       `cancelPending(instance)`.
 *
 * No static imports — see the note in ./index.js.
 */

// Icons for the service buttons. Served from /static, drawn with
// stroke="currentColor" so the button's `color` drives them.
const ICON_BASE = '/static/core/engine/lib/base/images';
const ICON_SAVE = `${ICON_BASE}/save-inline.svg`;
const ICON_CLOSE = `${ICON_BASE}/close-inline.svg`;

// Debug prefix — grep the console for `[FX-CREATE]` to see the whole
// create flow in one place.
const LOG = '[FX-CREATE]';

// ============================================
// CREATE START
// ============================================

export function onCreateClick(instance) {
    console.log(`${LOG} onCreateClick: enter`);

    const selected = instance.editor.getSelected();
    if (!selected) {
        console.warn(`${LOG} onCreateClick: no selection — aborting`);
        instance._mod.header.showCategoryError(
            instance,
            'Выделите элемент на странице'
        );
        return;
    }
    if (selected.get('type') === 'wrapper') {
        console.warn(`${LOG} onCreateClick: wrapper selected — aborting`);
        instance._mod.header.showCategoryError(
            instance,
            'Выделите элемент, а не всю страницу'
        );
        return;
    }
    console.log(`${LOG} onCreateClick: selection ok, type=`, selected.get('type'));

    if (instance._pendingEffect) {
        console.log(`${LOG} onCreateClick: pending already in memory:`, instance._pendingEffect.pendingId);

        const existingEl = instance._mod.panel.findBlockEl(
            instance,
            instance._pendingEffect.title
        );
        console.log(`${LOG} onCreateClick: existingEl in DOM?`, !!existingEl,
            existingEl ? existingEl.className : '(none)');

        if (existingEl && existingEl.classList.contains('is-pending')) {
            console.log(`${LOG} onCreateClick: genuine pending exists — ignored`);
            return;
        }

        console.log(`${LOG} onCreateClick: stale pending — resetting`);
        try { instance.bm.remove(instance._pendingEffect.pendingId); } catch (_) {}
        instance._pendingEffect = null;
    }

    const pendingId = 'fx-pending-' + Math.random().toString(36).slice(2, 8);
    const title = 'Новый эффект';
    console.log(`${LOG} onCreateClick: creating pending block:`, pendingId, 'title=', title);

    instance.bm.add(pendingId, {
        label: title,
        category: instance.category,
        media: '<svg viewBox="0 0 24 24" width="20" height="20">' +
               '<rect x="2" y="2" width="20" height="20" rx="3" ' +
               'fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" ' +
               'stroke-dasharray="3 3"/></svg>',
        content: '',
        activate: false,
        attributes: { title },
    });

    instance._pendingEffect = {
        pendingId,
        draft: null,
        title,
    };
    console.log(`${LOG} onCreateClick: instance._pendingEffect set:`, instance._pendingEffect);

    instance._mod.reorder.moveBlockToTop(instance, pendingId, title);

    requestAnimationFrame(() => {
        console.log(`${LOG} onCreateClick rAF: looking for pending block DOM…`);
        const blockEl = instance._mod.panel.findBlockEl(instance, title);
        console.log(`${LOG} onCreateClick rAF: blockEl found?`, !!blockEl,
            blockEl ? blockEl.className : '(none)');
        if (blockEl) {
            syncServiceButtons(instance, blockEl);
        } else {
            console.warn(`${LOG} onCreateClick rAF: pending block NOT in DOM — will retry`);
            retrySync(instance, title, 0);
        }

        // NEW: refresh panel so the pending block gets is-active.
        console.log(`${LOG} onCreateClick rAF: calling refreshPanelState`);
        instance._mod.panel.refreshPanelState(instance);
    });

    console.log(`${LOG} onCreateClick: emitting word:effect-create-session-started`);
    instance.editor.trigger('word:effect-create-session-started', {});
}

/**
 * Retry syncServiceButtons on next frames until the pending block DOM
 * appears. GrapesJS may take several frames to paint a new block.
 */
function retrySync(instance, title, attempt) {
    if (attempt >= 40) {
        console.warn(`${LOG} retrySync: giving up after 40 frames — title=`, title);
        return;
    }
    requestAnimationFrame(() => {
        const blockEl = instance._mod.panel.findBlockEl(instance, title);
        if (blockEl) {
            console.log(`${LOG} retrySync: found block after`, attempt + 1, 'frames');
            syncServiceButtons(instance, blockEl);
            // NEW: refresh so the pending block gets is-active.
            instance._mod.panel.refreshPanelState(instance);
            return;
        }
        retrySync(instance, title, attempt + 1);
    });
}

// ============================================
// DRAFT
// ============================================

export function applyDraftToPendingBlock(instance, draft) {
    console.log(`${LOG} applyDraftToPendingBlock: enter, draft=`, draft ? draft.id : null);

    if (!instance._pendingEffect) {
        console.warn(`${LOG} applyDraftToPendingBlock: NO pending effect in memory — aborting`);
        return;
    }
    if (!draft) {
        console.warn(`${LOG} applyDraftToPendingBlock: draft is null — aborting`);
        return;
    }

    instance._pendingEffect.draft = draft;
    console.log(`${LOG} applyDraftToPendingBlock: stored draft in _pendingEffect:`,
        instance._pendingEffect.draft.id);

    const blockEl = instance._mod.panel.findBlockEl(
        instance,
        instance._pendingEffect.title
    );
    console.log(`${LOG} applyDraftToPendingBlock: pending block DOM found?`, !!blockEl,
        blockEl ? blockEl.className : '(none)');

    if (!blockEl) {
        console.warn(`${LOG} applyDraftToPendingBlock: pending block NOT in DOM — scheduling retry`);
        retryApplyDraft(instance, 0);
        return;
    }

    if (draft.media) {
        const mediaEl = blockEl.querySelector('.gjs-block__media');
        console.log(`${LOG} applyDraftToPendingBlock: mediaEl?`, !!mediaEl);
        if (mediaEl) {
            mediaEl.innerHTML = draft.media;
        }
    } else {
        console.log(`${LOG} applyDraftToPendingBlock: draft has NO media`);
    }

    console.log(`${LOG} applyDraftToPendingBlock: calling syncServiceButtons (sync pass)`);
    syncServiceButtons(instance, blockEl);

    requestAnimationFrame(() => {
        if (!instance._pendingEffect) return;
        const el = instance._mod.panel.findBlockEl(
            instance,
            instance._pendingEffect.title
        );
        console.log(`${LOG} applyDraftToPendingBlock rAF: re-checking DOM… found?`, !!el,
            el ? el.className : '(none)');
        if (el) {
            syncServiceButtons(instance, el);
        }
        // NEW: refresh panel so the pending block stays is-active
        // and the save button state is consistent.
        instance._mod.panel.refreshPanelState(instance);
    });

    console.log(`${LOG} applyDraftToPendingBlock: done for draft`, draft.id);
}

function retryApplyDraft(instance, attempt) {
    if (attempt >= 40) {
        console.warn(`${LOG} retryApplyDraft: giving up after 40 frames`);
        return;
    }
    if (!instance._pendingEffect || !instance._pendingEffect.draft) return;

    requestAnimationFrame(() => {
        const blockEl = instance._mod.panel.findBlockEl(
            instance,
            instance._pendingEffect.title
        );
        if (blockEl) {
            console.log(`${LOG} retryApplyDraft: found block after`, attempt + 1, 'frames');
            const draft = instance._pendingEffect.draft;
            if (draft.media) {
                const mediaEl = blockEl.querySelector('.gjs-block__media');
                if (mediaEl) mediaEl.innerHTML = draft.media;
            }
            syncServiceButtons(instance, blockEl);
            // NEW: refresh so the pending block stays is-active.
            instance._mod.panel.refreshPanelState(instance);
            return;
        }
        retryApplyDraft(instance, attempt + 1);
    });
}

// ============================================
// FINALIZE / CANCEL
// ============================================

export function finalizePending(instance, effect) {
    console.log(`${LOG} finalizePending: enter, effect=`, effect ? effect.id : null);

    if (!instance._pendingEffect) {
        console.warn(`${LOG} finalizePending: no pending effect — aborting`);
        return;
    }
    if (!effect || !effect.id) {
        console.warn(`${LOG} finalizePending: effect or id missing — aborting`);
        return;
    }

    const pendingId = instance._pendingEffect.pendingId;
    const pendingTitle = instance._pendingEffect.title;
    console.log(`${LOG} finalizePending: removing pending`, pendingId, 'title=', pendingTitle);

    const blockEl = instance._mod.panel.findBlockEl(instance, pendingTitle);
    console.log(`${LOG} finalizePending: pending blockEl found?`, !!blockEl);
    if (blockEl && blockEl.parentNode) {
        blockEl.parentNode.removeChild(blockEl);
    }
    try { instance.bm.remove(pendingId); } catch (_) {}

    instance._pendingEffect = null;
    console.log(`${LOG} finalizePending: calling registerOne for`, effect.id);

    instance.registerOne(effect);

    console.log(`${LOG} finalizePending: done`);
}

export function cancelPending(instance) {
    console.log(`${LOG} cancelPending: enter`);

    if (!instance._pendingEffect) {
        console.warn(`${LOG} cancelPending: no pending effect — nothing to do`);
        return;
    }

    const pendingId = instance._pendingEffect.pendingId;
    const pendingTitle = instance._pendingEffect.title;

    const blockEl = instance._mod.panel.findBlockEl(instance, pendingTitle);
    console.log(`${LOG} cancelPending: pending blockEl found?`, !!blockEl);
    if (blockEl && blockEl.parentNode) {
        blockEl.parentNode.removeChild(blockEl);
    }
    try { instance.bm.remove(pendingId); } catch (_) {}

    instance._pendingEffect = null;

    // NEW: refresh panel so the clear button state updates.
    instance._mod.panel.refreshPanelState(instance);

    console.log(`${LOG} cancelPending: done`);
}

// ============================================
// PUBLIC — read-only access
// ============================================

export function getPendingEffect(instance) {
    return instance._pendingEffect;
}

// ============================================
// SERVICE BUTTONS
// ============================================

/**
 * Service buttons on a PENDING block: save + close.
 *
 * EXTENSIVE LOGGING: every branch logs what it sees, so the console
 * shows exactly why the save button is or is not enabled.
 */
export function syncServiceButtons(instance, blockEl) {
    const pending = instance._pendingEffect;
    console.log(`${LOG} syncServiceButtons: enter`, {
        hasPending: !!pending,
        pendingId: pending?.pendingId,
        draftId: pending?.draft?.id || null,
        hasDraft: !!pending?.draft,
        blockElIsConnected: blockEl ? blockEl.isConnected : null,
        blockElParent: blockEl && blockEl.parentNode ? blockEl.parentNode.className : null,
    });

    if (!pending) {
        console.warn(`${LOG} syncServiceButtons: no pending in memory — aborting`);
        return;
    }

    const hasDraft = !!pending.draft;

    // ---- Save button ----
    let saveBtn = blockEl.querySelector('.fx-save-btn');
    console.log(`${LOG} syncServiceButtons: existing saveBtn?`, !!saveBtn);

    if (!saveBtn) {
        saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'fx-save-btn';
        saveBtn.setAttribute('title', 'Сохранить эффект');
        saveBtn.setAttribute('aria-label', 'Сохранить эффект');
        saveBtn.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.className = 'fx-save-btn__icon';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        img.setAttribute('src', ICON_SAVE);
        saveBtn.appendChild(img);

        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`${LOG} SAVE BUTTON CLICKED`);

            if (!instance._pendingEffect || !instance._pendingEffect.draft) {
                console.warn(`${LOG} SAVE BUTTON: no draft in memory — ignored`);
                return;
            }
            console.log(`${LOG} SAVE BUTTON: emitting word:effect-create-save`);
            instance.editor.trigger('word:effect-create-save', {});
        });

        blockEl.appendChild(saveBtn);
        console.log(`${LOG} syncServiceButtons: save button CREATED and appended`);
    }

    saveBtn.disabled = !hasDraft;
    saveBtn.classList.toggle('is-disabled', !hasDraft);
    saveBtn.setAttribute(
        'title',
        hasDraft ? 'Сохранить эффект' : 'Опишите эффект в чате'
    );
    console.log(`${LOG} syncServiceButtons: save button STATE SET`, {
        disabled: saveBtn.disabled,
        hasDraft,
        isConnected: saveBtn.isConnected,
        className: saveBtn.className,
    });

    // ---- Close button ----
    let closeBtn = blockEl.querySelector('.fx-close-btn');
    if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fx-close-btn';
        closeBtn.setAttribute('title', 'Отменить создание');
        closeBtn.setAttribute('aria-label', 'Отменить создание');
        closeBtn.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.className = 'fx-close-btn__icon';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        img.setAttribute('src', ICON_CLOSE);
        closeBtn.appendChild(img);

        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`${LOG} CLOSE BUTTON CLICKED`);
            instance.editor.trigger('word:effect-create-cancel', {});
        });

        blockEl.appendChild(closeBtn);
        console.log(`${LOG} syncServiceButtons: close button CREATED and appended`);
    }

    blockEl.classList.add('is-pending');
    console.log(`${LOG} syncServiceButtons: done`);
}