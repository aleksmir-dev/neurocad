// app/core/engine/lib/pages/hint.js

/**
 * Onboarding tooltips for the article catalog.
 *
 * Two independent hints:
 *
 *   EmptyArticlesHint — when the catalog is empty. Anchored to the
 *     "+" button. Explains how to create the first article.
 *
 *   CardActionsHint — after a card is created. Anchored to the newly
 *     created card. Explains:
 *       - right click → «Редактировать» (card properties)
 *       - double click → open the article
 *
 * Both hints:
 *   - are position: fixed and are placed by JS relative to a target
 *     element (getBoundingClientRect);
 *   - carry a "Не показывать больше" checkbox that persists a flag
 *     in localStorage;
 *   - reposition themselves on window resize while visible.
 *
 * Each hint has its own storage key, so suppressing one does not
 * suppress the other.
 *
 * Lifecycle (both classes):
 *   const hint = new EmptyArticlesHint();
 *   hint.show();          // shows it (if not suppressed & target exists)
 *   hint.show(el);        // CardActionsHint also accepts a card element
 *   hint.hide();          // removes it from the DOM
 *   hint.remove();        // same as hide(), also detaches listeners
 *
 * No imports. Loaded dynamically from Pages._init() with ?v=<version>.
 */


// ============================================
// STORAGE KEYS
// ============================================

const KEY_EMPTY_HINT = 'neurocad.pages.empty_hint_hidden';
const KEY_CARD_HINT  = 'neurocad.pages.card_actions_hint_hidden';


// ============================================
// SMALL HELPERS
// ============================================

function _readFlag(key) {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function _writeFlag(key) {
    try {
        localStorage.setItem(key, '1');
    } catch {
        // localStorage may be unavailable (private mode) — ignore.
    }
}

/**
 * Place `el` below `target`.
 * options.offsetY   — vertical gap, default 12
 * options.alignRight— when true, align the hint's right edge with
 *                     the target's right edge; otherwise align the
 *                     left edges.
 */
function _anchorTo(el, target, options = {}) {
    if (!el || !target) return;

    const rect = target.getBoundingClientRect();
    const offsetY = options.offsetY ?? 12;

    el.style.top = `${rect.bottom + offsetY}px`;

    if (options.alignRight) {
        el.style.right = `${window.innerWidth - rect.right}px`;
        el.style.left = '';
    } else {
        el.style.left = `${rect.left}px`;
        el.style.right = '';
    }
}


// ============================================
// EMPTY CATALOG HINT
// ============================================

export class EmptyArticlesHint {
    constructor() {
        this.el = null;
        this._onResize = null;
    }

    static isSuppressed() {
        return _readFlag(KEY_EMPTY_HINT);
    }

    static suppress() {
        _writeFlag(KEY_EMPTY_HINT);
    }

    /**
     * Show the hint anchored to the "+" button.
     * Does nothing if the user suppressed it or the "+" is not in the DOM.
     */
    show() {
        if (EmptyArticlesHint.isSuppressed()) return;

        const target = document.querySelector('.cards-toolbar-btn-add');
        if (!target) {
            console.log('[EmptyArticlesHint] no "+" button in DOM — skipping');
            return;
        }

        this.remove();

        const el = document.createElement('div');
        el.className = 'core-engine-lib-pages-empty-hint';
        el.innerHTML = `
            <button type="button"
                    class="core-engine-lib-pages-empty-hint-close"
                    title="Закрыть">✕</button>

            <div class="core-engine-lib-pages-empty-hint-title">
                У вас пока нет статей
            </div>

            <div class="core-engine-lib-pages-empty-hint-text">
                Нажмите на кнопку «+», чтобы создать первую статью.
            </div>

            <label class="core-engine-lib-pages-empty-hint-check">
                <input type="checkbox" data-js="hint-never">
                <span>Не показывать больше</span>
            </label>
        `;

        _anchorTo(el, target, { offsetY: 12 });

        document.body.appendChild(el);
        this.el = el;

        el.querySelector('.core-engine-lib-pages-empty-hint-close')
            ?.addEventListener('click', () => this.hide());

        el.querySelector('[data-js="hint-never"]')
            ?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    EmptyArticlesHint.suppress();
                    this.hide();
                }
            });

        this._onResize = () => _anchorTo(this.el, target, { offsetY: 12 });
        window.addEventListener('resize', this._onResize);
    }

    hide() {
        this.remove();
    }

    remove() {
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }
}


// ============================================
// CARD ACTIONS HINT
// ============================================

export class CardActionsHint {
    constructor() {
        this.el = null;
        this._onResize = null;
    }

    static isSuppressed() {
        return _readFlag(KEY_CARD_HINT);
    }

    static suppress() {
        _writeFlag(KEY_CARD_HINT);
    }

    /**
     * Show the hint anchored to a card.
     *
     * @param {HTMLElement} [cardEl] — card node to anchor to.
     *   When omitted, the first card in the grid is used.
     */
    show(cardEl = null) {
        if (CardActionsHint.isSuppressed()) return;

        const target = cardEl || document.querySelector(
            '.core-engine-lib-base-cards-card, .pages-card-wrapper'
        );
        if (!target) {
            console.log('[CardActionsHint] no card in DOM — skipping');
            return;
        }

        this.remove();

        const el = document.createElement('div');
        el.className = 'core-engine-lib-pages-card-hint';
        el.innerHTML = `
            <button type="button"
                    class="core-engine-lib-pages-card-hint-close"
                    title="Закрыть">✕</button>

            <div class="core-engine-lib-pages-card-hint-title">
                Карточка создана
            </div>

            <div class="core-engine-lib-pages-card-hint-text">
                <div class="core-engine-lib-pages-card-hint-row">
                    <span class="core-engine-lib-pages-card-hint-key">Правый клик</span>
                    <span>— редактировать свойства карточки</span>
                </div>
                <div class="core-engine-lib-pages-card-hint-row">
                    <span class="core-engine-lib-pages-card-hint-key">Двойной клик</span>
                    <span>— открыть статью</span>
                </div>
            </div>

            <label class="core-engine-lib-pages-card-hint-check">
                <input type="checkbox" data-js="hint-never">
                <span>Не показывать больше</span>
            </label>
        `;

        // Anchor below the card, aligned to its right edge so the
        // hint does not overlap the neighbouring card.
        _anchorTo(el, target, { offsetY: 12, alignRight: true });

        document.body.appendChild(el);
        this.el = el;

        el.querySelector('.core-engine-lib-pages-card-hint-close')
            ?.addEventListener('click', () => this.hide());

        el.querySelector('[data-js="hint-never"]')
            ?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    CardActionsHint.suppress();
                    this.hide();
                }
            });

        this._onResize = () => _anchorTo(el, target, { offsetY: 12, alignRight: true });
        window.addEventListener('resize', this._onResize);
    }

    hide() {
        this.remove();
    }

    remove() {
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }
}