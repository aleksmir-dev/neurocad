// neurocad/core/engine/lib/word/editor/effects/panel.js

/**
 * Panel state — the DOM side of the block palette.
 *
 * Responsibilities:
 *
 *   1. findBlockEl(instance, title)
 *      Find the DOM node of a block by its `title`. Four paths tried.
 *
 *   2. syncEditButton(instance, blockEl, effectId, isActive, isEditing)
 *      Render/update/remove the three service buttons inside a NORMAL
 *      effect block:
 *        .fx-rename-btn      — rename (only when is-active)
 *        .fx-edit-cancel-btn — cancel edit (only when is-editing)
 *        .fx-edit-btn        — start/save edit (only when is-active)
 *
 *   3. syncClearButton(instance)
 *      Enable/disable the "clear all effects" button in the header.
 *
 *   4. refreshPanelState(instance)
 *      Recompute which effect is active and refresh all blocks.
 *
 * No static imports — see the note in ./index.js.
 */

const ICON_BASE = '/static/core/engine/lib/base/images';
const ICON_EDIT = `${ICON_BASE}/tool-inline.svg`;
const ICON_SAVE = `${ICON_BASE}/save-inline.svg`;
const ICON_CLOSE = `${ICON_BASE}/close-inline.svg`;
const ICON_RENAME = `${ICON_BASE}/pencil-inline.svg`;

const LOG = '[FX-PANEL]';

/**
 * Find the DOM node of a block by its `title`.
 *
 * Four paths, tried in order — GrapesJS does not consistently expose
 * the block DOM node across versions.
 *
 * @param {EffectBlocks} instance
 * @param {string} title
 * @returns {HTMLElement|null}
 */
export function findBlockEl(instance, title) {
    if (!title) return null;

    // ---- Path 1: Backbone model → view.el ----
    try {
        const collection = (typeof instance.bm.getAll === 'function')
            ? instance.bm.getAll()
            : (instance.bm.collection || instance.bm.blocks || null);

        if (collection && typeof collection.find === 'function') {
            const model = collection.find((b) => {
                let t = null;
                try {
                    const attrs = b.get && b.get('attributes');
                    t = (attrs && attrs.title)
                        || (b.get && b.get('label'))
                        || null;
                } catch (_) { t = null; }
                return t === title;
            });
            if (model) {
                const viewEl = model.view && model.view.el;
                if (viewEl && viewEl.nodeType === 1) return viewEl;
            }
        }
    } catch (_) { /* fall through */ }

    let root = null;
    try {
        root = instance.bm.getContainer?.()
            || instance.bm.getContainerEl?.()
            || null;
    } catch (_) { root = null; }
    if (!root) root = document;

    const esc = cssEscape(title);

    // ---- Path 2: DOM by title attribute ----
    const byTitle = root.querySelector(`.gjs-block[title="${esc}"]`);
    if (byTitle) return byTitle;

    // ---- Path 3: DOM by label text / data-title ----
    const blocks = root.querySelectorAll('.gjs-block');
    for (const el of blocks) {
        const labelEl = el.querySelector('.gjs-block-label');
        const labelText = (labelEl?.textContent || '').trim();
        if (labelText === title) return el;

        const dataTitle = el.getAttribute('data-title');
        if (dataTitle === title) return el;

        const attrTitle = el.getAttribute('title');
        if (attrTitle === title) return el;
    }

    return null;
}

/**
 * Recompute which effect is active on the current selection and
 * refresh the visual state of every registered block.
 *
 * @param {EffectBlocks} instance
 */
export function refreshPanelState(instance) {
    const selected = instance.editor.getSelected();
    const classes = (selected && typeof selected.getClasses === 'function')
        ? (selected.getClasses() || [])
        : [];

    const hasPending = !!instance._pendingEffect;

    // ---- Resolve the active effect by DOM order ----
    let activeId = null;
    let activeTop = Infinity;

    if (!hasPending) {
        for (const [id, entry] of instance._blocks) {
            if (!classes.includes(id)) continue;

            const blockEl = findBlockEl(instance, entry.title);
            if (!blockEl || !blockEl.parentNode) continue;

            const parent = blockEl.parentNode;
            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(blockEl);
            if (idx < 0) continue;

            if (idx < activeTop) {
                activeTop = idx;
                activeId = id;
            }
        }

        if (!activeId && classes.length) {
            for (const id of instance._blocks.keys()) {
                if (classes.includes(id)) {
                    activeId = id;
                    break;
                }
            }
        }
    }

    instance._activeEffect = activeId;

    // ---- Update every registered block ----
    for (const [id, entry] of instance._blocks) {
        const blockEl = findBlockEl(instance, entry.title);
        if (!blockEl) continue;

        const isActive = !hasPending && (id === activeId);
        const isEditing = isEditingEffect(instance, id);

        blockEl.classList.toggle('is-active', isActive);
        blockEl.classList.toggle('is-editing', isEditing);

        syncEditButton(instance, blockEl, id, isActive, isEditing);
    }

    // ---- Pending block: force active + service buttons ----
    if (instance._pendingEffect) {
        const blockEl = findBlockEl(instance, instance._pendingEffect.title);
        if (blockEl) {
            blockEl.classList.add('is-active');
            instance._mod?.create?.syncServiceButtons(instance, blockEl);
        }
    }

    // ---- Clear-all button in the category header ----
    syncClearButton(instance, classes);
}

/**
 * Enable/disable the "clear all effects" button in the category
 * header, depending on whether the current selection has any `fx-*`
 * class.
 *
 * @param {EffectBlocks} instance
 * @param {string[]} [classes]
 */
