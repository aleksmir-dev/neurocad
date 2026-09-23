// app/core/engine/lib/word/editor/blocks/layout.js

/**
 * LayoutBlocks — structural blocks for GrapesJS.
 *
 * Category: "Разметка" (layout).
 *
 * Blocks:
 *   - Container       — centered max-width wrapper
 *   - 2 columns       — grid
 *   - 3 columns       — grid
 *   - 4 columns       — grid
 *   - Auto columns    — adaptive auto-fit grid
 *   - Flex shell      — full-height page skeleton (nav / main / footer)
 *
 * NOTE: blocks are NOT wrapped in .core-engine-lib-word-blocks anymore.
 * That class is the single scope wrapper for the whole page:
 *   - in the editor — added to the iframe <body> (GrapesLoader)
 *   - on public pages — added to <article> (public.html)
 *
 * Layout classes:
 *   Generic (.section, .container, .grid, .grid--2/3/4/auto, .col)
 *     — live in editor/css/content.css (shared, loaded globally).
 *   Flex-shell specific (.flex-shell, .flex-shell__*)
 *     — live in editor/blocks/layout.css (only used by this block).
 *
 * Atoms (.h1, .h2, .text, .btn, .card, ...) live in
 * editor/css/content.css.
 *
 * Sections (.hero, .features, .cta, ...) live in
 * editor/blocks/ready.css.
 *
 * Droppable areas:
 *   Containers, grids, columns and flex-shell areas are marked with
 *   data-gjs-droppable="true" so GrapesJS accepts dropping other
 *   blocks INSIDE them (instead of placing them next to the block).
 *   data-gjs-draggable=".flex-shell__main" keeps the flex-shell
 *   areas locked inside the flex row.
 */
export class LayoutBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Разметка';
    }

    register() {
        console.log('[LayoutBlocks] Регистрация');

        // ===== CONTAINER =====

        /*
         * Container — centered max-width wrapper.
         * Uses .container from content.css (max-width: --theme-container-max).
         *
         * data-gjs-droppable="true" — other blocks can be dropped inside.
         */
        this.bm.add('core-container', {
            label: 'Контейнер',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="6" y="4" width="12" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="container" data-gjs-droppable="true">
                    <p class="text text--center text--muted">Содержимое контейнера</p>
                </div>
            `,
        });

        // ===== GRIDS =====

        this.bm.add('core-grid-2', {
            label: '2 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="grid grid--2" data-gjs-droppable="true">
                    <div class="col" data-gjs-droppable="true">
                        <h3 class="h3">Колонка 1</h3>
                        <p class="text text--muted">Описание первой колонки</p>
                    </div>
                    <div class="col" data-gjs-droppable="true">
                        <h3 class="h3">Колонка 2</h3>
                        <p class="text text--muted">Описание второй колонки</p>
                    </div>
                </div>
            `,
        });

        this.bm.add('core-grid-3', {
            label: '3 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.25" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16.5" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="grid grid--3" data-gjs-droppable="true">
                    <div class="col" data-gjs-droppable="true">
                        <h3 class="h3">Колонка 1</h3>
                        <p class="text text--muted">Описание</p>
                    </div>
                    <div class="col" data-gjs-droppable="true">
                        <h3 class="h3">Колонка 2</h3>
                        <p class="text text--muted">Описание</p>
                    </div>
                    <div class="col" data-gjs-droppable="true">
                        <h3 class="h3">Колонка 3</h3>
                        <p class="text text--muted">Описание</p>
                    </div>
                </div>
            `,
        });

        this.bm.add('core-grid-4', {
            label: '4 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7.3" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12.6" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="18" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="grid grid--4" data-gjs-droppable="true">
                    <div class="col" data-gjs-droppable="true">Колонка 1</div>
                    <div class="col" data-gjs-droppable="true">Колонка 2</div>
                    <div class="col" data-gjs-droppable="true">Колонка 3</div>
                    <div class="col" data-gjs-droppable="true">Колонка 4</div>
                </div>
            `,
        });

        this.bm.add('core-grid-auto', {
            label: 'Адаптивная сетка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="4" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="4" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="13" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="13" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="13" width="6" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div class="grid grid--auto" data-gjs-droppable="true">
                    <div class="col" data-gjs-droppable="true">Карточка 1</div>
                    <div class="col" data-gjs-droppable="true">Карточка 2</div>
                    <div class="col" data-gjs-droppable="true">Карточка 3</div>
                    <div class="col" data-gjs-droppable="true">Карточка 4</div>
                    <div class="col" data-gjs-droppable="true">Карточка 5</div>
                    <div class="col" data-gjs-droppable="true">Карточка 6</div>
                </div>
            `,
        });

        // ===== FLEX SHELL =====

        /*
         * Flex shell — full-height page skeleton with a three-column main:
         *
         *   nav      — fixed height (60px)
         *   main     — flex row of three areas:
         *              left   (aside)   — 1 share of free space
         *              center (section) — 3 shares of free space
         *              right  (aside)   — 1 share of free space
         *   footer   — fixed height (30px)
         *
         * Each area scrolls independently (overflow: auto).
         *
         * The shell itself is position: absolute; inset: 0 — it fills
         * its parent exactly. The parent must be position: relative:
         *   - editor canvas: iframe <body> (canvas.css);
         *   - admin preview: inner <div id="..."> (word.css);
         *   - public page:   .core-engine-lib-word-blocks (public.css).
         *
         * Droppable targets:
         *   nav, all three areas and footer carry data-gjs-droppable="true"
         *   so other blocks (headings, text, buttons, images, ...) can be
         *   dropped INSIDE them. Without this, GrapesJS treats <nav>,
         *   <aside>, <section>, <footer> as leaf elements and places the
         *   new block NEXT TO the shell — exactly the bug we are fixing.
         *
         * Areas are also limited by data-gjs-draggable=".flex-shell__main"
         * so they cannot be dragged out of the flex row.
         *
         * Section styles live in editor/blocks/layout.css.
         */
        this.bm.add('core-flex-shell', {
            label: 'Flex-каркас (nav / main / footer)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24">'
                + '<rect x="2" y="2" width="20" height="4" fill="#246eaa"/>'
                + '<rect x="2" y="8" width="20" height="10" fill="#cbd5e1"/>'
                + '<rect x="2" y="20" width="20" height="2" fill="#0f172a"/>'
                + '</svg>',
            content: `
                <div class="flex-shell">
                    <nav class="flex-shell__nav"
                         data-gjs-droppable="true">Nav</nav>
                    <main class="flex-shell__main">
                        <aside class="flex-shell__area flex-shell__area--left"
                               data-gjs-droppable="true"
                               data-gjs-draggable=".flex-shell__main"></aside>
                        <section class="flex-shell__area flex-shell__area--center"
                                 data-gjs-droppable="true"
                                 data-gjs-draggable=".flex-shell__main"><div data-slot="content"></div></section>
                        <aside class="flex-shell__area flex-shell__area--right"
                               data-gjs-droppable="true"
                               data-gjs-draggable=".flex-shell__main"></aside>
                    </main>
                    <footer class="flex-shell__footer"
                            data-gjs-droppable="true">Footer</footer>
                </div>
            `,
        });
    }
}