// app/core/engine/lib/word/editor/tutorial.js

/**
 * EditorTutorial — a short walkthrough of the GrapesJS editor UI.
 *
 * Shown when the editor is opened for an EMPTY article (no content).
 *
 * Suppression:
 *   The bubble has a "Больше не показывать" checkbox. When checked,
 *   `EditorTutorial.suppress()` writes a flag to localStorage
 *   (STORAGE_KEY) and the tutorial is never shown again in this
 *   browser. Same pattern as EmptyArticleHint (./../hint.js).
 *
 * Steps (three, in order):
 *   1. Toolbar      — every toolbar button, with the same icons.
 *   2. Area-left    — the four tabs: Стили / Свойства / Блоки / Пресеты.
 *   3. Area-right   — the LLM chat panel and how to use it.
 *
 * Navigation:
 *   - "Дальше"   — next step (or "Понятно" on the last step)
 *   - "Пропустить" — close the whole tutorial
 *   - ✕           — close the whole tutorial
 *   - чекбокс     — "Больше не показывать" → suppress() + close
 *
 * Mounting:
 *   The bubble is appended to the editor CANVAS CONTENT area
 *   (.core-engine-lib-word-editor-canvas-content, a.k.a.
 *   [data-js="editor-canvas"], a.k.a. .gjs-editor-cont) and is
 *   positioned with position:absolute; top:8px; left:50%.
 *
 *   That container has position:relative (see editor/css/layout.css),
 *   so the bubble floats over the GrapesJS canvas — its top edge is
 *   aligned with the top of the editable wrapper inside the iframe
 *   (<div data-gjs-type="wrapper">), and the grey toolbar strip is
 *   not around the bubble.
 *
 *   Layout:
 *     .editor-canvas (flex column)
 *       ├── [data-js="editor-toolbar"]      (flex-shrink: 0)
 *       └── .editor-canvas-content          (position: relative)
 *           ├── .gjs-editor / .gjs-cv-canvas / <iframe>
 *           └── .editor-tutorial            (position: absolute, top: 8px)
 *
 * IMPORTANT — declaration order inside this class:
 *   `_ICONS` MUST be declared BEFORE `STEPS`, because `STEPS` reads
 *   `EditorTutorial._ICONS.*` during its own static initialization.
 *   If `_ICONS` comes first, `EditorTutorial._ICONS` is already
 *   defined at that point; otherwise the class initializer throws
 *   "Cannot read properties of undefined (reading 'save')".
 *
 * No imports. Loaded dynamically from bridge.js with ?v=<version>.
 */
export class EditorTutorial {
    static STORAGE_KEY = 'neurocad.word.editor_tutorial_hidden';

    /** Canvas content — anchor for mounting. */
    static CANVAS_SELECTOR = '.core-engine-lib-word-editor-canvas-content';

    // ============================================
    // SUPPRESSION (localStorage) — same pattern as EmptyArticleHint
    // ============================================

