// neurocad/core/engine/lib/word/editor/effects/header.js

/**
 * Header helpers — the "+" button in the category header, the "clear
 * all effects" button next to it, the inline error message, and the
 * legacy toast fallback.
 *
 * Layout of the header actions (left to right):
 *
 *     [ × ]  [+]      ← clear-all, create
 *
 * No static imports — see the note in ./index.js.
 */

const ICON_BASE = '/static/core/engine/lib/base/images';
const ICON_CLOSE = `${ICON_BASE}/close-inline.svg`;

/**
 * Attach the "+" and "clear all" buttons to the "Эффекты" category
 * header.
 *
 * Idempotent: if the buttons already exist, nothing is done.
 *
 * @param {EffectBlocks} instance
 * @param {number} [attempt=0] — internal retry counter
 */
export function registerCategoryButton(instance, attempt = 0) {
    if (instance._categoryButton && instance._clearButton) return;

    const headerEl = findCategoryHeader(instance);

    if (!headerEl) {
        if (attempt < 10) {
            requestAnimationFrame(
                () => registerCategoryButton(instance, attempt + 1)
            );
        } else {
            console.warn(
                '[EffectBlocks] category header not found — header buttons skipped'
            );
        }
        return;
    }

    headerEl.setAttribute('data-fx-category', instance.category);

    // ---- Container for the two buttons ----
    let actionsEl = headerEl.querySelector('.fx-header-actions');
    if (!actionsEl) {
        actionsEl = document.createElement('span');
        actionsEl.className = 'fx-header-actions';
        headerEl.appendChild(actionsEl);
    }

    // ---- Clear-all button (left) ----
    let clearBtn = actionsEl.querySelector('.fx-clear-btn');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fx-clear-btn';
        clearBtn.setAttribute('title', 'Убрать все эффекты');
        clearBtn.setAttribute('aria-label', 'Убрать все эффекты');
        clearBtn.setAttribute('draggable', 'false');

        const img = document.createElement('img');
        img.className = 'fx-clear-btn__icon';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('draggable', 'false');
        img.setAttribute('src', ICON_CLOSE);
        clearBtn.appendChild(img);

        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[EffectBlocks] clear-all clicked');
            instance._mod?.toggle?.clearAllEffects(instance);
        });

        // Insert BEFORE the "+" so it appears on the left.
        actionsEl.appendChild(clearBtn);
        instance._clearButton = clearBtn;

        console.log('[EffectBlocks] "×" button added to category header');
    }

    // ---- Create button (right) ----
    let createBtn = actionsEl.querySelector('.fx-create-btn');
    if (!createBtn) {
        createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'fx-create-btn';
        createBtn.setAttribute('title', 'Создать новый эффект');
        createBtn.setAttribute('aria-label', 'Создать новый эффект');
        createBtn.textContent = '+';

        createBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            instance.editor.trigger('word:effect-create-start', {});
        });

        actionsEl.appendChild(createBtn);
        instance._categoryButton = createBtn;

        console.log('[EffectBlocks] "+" button added to category header');
    }
}

/**
 * Show a red error message right under the category header.
 *
 * @param {EffectBlocks} instance
 * @param {string} text
 */
export function showCategoryError(instance, text) {
    const headerEl = findCategoryHeader(instance);

    if (!headerEl) {
        toast(text);
        return;
    }

    const categoryEl = headerEl.closest('.gjs-block-category');
    if (!categoryEl) {
        toast(text);
        return;
    }

    const old = categoryEl.querySelector('.fx-create-error');
    if (old) old.remove();

    const errEl = document.createElement('div');
    errEl.className = 'fx-create-error';
    errEl.textContent = text;

    headerEl.insertAdjacentElement('afterend', errEl);

    setTimeout(() => {
        if (errEl.parentNode) errEl.remove();
    }, 2000);
}

export function toast(text) {
    const el = document.createElement('div');
    el.className = 'core-engine-lib-word-editor-effect-toast';
    el.textContent = text;
    document.body.appendChild(el);

    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 300);
    }, 1800);
}

// ============================================
// INTERNAL
// ============================================

function findCategoryHeader(instance) {
    let headerEl = document.querySelector(
        `.gjs-title[data-fx-category="${cssEscape(instance.category)}"]`
    );
    if (headerEl) return headerEl;

    const headers = document.querySelectorAll(
        '.gjs-block-category .gjs-title'
    );
    for (const h of headers) {
        const text = (h.textContent || '').trim();
        if (text.startsWith(instance.category)) {
            return h;
        }
    }

    return null;
}

function cssEscape(s) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(s);
    }
    return String(s).replace(/["\\]/g, '\\$&');
}