export function syncClearButton(instance, classes) {
    const btn = instance._clearButton;
    if (!btn) return;

    if (!classes) {
        const selected = instance.editor.getSelected();
        classes = (selected && typeof selected.getClasses === 'function')
            ? (selected.getClasses() || [])
            : [];
    }

    const hasAny = classes.some(c => c.startsWith('fx-'));
    btn.disabled = !hasAny;
    btn.classList.toggle('is-disabled', !hasAny);
    btn.setAttribute(
        'title',
        hasAny ? 'Убрать все эффекты' : 'На элементе нет эффектов'
    );
}

/**
 * Render / update / remove the service buttons inside a NORMAL
 * effect block.
 *
 * Three buttons are managed here:
 *
 *   .fx-rename-btn      — leftmost. Only shown when the block is
 *                         is-active. Emits `word:effect-edit-rename`.
 *
 *   .fx-edit-cancel-btn — middle. Only shown while is-editing.
 *                         Emits `word:effect-edit-cancel`.
 *
 *   .fx-edit-btn        — rightmost. When not editing: tool-inline.svg,
 *                         starts an edit. When editing:
 *                         save-inline.svg, saves the edit.
 *
 * Layout (right to left, top-right of the block card):
 *
 *     [rename] [cancel] [save/edit]
 *       48px     26px      4px
 *
 * @param {EffectBlocks} instance
 * @param {HTMLElement} blockEl
 * @param {string} effectId
 * @param {boolean} isActive
 * @param {boolean} isEditing
 */
export function syncEditButton(instance, blockEl, effectId, isActive, isEditing) {
    // ============================================
    // BUTTON 1 (rightmost) — edit / save
    // ============================================
    let btn = blockEl.querySelector('.fx-edit-btn');

    if (!isActive) {
        if (btn) btn.remove();

        // Clean up the other two when the block is no longer active.
        const staleCancel = blockEl.querySelector('.fx-edit-cancel-btn');
        if (staleCancel) staleCancel.remove();
        const staleRename = blockEl.querySelector('.fx-rename-btn');
        if (staleRename) staleRename.remove();
        return;
    }

    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fx-edit-btn';
        btn.setAttribute('data-effect-id', effectId);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isEditingEffect(instance, effectId)) {
                instance.saveEdit(effectId);
            } else {
                instance.startEdit(effectId);
            }
        });

        btn.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.className = 'fx-edit-btn__icon';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        btn.appendChild(img);

        blockEl.appendChild(btn);
    }

    const img = btn.querySelector('.fx-edit-btn__icon');

    if (isEditing) {
        btn.setAttribute('title', 'Сохранить эффект');
        btn.setAttribute('aria-label', 'Сохранить эффект');
        if (img && img.getAttribute('src') !== ICON_SAVE) {
            img.setAttribute('src', ICON_SAVE);
        }
    } else {
        btn.setAttribute('title', 'Настроить эффект');
        btn.setAttribute('aria-label', 'Настроить эффект');
        if (img && img.getAttribute('src') !== ICON_EDIT) {
            img.setAttribute('src', ICON_EDIT);
        }
    }

    // ============================================
    // BUTTON 2 (middle) — cancel edit (only while editing)
    // ============================================
    let cancelBtn = blockEl.querySelector('.fx-edit-cancel-btn');

    if (!isEditing) {
        if (cancelBtn) cancelBtn.remove();
    } else if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'fx-edit-cancel-btn';
        cancelBtn.setAttribute('data-effect-id', effectId);
        cancelBtn.setAttribute('title', 'Отменить редактирование');
        cancelBtn.setAttribute('aria-label', 'Отменить редактирование');
        cancelBtn.setAttribute('draggable', 'false');

        const imgC = document.createElement('img');
        imgC.className = 'fx-edit-cancel-btn__icon';
        imgC.alt = '';
        imgC.setAttribute('aria-hidden', 'true');
        imgC.setAttribute('draggable', 'false');
        imgC.setAttribute('src', ICON_CLOSE);
        cancelBtn.appendChild(imgC);

        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[FX-PANEL] cancel-edit button clicked for', effectId);
            instance.editor.trigger('word:effect-edit-cancel', { id: effectId });
        });

        blockEl.appendChild(cancelBtn);
    }

    // ============================================
    // BUTTON 3 (leftmost) — rename (only when active)
    // ============================================
    let renameBtn = blockEl.querySelector('.fx-rename-btn');

    if (!renameBtn) {
        renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'fx-rename-btn';
        renameBtn.setAttribute('data-effect-id', effectId);
        renameBtn.setAttribute('title', 'Переименовать эффект');
        renameBtn.setAttribute('aria-label', 'Переименовать эффект');
        renameBtn.setAttribute('draggable', 'false');

        const imgR = document.createElement('img');
        imgR.className = 'fx-rename-btn__icon';
        imgR.alt = '';
        imgR.setAttribute('aria-hidden', 'true');
        imgR.setAttribute('draggable', 'false');
        imgR.setAttribute('src', ICON_RENAME);
        renameBtn.appendChild(imgR);

        renameBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[FX-PANEL] rename button clicked for', effectId);
            instance.editor.trigger('word:effect-edit-rename', { id: effectId });
        });

        blockEl.appendChild(renameBtn);
    }
}

// ============================================
// INTERNAL
// ============================================

function isEditingEffect(instance, effectId) {
    return !!(instance._editingEffect
        && instance._editingEffect.id === effectId);
}

function cssEscape(s) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
    }
    return String(s).replace(/["\\]/g, '\\$&');
}