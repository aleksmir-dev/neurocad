// app/core/engine/lib/word/hint.js

/**
 * EmptyArticleHint — onboarding tooltip for an empty article.
 *
 * Shown when the page is opened in the viewer and its content is
 * empty. Anchored to the "Редактировать" button in the Word toolbar.
 * Explains how to start editing.
 *
 * Contains a "Не показывать больше" checkbox; when checked, the hint
 * is never shown again (localStorage flag).
 *
 * Lifecycle:
 *   const hint = new EmptyArticleHint();
 *   hint.show();   // shows it (if not suppressed and target exists)
 *   hint.hide();   // removes it from the DOM
 *   hint.remove(); // same as hide(), also detaches listeners
 *
 * Position is recomputed on window resize while visible.
 *
 * No imports. Loaded dynamically from Word._init() with ?v=<version>.
 */
export class EmptyArticleHint {
    static STORAGE_KEY = 'neurocad.word.empty_article_hint_hidden';

    /**
     * Selector for the toolbar's "Редактировать" button.
     * Set in view.js → buildToolbarButtons().
     */
    static TARGET_SELECTOR = '[data-action="word-edit"]';

    /** Whether the user chose "never show again". */
    static isSuppressed() {
        try {
            return localStorage.getItem(EmptyArticleHint.STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }

    /** Persist "never show again". */
    static suppress() {
        try {
            localStorage.setItem(EmptyArticleHint.STORAGE_KEY, '1');
        } catch {
            // localStorage may be unavailable (private mode) — ignore.
        }
    }

    constructor() {
        this.el = null;
        this._onResize = null;
    }

    /**
     * Show the hint anchored to the "Редактировать" button.
     * Does nothing if:
     *   - the user suppressed it,
     *   - the toolbar button is not in the DOM.
     */
    show() {
        if (EmptyArticleHint.isSuppressed()) return;

        const target = document.querySelector(EmptyArticleHint.TARGET_SELECTOR);
        if (!target) {
            console.log('[EmptyArticleHint] no edit button in DOM — skipping');
            return;
        }

        this.remove();

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-empty-article-hint';
        el.innerHTML = `
            <button type="button"
                    class="core-engine-lib-word-empty-article-hint-close"
                    title="Закрыть">✕</button>

            <div class="core-engine-lib-word-empty-article-hint-title">
                Статья пока пуста
            </div>

            <div class="core-engine-lib-word-empty-article-hint-text">
                Для редактирования статьи нажмите на кнопку
                «Редактировать».
            </div>

            <label class="core-engine-lib-word-empty-article-hint-check">
                <input type="checkbox" data-js="hint-never">
                <span>Не показывать больше</span>
            </label>
        `;

        // Position: below the button, aligned to its left edge.
        // Arrow points up-left toward the button (see CSS ::before).
        const rect = target.getBoundingClientRect();
        el.style.top  = `${rect.bottom + 12}px`;
        el.style.left = `${rect.left}px`;

        document.body.appendChild(el);
        this.el = el;

        // Close button.
        el.querySelector('.core-engine-lib-word-empty-article-hint-close')
            ?.addEventListener('click', () => this.hide());

        // "Never show again" checkbox.
        el.querySelector('[data-js="hint-never"]')
            ?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    EmptyArticleHint.suppress();
                    this.hide();
                }
            });

        // Keep the hint glued to the button on resize.
        this._onResize = () => this._reposition();
        window.addEventListener('resize', this._onResize);
    }

    _reposition() {
        if (!this.el) return;

        const target = document.querySelector(EmptyArticleHint.TARGET_SELECTOR);
        if (!target) return;

        const rect = target.getBoundingClientRect();
        this.el.style.top  = `${rect.bottom + 12}px`;
        this.el.style.left = `${rect.left}px`;
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