// app/core/engine/lib/word/editor/blocks/elements.js

/**
 * ElementBlocks — atoms for GrapesJS.
 *
 * Category: "Элементы" (elements).
 *
 * Blocks:
 *   - Heading H1        — .h1
 *   - Heading H2        — .h2
 *   - Heading H3        — .h3
 *   - Text              — .text
 *   - Lead              — .lead
 *   - List              — .list
 *   - List (check)      — .list--check
 *   - List (num)        — .list--num
 *   - Button            — .btn
 *   - Button (ghost)    — .btn--ghost
 *   - Image             — .image
 *   - Divider           — .divider
 *   - Quote             — .quote
 *   - Badge             — .badge
 *   - Card              — .card
 *
 * NOTE: blocks are NOT wrapped in .core-engine-lib-word-blocks anymore.
 * That class is the single scope wrapper for the whole page:
 *   - in the editor — added to the iframe <body> (GrapesLoader)
 *   - on public pages — added to <article> (public.html)
 *
 * All atom classes (.h1, .h2, .h3, .text, .lead, .list, .btn, .card,
 * .badge, .quote, .image, .divider) live in editor/css/content.css —
 * they are shared across multiple categories, so they are loaded
 * globally via canvasCss, not per-block.
 *
 * editor/blocks/elements.css is intentionally empty (kept only for
 * symmetry with layout.css and ready.css).
 *
 * Rules:
 *   - Never change existing class names after release.
 *   - Atom styles live in content.css and use only --theme-* vars.
 */
export class ElementBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Элементы';
    }

    register() {
        console.log('[ElementBlocks] Регистрация');

        // ===== HEADINGS =====

        this.bm.add('core-heading-h1', {
            label: 'Заголовок H1',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"></path></svg>',
            content: '<h1 class="h1">Заголовок H1</h1>',
        });

        this.bm.add('core-heading-h2', {
            label: 'Заголовок H2',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"></path></svg>',
            content: '<h2 class="h2">Заголовок H2</h2>',
        });

        this.bm.add('core-heading-h3', {
            label: 'Заголовок H3',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"></path></svg>',
            content: '<h3 class="h3">Заголовок H3</h3>',
        });

        // ===== TEXT =====

        this.bm.add('core-text', {
            label: 'Параграф',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"></path></svg>',
            content: '<p class="text">Текст параграфа. Замените на любой контент.</p>',
        });

        this.bm.add('core-lead', {
            label: 'Лид (вводный текст)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 5h18v3H3zm0 6h18v2H3zm0 5h14v2H3z"></path></svg>',
            content: '<p class="lead">Вводный текст. Расскажите коротко о главном.</p>',
        });

        // ===== LISTS =====

        this.bm.add('core-list', {
            label: 'Список',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 6h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z"></path></svg>',
            content: `
                <ul class="list">
                    <li>Первый пункт</li>
                    <li>Второй пункт</li>
                    <li>Третий пункт</li>
                </ul>
            `,
        });

        this.bm.add('core-list-check', {
            label: 'Список с галочками',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>',
            content: `
                <ul class="list list--check">
                    <li>Первый пункт</li>
                    <li>Второй пункт</li>
                    <li>Третий пункт</li>
                </ul>
            `,
        });

        this.bm.add('core-list-num', {
            label: 'Нумерованный список',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4h2v5H3zm0 7h2v6H3zm0 8h2v2H3zm4-15h14v2H7zm0 7h14v2H7zm0 8h14v2H7z"></path></svg>',
            content: `
                <ol class="list list--num">
                    <li>Первый пункт</li>
                    <li>Второй пункт</li>
                    <li>Третий пункт</li>
                </ol>
            `,
        });

        // ===== BUTTONS =====

        this.bm.add('core-btn', {
            label: 'Кнопка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="3" fill="currentColor"></rect></svg>',
            content: '<a href="#" class="btn">Кнопка</a>',
        });

        this.bm.add('core-btn-ghost', {
            label: 'Кнопка (вторичная)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2"></rect></svg>',
            content: '<a href="#" class="btn btn--ghost">Кнопка</a>',
        });

        // ===== IMAGE =====

        this.bm.add('core-image', {
            label: 'Картинка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3L14.5 12l4.5 6H5z"></path></svg>',
            content: '<img class="image" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">',
        });

        // ===== DIVIDER =====

        this.bm.add('core-divider', {
            label: 'Разделитель',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="11" width="20" height="2" fill="currentColor"></rect></svg>',
            content: '<hr class="divider">',
        });

        // ===== QUOTE =====

        this.bm.add('core-quote', {
            label: 'Цитата',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"></path></svg>',
            content: '<blockquote class="quote">Текст цитаты. Можно заменить на любой контент.</blockquote>',
        });

        // ===== BADGE =====

        this.bm.add('core-badge', {
            label: 'Плашка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="9" width="18" height="6" rx="3" fill="currentColor"></rect></svg>',
            content: '<span class="badge">Плашка</span>',
        });

        // ===== CARD =====

        this.bm.add('core-card', {
            label: 'Карточка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="card">
                    <h3 class="card__title">Заголовок карточки</h3>
                    <p class="card__text">Содержимое карточки. Можно заменить на любой контент.</p>
                </div>
            `,
        });
    }
}