    static isSuppressed() {
        try {
            return localStorage.getItem(EditorTutorial.STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }

    static suppress() {
        try {
            localStorage.setItem(EditorTutorial.STORAGE_KEY, '1');
        } catch {
            // localStorage may be unavailable (private mode) — ignore.
        }
    }

    // ============================================
    // ICONS — inline SVG, same set as the toolbar
    // ============================================
    //
    // ★ MUST be declared BEFORE STEPS — see the class JSDoc above.
    //
    // Kept inline so the bubble does not depend on /static/ paths or
    // on coreEngine.loadCSS() being finished. `currentColor` lets the
    // icons adapt to the text color (main, muted, etc.) via CSS.

    static _ICONS = {
        save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
        redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>`,
        devices: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="10" rx="1"/><line x1="2" y1="18" x2="16" y2="18"/><rect x="17" y="10" width="5" height="10" rx="1"/></svg>`,
        html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/></svg>`,
        css: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3a3 3 0 0 0-3 3v3a3 3 0 0 1-3 3 3 3 0 0 1 3 3v3a3 3 0 0 0 3 3"/><path d="M15 3a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3 3 3 0 0 0-3 3v3a3 3 0 0 1-3 3"/></svg>`,
        history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/><polyline points="12 7 12 12 16 14"/></svg>`,
        import: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        export: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
        clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>`,
        cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>`,
        styles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 6.2L21 9.6l-4.8 4.2L17.4 21 12 17.4 6.6 21l1.2-7.2L3 9.6l6.6-.4z"/></svg>`,
        traits: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="7" cy="18" r="1.5" fill="currentColor"/></svg>`,
        blocks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
        presets: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>`,
        chatPage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        chatFill: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>`,
        chatStyle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
        chatEffect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    };

    // ============================================
    // STEPS
    // ============================================
    //
    // Each step has:
    //   title       — heading of the bubble
    //   intro       — lead paragraph (optional, only step 1)
    //   text        — main paragraph (optional; can be empty)
    //   items       — list of { icon, label, text } rendered as a
    //                 two-column list: icon + label on the left,
    //                 description on the right.
    //                 icon is an inline SVG string (see _ICONS above).

    static STEPS = [
        {
            title: 'Это редактор статьи',
            intro: `
                Самый простой вариант начать — напишите в чате справа:
                «Создай крутую главную страницу о моём магазине оргтехники"(или ваш вариант, но обязательно должен начинаться с "Создай...").
                Дальше можно править вручную. Вот что делает каждая кнопка
                на панели инструментов.
            `,
            items: [
                {
                    icon: EditorTutorial._ICONS.save,
                    label: 'Сохранить',
                    text: 'Записать изменения и закрыть редактор.',
                },
                {
                    icon: EditorTutorial._ICONS.undo,
                    label: 'Отменить',
                    text: 'Вернуть предыдущее состояние страницы.',
                },
                {
                    icon: EditorTutorial._ICONS.redo,
                    label: 'Повторить',
                    text: 'Отменить отмену — вернуть то, что только что откатили.',
                },
                {
                    icon: EditorTutorial._ICONS.devices,
                    label: 'Десктоп / планшет / мобильный',
                    text: 'Проверить, как страница выглядит на разных экранах. ' +
                          'На планшете и мобильном шаблон скрывается — видно только ваш контент.',
                },
                {
                    icon: EditorTutorial._ICONS.html,
                    label: 'HTML',
                    text: 'Посмотреть и отредактировать HTML всей страницы или выделенного блока.',
                },
                {
                    icon: EditorTutorial._ICONS.css,
                    label: 'CSS',
                    text: 'Добавить свой CSS для выделенного элемента — например, тонкую настройку отступов или цвета.',
                },
                {
                    icon: EditorTutorial._ICONS.history,
                    label: 'История изменений',
                    text: 'Список сохранённых версий страницы. Любую можно посмотреть в превью и откатить.',
                },
                {
                    icon: EditorTutorial._ICONS.import,
                    label: 'Импорт',
                    text: 'Загрузить страницу из файла <b>.grp</b> или <b>.html</b>, ' +
                          'либо скачать её с чужого сайта по URL.',
                },
                {
                    icon: EditorTutorial._ICONS.export,
                    label: 'Экспорт',
                    text: 'Скачать текущую страницу одним HTML-файлом или архивом <b>.grp</b> ' +
                          '(со стилями и картинками).',
                },
                {
                    icon: EditorTutorial._ICONS.clear,
                    label: 'Очистить',
                    text: 'Удалить всё содержимое страницы. Действие подтверждается — ' +
                          'случайно не сработает.',
                },
                {
                    icon: EditorTutorial._ICONS.cancel,
                    label: 'Выход без сохранения',
                    text: 'Закрыть редактор, не записывая изменения.',
                },
            ],
        },
        {
            title: 'Редактирование элементов',
            text: `
                Слева — четыре вкладки. Они работают с тем элементом,
                который выделен на странице.
            `,
            items: [
                {
                    icon: EditorTutorial._ICONS.styles,
                    label: 'Стили',
                    text: 'Размеры, отступы, типографика, фон, рамки, Flex, Grid ' +
                          'и позиционирование — как в обычном CSS, но через удобные поля.',
                },
                {
                    icon: EditorTutorial._ICONS.traits,
                    label: 'Свойства',
                    text: 'Атрибуты блока: ссылка (<b>href</b>), заголовок, alt у картинки ' +
                          'и другие параметры, зависящие от типа элемента.',
                },
                {
                    icon: EditorTutorial._ICONS.blocks,
                    label: 'Блоки',
                    text: 'Библиотека готовых элементов. Перетащите блок на страницу. ' +
                          'Категории: <b>Элементы</b> (заголовки, текст, кнопки, карточки), ' +
                          '<b>Секции</b> (hero, преимущества, галерея, FAQ, CTA, подвал), ' +
                          '<b>Разметка</b> (контейнеры, 2–4 колонки, flex-каркас), ' +
                          '<b>Эффекты</b> (тени, свечения, анимации фона), ' +
                          '<b>Изображения</b> (готовые картинки и превью).',
                },
                {
                    icon: EditorTutorial._ICONS.presets,
                    label: 'Пресеты',
                    text: 'Сохранённые наборы стилей. Создайте один раз — применяйте ' +
                          'к другим элементам одним кликом.',
                },
            ],
        },
        {
            title: 'Чат с ИИ',
            text: `
                Опишите словами, что нужно сделать — ИИ соберёт страницу,
                добавит раздел, перепишет текст или изменит стиль.
            `,
            items: [
                {
                    icon: EditorTutorial._ICONS.chatPage,
                    label: 'Собрать страницу',
                    text: '«Создай крутую главную страницу о моём магазине оргтехники» — ' +
                          'ИИ подберёт секции и заполнит их текстом.',
                },
                {
                    icon: EditorTutorial._ICONS.chatFill,
                    label: 'Заполнить текстом',
                    text: 'Выделите блок на странице и напишите «заполни текстом» — ' +
                          'ИИ придумает содержимое под ваш контекст.',
                },
                {
                    icon: EditorTutorial._ICONS.chatStyle,
                    label: 'Изменить стиль',
                    text: '«Закрась жёлтым», «сделай тень помягче», «увеличь отступы» — ' +
                          'работает и на всей странице, и на выделенном блоке.',
                },
                {
                    icon: EditorTutorial._ICONS.chatEffect,
                    label: 'Добавить эффект',
                    text: '«Добавь анимацию фона», «сделай мерцающие звёзды» — ' +
                          'ИИ подключит один из готовых эффектов.',
                },
            ],
        },
    ];

    constructor() {
        this.el = null;
        this.currentStep = 0;
    }

    // ============================================
    // PUBLIC
    // ============================================

    /** Show the first step. No-op if suppressed or the canvas is missing. */
    start() {
        if (EditorTutorial.isSuppressed()) return;

        this.stop();
        this.currentStep = 0;
        this._render();
    }

    /** Advance to the next step, or close if there are no more. */
    next() {
        if (this.currentStep < EditorTutorial.STEPS.length - 1) {
            this.currentStep += 1;
            this._render();
        } else {
            this.stop();
        }
    }

    /** Tear down. Safe to call multiple times. */
    stop() {
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }

    // ============================================
    // INTERNAL
    // ============================================

    _render() {
        const step = EditorTutorial.STEPS[this.currentStep];

        const host = document.querySelector(EditorTutorial.CANVAS_SELECTOR);
        if (!host) {
            console.warn('[EditorTutorial] canvas content not found — skipping');
            return;
        }

        // Clear previous bubble.
        if (this.el) {
            this.el.remove();
            this.el = null;
        }

        const total = EditorTutorial.STEPS.length;
        const isLast = this.currentStep === total - 1;

        // Build items list (only steps that have `items`).
        const itemsHtml = Array.isArray(step.items) && step.items.length
            ? `<ul class="core-engine-lib-word-editor-tutorial-list">
                 ${step.items.map((it) => `
                   <li class="core-engine-lib-word-editor-tutorial-item">
                     <span class="core-engine-lib-word-editor-tutorial-item-icon" aria-hidden="true">${it.icon || ''}</span>
                     <span class="core-engine-lib-word-editor-tutorial-item-body">
                       <span class="core-engine-lib-word-editor-tutorial-item-label">${it.label || ''}</span>
                       <span class="core-engine-lib-word-editor-tutorial-item-text">${it.text || ''}</span>
                     </span>
                   </li>
                 `).join('')}
               </ul>`
            : '';

        const introHtml = step.intro
            ? `<div class="core-engine-lib-word-editor-tutorial-intro">${step.intro}</div>`
            : '';

        const textHtml = step.text
            ? `<div class="core-engine-lib-word-editor-tutorial-text">${step.text}</div>`
            : '';

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-editor-tutorial';
        el.innerHTML = `
            <button type="button"
                    class="core-engine-lib-word-editor-tutorial-close"
                    title="Закрыть">✕</button>

            <div class="core-engine-lib-word-editor-tutorial-step">
                Шаг ${this.currentStep + 1} из ${total}
            </div>

            <div class="core-engine-lib-word-editor-tutorial-title">
                ${step.title}
            </div>

            ${introHtml}
            ${textHtml}
            ${itemsHtml}

            <div class="core-engine-lib-word-editor-tutorial-footer">
                <label class="core-engine-lib-word-editor-tutorial-never">
                    <input type="checkbox" data-js="tutorial-never">
                    <span>Больше не показывать</span>
                </label>
            </div>

            <div class="core-engine-lib-word-editor-tutorial-actions">
                <button type="button"
                        class="core-engine-lib-word-editor-tutorial-skip">
                    Пропустить
                </button>
                <button type="button"
                        class="core-engine-lib-word-editor-tutorial-next">
                    ${isLast ? 'Понятно' : 'Дальше'}
                </button>
            </div>
        `;

        // Mount INSIDE the canvas content (position: relative host),
        // so the bubble floats over the GrapesJS canvas — top edge
        // aligned with the editable wrapper inside the iframe.
        host.appendChild(el);
        this.el = el;

        // Close.
        el.querySelector('.core-engine-lib-word-editor-tutorial-close')
            ?.addEventListener('click', () => this.stop());

        // Skip.
        el.querySelector('.core-engine-lib-word-editor-tutorial-skip')
            ?.addEventListener('click', () => this.stop());

        // Next / Понятно.
        el.querySelector('.core-engine-lib-word-editor-tutorial-next')
            ?.addEventListener('click', () => this.next());

        // "Больше не показывать" — suppress + close.
        el.querySelector('[data-js="tutorial-never"]')
            ?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    EditorTutorial.suppress();
                    this.stop();
                }
            });
    }
}