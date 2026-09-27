-- Demo data: pages
-- Rows: 5

PRAGMA foreign_keys = OFF;

DELETE FROM "pages";

INSERT INTO "pages" ("id", "nav_id", "datetime", "title", "description", "logo", "content", "content_json", "is_active", "is_delete", "created_at", "updated_at", "rss_yandex_id", "is_template", "template_id", "css") VALUES (1, 1, '2026-09-27 08:35:40.221761', 'Статья 1', '', '', '<body><section data-block="core-hero" class="section hero"><div class="container hero__inner"><h1 id="i3km" class="h1 hero__title">Создай свой сайт за пару минут — без программирования</h1><p class="lead hero__lead">NeuroCad — конструктор сайтов на базе искусственного интеллекта. Ты описываешь, что хочешь, — и ИИ собирает страницу за тебя: без кода, без вёрстки, без технических знаний. Получи свой адрес вида твоё-имя.neurocad.ru.</p><a href="#" class="btn hero__btn">Начать бесплатно</a></div></section><section data-block="core-steps" id="iifni" class="section steps"><div class="container"><h2 class="h2 steps__title">Три шага до готового сайта</h2><div class="grid grid--3 steps__grid"><div class="steps__item"><div class="steps__num">1</div><h3 class="h3 steps__item-title">Регистрация</h3><p class="text text--muted">Зарегистрируйся — и получи личный адрес вида твоё-имя.neurocad.ru.</p></div><div class="steps__item"><div class="steps__num">2</div><h3 class="h3 steps__item-title">Описание сайта</h3><p class="text text--muted">Опиши, какой сайт тебе нужен: чем занимаешься, что хочешь рассказать, какие разделы должны быть.</p></div><div class="steps__item"><div class="steps__num">3</div><h3 class="h3 steps__item-title">Публикация</h3><p id="ij92k" class="text text--muted">Искусственный интеллект соберёт готовую страницу. Ты сможешь её посмотреть, отредактировать и опубликовать.</p></div></div></div></section><section data-block="core-features" id="i42fj" class="section features"><div class="container"><h2 class="h2 features__title">Что можно делать в NeuroCad</h2><div class="grid grid--3 features__grid"><div class="card features__item"><h3 class="card__title">Визуальный редактор</h3><p class="card__text">Перетаскивай блоки, меняй цвета и шрифты, собирай страницу как конструктор.</p></div><div class="card features__item"><h3 class="card__title">ИИ-редактор</h3><p class="card__text">Опиши словами, что хочешь изменить, и модель сама поправит текст, добавит раздел или перепишет абзац.</p></div><div class="card features__item"><h3 class="card__title">Готовые блоки и медиатека</h3><p id="ijoij" class="card__text">Заголовки, тексты, кнопки, карточки, и формы уже нарисованы — остаётся поставить их на место и добавить картинки из медиатеки, применить эффекты</p></div></div></div></section><section data-block="core-faq" class="section faq"><div class="container"><h2 class="h2 faq__title">Часто задаваемые вопросы</h2><div class="faq__list"><div class="faq__item"><h3 class="h3 faq__question">Нужно ли уметь программировать?</h3><p class="text text--muted faq__answer">Нет. NeuroCad создан для людей без технического опыта: ты описываешь, что хочешь, — остальное делает система. Первую страницу можно собрать за несколько минут, дальше — только правки и наполнение.</p></div><div class="faq__item"><h3 class="h3 faq__question">Что если мне не хватит бесплатного тарифа?</h3><p class="text text--muted faq__answer">Ты в любой момент можешь перейти на тариф «Про» за 500 рублей в месяц. Всё, что уже создано, сохранится.</p></div><div class="faq__item"><h3 class="h3 faq__question">Можно ли использовать свой домен и что происходит с моими данными?</h3><p class="text text--muted faq__answer">На бесплатном тарифе доступен адрес вида твоё-имя.neurocad.ru, подключение собственного домена обсуждается отдельно. Свою страницу и аккаунт можно удалить в любой момент — мы не передаём данные третьим лицам.</p></div></div></div></section><section data-block="core-cta" class="section cta"><div class="container cta__inner"><h2 class="h2 cta__title">Готов попробовать?</h2><p class="text cta__text">Зарегистрируйся и собери первую страницу прямо сейчас. Бесплатно, без ограничений по времени и без привязки карты.</p><a href="#" class="btn cta__btn">Создать сайт</a></div></section></body>', '{"assets":[{"type":"image","src":"/media/default/1_2a5d0981.jpg","unitDim":"px","height":0,"width":0,"name":"1_2a5d0981.jpg"},{"type":"image","src":"/media/default/deepseek_mermaid_20260714_ea7f08_552fde3a.png","unitDim":"px","height":0,"width":0,"name":"deepseek_mermaid_20260714_ea7f08_552fde3a.png"},{"type":"image","src":"/media/default/fone_ace23bb7.jpg","unitDim":"px","height":0,"width":0,"name":"fone_ace23bb7.jpg"},{"type":"image","src":"/media/default/logo_ec0d8ede.png","unitDim":"px","height":0,"width":0,"name":"logo_ec0d8ede.png"}],"styles":[],"pages":[{"frames":[{"component":{"type":"wrapper","stylable":["background","background-color","background-image","background-repeat","background-attachment","background-position","background-size"],"components":[{"tagName":"section","classes":["section","hero"],"attributes":{"data-block":"core-hero"},"components":[{"classes":["container","hero__inner"],"components":[{"tagName":"h1","type":"text","classes":["h1","hero__title"],"attributes":{"id":"i3km"},"components":[{"type":"textnode","content":"Создай свой сайт за пару минут — без программирования"}]},{"tagName":"p","type":"text","classes":["lead","hero__lead"],"components":[{"type":"textnode","content":"NeuroCad — конструктор сайтов на базе искусственного интеллекта. Ты описываешь, что хочешь, — и ИИ собирает страницу за тебя: без кода, без вёрстки, без технических знаний. Получи свой адрес вида твоё-имя.neurocad.ru."}]},{"type":"link","classes":["btn","hero__btn"],"attributes":{"href":"#"},"components":[{"type":"textnode","content":"Начать бесплатно"}]}]}]},{"tagName":"section","classes":["section","steps"],"attributes":{"data-block":"core-steps","id":"iifni"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","steps__title"],"components":[{"type":"textnode","content":"Три шага до готового сайта"}]},{"classes":["grid","grid--3","steps__grid"],"components":[{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"1"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Регистрация"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Зарегистрируйся — и получи личный адрес вида твоё-имя.neurocad.ru."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"2"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Описание сайта"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Опиши, какой сайт тебе нужен: чем занимаешься, что хочешь рассказать, какие разделы должны быть."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"3"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Публикация"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"attributes":{"id":"ij92k"},"components":[{"type":"textnode","content":"Искусственный интеллект соберёт готовую страницу. Ты сможешь её посмотреть, отредактировать и опубликовать."}]}]}]}]}]},{"tagName":"section","classes":["section","features"],"attributes":{"data-block":"core-features","id":"i42fj"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","features__title"],"components":[{"type":"textnode","content":"Что можно делать в NeuroCad"}]},{"classes":["grid","grid--3","features__grid"],"components":[{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Визуальный редактор"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Перетаскивай блоки, меняй цвета и шрифты, собирай страницу как конструктор."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"ИИ-редактор"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Опиши словами, что хочешь изменить, и модель сама поправит текст, добавит раздел или перепишет абзац."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Готовые блоки и медиатека"}]},{"tagName":"p","type":"text","classes":["card__text"],"attributes":{"id":"ijoij"},"components":[{"type":"textnode","content":"Заголовки, тексты, кнопки, карточки, и формы уже нарисованы — остаётся поставить их на место и добавить картинки из медиатеки, применить эффекты"}]}]}]}]}]},{"tagName":"section","classes":["section","faq"],"attributes":{"data-block":"core-faq"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","faq__title"],"components":[{"type":"textnode","content":"Часто задаваемые вопросы"}]},{"classes":["faq__list"],"components":[{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Нужно ли уметь программировать?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Нет. NeuroCad создан для людей без технического опыта: ты описываешь, что хочешь, — остальное делает система. Первую страницу можно собрать за несколько минут, дальше — только правки и наполнение."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Что если мне не хватит бесплатного тарифа?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Ты в любой момент можешь перейти на тариф «Про» за 500 рублей в месяц. Всё, что уже создано, сохранится."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Можно ли использовать свой домен и что происходит с моими данными?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"На бесплатном тарифе доступен адрес вида твоё-имя.neurocad.ru, подключение собственного домена обсуждается отдельно. Свою страницу и аккаунт можно удалить в любой момент — мы не передаём данные третьим лицам."}]}]}]}]}]},{"tagName":"section","classes":["section","cta"],"attributes":{"data-block":"core-cta"},"components":[{"classes":["container","cta__inner"],"components":[{"tagName":"h2","type":"text","classes":["h2","cta__title"],"components":[{"type":"textnode","content":"Готов попробовать?"}]},{"tagName":"p","type":"text","classes":["text","cta__text"],"components":[{"type":"textnode","content":"Зарегистрируйся и собери первую страницу прямо сейчас. Бесплатно, без ограничений по времени и без привязки карты."}]},{"type":"link","classes":["btn","cta__btn"],"attributes":{"href":"#"},"components":[{"type":"textnode","content":"Создать сайт"}]}]}]}],"head":{"type":"head"},"docEl":{"tagName":"html"}},"id":"m0YzY11FFk8LXqTH"}],"id":"6rfAdwOYxN8d4xts"}],"symbols":[]}', 1, 0, '2026-09-27 08:35:40.221784', '2026-09-27 08:40:17.211103', NULL, 0, NULL, '/* app/core/engine/lib/word/editor/css/content.css */

/**
 * Content — theme variables + shared atoms + layout for CONTENT pages.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Uses ONLY --theme-* variables, defined at the top of this file.
 * Completely independent from base/css/00_variables.css (admin UI):
 * admin theme changes do NOT affect page content.
 *
 * Contents:
 *   THEME VARIABLES
 *     --theme-*                 all colors, fonts, radii, spacing
 *
 *   ATOMS
 *     .h1, .h2, .h3             headings
 *     .text, .text--muted, .text--center
 *     .lead                     intro paragraph
 *     .list, .list--check, .list--num
 *     .btn, .btn--ghost         buttons
 *     .card, .card__title, .card__text
 *     .badge, .quote, .image, .icon, .divider
 *
 *   LAYOUT
 *     .section                  vertical rhythm wrapper
 *     .container                centered max-width wrapper
 *     .grid, .grid--2/3/4/auto  base grids
 *     .col                      grid cell
 *
 * .flex-shell* lives in blocks/layout.css — it is block-specific
 * (only used by the flex-shell block).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   THEME VARIABLES — content
   ============================================ */

/*
 * Completely independent from base/css/00_variables.css (admin UI).
 * Admin theme changes do NOT affect these values.
 *
 * Scoped under .core-engine-lib-word-blocks — the same class sits
 * on the canvas <body> in the editor and on the article wrapper
 * on the public page.
 */
.core-engine-lib-word-blocks {

    /* ===== COLORS ===== */

    --theme-bg:             #ffffff;
    --theme-bg-subtle:      #f8fafc;
    --theme-bg-dark:        #0f172a;
    --theme-bg-hover:       #f1f5f9;

    --theme-text:           #1e293b;
    --theme-text-muted:     #64748b;
    --theme-text-invert:    #ffffff;

    --theme-accent:         #246eaa;
    --theme-accent-hover:   #1e5a8a;
    --theme-accent-soft:    #e0edf7;

    --theme-border:         #e2e8f0;
    --theme-border-strong:  #cbd5e1;

    --theme-success:        #16a34a;
    --theme-warning:        #d97706;
    --theme-danger:         #dc2626;

    /* ===== SHADOWS ===== */

    --theme-shadow-sm:  0 1px 3px rgba(15, 23, 42, 0.06);
    --theme-shadow-md:  0 4px 12px rgba(15, 23, 42, 0.08);
    --theme-shadow-lg:  0 12px 32px rgba(15, 23, 42, 0.12);

    /* ===== FONTS ===== */

    --theme-font-family:    ''Inter'', ''Golos Text'', sans-serif;
    --theme-font-size-xs:   0.75rem;
    --theme-font-size-sm:   0.875rem;
    --theme-font-size-base: 1rem;
    --theme-font-size-lg:   1.125rem;
    --theme-font-size-xl:   1.25rem;
    --theme-font-size-2xl:  1.5rem;
    --theme-font-size-3xl:  2rem;
    --theme-font-size-4xl:  2.5rem;

    --theme-font-weight-regular:  400;
    --theme-font-weight-medium:   500;
    --theme-font-weight-semibold: 600;
    --theme-font-weight-bold:     700;

    --theme-line-height-tight:  1.25;
    --theme-line-height-base:   1.6;
    --theme-line-height-loose:  1.8;

    /* ===== RADII ===== */

    --theme-radius-sm:   0.25rem;
    --theme-radius-md:   0.5rem;
    --theme-radius-lg:   0.75rem;
    --theme-radius-xl:   1rem;
    --theme-radius-pill: 9999px;

    /* ===== SPACING ===== */

    --theme-space-1:   0.25rem;
    --theme-space-2:   0.5rem;
    --theme-space-3:   0.75rem;
    --theme-space-4:   1rem;
    --theme-space-5:   1.25rem;
    --theme-space-6:   1.5rem;
    --theme-space-8:   2rem;
    --theme-space-10:  2.5rem;
    --theme-space-12:  3rem;
    --theme-space-16:  4rem;
    --theme-space-20:  5rem;

    --theme-space-section:  4rem;
    --theme-space-gutter:   1rem;
    --theme-space-grid:     1rem;

    /* ===== LAYOUT ===== */

    --theme-container-max:  75rem;
}


/* ============================================
   HEADINGS
   ============================================ */

.core-engine-lib-word-blocks .h1 {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-4xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.02em;
}

.core-engine-lib-word-blocks .h2 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-3xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.01em;
}

.core-engine-lib-word-blocks .h3 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-2xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}


/* ============================================
   TEXT
   ============================================ */

.core-engine-lib-word-blocks .text {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .text--muted {
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .text--center {
    text-align: center;
}

.core-engine-lib-word-blocks .text:last-child {
    margin-bottom: 0;
}


/* ============================================
   LEAD
   ============================================ */

.core-engine-lib-word-blocks .lead {
    margin: 0 0 var(--theme-space-5);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   LISTS
   ============================================ */

.core-engine-lib-word-blocks .list {
    margin: 0 0 var(--theme-space-4);
    padding-left: var(--theme-space-6);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .list li {
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .list li:last-child {
    margin-bottom: 0;
}

.core-engine-lib-word-blocks .list li::marker {
    color: var(--theme-accent);
}

.core-engine-lib-word-blocks .list--check {
    list-style: none;
    padding-left: 0;
}

.core-engine-lib-word-blocks .list--check li {
    position: relative;
    padding-left: var(--theme-space-6);
}

.core-engine-lib-word-blocks .list--check li::before {
    content: ''✓'';
    position: absolute;
    left: 0;
    top: 0;
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-bold);
}

.core-engine-lib-word-blocks .list--num {
    list-style: decimal;
}

.core-engine-lib-word-blocks .list--num li::marker {
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-semibold);
}


/* ============================================
   BUTTONS
   ============================================ */

.core-engine-lib-word-blocks .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-space-2);
    padding: var(--theme-space-3) var(--theme-space-6);
    border: 2px solid transparent;
    border-radius: var(--theme-radius-md);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-semibold);
    line-height: 1.2;
    text-decoration: none;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    background: var(--theme-accent);
    color: var(--theme-text-invert);
    border-color: var(--theme-accent);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.core-engine-lib-word-blocks .btn:hover {
    background: var(--theme-accent-hover);
    border-color: var(--theme-accent-hover);
    color: var(--theme-text-invert);
}

.core-engine-lib-word-blocks .btn:active {
    transform: translateY(1px);
}

.core-engine-lib-word-blocks .btn--ghost {
    background: transparent;
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}

.core-engine-lib-word-blocks .btn--ghost:hover {
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}


/* ============================================
   CARD
   ============================================ */

.core-engine-lib-word-blocks .card {
    padding: var(--theme-space-6);
    background: var(--theme-bg);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-lg);
    box-shadow: var(--theme-shadow-sm);
}

.core-engine-lib-word-blocks .card__title {
    margin: 0 0 var(--theme-space-2);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .card__text {
    margin: 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text-muted);
}


/* ============================================
   BADGE
   ============================================ */

.core-engine-lib-word-blocks .badge {
    display: inline-block;
    padding: var(--theme-space-1) var(--theme-space-3);
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    line-height: 1.4;
}


/* ============================================
   QUOTE
   ============================================ */

.core-engine-lib-word-blocks .quote {
    margin: var(--theme-space-6) 0;
    padding: var(--theme-space-4) var(--theme-space-5);
    border-left: 4px solid var(--theme-accent);
    background: var(--theme-bg-subtle);
    border-radius: 0 var(--theme-radius-md) var(--theme-radius-md) 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-style: italic;
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   IMAGE
   ============================================ */

.core-engine-lib-word-blocks .image {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--theme-radius-md);
    margin: 0;
}


/* ============================================
   ICON
   ============================================ */

.core-engine-lib-word-blocks .icon {
    display: inline-block;
    width: 1.5em;
    height: 1.5em;
    vertical-align: middle;
    color: var(--theme-accent);
    flex-shrink: 0;
}


/* ============================================
   DIVIDER
   ============================================ */

.core-engine-lib-word-blocks .divider {
    margin: var(--theme-space-8) 0;
    border: none;
    height: 1px;
    background: var(--theme-border);
}


/* ============================================
   SECTION — vertical rhythm wrapper
   ============================================ */

.core-engine-lib-word-blocks .section {
    padding-top: var(--theme-space-section);
    padding-bottom: var(--theme-space-section);
}


/* ============================================
   CONTAINER — centered max-width wrapper
   ============================================ */

.core-engine-lib-word-blocks .container {
    width: 100%;
    max-width: var(--theme-container-max);
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--theme-space-gutter);
    padding-right: var(--theme-space-gutter);
    box-sizing: border-box;
}


/* ============================================
   GRID — base
   ============================================ */

.core-engine-lib-word-blocks .grid {
    display: grid;
    gap: var(--theme-space-grid);
}

.core-engine-lib-word-blocks .grid--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--auto {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}


/* ============================================
   COLUMN — grid cell
   ============================================ */

/*
 * Minimal cell: only prevents overflow. Padding, background, border
 * are set per block (e.g. .card, .col--tile were removed on purpose).
 */
.core-engine-lib-word-blocks .col {
    min-width: 0;
}


/* ============================================
   GRID — responsive fallback
   ============================================ */

@media (max-width: 768px) {
    .core-engine-lib-word-blocks .grid--2,
    .core-engine-lib-word-blocks .grid--3,
    .core-engine-lib-word-blocks .grid--4 {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* app/core/engine/lib/word/editor/blocks/ready.css */

/**
 * Ready — styles for the "Секции" (sections) blocks.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Covers section-specific classes from blocks/ready.js:
 *   - .hero, .hero__inner, .hero__title, .hero__lead, .hero__btn
 *   - .features, .features__title, .features__grid, .features__item
 *   - .steps, .steps__title, .steps__grid, .steps__item, .steps__num
 *   - .text-image, .text-image__grid, .text-image__text, .text-image__media
 *   - .image-text, .image-text__grid, .image-text__text, .image-text__media
 *   - .gallery, .gallery__title, .gallery__grid, .gallery__item
 *   - .faq, .faq__title, .faq__list, .faq__item, .faq__question, .faq__answer
 *   - .cta, .cta__inner, .cta__title, .cta__text, .cta__btn
 *   - .contacts, .contacts__title, .contacts__grid, .contacts__item,
 *     .contacts__label, .contacts__value
 *   - .footer, .footer__inner, .footer__brand, .footer__nav, .footer__link
 *
 * Shared atom classes (.h1, .h2, .text, .lead, .btn, .card, .image)
 * and layout classes (.section, .container, .grid) live in
 * editor/css/content.css — they are loaded globally.
 *
 * Uses ONLY --theme-* variables (see theme.css).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   HERO — .hero
   ============================================ */

.core-engine-lib-word-blocks .hero__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .hero__title {
    margin: 0;
    max-width: 48rem;
}

.core-engine-lib-word-blocks .hero__lead {
    margin: 0;
    max-width: 40rem;
}

.core-engine-lib-word-blocks .hero__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   FEATURES — .features
   ============================================ */

.core-engine-lib-word-blocks .features__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .features__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .features__item {
    /* uses .card from content.css */
    height: 100%;
}


/* ============================================
   STEPS — .steps
   ============================================ */

.core-engine-lib-word-blocks .steps__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .steps__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .steps__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-bold);
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__item-title {
    margin: 0;
}


/* ============================================
   TEXT + IMAGE — .text-image
   ============================================ */

.core-engine-lib-word-blocks .text-image__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .text-image__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .text-image__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .text-image__media .image {
    width: 100%;
}


/* ============================================
   IMAGE + TEXT — .image-text
   ============================================ */

.core-engine-lib-word-blocks .image-text__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .image-text__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .image-text__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .image-text__media .image {
    width: 100%;
}


/* ============================================
   GALLERY — .gallery
   ============================================ */

.core-engine-lib-word-blocks .gallery__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .gallery__grid {
    /* uses .grid.grid--auto from content.css */
}

.core-engine-lib-word-blocks .gallery__item {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
}


/* ============================================
   FAQ — .faq
   ============================================ */

.core-engine-lib-word-blocks .faq__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .faq__list {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-6);
    max-width: 48rem;
    margin-left: auto;
    margin-right: auto;
}

.core-engine-lib-word-blocks .faq__item {
    padding-bottom: var(--theme-space-5);
    border-bottom: 1px solid var(--theme-border);
}

.core-engine-lib-word-blocks .faq__item:last-child {
    padding-bottom: 0;
    border-bottom: none;
}

.core-engine-lib-word-blocks .faq__question {
    margin: 0 0 var(--theme-space-2);
}

.core-engine-lib-word-blocks .faq__answer {
    margin: 0;
}


/* ============================================
   CTA — .cta
   ============================================ */

.core-engine-lib-word-blocks .cta {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
}

.core-engine-lib-word-blocks .cta__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .cta__title {
    margin: 0;
    color: var(--theme-text, #1e293b);
    max-width: 48rem;
}

.core-engine-lib-word-blocks .cta__text {
    margin: 0;
    color: var(--theme-text-muted, #64748b);
    max-width: 40rem;
}

.core-engine-lib-word-blocks .cta__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   CONTACTS — .contacts
   ============================================ */

.core-engine-lib-word-blocks .contacts__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .contacts__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .contacts__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-1);
}

.core-engine-lib-word-blocks .contacts__label {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .contacts__value {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-medium);
    color: var(--theme-text);
}


/* ============================================
   FOOTER — .footer
   ============================================ */

.core-engine-lib-word-blocks .footer {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
    padding-top: var(--theme-space-6);
    padding-bottom: var(--theme-space-6);
}

.core-engine-lib-word-blocks .footer__inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__brand {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
}

.core-engine-lib-word-blocks .footer__nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__link {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
    text-decoration: none;
    transition: opacity 0.15s ease;
}

.core-engine-lib-word-blocks .footer__link:hover {
    opacity: 1;
}

* { box-sizing: border-box; } body {margin: 0;}');
INSERT INTO "pages" ("id", "nav_id", "datetime", "title", "description", "logo", "content", "content_json", "is_active", "is_delete", "created_at", "updated_at", "rss_yandex_id", "is_template", "template_id", "css") VALUES (2, 1, '2026-09-27 08:40:39.259941', 'Главная', '', '/static/core/engine/lib/word/editor/images/files/img-a52e8683.svg', '<body><section data-block="core-hero" class="section hero fx-starfield-earth"><div id="iz3z" class="container hero__inner"><h1 class="h1 hero__title">Создай свой сайт за пару минут — без программирования</h1><p class="lead hero__lead">NeuroCad — конструктор сайтов на базе искусственного интеллекта. Ты описываешь, что хочешь, — и ИИ собирает страницу за тебя: без кода, без вёрстки, без технических знаний. Получи свой адрес вида твоё-имя.neurocad.ru.</p><a href="/core/engine/lib/base/auth/register" data-action="auth" id="i8ze" class="btn hero__btn">Начать бесплатно</a></div></section><section data-block="core-steps" class="section steps fx-soft-diagonal-hatch"><div class="container"><h2 class="h2 steps__title">Три шага до готового сайта</h2><div class="grid grid--3 steps__grid"><div class="steps__item"><div class="steps__num">1</div><h3 class="h3 steps__item-title">Регистрация</h3><p class="text text--muted">Зарегистрируйся — и получи личный адрес вида твоё-имя.neurocad.ru.</p></div><div class="steps__item"><div class="steps__num">2</div><h3 class="h3 steps__item-title">Описание сайта</h3><p class="text text--muted">Опиши, какой сайт тебе нужен: чем занимаешься, что хочешь рассказать, какие разделы должны быть.</p></div><div class="steps__item"><div class="steps__num">3</div><h3 class="h3 steps__item-title">Публикация</h3><p class="text text--muted">Искусственный интеллект соберёт готовую страницу. Ты сможешь её посмотреть, отредактировать и опубликовать.</p></div></div></div></section><section data-block="core-features" class="section features fx-circles-n"><div class="container"><h2 class="h2 features__title">Что можно делать в NeuroCad</h2><div class="grid grid--3 features__grid"><div class="card features__item"><h3 class="card__title">Визуальный редактор</h3><p class="card__text">Перетаскивай блоки, меняй цвета и шрифты, собирай страницу как конструктор.</p></div><div class="card features__item"><h3 class="card__title">ИИ-редактор</h3><p class="card__text">Опиши словами, что хочешь изменить, и модель сама поправит текст, добавит раздел или перепишет абзац.</p></div><div class="card features__item"><h3 class="card__title">Готовые блоки и медиатека</h3><p class="card__text">Заголовки, тексты, кнопки, карточки и формы уже нарисованы — остаётся поставить их на место, добавить картинки из медиатеки и применить эффекты.</p></div></div></div></section><section data-block="core-text-image" class="section text-image fx-aurora-drift"><div class="container"><div class="grid grid--2 text-image__grid"><div class="text-image__text"><h2 class="h2">Собери страницу как конструктор</h2><p class="text">Перетаскивай блоки, меняй цвета и шрифты, добавляй картинки из медиатеки и применяй эффекты. Заголовки, тексты, кнопки, карточки и формы уже нарисованы — остаётся поставить их на место.</p><p class="text text--muted">Если нужно изменить текст или добавить раздел, просто опиши это словами — ИИ-редактор сам поправит страницу.</p></div><div class="text-image__media"><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Интерфейс редактора NeuroCad: блоки страницы, панель настроек и медиатека" class="image"><rect x="110" y="80" width="580" height="440" rx="16" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="3"></rect><rect x="126" y="94" width="548" height="34" rx="8" fill="var(--theme-accent, #3b82f6)"></rect><circle cx="148" cy="111" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="170" cy="111" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="192" cy="111" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="126" y="150" width="120" height="38" rx="8" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="126" y="196" width="120" height="38" rx="8" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="126" y="242" width="120" height="38" rx="8" fill="var(--theme-accent, #3b82f6)"></rect><rect x="126" y="288" width="120" height="38" rx="8" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="126" y="352" width="52" height="52" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="152" cy="378" r="9" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="186" y="352" width="52" height="52" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="212" cy="378" r="9" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="126" y="414" width="52" height="52" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="152" cy="440" r="9" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="186" y="414" width="52" height="52" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="212" cy="440" r="9" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="262" y="150" width="294" height="340" rx="10" fill="none" stroke="var(--theme-text, #1e293b)" stroke-width="3"></rect><rect x="284" y="172" width="250" height="26" rx="6" fill="var(--theme-accent, #3b82f6)"></rect><rect x="284" y="214" width="250" height="10" rx="5" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="284" y="234" width="170" height="10" rx="5" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="284" y="262" width="250" height="110" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><path d="M300 356 L345 304 L382 344 L412 312 L452 356 Z" fill="var(--theme-bg-soft, #f1f5f9)"></path><circle cx="496" cy="292" r="14" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="284" y="396" width="250" height="10" rx="5" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="284" y="416" width="190" height="10" rx="5" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="284" y="444" width="96" height="26" rx="13" fill="var(--theme-accent, #3b82f6)"></rect><rect x="572" y="150" width="102" height="340" rx="10" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="588" y="180" width="70" height="8" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="632" cy="184" r="10" fill="var(--theme-accent, #3b82f6)"></circle><rect x="588" y="212" width="70" height="8" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="608" cy="216" r="10" fill="var(--theme-accent, #3b82f6)"></circle><rect x="588" y="252" width="22" height="22" rx="6" fill="var(--theme-accent, #3b82f6)"></rect><rect x="616" y="252" width="22" height="22" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="644" y="252" width="22" height="22" rx="6" fill="var(--theme-text, #1e293b)"></rect><rect x="588" y="300" width="46" height="24" rx="12" fill="var(--theme-accent, #3b82f6)"></rect><circle cx="622" cy="312" r="9" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="588" y="352" width="70" height="8" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="588" y="374" width="48" height="8" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="588" y="410" width="70" height="44" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect></svg></div></div></div></section><section data-block="core-faq" id="i78zxd" class="section faq fx-rotating-globe"><div class="container"><h2 class="h2 faq__title">Часто задаваемые вопросы</h2><div class="faq__list"><div class="faq__item"><h3 class="h3 faq__question">Нужно ли уметь программировать?</h3><p class="text text--muted faq__answer">Нет. NeuroCad создан для людей без технического опыта: ты описываешь, что хочешь, — остальное делает система. Первую страницу можно собрать за несколько минут, дальше — только правки и наполнение.</p></div><div class="faq__item"><h3 class="h3 faq__question">Что если мне не хватит бесплатного тарифа?</h3><p class="text text--muted faq__answer">Ты в любой момент можешь перейти на тариф «Про» за 500 рублей в месяц. Всё, что уже создано, сохранится.</p></div><div class="faq__item"><h3 class="h3 faq__question">Можно ли использовать свой домен и что происходит с моими данными?</h3><p class="text text--muted faq__answer">На бесплатном тарифе доступен адрес вида твоё-имя.neurocad.ru, подключение собственного домена обсуждается отдельно. Свою страницу и аккаунт можно удалить в любой момент — мы не передаём данные третьим лицам.</p></div></div></div></section><section data-block="core-cta" class="section cta fx-dance-spotlight-sweep"><div class="container cta__inner"><h2 class="h2 cta__title">Готов попробовать?</h2><p class="text cta__text">Зарегистрируйся и собери первую страницу прямо сейчас. Бесплатно, без ограничений по времени и без привязки карты.</p><a href="page:register" class="btn cta__btn">Создать сайт</a></div></section><footer data-block="core-footer" class="section footer"><div class="container footer__inner"><div class="footer__brand">© NeuroCad</div><nav class="footer__nav"><a href="page:index" class="footer__link">Главная</a><a href="page:features" class="footer__link">Возможности</a><a href="page:contacts" class="footer__link">Контакты</a></nav></div></footer></body>', '{"assets":[{"type":"image","src":"/media/default/1_2a5d0981.jpg","unitDim":"px","height":0,"width":0,"name":"1_2a5d0981.jpg"},{"type":"image","src":"/media/default/deepseek_mermaid_20260714_ea7f08_552fde3a.png","unitDim":"px","height":0,"width":0,"name":"deepseek_mermaid_20260714_ea7f08_552fde3a.png"},{"type":"image","src":"/media/default/fone_ace23bb7.jpg","unitDim":"px","height":0,"width":0,"name":"fone_ace23bb7.jpg"},{"type":"image","src":"/media/default/logo_ec0d8ede.png","unitDim":"px","height":0,"width":0,"name":"logo_ec0d8ede.png"}],"styles":[{"selectors":[],"selectorsAdd":"*","style":{"box-sizing":"border-box"}},{"selectors":[],"selectorsAdd":"body","style":{"margin-top":"0px","margin-right":"0px","margin-bottom":"0px","margin-left":"0px"}}],"pages":[{"frames":[{"component":{"type":"wrapper","stylable":["background","background-color","background-image","background-repeat","background-attachment","background-position","background-size"],"components":[{"tagName":"section","classes":["section","hero","fx-starfield-earth"],"attributes":{"data-block":"core-hero"},"components":[{"classes":["container","hero__inner"],"attributes":{"id":"iz3z"},"components":[{"tagName":"h1","type":"text","classes":["h1","hero__title"],"components":[{"type":"textnode","content":"Создай свой сайт за пару минут — без программирования"}]},{"tagName":"p","type":"text","classes":["lead","hero__lead"],"components":[{"type":"textnode","content":"NeuroCad — конструктор сайтов на базе искусственного интеллекта. Ты описываешь, что хочешь, — и ИИ собирает страницу за тебя: без кода, без вёрстки, без технических знаний. Получи свой адрес вида твоё-имя.neurocad.ru."}]},{"type":"link","classes":["btn","hero__btn"],"attributes":{"href":"/core/engine/lib/base/auth/register","data-action":"auth","id":"i8ze"},"components":[{"type":"textnode","content":"Начать бесплатно"}]}]}]},{"tagName":"section","classes":["section","steps","fx-soft-diagonal-hatch"],"attributes":{"data-block":"core-steps"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","steps__title"],"components":[{"type":"textnode","content":"Три шага до готового сайта"}]},{"classes":["grid","grid--3","steps__grid"],"components":[{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"1"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Регистрация"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Зарегистрируйся — и получи личный адрес вида твоё-имя.neurocad.ru."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"2"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Описание сайта"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Опиши, какой сайт тебе нужен: чем занимаешься, что хочешь рассказать, какие разделы должны быть."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"3"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Публикация"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Искусственный интеллект соберёт готовую страницу. Ты сможешь её посмотреть, отредактировать и опубликовать."}]}]}]}]}]},{"tagName":"section","classes":["section","features","fx-circles-n"],"attributes":{"data-block":"core-features"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","features__title"],"components":[{"type":"textnode","content":"Что можно делать в NeuroCad"}]},{"classes":["grid","grid--3","features__grid"],"components":[{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Визуальный редактор"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Перетаскивай блоки, меняй цвета и шрифты, собирай страницу как конструктор."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"ИИ-редактор"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Опиши словами, что хочешь изменить, и модель сама поправит текст, добавит раздел или перепишет абзац."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Готовые блоки и медиатека"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Заголовки, тексты, кнопки, карточки и формы уже нарисованы — остаётся поставить их на место, добавить картинки из медиатеки и применить эффекты."}]}]}]}]}]},{"tagName":"section","classes":["section","text-image","fx-aurora-drift"],"attributes":{"data-block":"core-text-image"},"components":[{"classes":["container"],"components":[{"classes":["grid","grid--2","text-image__grid"],"components":[{"classes":["text-image__text"],"components":[{"tagName":"h2","type":"text","classes":["h2"],"components":[{"type":"textnode","content":"Собери страницу как конструктор"}]},{"tagName":"p","type":"text","classes":["text"],"components":[{"type":"textnode","content":"Перетаскивай блоки, меняй цвета и шрифты, добавляй картинки из медиатеки и применяй эффекты. Заголовки, тексты, кнопки, карточки и формы уже нарисованы — остаётся поставить их на место."}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Если нужно изменить текст или добавить раздел, просто опиши это словами — ИИ-редактор сам поправит страницу."}]}]},{"classes":["text-image__media"],"components":[{"type":"svg","resizable":{"ratioDefault":true},"classes":["image"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Интерфейс редактора NeuroCad: блоки страницы, панель настроек и медиатека"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"110","y":"80","width":"580","height":"440","rx":"16","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"94","width":"548","height":"34","rx":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"148","cy":"111","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"170","cy":"111","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"192","cy":"111","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"150","width":"120","height":"38","rx":"8","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"196","width":"120","height":"38","rx":"8","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"242","width":"120","height":"38","rx":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"288","width":"120","height":"38","rx":"8","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"352","width":"52","height":"52","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"152","cy":"378","r":"9","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"186","y":"352","width":"52","height":"52","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"212","cy":"378","r":"9","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"126","y":"414","width":"52","height":"52","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"152","cy":"440","r":"9","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"186","y":"414","width":"52","height":"52","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"212","cy":"440","r":"9","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"262","y":"150","width":"294","height":"340","rx":"10","fill":"none","stroke":"var(--theme-text, #1e293b)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"172","width":"250","height":"26","rx":"6","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"214","width":"250","height":"10","rx":"5","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"234","width":"170","height":"10","rx":"5","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"262","width":"250","height":"110","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M300 356 L345 304 L382 344 L412 312 L452 356 Z","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"496","cy":"292","r":"14","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"396","width":"250","height":"10","rx":"5","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"416","width":"190","height":"10","rx":"5","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"284","y":"444","width":"96","height":"26","rx":"13","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"572","y":"150","width":"102","height":"340","rx":"10","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"180","width":"70","height":"8","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"632","cy":"184","r":"10","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"212","width":"70","height":"8","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"608","cy":"216","r":"10","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"252","width":"22","height":"22","rx":"6","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"616","y":"252","width":"22","height":"22","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"644","y":"252","width":"22","height":"22","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"300","width":"46","height":"24","rx":"12","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"622","cy":"312","r":"9","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"352","width":"70","height":"8","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"374","width":"48","height":"8","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"588","y":"410","width":"70","height":"44","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}}]}]}]}]}]},{"tagName":"section","classes":["section","faq","fx-rotating-globe"],"attributes":{"data-block":"core-faq","id":"i78zxd"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","faq__title"],"components":[{"type":"textnode","content":"Часто задаваемые вопросы"}]},{"classes":["faq__list"],"components":[{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Нужно ли уметь программировать?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Нет. NeuroCad создан для людей без технического опыта: ты описываешь, что хочешь, — остальное делает система. Первую страницу можно собрать за несколько минут, дальше — только правки и наполнение."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Что если мне не хватит бесплатного тарифа?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Ты в любой момент можешь перейти на тариф «Про» за 500 рублей в месяц. Всё, что уже создано, сохранится."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Можно ли использовать свой домен и что происходит с моими данными?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"На бесплатном тарифе доступен адрес вида твоё-имя.neurocad.ru, подключение собственного домена обсуждается отдельно. Свою страницу и аккаунт можно удалить в любой момент — мы не передаём данные третьим лицам."}]}]}]}]}]},{"tagName":"section","classes":["section","cta","fx-dance-spotlight-sweep"],"attributes":{"data-block":"core-cta"},"components":[{"classes":["container","cta__inner"],"components":[{"tagName":"h2","type":"text","classes":["h2","cta__title"],"components":[{"type":"textnode","content":"Готов попробовать?"}]},{"tagName":"p","type":"text","classes":["text","cta__text"],"components":[{"type":"textnode","content":"Зарегистрируйся и собери первую страницу прямо сейчас. Бесплатно, без ограничений по времени и без привязки карты."}]},{"type":"link","classes":["btn","cta__btn"],"attributes":{"href":"page:register"},"components":[{"type":"textnode","content":"Создать сайт"}]}]}]},{"tagName":"footer","classes":["section","footer"],"attributes":{"data-block":"core-footer"},"components":[{"classes":["container","footer__inner"],"components":[{"type":"text","classes":["footer__brand"],"components":[{"type":"textnode","content":"© NeuroCad"}]},{"tagName":"nav","classes":["footer__nav"],"components":[{"type":"link","classes":["footer__link"],"attributes":{"href":"page:index"},"components":[{"type":"textnode","content":"Главная"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:features"},"components":[{"type":"textnode","content":"Возможности"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:contacts"},"components":[{"type":"textnode","content":"Контакты"}]}]}]}]}],"head":{"type":"head"},"docEl":{"tagName":"html"}},"id":"BjSa5LGE86jeq1Pa"}],"id":"09RLKZEekWahPh5F"}],"symbols":[]}', 1, 0, '2026-09-27 08:40:39.259973', '2026-09-27 10:45:22.024665', NULL, 0, NULL, '/* app/core/engine/lib/word/editor/css/content.css */

/**
 * Content — theme variables + shared atoms + layout for CONTENT pages.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Uses ONLY --theme-* variables, defined at the top of this file.
 * Completely independent from base/css/00_variables.css (admin UI):
 * admin theme changes do NOT affect page content.
 *
 * Contents:
 *   THEME VARIABLES
 *     --theme-*                 all colors, fonts, radii, spacing
 *
 *   ATOMS
 *     .h1, .h2, .h3             headings
 *     .text, .text--muted, .text--center
 *     .lead                     intro paragraph
 *     .list, .list--check, .list--num
 *     .btn, .btn--ghost         buttons
 *     .card, .card__title, .card__text
 *     .badge, .quote, .image, .icon, .divider
 *
 *   LAYOUT
 *     .section                  vertical rhythm wrapper
 *     .container                centered max-width wrapper
 *     .grid, .grid--2/3/4/auto  base grids
 *     .col                      grid cell
 *
 * .flex-shell* lives in blocks/layout.css — it is block-specific
 * (only used by the flex-shell block).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   THEME VARIABLES — content
   ============================================ */

/*
 * Completely independent from base/css/00_variables.css (admin UI).
 * Admin theme changes do NOT affect these values.
 *
 * Scoped under .core-engine-lib-word-blocks — the same class sits
 * on the canvas <body> in the editor and on the article wrapper
 * on the public page.
 */
.core-engine-lib-word-blocks {

    /* ===== COLORS ===== */

    --theme-bg:             #ffffff;
    --theme-bg-subtle:      #f8fafc;
    --theme-bg-dark:        #0f172a;
    --theme-bg-hover:       #f1f5f9;

    --theme-text:           #1e293b;
    --theme-text-muted:     #64748b;
    --theme-text-invert:    #ffffff;

    --theme-accent:         #246eaa;
    --theme-accent-hover:   #1e5a8a;
    --theme-accent-soft:    #e0edf7;

    --theme-border:         #e2e8f0;
    --theme-border-strong:  #cbd5e1;

    --theme-success:        #16a34a;
    --theme-warning:        #d97706;
    --theme-danger:         #dc2626;

    /* ===== SHADOWS ===== */

    --theme-shadow-sm:  0 1px 3px rgba(15, 23, 42, 0.06);
    --theme-shadow-md:  0 4px 12px rgba(15, 23, 42, 0.08);
    --theme-shadow-lg:  0 12px 32px rgba(15, 23, 42, 0.12);

    /* ===== FONTS ===== */

    --theme-font-family:    ''Inter'', ''Golos Text'', sans-serif;
    --theme-font-size-xs:   0.75rem;
    --theme-font-size-sm:   0.875rem;
    --theme-font-size-base: 1rem;
    --theme-font-size-lg:   1.125rem;
    --theme-font-size-xl:   1.25rem;
    --theme-font-size-2xl:  1.5rem;
    --theme-font-size-3xl:  2rem;
    --theme-font-size-4xl:  2.5rem;

    --theme-font-weight-regular:  400;
    --theme-font-weight-medium:   500;
    --theme-font-weight-semibold: 600;
    --theme-font-weight-bold:     700;

    --theme-line-height-tight:  1.25;
    --theme-line-height-base:   1.6;
    --theme-line-height-loose:  1.8;

    /* ===== RADII ===== */

    --theme-radius-sm:   0.25rem;
    --theme-radius-md:   0.5rem;
    --theme-radius-lg:   0.75rem;
    --theme-radius-xl:   1rem;
    --theme-radius-pill: 9999px;

    /* ===== SPACING ===== */

    --theme-space-1:   0.25rem;
    --theme-space-2:   0.5rem;
    --theme-space-3:   0.75rem;
    --theme-space-4:   1rem;
    --theme-space-5:   1.25rem;
    --theme-space-6:   1.5rem;
    --theme-space-8:   2rem;
    --theme-space-10:  2.5rem;
    --theme-space-12:  3rem;
    --theme-space-16:  4rem;
    --theme-space-20:  5rem;

    --theme-space-section:  4rem;
    --theme-space-gutter:   1rem;
    --theme-space-grid:     1rem;

    /* ===== LAYOUT ===== */

    --theme-container-max:  75rem;
}


/* ============================================
   HEADINGS
   ============================================ */

.core-engine-lib-word-blocks .h1 {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-4xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.02em;
}

.core-engine-lib-word-blocks .h2 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-3xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.01em;
}

.core-engine-lib-word-blocks .h3 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-2xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}


/* ============================================
   TEXT
   ============================================ */

.core-engine-lib-word-blocks .text {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .text--muted {
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .text--center {
    text-align: center;
}

.core-engine-lib-word-blocks .text:last-child {
    margin-bottom: 0;
}


/* ============================================
   LEAD
   ============================================ */

.core-engine-lib-word-blocks .lead {
    margin: 0 0 var(--theme-space-5);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   LISTS
   ============================================ */

.core-engine-lib-word-blocks .list {
    margin: 0 0 var(--theme-space-4);
    padding-left: var(--theme-space-6);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .list li {
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .list li:last-child {
    margin-bottom: 0;
}

.core-engine-lib-word-blocks .list li::marker {
    color: var(--theme-accent);
}

.core-engine-lib-word-blocks .list--check {
    list-style: none;
    padding-left: 0;
}

.core-engine-lib-word-blocks .list--check li {
    position: relative;
    padding-left: var(--theme-space-6);
}

.core-engine-lib-word-blocks .list--check li::before {
    content: ''✓'';
    position: absolute;
    left: 0;
    top: 0;
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-bold);
}

.core-engine-lib-word-blocks .list--num {
    list-style: decimal;
}

.core-engine-lib-word-blocks .list--num li::marker {
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-semibold);
}


/* ============================================
   BUTTONS
   ============================================ */

.core-engine-lib-word-blocks .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-space-2);
    padding: var(--theme-space-3) var(--theme-space-6);
    border: 2px solid transparent;
    border-radius: var(--theme-radius-md);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-semibold);
    line-height: 1.2;
    text-decoration: none;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    background: var(--theme-accent);
    color: var(--theme-text-invert);
    border-color: var(--theme-accent);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.core-engine-lib-word-blocks .btn:hover {
    background: var(--theme-accent-hover);
    border-color: var(--theme-accent-hover);
    color: var(--theme-text-invert);
}

.core-engine-lib-word-blocks .btn:active {
    transform: translateY(1px);
}

.core-engine-lib-word-blocks .btn--ghost {
    background: transparent;
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}

.core-engine-lib-word-blocks .btn--ghost:hover {
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}


/* ============================================
   CARD
   ============================================ */

.core-engine-lib-word-blocks .card {
    padding: var(--theme-space-6);
    background: var(--theme-bg);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-lg);
    box-shadow: var(--theme-shadow-sm);
}

.core-engine-lib-word-blocks .card__title {
    margin: 0 0 var(--theme-space-2);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .card__text {
    margin: 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text-muted);
}


/* ============================================
   BADGE
   ============================================ */

.core-engine-lib-word-blocks .badge {
    display: inline-block;
    padding: var(--theme-space-1) var(--theme-space-3);
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    line-height: 1.4;
}


/* ============================================
   QUOTE
   ============================================ */

.core-engine-lib-word-blocks .quote {
    margin: var(--theme-space-6) 0;
    padding: var(--theme-space-4) var(--theme-space-5);
    border-left: 4px solid var(--theme-accent);
    background: var(--theme-bg-subtle);
    border-radius: 0 var(--theme-radius-md) var(--theme-radius-md) 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-style: italic;
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   IMAGE
   ============================================ */

.core-engine-lib-word-blocks .image {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--theme-radius-md);
    margin: 0;
}


/* ============================================
   ICON
   ============================================ */

.core-engine-lib-word-blocks .icon {
    display: inline-block;
    width: 1.5em;
    height: 1.5em;
    vertical-align: middle;
    color: var(--theme-accent);
    flex-shrink: 0;
}


/* ============================================
   DIVIDER
   ============================================ */

.core-engine-lib-word-blocks .divider {
    margin: var(--theme-space-8) 0;
    border: none;
    height: 1px;
    background: var(--theme-border);
}


/* ============================================
   SECTION — vertical rhythm wrapper
   ============================================ */

.core-engine-lib-word-blocks .section {
    padding-top: var(--theme-space-section);
    padding-bottom: var(--theme-space-section);
}


/* ============================================
   CONTAINER — centered max-width wrapper
   ============================================ */

.core-engine-lib-word-blocks .container {
    width: 100%;
    max-width: var(--theme-container-max);
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--theme-space-gutter);
    padding-right: var(--theme-space-gutter);
    box-sizing: border-box;
}


/* ============================================
   GRID — base
   ============================================ */

.core-engine-lib-word-blocks .grid {
    display: grid;
    gap: var(--theme-space-grid);
}

.core-engine-lib-word-blocks .grid--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--auto {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}


/* ============================================
   COLUMN — grid cell
   ============================================ */

/*
 * Minimal cell: only prevents overflow. Padding, background, border
 * are set per block (e.g. .card, .col--tile were removed on purpose).
 */
.core-engine-lib-word-blocks .col {
    min-width: 0;
}


/* ============================================
   GRID — responsive fallback
   ============================================ */

@media (max-width: 768px) {
    .core-engine-lib-word-blocks .grid--2,
    .core-engine-lib-word-blocks .grid--3,
    .core-engine-lib-word-blocks .grid--4 {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* app/core/engine/lib/word/editor/blocks/ready.css */

/**
 * Ready — styles for the "Секции" (sections) blocks.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Covers section-specific classes from blocks/ready.js:
 *   - .hero, .hero__inner, .hero__title, .hero__lead, .hero__btn
 *   - .features, .features__title, .features__grid, .features__item
 *   - .steps, .steps__title, .steps__grid, .steps__item, .steps__num
 *   - .text-image, .text-image__grid, .text-image__text, .text-image__media
 *   - .image-text, .image-text__grid, .image-text__text, .image-text__media
 *   - .gallery, .gallery__title, .gallery__grid, .gallery__item
 *   - .faq, .faq__title, .faq__list, .faq__item, .faq__question, .faq__answer
 *   - .cta, .cta__inner, .cta__title, .cta__text, .cta__btn
 *   - .contacts, .contacts__title, .contacts__grid, .contacts__item,
 *     .contacts__label, .contacts__value
 *   - .footer, .footer__inner, .footer__brand, .footer__nav, .footer__link
 *
 * Shared atom classes (.h1, .h2, .text, .lead, .btn, .card, .image)
 * and layout classes (.section, .container, .grid) live in
 * editor/css/content.css — they are loaded globally.
 *
 * Uses ONLY --theme-* variables (see theme.css).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   HERO — .hero
   ============================================ */

.core-engine-lib-word-blocks .hero__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .hero__title {
    margin: 0;
    max-width: 48rem;
}

.core-engine-lib-word-blocks .hero__lead {
    margin: 0;
    max-width: 40rem;
}

.core-engine-lib-word-blocks .hero__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   FEATURES — .features
   ============================================ */

.core-engine-lib-word-blocks .features__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .features__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .features__item {
    /* uses .card from content.css */
    height: 100%;
}


/* ============================================
   STEPS — .steps
   ============================================ */

.core-engine-lib-word-blocks .steps__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .steps__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .steps__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-bold);
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__item-title {
    margin: 0;
}


/* ============================================
   TEXT + IMAGE — .text-image
   ============================================ */

.core-engine-lib-word-blocks .text-image__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .text-image__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .text-image__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .text-image__media .image {
    width: 100%;
}


/* ============================================
   IMAGE + TEXT — .image-text
   ============================================ */

.core-engine-lib-word-blocks .image-text__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .image-text__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .image-text__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .image-text__media .image {
    width: 100%;
}


/* ============================================
   GALLERY — .gallery
   ============================================ */

.core-engine-lib-word-blocks .gallery__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .gallery__grid {
    /* uses .grid.grid--auto from content.css */
}

.core-engine-lib-word-blocks .gallery__item {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
}


/* ============================================
   FAQ — .faq
   ============================================ */

.core-engine-lib-word-blocks .faq__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .faq__list {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-6);
    max-width: 48rem;
    margin-left: auto;
    margin-right: auto;
}

.core-engine-lib-word-blocks .faq__item {
    padding-bottom: var(--theme-space-5);
    border-bottom: 1px solid var(--theme-border);
}

.core-engine-lib-word-blocks .faq__item:last-child {
    padding-bottom: 0;
    border-bottom: none;
}

.core-engine-lib-word-blocks .faq__question {
    margin: 0 0 var(--theme-space-2);
}

.core-engine-lib-word-blocks .faq__answer {
    margin: 0;
}


/* ============================================
   CTA — .cta
   ============================================ */

.core-engine-lib-word-blocks .cta {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
}

.core-engine-lib-word-blocks .cta__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .cta__title {
    margin: 0;
    color: var(--theme-text, #1e293b);
    max-width: 48rem;
}

.core-engine-lib-word-blocks .cta__text {
    margin: 0;
    color: var(--theme-text-muted, #64748b);
    max-width: 40rem;
}

.core-engine-lib-word-blocks .cta__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   CONTACTS — .contacts
   ============================================ */

.core-engine-lib-word-blocks .contacts__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .contacts__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .contacts__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-1);
}

.core-engine-lib-word-blocks .contacts__label {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .contacts__value {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-medium);
    color: var(--theme-text);
}


/* ============================================
   FOOTER — .footer
   ============================================ */

.core-engine-lib-word-blocks .footer {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
    padding-top: var(--theme-space-6);
    padding-bottom: var(--theme-space-6);
}

.core-engine-lib-word-blocks .footer__inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__brand {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
}

.core-engine-lib-word-blocks .footer__nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__link {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
    text-decoration: none;
    transition: opacity 0.15s ease;
}

.core-engine-lib-word-blocks .footer__link:hover {
    opacity: 1;
}

/* neurocad/core/engine/lib/word/editor/effects/fx/fx-circles-n.css */

/**
 * Effect: fx-circles-n — soft concentric rings, now in several places
 * (centre + four off-centre anchors).
 *
 * Scope: .core-engine-lib-word-blocks .fx-circles-n
 *
 * Each ring set is a single radial-gradient with hard colour stops:
 *   transparent up to 14px, ring (2px), transparent, ring, transparent.
 * Every layer is clipped to a 92x92px tile via background-size, so the
 * 14/28/42px stops stay local to their own circle instead of growing to
 * fill the whole element.
 *
 * Ring positions and ring sizes are hard-coded. Ask the LLM in
 * "edit effect" mode to move the anchors or make the rings denser.
 */

.core-engine-lib-word-blocks .fx-circles-n {
    background-image: radial-gradient(
            circle at center,
            transparent 0,
            transparent 14px,
            #cbd5e1 14px,
            #cbd5e1 15px,
            transparent 15px,
            transparent 28px,
            #cbd5e1 28px,
            #cbd5e1 29px,
            transparent 29px,
            transparent 42px,
            #cbd5e1 42px,
            #cbd5e1 43px,
            transparent 43px
        ),
        radial-gradient(
            circle at center,
            transparent 0,
            transparent 14px,
            #cbd5e1 14px,
            #cbd5e1 15px,
            transparent 15px,
            transparent 28px,
            #cbd5e1 28px,
            #cbd5e1 29px,
            transparent 29px,
            transparent 42px,
            #cbd5e1 42px,
            #cbd5e1 43px,
            transparent 43px
        ),
        radial-gradient(
            circle at center,
            transparent 0,
            transparent 14px,
            #cbd5e1 14px,
            #cbd5e1 15px,
            transparent 15px,
            transparent 28px,
            #cbd5e1 28px,
            #cbd5e1 29px,
            transparent 29px,
            transparent 42px,
            #cbd5e1 42px,
            #cbd5e1 43px,
            transparent 43px
        ),
        radial-gradient(
            circle at center,
            transparent 0,
            transparent 14px,
            #cbd5e1 14px,
            #cbd5e1 15px,
            transparent 15px,
            transparent 28px,
            #cbd5e1 28px,
            #cbd5e1 29px,
            transparent 29px,
            transparent 42px,
            #cbd5e1 42px,
            #cbd5e1 43px,
            transparent 43px
        ),
        radial-gradient(
            circle at center,
            transparent 0,
            transparent 14px,
            #cbd5e1 14px,
            #cbd5e1 15px,
            transparent 15px,
            transparent 28px,
            #cbd5e1 28px,
            #cbd5e1 29px,
            transparent 29px,
            transparent 42px,
            #cbd5e1 42px,
            #cbd5e1 43px,
            transparent 43px
        );
    background-repeat: no-repeat;
    background-size: 92px 92px;
    background-position:
        50% 50%,
        12% 16%,
        88% 20%,
        18% 84%,
        82% 82%;
}

.core-engine-lib-word-blocks .fx-rotating-globe {
  position: relative;
  overflow: hidden;
}
.core-engine-lib-word-blocks .fx-rotating-globe::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(
      24deg,
      rgba(74, 222, 128, 0.20) 0 1px,
      transparent 1px 27px
    ),
    repeating-linear-gradient(
      -18deg,
      rgba(34, 197, 94, 0.12) 0 1px,
      transparent 1px 42px
    ),
    repeating-linear-gradient(
      68deg,
      rgba(22, 163, 74, 0.07) 0 1px,
      transparent 1px 66px
    );
  background-size: 100% 100%;
  opacity: 0.6;
  animation: fx-rotating-globe-drift 4s linear infinite;
  will-change: background-position;
}
.core-engine-lib-word-blocks .fx-rotating-globe::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(
      12deg,
      rgba(74, 222, 128, 0.09) 0 1px,
      transparent 1px 51px
    ),
    repeating-linear-gradient(
      -52deg,
      rgba(34, 197, 94, 0.05) 0 1px,
      transparent 1px 84px
    );
  mix-blend-mode: multiply;
  animation: fx-rotating-globe-drift-alt 6.5s linear infinite;
  pointer-events: none;
  will-change: background-position;
}
.core-engine-lib-word-blocks .fx-rotating-globe:hover::before {
  animation-duration: 1.6s;
}
.core-engine-lib-word-blocks .fx-rotating-globe:hover::after {
  animation-duration: 2.6s;
}
@keyframes fx-rotating-globe-drift {
  from {
    background-position: 0 0, 0 0, 0 0;
  }
  to {
    background-position: 270px 0, -210px 0, 132px 0;
  }
}
@keyframes fx-rotating-globe-drift-alt {
  from {
    background-position: 0 0, 0 0;
  }
  to {
    background-position: -204px 0, 168px 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .core-engine-lib-word-blocks .fx-rotating-globe::before,
  .core-engine-lib-word-blocks .fx-rotating-globe::after {
    animation: none;
  }
}

.core-engine-lib-word-blocks .fx-starfield-earth { position: relative; overflow: hidden; background-image: radial-gradient(circle at 50% 45%, #ffffff 0%, #e4edfa 75%); } .core-engine-lib-word-blocks .fx-starfield-earth::before { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(1px 1px at 12px 18px, #94a3b8, transparent 1.6px), radial-gradient(1px 1px at 52px 64px, #64748b, transparent 1.6px), radial-gradient(1.4px 1.4px at 78px 26px, #a5b4cb, transparent 2px), radial-gradient(1px 1px at 34px 96px, #7c8da8, transparent 1.6px), radial-gradient(1.4px 1.4px at 104px 112px, #94a3b8, transparent 2px), radial-gradient(1px 1px at 66px 44px, #64748b, transparent 1.6px); background-size: 128px 128px; background-repeat: repeat; animation: fx-starfield-earth-twinkle 4s ease-in-out infinite; } .core-engine-lib-word-blocks .fx-starfield-earth::after { content: ""; position: absolute; right: 12%; bottom: 14%; pointer-events: none; width: 64px; height: 64px; border-radius: 50%; background-image: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0) 48%), repeating-linear-gradient(90deg, #93c5fd 0 7px, #86efac 7px 11px, #60a5fa 11px 16px); background-size: 100% 100%, 200% 100%; box-shadow: inset -10px -8px 18px rgba(100,116,139,0.35), 0 0 22px rgba(96,165,250,0.35); animation: fx-starfield-earth-spin 9s linear infinite; } @keyframes fx-starfield-earth-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } } @keyframes fx-starfield-earth-spin { from { background-position: 0 0, 0 0; } to { background-position: 0 0, 200% 0; } }

/* neurocad/core/engine/lib/word/editor/effects/fx/fx-soft-diagonal-hatch.css */

/* Мягкие диагональные штрихи по фону с лёгким размытием.
   Извлечено из pages/11.css (эффекты effect-a7k3 + effect-b9q2). */

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch {
    position: relative;
    overflow: hidden;
    background-image: url("data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''90'' height=''90''%3E%3Cg stroke=''%23808080'' stroke-width=''1.6'' stroke-linecap=''round'' opacity=''0.14''%3E%3Cline x1=''10'' y1=''13'' x2=''25'' y2=''19''/%3E%3Cline x1=''48'' y1=''30'' x2=''63'' y2=''35''/%3E%3Cline x1=''16'' y1=''56'' x2=''31'' y2=''62''/%3E%3Cline x1=''60'' y1=''70'' x2=''76'' y2=''63''/%3E%3Cline x1=''40'' y1=''8'' x2=''52'' y2=''15''/%3E%3Cline x1=''70'' y1=''44'' x2=''82'' y2=''50''/%3E%3C/g%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 90px 90px;
}

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.14;
    filter: blur(2.5px);
    background-repeat: repeat;
    background-image: repeating-linear-gradient(
        24deg,
        rgba(148, 163, 184, 0.38) 0 1px,
        transparent 1px 9px
    ),
    repeating-linear-gradient(
        -18deg,
        rgba(148, 163, 184, 0.22) 0 1px,
        transparent 1px 14px
    ),
    repeating-linear-gradient(
        68deg,
        rgba(148, 163, 184, 0.14) 0 1px,
        transparent 1px 22px
    ),
    repeating-linear-gradient(
        -52deg,
        rgba(148, 163, 184, 0.10) 0 1px,
        transparent 1px 28px
    );
    background-size: 220px 120px, 340px 160px, 180px 140px, 420px 200px;
    background-position-x: 0px, 70px, 130px, 40px;
    background-position-y: 0px, 60px, 30px, 120px;
    mask-image: repeating-linear-gradient(
        -45deg,
        #000 0px, #000 9px,
        transparent 9px, transparent 26px
    );
    -webkit-mask-image: repeating-linear-gradient(
        -45deg,
        #000 0px, #000 9px,
        transparent 9px, transparent 26px
    );
}

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch > * {
    position: relative;
    z-index: 1;
}

.core-engine-lib-word-blocks .fx-aurora-drift { position: relative; overflow: hidden; background-image: radial-gradient(60% 80% at 15% 20%, rgba(148,163,184,0.35), transparent 62%), radial-gradient(55% 70% at 85% 78%, rgba(203,213,225,0.38), transparent 62%), radial-gradient(45% 60% at 60% 5%, rgba(148,163,184,0.18), transparent 62%); background-size: 180% 180%, 170% 170%, 200% 200%; background-repeat: no-repeat, no-repeat, no-repeat; animation: fx-aurora-drift-move 20s ease-in-out infinite alternate; } .core-engine-lib-word-blocks .fx-aurora-drift::after { content: ""; position: absolute; inset: -10%; background-image: radial-gradient(40% 50% at 50% 50%, rgba(203,213,225,0.22), transparent 65%); animation: fx-aurora-drift-breathe 9s ease-in-out infinite; pointer-events: none; } @keyframes fx-aurora-drift-move { 0% { background-position: 0% 0%, 100% 100%, 50% 0%; } 50% { background-position: 32% 42%, 68% 58%, 42% 32%; } 100% { background-position: 62% 82%, 38% 18%, 18% 62%; } } @keyframes fx-aurora-drift-breathe { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.08); } }

.core-engine-lib-word-blocks .fx-dance-spotlight-sweep { background-image: radial-gradient(ellipse 55% 90% at 50% 0%, rgba(148, 163, 184, 0.30) 0%, rgba(148, 163, 184, 0.10) 45%, transparent 70%), radial-gradient(ellipse 55% 90% at 50% 0%, rgba(203, 213, 225, 0.30) 0%, rgba(203, 213, 225, 0.10) 45%, transparent 70%); background-repeat: no-repeat, no-repeat; background-size: 120% 150%, 120% 150%; background-position: -35% 0%, 135% 0%; animation: fx-dance-spotlight-sweep-move 7s ease-in-out infinite alternate; } @keyframes fx-dance-spotlight-sweep-move { 0% { background-position: -35% 0%, 135% 0%; } 100% { background-position: 35% 0%, 65% 0%; } }

* { box-sizing: border-box; } body {margin: 0;}*{box-sizing:border-box;}body{margin-top:0px;margin-right:0px;margin-bottom:0px;margin-left:0px;}');
INSERT INTO "pages" ("id", "nav_id", "datetime", "title", "description", "logo", "content", "content_json", "is_active", "is_delete", "created_at", "updated_at", "rss_yandex_id", "is_template", "template_id", "css") VALUES (3, 2, '2026-09-27 13:42:25.496052', 'Музыкальная студия полного цикла', 'Запись, сведение и мастеринг в профессионально оборудованных залах', '/static/core/engine/lib/word/editor/images/files/img-d156c83e.svg', '<body id="i7mq"><section data-block="core-hero" class="section hero fx-music-equalizer"><div class="container hero__inner"><h1 class="h1 hero__title" id="iggo">Музыкальная студия полного цикла</h1><p class="lead hero__lead">Запись, сведение и мастеринг в профессионально оборудованных залах. Помогаем артистам, группам и проектам получить готовый трек от идеи до релиза.</p><a href="page:contacts" class="btn hero__btn">Записаться на сессию</a></div></section><section data-block="core-features" class="section features fx-vinyl-grooves"><div class="container"><h2 class="h2 features__title">Преимущества</h2><div class="grid grid--3 features__grid"><div class="card features__item"><h3 class="card__title">Профессиональное оборудование</h3><p class="card__text">Запись ведётся на студийные микрофоны, предусилители и аналоговые приборы обработки звука.</p></div><div class="card features__item"><h3 class="card__title">Опытные звукорежиссёры</h3><p class="card__text">Команда специалистов с опытом работы над релизами разных жанров — от попа до джаза.</p></div><div class="card features__item"><h3 class="card__title">Гибкий график сессий</h3><p class="card__text">Бронируйте студию на удобное время, включая вечерние часы и выходные дни.</p></div></div></div></section><section data-block="core-steps" class="section steps fx-faint-equalizer-lines"><div class="container"><h2 class="h2 steps__title">Как это работает</h2><div class="grid grid--3 steps__grid"><div class="steps__item"><div class="steps__num">1</div><h3 class="h3 steps__item-title">Заявка на запись</h3><p class="text text--muted">Оставьте заявку, укажите формат проекта и удобные даты. Мы согласуем дату и время сессии.</p></div><div class="steps__item"><div class="steps__num">2</div><h3 class="h3 steps__item-title">Студийная сессия</h3><p class="text text--muted">Звукорежиссёр готовит зал и оборудование, проводит запись вокала и инструментов.</p></div><div class="steps__item"><div class="steps__num">3</div><h3 class="h3 steps__item-title">Сведение и мастеринг</h3><p class="text text--muted">Сводим материал, выполняем мастеринг и передаём готовые файлы в нужном формате.</p></div></div></div></section><section data-block="core-text-image" class="section text-image"><div class="container"><div class="grid grid--2 text-image__grid"><div class="text-image__text"><h2 class="h2">О студии</h2><p class="text">Мы предлагаем запись вокала и инструментов, сведение, мастеринг и репетиционные залы с акустической подготовкой.</p><p class="text text--muted">Работаем с артистами, группами, подкастами, рекламными и кино-проектами. Помогаем с аранжировкой и подбором сессионных музыкантов.</p></div><div class="text-image__media"><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Микшерный пульт и студийный мониторинг в аппаратной музыкальной студии" class="image"><rect x="90" y="150" width="140" height="215" rx="12" fill="var(--theme-text, #1e293b)"></rect><circle cx="160" cy="288" r="42" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="160" cy="288" r="15" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="160" cy="206" r="19" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="570" y="150" width="140" height="215" rx="12" fill="var(--theme-text, #1e293b)"></rect><circle cx="640" cy="288" r="42" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="640" cy="288" r="15" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="640" cy="206" r="19" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="115" y="365" width="90" height="10" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="595" y="365" width="90" height="10" rx="4" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="140" y="380" width="520" height="150" rx="10" fill="var(--theme-text, #1e293b)"></rect><rect x="158" y="398" width="484" height="114" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><circle cx="196" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="244" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="292" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="340" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="388" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="436" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="484" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="532" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="580" cy="428" r="9" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="628" cy="428" r="9" fill="var(--theme-accent, #3b82f6)"></circle><line x1="196" y1="452" x2="196" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="244" y1="452" x2="244" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="292" y1="452" x2="292" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="340" y1="452" x2="340" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="388" y1="452" x2="388" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="436" y1="452" x2="436" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="484" y1="452" x2="484" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="532" y1="452" x2="532" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="580" y1="452" x2="580" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><line x1="628" y1="452" x2="628" y2="496" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></line><rect x="187" y="470" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="235" y="462" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="283" y="478" width="18" height="10" rx="2" fill="var(--theme-accent, #3b82f6)"></rect><rect x="331" y="466" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="379" y="474" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="427" y="460" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="475" y="480" width="18" height="10" rx="2" fill="var(--theme-accent, #3b82f6)"></rect><rect x="523" y="468" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="571" y="476" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="619" y="464" width="18" height="10" rx="2" fill="var(--theme-text, #1e293b)"></rect><rect x="300" y="530" width="200" height="14" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect></svg></div></div></div></section><section data-block="core-gallery" class="section gallery fx-aurora-drift"><div class="container"><h2 class="h2 gallery__title">Галерея студии</h2><div class="grid grid--auto gallery__grid"><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Аппаратная комната с микшерным пультом и студийными мониторами" class="image gallery__item"><rect x="95" y="180" width="100" height="140" rx="8" fill="var(--theme-text, #1e293b)"></rect><circle cx="145" cy="250" r="30" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="145" cy="250" r="10" fill="var(--theme-accent, #3b82f6)"></circle><rect x="605" y="180" width="100" height="140" rx="8" fill="var(--theme-text, #1e293b)"></rect><circle cx="655" cy="250" r="30" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="655" cy="250" r="10" fill="var(--theme-accent, #3b82f6)"></circle><polygon points="190,330 610,330 650,390 150,390" fill="var(--theme-accent, #3b82f6)"></polygon><rect x="150" y="390" width="500" height="100" rx="6" fill="var(--theme-text, #1e293b)"></rect><circle cx="215" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="265" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="315" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="365" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="415" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="465" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="515" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="565" cy="350" r="10" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="215" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="265" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="315" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="365" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="415" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="465" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="515" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="565" cy="374" r="6" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="185" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="235" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="285" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="335" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="385" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="435" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="485" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="535" y="410" width="12" height="60" rx="6" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="181" y="420" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="231" y="445" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="281" y="430" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="331" y="455" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="381" y="425" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="431" y="450" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="481" y="435" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect><rect x="531" y="460" width="20" height="8" rx="4" fill="var(--theme-accent, #3b82f6)"></rect></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Кабина для записи вокала с микрофоном и акустическими панелями" class="image gallery__item"><g fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"><rect x="100" y="90" width="64" height="64" rx="8"></rect><rect x="100" y="170" width="64" height="64" rx="8"></rect><rect x="100" y="250" width="64" height="64" rx="8"></rect><rect x="180" y="90" width="64" height="64" rx="8"></rect><rect x="180" y="170" width="64" height="64" rx="8"></rect><rect x="180" y="250" width="64" height="64" rx="8"></rect><rect x="556" y="90" width="64" height="64" rx="8"></rect><rect x="556" y="170" width="64" height="64" rx="8"></rect><rect x="556" y="250" width="64" height="64" rx="8"></rect><rect x="636" y="90" width="64" height="64" rx="8"></rect><rect x="636" y="170" width="64" height="64" rx="8"></rect><rect x="636" y="250" width="64" height="64" rx="8"></rect></g><circle cx="400" cy="290" r="68" fill="none" stroke="var(--theme-accent, #3b82f6)" stroke-width="6"></circle><rect x="394" y="356" width="12" height="48" fill="var(--theme-text, #1e293b)"></rect><line x1="400" y1="398" x2="400" y2="516" stroke="var(--theme-text, #1e293b)" stroke-width="9" stroke-linecap="round"></line><ellipse cx="400" cy="524" rx="72" ry="12" fill="var(--theme-text, #1e293b)"></ellipse><rect x="374" y="264" width="52" height="100" rx="18" fill="var(--theme-accent, #3b82f6)"></rect><circle cx="400" cy="260" r="30" fill="var(--theme-text-muted, #94a3b8)"></circle><circle cx="400" cy="260" r="30" fill="none" stroke="var(--theme-text, #1e293b)" stroke-width="3"></circle></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Живой зал для записи группы с барабанной установкой" class="image gallery__item"><line x1="60" y1="520" x2="740" y2="520" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="4"></line><rect x="90" y="70" width="170" height="110" rx="6" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="540" y="70" width="170" height="110" rx="6" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><rect x="330" y="80" width="140" height="90" rx="6" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="3"></rect><line x1="150" y1="185" x2="150" y2="505" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><line x1="110" y1="505" x2="190" y2="505" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><ellipse cx="150" cy="180" rx="85" ry="14" fill="var(--theme-accent, #3b82f6)"></ellipse><circle cx="150" cy="180" r="8" fill="var(--theme-text, #1e293b)"></circle><line x1="690" y1="195" x2="690" y2="505" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><line x1="650" y1="505" x2="730" y2="505" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><ellipse cx="690" cy="190" rx="90" ry="15" fill="var(--theme-accent, #3b82f6)"></ellipse><circle cx="690" cy="190" r="8" fill="var(--theme-text, #1e293b)"></circle><circle cx="345" cy="250" r="48" fill="var(--theme-text, #1e293b)"></circle><circle cx="345" cy="250" r="33" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="460" cy="250" r="48" fill="var(--theme-text, #1e293b)"></circle><circle cx="460" cy="250" r="33" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="400" cy="390" r="95" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="400" cy="390" r="68" fill="var(--theme-bg-soft, #f1f5f9)"></circle><line x1="330" y1="450" x2="312" y2="520" stroke="var(--theme-text, #1e293b)" stroke-width="7"></line><line x1="470" y1="450" x2="488" y2="520" stroke="var(--theme-text, #1e293b)" stroke-width="7"></line><circle cx="250" cy="420" r="58" fill="var(--theme-text, #1e293b)"></circle><circle cx="250" cy="420" r="40" fill="var(--theme-bg-soft, #f1f5f9)"></circle><line x1="215" y1="468" x2="205" y2="520" stroke="var(--theme-text, #1e293b)" stroke-width="6"></line><line x1="285" y1="468" x2="295" y2="520" stroke="var(--theme-text, #1e293b)" stroke-width="6"></line><circle cx="565" cy="400" r="50" fill="var(--theme-text, #1e293b)"></circle><circle cx="565" cy="400" r="34" fill="var(--theme-bg-soft, #f1f5f9)"></circle><line x1="530" y1="440" x2="518" y2="520" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6"></line><line x1="600" y1="440" x2="612" y2="520" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6"></line><line x1="95" y1="300" x2="95" y2="515" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><line x1="60" y1="515" x2="130" y2="515" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><line x1="95" y1="300" x2="195" y2="245" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="5"></line><circle cx="205" cy="240" r="14" fill="var(--theme-text, #1e293b)"></circle></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Репетиционная комната с гитарными усилителями и комбо" class="image gallery__item"><rect x="90" y="70" width="150" height="120" rx="10" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="590" y="100" width="120" height="90" rx="10" fill="var(--theme-bg-soft, #f1f5f9)"></rect><line x1="60" y1="512" x2="740" y2="512" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="4"></line><line x1="130" y1="206" x2="130" y2="512" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="7"></line><circle cx="130" cy="190" r="16" fill="var(--theme-text, #1e293b)"></circle><rect x="200" y="240" width="220" height="62" rx="6" fill="var(--theme-text, #1e293b)"></rect><circle cx="228" cy="271" r="8" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="262" cy="271" r="8" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="296" cy="271" r="8" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="330" cy="271" r="8" fill="var(--theme-accent, #3b82f6)"></circle><rect x="200" y="312" width="220" height="200" rx="6" fill="var(--theme-text, #1e293b)"></rect><rect x="212" y="326" width="196" height="172" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="258" cy="374" r="38" fill="var(--theme-text, #1e293b)"></circle><circle cx="362" cy="374" r="38" fill="var(--theme-text, #1e293b)"></circle><circle cx="258" cy="452" r="38" fill="var(--theme-text, #1e293b)"></circle><circle cx="362" cy="452" r="38" fill="var(--theme-text, #1e293b)"></circle><circle cx="258" cy="374" r="12" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="362" cy="374" r="12" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="258" cy="452" r="12" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="362" cy="452" r="12" fill="var(--theme-accent, #3b82f6)"></circle><rect x="470" y="330" width="190" height="182" rx="6" fill="var(--theme-text, #1e293b)"></rect><rect x="470" y="330" width="190" height="36" rx="6" fill="var(--theme-accent, #3b82f6)"></rect><circle cx="492" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="518" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="544" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="570" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="596" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="622" cy="348" r="7" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="482" y="378" width="166" height="122" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="565" cy="439" r="48" fill="var(--theme-text, #1e293b)"></circle><circle cx="565" cy="439" r="14" fill="var(--theme-accent, #3b82f6)"></circle></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Рабочее место для сведения и мастеринга звука" class="image gallery__item"><rect x="110" y="230" width="110" height="200" rx="10" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="165" cy="295" r="34" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="165" cy="385" r="18" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="580" y="230" width="110" height="200" rx="10" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="635" cy="295" r="34" fill="var(--theme-bg-soft, #f1f5f9)"></circle><circle cx="635" cy="385" r="18" fill="var(--theme-bg-soft, #f1f5f9)"></circle><rect x="290" y="200" width="220" height="160" rx="10" fill="var(--theme-text, #1e293b)"></rect><rect x="304" y="214" width="192" height="132" rx="6" fill="var(--theme-accent, #3b82f6)"></rect><polyline points="312,280 330,250 348,310 366,238 384,322 402,268 420,296 438,246 456,308 474,272 488,280" fill="none" stroke="var(--theme-bg-soft, #f1f5f9)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline><rect x="385" y="360" width="30" height="14" fill="var(--theme-text, #1e293b)"></rect><rect x="250" y="374" width="300" height="66" rx="10" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="268" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="304" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="340" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="376" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="412" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="448" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="484" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="520" y="390" width="10" height="34" rx="5" fill="var(--theme-bg-soft, #f1f5f9)"></rect><rect x="90" y="440" width="620" height="16" rx="6" fill="var(--theme-text, #1e293b)"></rect><rect x="140" y="456" width="16" height="90" fill="var(--theme-text, #1e293b)"></rect><rect x="644" y="456" width="16" height="90" fill="var(--theme-text, #1e293b)"></rect></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Зона отдыха для музыкантов в студии" class="image gallery__item"><rect x="170" y="286" width="460" height="96" rx="24" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="6"></rect><rect x="198" y="306" width="180" height="58" rx="14" fill="var(--theme-accent, #3b82f6)"></rect><rect x="422" y="306" width="180" height="58" rx="14" fill="var(--theme-accent, #3b82f6)"></rect><rect x="150" y="368" width="500" height="96" rx="28" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="6"></rect><rect x="186" y="462" width="18" height="28" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="596" y="462" width="18" height="28" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><circle cx="278" cy="306" r="28" fill="var(--theme-text, #1e293b)"></circle><rect x="234" y="332" width="88" height="120" rx="26" fill="var(--theme-text, #1e293b)"></rect><circle cx="472" cy="306" r="28" fill="var(--theme-text, #1e293b)"></circle><rect x="428" y="332" width="88" height="120" rx="26" fill="var(--theme-text, #1e293b)"></rect><rect x="392" y="376" width="16" height="110" rx="8" fill="var(--theme-accent, #3b82f6)"></rect><ellipse cx="400" cy="508" rx="58" ry="46" fill="var(--theme-accent, #3b82f6)"></ellipse><circle cx="400" cy="500" r="16" fill="var(--theme-bg-soft, #f1f5f9)"></circle></svg></div></div></section><section data-block="core-faq" class="section faq"><div class="container"><h2 class="h2 faq__title">Частые вопросы</h2><div class="faq__list"><div class="faq__item"><h3 class="h3 faq__question">Сколько длится студийная сессия?</h3><p class="text text--muted faq__answer">Минимальная сессия — два часа. Точная длительность зависит от количества дорожек и инструментов; её мы согласуем при бронировании.</p></div><div class="faq__item"><h3 class="h3 faq__question">Можно ли записать живой состав?</h3><p class="text text--muted faq__answer">Да, живой зал рассчитан на запись группы целиком. Для больших составов доступно разделение на несколько сессий и дорожек.</p></div><div class="faq__item"><h3 class="h3 faq__question">Что входит в сведение и мастеринг?</h3><p class="text text--muted faq__answer">В услугу входят обработка и баланс дорожек, работа с динамикой и пространством, финальный мастеринг и передача готовых файлов.</p></div></div></div></section><section data-block="core-cta" class="section cta fx-equalizer-bars"><div class="container cta__inner"><h2 class="h2 cta__title">Готовы записать свой трек?</h2><p class="text cta__text">Оставьте заявку — подберём дату сессии, состав оборудования и звукорежиссёра под ваш проект.</p><a href="page:contacts" class="btn cta__btn">Оставить заявку</a></div></section><section data-block="core-contacts" class="section contacts"><div class="container"><h2 class="h2 contacts__title">Контакты</h2><div class="grid grid--3 contacts__grid"><div class="contacts__item"><div class="contacts__label">Адрес</div><div class="contacts__value">Москва, ул. Примерная, д. 10, стр. 2</div></div><div class="contacts__item"><div class="contacts__label">Телефон</div><div class="contacts__value">+7 (000) 000-00-00</div></div><div class="contacts__item"><div class="contacts__label">Email</div><div class="contacts__value">mail@example.com</div></div></div></div></section><footer data-block="core-footer" class="section footer"><div class="container footer__inner"><div class="footer__brand">© Музыкальная студия</div><nav class="footer__nav"><a href="page:index" class="footer__link">Главная</a><a href="page:services" class="footer__link">Услуги</a><a href="page:contacts" class="footer__link">Контакты</a></nav></div></footer></body>', '{"assets":[],"styles":[],"pages":[{"frames":[{"component":{"type":"wrapper","stylable":["background","background-color","background-image","background-repeat","background-attachment","background-position","background-size"],"attributes":{"id":"i7mq"},"components":[{"tagName":"section","classes":["section","hero","fx-music-equalizer"],"attributes":{"data-block":"core-hero"},"components":[{"classes":["container","hero__inner"],"components":[{"tagName":"h1","type":"text","classes":["h1","hero__title"],"attributes":{"id":"iggo"},"components":[{"type":"textnode","content":"Музыкальная студия полного цикла"}]},{"tagName":"p","type":"text","classes":["lead","hero__lead"],"components":[{"type":"textnode","content":"Запись, сведение и мастеринг в профессионально оборудованных залах. Помогаем артистам, группам и проектам получить готовый трек от идеи до релиза."}]},{"type":"link","classes":["btn","hero__btn"],"attributes":{"href":"page:contacts"},"components":[{"type":"textnode","content":"Записаться на сессию"}]}]}]},{"tagName":"section","classes":["section","features","fx-vinyl-grooves"],"attributes":{"data-block":"core-features"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","features__title"],"components":[{"type":"textnode","content":"Преимущества"}]},{"classes":["grid","grid--3","features__grid"],"components":[{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Профессиональное оборудование"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Запись ведётся на студийные микрофоны, предусилители и аналоговые приборы обработки звука."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Опытные звукорежиссёры"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Команда специалистов с опытом работы над релизами разных жанров — от попа до джаза."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Гибкий график сессий"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Бронируйте студию на удобное время, включая вечерние часы и выходные дни."}]}]}]}]}]},{"tagName":"section","classes":["section","steps","fx-faint-equalizer-lines"],"attributes":{"data-block":"core-steps"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","steps__title"],"components":[{"type":"textnode","content":"Как это работает"}]},{"classes":["grid","grid--3","steps__grid"],"components":[{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"1"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Заявка на запись"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Оставьте заявку, укажите формат проекта и удобные даты. Мы согласуем дату и время сессии."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"2"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Студийная сессия"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Звукорежиссёр готовит зал и оборудование, проводит запись вокала и инструментов."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"3"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Сведение и мастеринг"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Сводим материал, выполняем мастеринг и передаём готовые файлы в нужном формате."}]}]}]}]}]},{"tagName":"section","classes":["section","text-image"],"attributes":{"data-block":"core-text-image"},"components":[{"classes":["container"],"components":[{"classes":["grid","grid--2","text-image__grid"],"components":[{"classes":["text-image__text"],"components":[{"tagName":"h2","type":"text","classes":["h2"],"components":[{"type":"textnode","content":"О студии"}]},{"tagName":"p","type":"text","classes":["text"],"components":[{"type":"textnode","content":"Мы предлагаем запись вокала и инструментов, сведение, мастеринг и репетиционные залы с акустической подготовкой."}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Работаем с артистами, группами, подкастами, рекламными и кино-проектами. Помогаем с аранжировкой и подбором сессионных музыкантов."}]}]},{"classes":["text-image__media"],"components":[{"type":"svg","resizable":{"ratioDefault":true},"classes":["image"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Микшерный пульт и студийный мониторинг в аппаратной музыкальной студии"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"90","y":"150","width":"140","height":"215","rx":"12","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"160","cy":"288","r":"42","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"160","cy":"288","r":"15","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"160","cy":"206","r":"19","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"570","y":"150","width":"140","height":"215","rx":"12","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"640","cy":"288","r":"42","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"640","cy":"288","r":"15","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"640","cy":"206","r":"19","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"115","y":"365","width":"90","height":"10","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"595","y":"365","width":"90","height":"10","rx":"4","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"140","y":"380","width":"520","height":"150","rx":"10","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"158","y":"398","width":"484","height":"114","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"196","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"244","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"292","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"340","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"388","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"436","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"484","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"532","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"580","cy":"428","r":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"628","cy":"428","r":"9","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"196","y1":"452","x2":"196","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"244","y1":"452","x2":"244","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"292","y1":"452","x2":"292","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"340","y1":"452","x2":"340","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"388","y1":"452","x2":"388","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"436","y1":"452","x2":"436","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"484","y1":"452","x2":"484","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"532","y1":"452","x2":"532","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"580","y1":"452","x2":"580","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"628","y1":"452","x2":"628","y2":"496","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"187","y":"470","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"235","y":"462","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"283","y":"478","width":"18","height":"10","rx":"2","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"331","y":"466","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"379","y":"474","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"427","y":"460","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"475","y":"480","width":"18","height":"10","rx":"2","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"523","y":"468","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"571","y":"476","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"619","y":"464","width":"18","height":"10","rx":"2","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"300","y":"530","width":"200","height":"14","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}}]}]}]}]}]},{"tagName":"section","classes":["section","gallery","fx-aurora-drift"],"attributes":{"data-block":"core-gallery"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","gallery__title"],"components":[{"type":"textnode","content":"Галерея студии"}]},{"classes":["grid","grid--auto","gallery__grid"],"components":[{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Аппаратная комната с микшерным пультом и студийными мониторами"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"95","y":"180","width":"100","height":"140","rx":"8","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"145","cy":"250","r":"30","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"145","cy":"250","r":"10","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"605","y":"180","width":"100","height":"140","rx":"8","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"655","cy":"250","r":"30","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"655","cy":"250","r":"10","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"polygon","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"points":"190,330 610,330 650,390 150,390","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"150","y":"390","width":"500","height":"100","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"215","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"265","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"315","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"365","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"415","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"465","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"515","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"350","r":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"215","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"265","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"315","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"365","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"415","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"465","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"515","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"374","r":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"185","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"235","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"285","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"335","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"385","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"435","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"485","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"535","y":"410","width":"12","height":"60","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"181","y":"420","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"231","y":"445","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"281","y":"430","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"331","y":"455","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"381","y":"425","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"431","y":"450","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"481","y":"435","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"531","y":"460","width":"20","height":"8","rx":"4","fill":"var(--theme-accent, #3b82f6)"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Кабина для записи вокала с микрофоном и акустическими панелями"},"components":[{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"100","y":"90","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"100","y":"170","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"100","y":"250","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"180","y":"90","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"180","y":"170","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"180","y":"250","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"556","y":"90","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"556","y":"170","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"556","y":"250","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"636","y":"90","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"636","y":"170","width":"64","height":"64","rx":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"636","y":"250","width":"64","height":"64","rx":"8"}}]},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"290","r":"68","fill":"none","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"6"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"394","y":"356","width":"12","height":"48","fill":"var(--theme-text, #1e293b)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"400","y1":"398","x2":"400","y2":"516","stroke":"var(--theme-text, #1e293b)","stroke-width":"9","stroke-linecap":"round"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"524","rx":"72","ry":"12","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"374","y":"264","width":"52","height":"100","rx":"18","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"260","r":"30","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"260","r":"30","fill":"none","stroke":"var(--theme-text, #1e293b)","stroke-width":"3"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Живой зал для записи группы с барабанной установкой"},"components":[{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"60","y1":"520","x2":"740","y2":"520","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"4"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"90","y":"70","width":"170","height":"110","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"540","y":"70","width":"170","height":"110","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"330","y":"80","width":"140","height":"90","rx":"6","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"3"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"150","y1":"185","x2":"150","y2":"505","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"110","y1":"505","x2":"190","y2":"505","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"150","cy":"180","rx":"85","ry":"14","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"150","cy":"180","r":"8","fill":"var(--theme-text, #1e293b)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"690","y1":"195","x2":"690","y2":"505","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"650","y1":"505","x2":"730","y2":"505","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"690","cy":"190","rx":"90","ry":"15","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"690","cy":"190","r":"8","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"345","cy":"250","r":"48","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"345","cy":"250","r":"33","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"460","cy":"250","r":"48","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"460","cy":"250","r":"33","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"390","r":"95","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"390","r":"68","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"330","y1":"450","x2":"312","y2":"520","stroke":"var(--theme-text, #1e293b)","stroke-width":"7"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"470","y1":"450","x2":"488","y2":"520","stroke":"var(--theme-text, #1e293b)","stroke-width":"7"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"250","cy":"420","r":"58","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"250","cy":"420","r":"40","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"215","y1":"468","x2":"205","y2":"520","stroke":"var(--theme-text, #1e293b)","stroke-width":"6"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"285","y1":"468","x2":"295","y2":"520","stroke":"var(--theme-text, #1e293b)","stroke-width":"6"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"400","r":"50","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"400","r":"34","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"530","y1":"440","x2":"518","y2":"520","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"600","y1":"440","x2":"612","y2":"520","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"95","y1":"300","x2":"95","y2":"515","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"60","y1":"515","x2":"130","y2":"515","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"95","y1":"300","x2":"195","y2":"245","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"5"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"205","cy":"240","r":"14","fill":"var(--theme-text, #1e293b)"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Репетиционная комната с гитарными усилителями и комбо"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"90","y":"70","width":"150","height":"120","rx":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"590","y":"100","width":"120","height":"90","rx":"10","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"60","y1":"512","x2":"740","y2":"512","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"4"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"130","y1":"206","x2":"130","y2":"512","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"7"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"130","cy":"190","r":"16","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"200","y":"240","width":"220","height":"62","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"228","cy":"271","r":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"262","cy":"271","r":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"296","cy":"271","r":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"330","cy":"271","r":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"200","y":"312","width":"220","height":"200","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"212","y":"326","width":"196","height":"172","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"258","cy":"374","r":"38","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"362","cy":"374","r":"38","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"258","cy":"452","r":"38","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"362","cy":"452","r":"38","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"258","cy":"374","r":"12","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"362","cy":"374","r":"12","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"258","cy":"452","r":"12","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"362","cy":"452","r":"12","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"470","y":"330","width":"190","height":"182","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"470","y":"330","width":"190","height":"36","rx":"6","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"492","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"518","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"544","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"570","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"596","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"622","cy":"348","r":"7","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"482","y":"378","width":"166","height":"122","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"439","r":"48","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"565","cy":"439","r":"14","fill":"var(--theme-accent, #3b82f6)"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Рабочее место для сведения и мастеринга звука"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"110","y":"230","width":"110","height":"200","rx":"10","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"165","cy":"295","r":"34","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"165","cy":"385","r":"18","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"580","y":"230","width":"110","height":"200","rx":"10","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"635","cy":"295","r":"34","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"635","cy":"385","r":"18","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"290","y":"200","width":"220","height":"160","rx":"10","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"304","y":"214","width":"192","height":"132","rx":"6","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"polyline","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"points":"312,280 330,250 348,310 366,238 384,322 402,268 420,296 438,246 456,308 474,272 488,280","fill":"none","stroke":"var(--theme-bg-soft, #f1f5f9)","stroke-width":"5","stroke-linecap":"round","stroke-linejoin":"round"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"385","y":"360","width":"30","height":"14","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"250","y":"374","width":"300","height":"66","rx":"10","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"268","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"304","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"340","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"376","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"412","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"448","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"484","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"520","y":"390","width":"10","height":"34","rx":"5","fill":"var(--theme-bg-soft, #f1f5f9)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"90","y":"440","width":"620","height":"16","rx":"6","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"140","y":"456","width":"16","height":"90","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"644","y":"456","width":"16","height":"90","fill":"var(--theme-text, #1e293b)"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Зона отдыха для музыкантов в студии"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"170","y":"286","width":"460","height":"96","rx":"24","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"6"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"198","y":"306","width":"180","height":"58","rx":"14","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"422","y":"306","width":"180","height":"58","rx":"14","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"150","y":"368","width":"500","height":"96","rx":"28","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"6"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"186","y":"462","width":"18","height":"28","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"596","y":"462","width":"18","height":"28","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"278","cy":"306","r":"28","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"234","y":"332","width":"88","height":"120","rx":"26","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"472","cy":"306","r":"28","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"428","y":"332","width":"88","height":"120","rx":"26","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"392","y":"376","width":"16","height":"110","rx":"8","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"508","rx":"58","ry":"46","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"500","r":"16","fill":"var(--theme-bg-soft, #f1f5f9)"}}]}]}]}]},{"tagName":"section","classes":["section","faq"],"attributes":{"data-block":"core-faq"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","faq__title"],"components":[{"type":"textnode","content":"Частые вопросы"}]},{"classes":["faq__list"],"components":[{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Сколько длится студийная сессия?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Минимальная сессия — два часа. Точная длительность зависит от количества дорожек и инструментов; её мы согласуем при бронировании."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Можно ли записать живой состав?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Да, живой зал рассчитан на запись группы целиком. Для больших составов доступно разделение на несколько сессий и дорожек."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Что входит в сведение и мастеринг?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"В услугу входят обработка и баланс дорожек, работа с динамикой и пространством, финальный мастеринг и передача готовых файлов."}]}]}]}]}]},{"tagName":"section","classes":["section","cta","fx-equalizer-bars"],"attributes":{"data-block":"core-cta"},"components":[{"classes":["container","cta__inner"],"components":[{"tagName":"h2","type":"text","classes":["h2","cta__title"],"components":[{"type":"textnode","content":"Готовы записать свой трек?"}]},{"tagName":"p","type":"text","classes":["text","cta__text"],"components":[{"type":"textnode","content":"Оставьте заявку — подберём дату сессии, состав оборудования и звукорежиссёра под ваш проект."}]},{"type":"link","classes":["btn","cta__btn"],"attributes":{"href":"page:contacts"},"components":[{"type":"textnode","content":"Оставить заявку"}]}]}]},{"tagName":"section","classes":["section","contacts"],"attributes":{"data-block":"core-contacts"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","contacts__title"],"components":[{"type":"textnode","content":"Контакты"}]},{"classes":["grid","grid--3","contacts__grid"],"components":[{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Адрес"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"Москва, ул. Примерная, д. 10, стр. 2"}]}]},{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Телефон"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"+7 (000) 000-00-00"}]}]},{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Email"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"mail@example.com"}]}]}]}]}]},{"tagName":"footer","classes":["section","footer"],"attributes":{"data-block":"core-footer"},"components":[{"classes":["container","footer__inner"],"components":[{"type":"text","classes":["footer__brand"],"components":[{"type":"textnode","content":"© Музыкальная студия"}]},{"tagName":"nav","classes":["footer__nav"],"components":[{"type":"link","classes":["footer__link"],"attributes":{"href":"page:index"},"components":[{"type":"textnode","content":"Главная"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:services"},"components":[{"type":"textnode","content":"Услуги"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:contacts"},"components":[{"type":"textnode","content":"Контакты"}]}]}]}]}],"head":{"type":"head"},"docEl":{"tagName":"html"}},"id":"IaG1nPbItzTQ0qEq"}],"id":"cnCHUDBVKYy6FzGH"}],"symbols":[]}', 1, 0, '2026-09-27 13:42:25.496089', '2026-09-27 15:20:33.745654', NULL, 0, NULL, '/* app/core/engine/lib/word/editor/css/content.css */

/**
 * Content — theme variables + shared atoms + layout for CONTENT pages.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Uses ONLY --theme-* variables, defined at the top of this file.
 * Completely independent from base/css/00_variables.css (admin UI):
 * admin theme changes do NOT affect page content.
 *
 * Contents:
 *   THEME VARIABLES
 *     --theme-*                 all colors, fonts, radii, spacing
 *
 *   ATOMS
 *     .h1, .h2, .h3             headings
 *     .text, .text--muted, .text--center
 *     .lead                     intro paragraph
 *     .list, .list--check, .list--num
 *     .btn, .btn--ghost         buttons
 *     .card, .card__title, .card__text
 *     .badge, .quote, .image, .icon, .divider
 *
 *   LAYOUT
 *     .section                  vertical rhythm wrapper
 *     .container                centered max-width wrapper
 *     .grid, .grid--2/3/4/auto  base grids
 *     .col                      grid cell
 *
 * .flex-shell* lives in blocks/layout.css — it is block-specific
 * (only used by the flex-shell block).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   THEME VARIABLES — content
   ============================================ */

/*
 * Completely independent from base/css/00_variables.css (admin UI).
 * Admin theme changes do NOT affect these values.
 *
 * Scoped under .core-engine-lib-word-blocks — the same class sits
 * on the canvas <body> in the editor and on the article wrapper
 * on the public page.
 */
.core-engine-lib-word-blocks {

    /* ===== COLORS ===== */

    --theme-bg:             #ffffff;
    --theme-bg-subtle:      #f8fafc;
    --theme-bg-dark:        #0f172a;
    --theme-bg-hover:       #f1f5f9;

    --theme-text:           #1e293b;
    --theme-text-muted:     #64748b;
    --theme-text-invert:    #ffffff;

    --theme-accent:         #246eaa;
    --theme-accent-hover:   #1e5a8a;
    --theme-accent-soft:    #e0edf7;

    --theme-border:         #e2e8f0;
    --theme-border-strong:  #cbd5e1;

    --theme-success:        #16a34a;
    --theme-warning:        #d97706;
    --theme-danger:         #dc2626;

    /* ===== SHADOWS ===== */

    --theme-shadow-sm:  0 1px 3px rgba(15, 23, 42, 0.06);
    --theme-shadow-md:  0 4px 12px rgba(15, 23, 42, 0.08);
    --theme-shadow-lg:  0 12px 32px rgba(15, 23, 42, 0.12);

    /* ===== FONTS ===== */

    --theme-font-family:    ''Inter'', ''Golos Text'', sans-serif;
    --theme-font-size-xs:   0.75rem;
    --theme-font-size-sm:   0.875rem;
    --theme-font-size-base: 1rem;
    --theme-font-size-lg:   1.125rem;
    --theme-font-size-xl:   1.25rem;
    --theme-font-size-2xl:  1.5rem;
    --theme-font-size-3xl:  2rem;
    --theme-font-size-4xl:  2.5rem;

    --theme-font-weight-regular:  400;
    --theme-font-weight-medium:   500;
    --theme-font-weight-semibold: 600;
    --theme-font-weight-bold:     700;

    --theme-line-height-tight:  1.25;
    --theme-line-height-base:   1.6;
    --theme-line-height-loose:  1.8;

    /* ===== RADII ===== */

    --theme-radius-sm:   0.25rem;
    --theme-radius-md:   0.5rem;
    --theme-radius-lg:   0.75rem;
    --theme-radius-xl:   1rem;
    --theme-radius-pill: 9999px;

    /* ===== SPACING ===== */

    --theme-space-1:   0.25rem;
    --theme-space-2:   0.5rem;
    --theme-space-3:   0.75rem;
    --theme-space-4:   1rem;
    --theme-space-5:   1.25rem;
    --theme-space-6:   1.5rem;
    --theme-space-8:   2rem;
    --theme-space-10:  2.5rem;
    --theme-space-12:  3rem;
    --theme-space-16:  4rem;
    --theme-space-20:  5rem;

    --theme-space-section:  4rem;
    --theme-space-gutter:   1rem;
    --theme-space-grid:     1rem;

    /* ===== LAYOUT ===== */

    --theme-container-max:  75rem;
}


/* ============================================
   HEADINGS
   ============================================ */

.core-engine-lib-word-blocks .h1 {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-4xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.02em;
}

.core-engine-lib-word-blocks .h2 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-3xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.01em;
}

.core-engine-lib-word-blocks .h3 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-2xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}


/* ============================================
   TEXT
   ============================================ */

.core-engine-lib-word-blocks .text {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .text--muted {
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .text--center {
    text-align: center;
}

.core-engine-lib-word-blocks .text:last-child {
    margin-bottom: 0;
}


/* ============================================
   LEAD
   ============================================ */

.core-engine-lib-word-blocks .lead {
    margin: 0 0 var(--theme-space-5);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   LISTS
   ============================================ */

.core-engine-lib-word-blocks .list {
    margin: 0 0 var(--theme-space-4);
    padding-left: var(--theme-space-6);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .list li {
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .list li:last-child {
    margin-bottom: 0;
}

.core-engine-lib-word-blocks .list li::marker {
    color: var(--theme-accent);
}

.core-engine-lib-word-blocks .list--check {
    list-style: none;
    padding-left: 0;
}

.core-engine-lib-word-blocks .list--check li {
    position: relative;
    padding-left: var(--theme-space-6);
}

.core-engine-lib-word-blocks .list--check li::before {
    content: ''✓'';
    position: absolute;
    left: 0;
    top: 0;
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-bold);
}

.core-engine-lib-word-blocks .list--num {
    list-style: decimal;
}

.core-engine-lib-word-blocks .list--num li::marker {
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-semibold);
}


/* ============================================
   BUTTONS
   ============================================ */

.core-engine-lib-word-blocks .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-space-2);
    padding: var(--theme-space-3) var(--theme-space-6);
    border: 2px solid transparent;
    border-radius: var(--theme-radius-md);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-semibold);
    line-height: 1.2;
    text-decoration: none;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    background: var(--theme-accent);
    color: var(--theme-text-invert);
    border-color: var(--theme-accent);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.core-engine-lib-word-blocks .btn:hover {
    background: var(--theme-accent-hover);
    border-color: var(--theme-accent-hover);
    color: var(--theme-text-invert);
}

.core-engine-lib-word-blocks .btn:active {
    transform: translateY(1px);
}

.core-engine-lib-word-blocks .btn--ghost {
    background: transparent;
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}

.core-engine-lib-word-blocks .btn--ghost:hover {
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}


/* ============================================
   CARD
   ============================================ */

.core-engine-lib-word-blocks .card {
    padding: var(--theme-space-6);
    background: var(--theme-bg);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-lg);
    box-shadow: var(--theme-shadow-sm);
}

.core-engine-lib-word-blocks .card__title {
    margin: 0 0 var(--theme-space-2);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .card__text {
    margin: 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text-muted);
}


/* ============================================
   BADGE
   ============================================ */

.core-engine-lib-word-blocks .badge {
    display: inline-block;
    padding: var(--theme-space-1) var(--theme-space-3);
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    line-height: 1.4;
}


/* ============================================
   QUOTE
   ============================================ */

.core-engine-lib-word-blocks .quote {
    margin: var(--theme-space-6) 0;
    padding: var(--theme-space-4) var(--theme-space-5);
    border-left: 4px solid var(--theme-accent);
    background: var(--theme-bg-subtle);
    border-radius: 0 var(--theme-radius-md) var(--theme-radius-md) 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-style: italic;
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   IMAGE
   ============================================ */

.core-engine-lib-word-blocks .image {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--theme-radius-md);
    margin: 0;
}


/* ============================================
   ICON
   ============================================ */

.core-engine-lib-word-blocks .icon {
    display: inline-block;
    width: 1.5em;
    height: 1.5em;
    vertical-align: middle;
    color: var(--theme-accent);
    flex-shrink: 0;
}


/* ============================================
   DIVIDER
   ============================================ */

.core-engine-lib-word-blocks .divider {
    margin: var(--theme-space-8) 0;
    border: none;
    height: 1px;
    background: var(--theme-border);
}


/* ============================================
   SECTION — vertical rhythm wrapper
   ============================================ */

.core-engine-lib-word-blocks .section {
    padding-top: var(--theme-space-section);
    padding-bottom: var(--theme-space-section);
}


/* ============================================
   CONTAINER — centered max-width wrapper
   ============================================ */

.core-engine-lib-word-blocks .container {
    width: 100%;
    max-width: var(--theme-container-max);
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--theme-space-gutter);
    padding-right: var(--theme-space-gutter);
    box-sizing: border-box;
}


/* ============================================
   GRID — base
   ============================================ */

.core-engine-lib-word-blocks .grid {
    display: grid;
    gap: var(--theme-space-grid);
}

.core-engine-lib-word-blocks .grid--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--auto {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}


/* ============================================
   COLUMN — grid cell
   ============================================ */

/*
 * Minimal cell: only prevents overflow. Padding, background, border
 * are set per block (e.g. .card, .col--tile were removed on purpose).
 */
.core-engine-lib-word-blocks .col {
    min-width: 0;
}


/* ============================================
   GRID — responsive fallback
   ============================================ */

@media (max-width: 768px) {
    .core-engine-lib-word-blocks .grid--2,
    .core-engine-lib-word-blocks .grid--3,
    .core-engine-lib-word-blocks .grid--4 {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* app/core/engine/lib/word/editor/blocks/ready.css */

/**
 * Ready — styles for the "Секции" (sections) blocks.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Covers section-specific classes from blocks/ready.js:
 *   - .hero, .hero__inner, .hero__title, .hero__lead, .hero__btn
 *   - .features, .features__title, .features__grid, .features__item
 *   - .steps, .steps__title, .steps__grid, .steps__item, .steps__num
 *   - .text-image, .text-image__grid, .text-image__text, .text-image__media
 *   - .image-text, .image-text__grid, .image-text__text, .image-text__media
 *   - .gallery, .gallery__title, .gallery__grid, .gallery__item
 *   - .faq, .faq__title, .faq__list, .faq__item, .faq__question, .faq__answer
 *   - .cta, .cta__inner, .cta__title, .cta__text, .cta__btn
 *   - .contacts, .contacts__title, .contacts__grid, .contacts__item,
 *     .contacts__label, .contacts__value
 *   - .footer, .footer__inner, .footer__brand, .footer__nav, .footer__link
 *
 * Shared atom classes (.h1, .h2, .text, .lead, .btn, .card, .image)
 * and layout classes (.section, .container, .grid) live in
 * editor/css/content.css — they are loaded globally.
 *
 * Uses ONLY --theme-* variables (see theme.css).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   HERO — .hero
   ============================================ */

.core-engine-lib-word-blocks .hero__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .hero__title {
    margin: 0;
    max-width: 48rem;
}

.core-engine-lib-word-blocks .hero__lead {
    margin: 0;
    max-width: 40rem;
}

.core-engine-lib-word-blocks .hero__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   FEATURES — .features
   ============================================ */

.core-engine-lib-word-blocks .features__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .features__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .features__item {
    /* uses .card from content.css */
    height: 100%;
}


/* ============================================
   STEPS — .steps
   ============================================ */

.core-engine-lib-word-blocks .steps__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .steps__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .steps__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-bold);
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__item-title {
    margin: 0;
}


/* ============================================
   TEXT + IMAGE — .text-image
   ============================================ */

.core-engine-lib-word-blocks .text-image__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .text-image__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .text-image__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .text-image__media .image {
    width: 100%;
}


/* ============================================
   IMAGE + TEXT — .image-text
   ============================================ */

.core-engine-lib-word-blocks .image-text__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .image-text__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .image-text__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .image-text__media .image {
    width: 100%;
}


/* ============================================
   GALLERY — .gallery
   ============================================ */

.core-engine-lib-word-blocks .gallery__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .gallery__grid {
    /* uses .grid.grid--auto from content.css */
}

.core-engine-lib-word-blocks .gallery__item {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
}


/* ============================================
   FAQ — .faq
   ============================================ */

.core-engine-lib-word-blocks .faq__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .faq__list {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-6);
    max-width: 48rem;
    margin-left: auto;
    margin-right: auto;
}

.core-engine-lib-word-blocks .faq__item {
    padding-bottom: var(--theme-space-5);
    border-bottom: 1px solid var(--theme-border);
}

.core-engine-lib-word-blocks .faq__item:last-child {
    padding-bottom: 0;
    border-bottom: none;
}

.core-engine-lib-word-blocks .faq__question {
    margin: 0 0 var(--theme-space-2);
}

.core-engine-lib-word-blocks .faq__answer {
    margin: 0;
}


/* ============================================
   CTA — .cta
   ============================================ */

.core-engine-lib-word-blocks .cta {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
}

.core-engine-lib-word-blocks .cta__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .cta__title {
    margin: 0;
    color: var(--theme-text, #1e293b);
    max-width: 48rem;
}

.core-engine-lib-word-blocks .cta__text {
    margin: 0;
    color: var(--theme-text-muted, #64748b);
    max-width: 40rem;
}

.core-engine-lib-word-blocks .cta__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   CONTACTS — .contacts
   ============================================ */

.core-engine-lib-word-blocks .contacts__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .contacts__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .contacts__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-1);
}

.core-engine-lib-word-blocks .contacts__label {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .contacts__value {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-medium);
    color: var(--theme-text);
}


/* ============================================
   FOOTER — .footer
   ============================================ */

.core-engine-lib-word-blocks .footer {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
    padding-top: var(--theme-space-6);
    padding-bottom: var(--theme-space-6);
}

.core-engine-lib-word-blocks .footer__inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__brand {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
}

.core-engine-lib-word-blocks .footer__nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__link {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
    text-decoration: none;
    transition: opacity 0.15s ease;
}

.core-engine-lib-word-blocks .footer__link:hover {
    opacity: 1;
}

.core-engine-lib-word-blocks .fx-aurora-drift { position: relative; overflow: hidden; background-image: radial-gradient(60% 80% at 15% 20%, rgba(148,163,184,0.35), transparent 62%), radial-gradient(55% 70% at 85% 78%, rgba(203,213,225,0.38), transparent 62%), radial-gradient(45% 60% at 60% 5%, rgba(148,163,184,0.18), transparent 62%); background-size: 180% 180%, 170% 170%, 200% 200%; background-repeat: no-repeat, no-repeat, no-repeat; animation: fx-aurora-drift-move 20s ease-in-out infinite alternate; } .core-engine-lib-word-blocks .fx-aurora-drift::after { content: ""; position: absolute; inset: -10%; background-image: radial-gradient(40% 50% at 50% 50%, rgba(203,213,225,0.22), transparent 65%); animation: fx-aurora-drift-breathe 9s ease-in-out infinite; pointer-events: none; } @keyframes fx-aurora-drift-move { 0% { background-position: 0% 0%, 100% 100%, 50% 0%; } 50% { background-position: 32% 42%, 68% 58%, 42% 32%; } 100% { background-position: 62% 82%, 38% 18%, 18% 62%; } } @keyframes fx-aurora-drift-breathe { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.08); } }

.core-engine-lib-word-blocks .fx-music-equalizer { background-image: repeating-linear-gradient(90deg, rgba(244,114,182,0) 0px, rgba(244,114,182,0.20) 18px, rgba(244,114,182,0) 36px, rgba(244,114,182,0) 92px), repeating-linear-gradient(90deg, rgba(253,224,71,0) 0px, rgba(253,224,71,0.20) 22px, rgba(253,224,71,0) 44px, rgba(253,224,71,0) 120px), repeating-linear-gradient(90deg, rgba(125,211,252,0) 0px, rgba(125,211,252,0.20) 26px, rgba(125,211,252,0) 52px, rgba(125,211,252,0) 150px); animation: fx-music-equalizer-beat 7s ease-in-out infinite; } @keyframes fx-music-equalizer-beat { 0%, 100% { background-position: 0 0, 0 0, 0 0; } 50% { background-position: 16px 0, -20px 0, 24px 0; } }

/* neurocad/core/engine/lib/word/editor/effects/fx/fx-equalizer-bars.css */

/*
 * Пульсирующий эквалайзер по низу блока.
 *
 * Два слоя полосок (::before — узкие, ::after — широкие), оба
 * «пружинят» по высоте через transform: scaleY(...) с разными
 * duration (9s / 14s), чтобы фазы не совпадали и картинка жила.
 *
 * Цвета берутся из темы: --theme-primary, --theme-accent,
 * --theme-secondary, с fallback, если переменные не заданы.
 *
 * Полоски крепятся к низу блока (bottom: 0), высота 72%, поверх
 * фона — opacity 0.45 / 0.3. Контент поднимается на z-index: 1
 * через `> *`, слои идут на z-index: 0.
 */

.core-engine-lib-word-blocks .fx-equalizer-bars {
    position: relative;
    overflow-x: hidden;
    overflow-y: hidden;
    isolation: isolate;
}

.core-engine-lib-word-blocks .fx-equalizer-bars > * {
    position: relative;
    z-index: 1;
}

.core-engine-lib-word-blocks .fx-equalizer-bars::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72%;
    z-index: 0;
    pointer-events: none;
    transform-origin: center bottom;
    mask-repeat: repeat;
    opacity: 0.45;
    background-image: linear-gradient(
        90deg,
        var(--theme-primary, #cfe0ff) 0%,
        var(--theme-accent, #ffe4f3) 50%,
        var(--theme-primary, #cfe0ff) 100%
    );
    mask-image: repeating-linear-gradient(
        90deg,
        rgb(0, 0, 0) 0px,
        rgb(0, 0, 0) 36px,
        transparent 36px,
        transparent 52px
    );
    -webkit-mask-image: repeating-linear-gradient(
        90deg,
        rgb(0, 0, 0) 0px,
        rgb(0, 0, 0) 36px,
        transparent 36px,
        transparent 52px
    );
    animation: fx-equalizer-bars-a 9s ease-in-out infinite;
}

.core-engine-lib-word-blocks .fx-equalizer-bars::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72%;
    z-index: 0;
    pointer-events: none;
    transform-origin: center bottom;
    mask-repeat: repeat;
    opacity: 0.3;
    background-image: linear-gradient(
        90deg,
        var(--theme-accent, #e7f6ff) 0%,
        var(--theme-secondary, #ffffff) 50%,
        var(--theme-accent, #e7f6ff) 100%
    );
    mask-image: repeating-linear-gradient(
        90deg,
        transparent 0px,
        transparent 26px,
        rgb(0, 0, 0) 26px,
        rgb(0, 0, 0) 64px,
        transparent 64px,
        transparent 80px
    );
    -webkit-mask-image: repeating-linear-gradient(
        90deg,
        transparent 0px,
        transparent 26px,
        rgb(0, 0, 0) 26px,
        rgb(0, 0, 0) 64px,
        transparent 64px,
        transparent 80px
    );
    animation: fx-equalizer-bars-b 14s ease-in-out infinite;
}

@keyframes fx-equalizer-bars-a {
    0%,   100% { transform: scaleY(0.22); }
    18%        { transform: scaleY(0.68); }
    34%        { transform: scaleY(0.38); }
    52%        { transform: scaleY(0.92); }
    70%        { transform: scaleY(0.30); }
    86%        { transform: scaleY(0.58); }
}

@keyframes fx-equalizer-bars-b {
    0%,   100% { transform: scaleY(0.85); }
    22%        { transform: scaleY(0.28); }
    40%        { transform: scaleY(0.62); }
    58%        { transform: scaleY(0.20); }
    76%        { transform: scaleY(0.74); }
    90%        { transform: scaleY(0.42); }
}

.core-engine-lib-word-blocks .fx-faint-equalizer-lines { background-image: repeating-linear-gradient(90deg, rgba(71,85,105,0.10) 0 6px, transparent 6px 20px), repeating-linear-gradient(0deg, rgba(255,255,255,1) 0 8px, rgba(255,255,255,0.05) 8px 40px); background-size: 20px 100%, 100% 40px; -webkit-mask-image: radial-gradient(ellipse at center, #000 25%, transparent 100%); mask-image: radial-gradient(ellipse at center, #000 25%, transparent 100%); animation: fx-faint-equalizer-lines-beat 2.4s linear infinite; } @keyframes fx-faint-equalizer-lines-beat { from { background-position: 0 0, 0 0; } to { background-position: 0 0, 0 -40px; } }

.core-engine-lib-word-blocks .fx-vinyl-grooves { position: relative; overflow: hidden; } .core-engine-lib-word-blocks .fx-vinyl-grooves::before { content: ""; position: absolute; top: 50%; left: 50%; width: 220%; height: 220%; transform: translate(-50%, -50%); background-image: repeating-radial-gradient(circle at 50% 50%, #94a3b8 0 1px, transparent 1px 13px); opacity: 0.16; pointer-events: none; animation: fx-vinyl-grooves-spin 28s linear infinite; } @keyframes fx-vinyl-grooves-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }

* { box-sizing: border-box; } body {margin: 0;}');
INSERT INTO "pages" ("id", "nav_id", "datetime", "title", "description", "logo", "content", "content_json", "is_active", "is_delete", "created_at", "updated_at", "rss_yandex_id", "is_template", "template_id", "css") VALUES (4, 2, '2026-09-27 15:14:04.196665', 'Статья 13', '', '', NULL, NULL, 1, 1, '2026-09-27 15:14:04.196706', '2026-09-27 15:14:11.095120', NULL, 0, NULL, NULL);
INSERT INTO "pages" ("id", "nav_id", "datetime", "title", "description", "logo", "content", "content_json", "is_active", "is_delete", "created_at", "updated_at", "rss_yandex_id", "is_template", "template_id", "css") VALUES (5, 3, '2026-09-27 15:28:12.443496', 'Точка стрижки', 'Парикмахерская, где вас стригут по-настоящему', '/static/core/engine/lib/word/editor/images/files/img-006b7f62.svg', '<body><section data-block="core-hero" id="iwzn" class="section hero fx-soft-diagonal-hatch"><div class="container hero__inner"><h1 class="h1 hero__title">Точка стрижки — парикмахерская, где вас стригут по-настоящему</h1><p class="lead hero__lead">Стрижки, оформление бороды и уход за волосами от опытных мастеров. Работаем по записи и без неё, объясняем каждое действие и подбираем форму под ваш образ жизни.</p><a href="page:booking" class="btn hero__btn">Записаться онлайн</a></div></section><section data-block="core-features" id="imu7k" class="section features"><div class="container"><h2 class="h2 features__title">Почему выбирают «Точку стрижки»</h2><div class="grid grid--3 features__grid"><div class="card features__item"><h3 class="card__title">Опытные мастера</h3><p class="card__text">Барберы со стажем от пяти лет регулярно проходят внутреннее обучение и следят за новыми техниками.</p></div><div class="card features__item"><h3 class="card__title">Точный результат</h3><p class="card__text">Форма обсуждается до начала работы: учитываем тип волос, черты лица и ваши привычки в укладке.</p></div><div class="card features__item"><h3 class="card__title">Чистота и стерильность</h3><p class="card__text">Инструменты дезинфицируются после каждого гостя, одноразовые материалы уже включены в стоимость.</p></div></div></div></section><section data-block="core-text-image" id="id8ib" class="section text-image fx-soft-diagonal-hatch"><div class="container"><div class="grid grid--2 text-image__grid"><div class="text-image__text"><h2 class="h2">Барбершоп с вниманием к деталям</h2><p class="text">В «Точке стрижки» шесть рабочих мест, отдельная зона бритья и лаунж-зона, где можно подождать с кофе. Мы не работаем по шаблону: каждая стрижка начинается с разговора о ваших пожеланиях и заканчивается укладкой.</p><p class="text text--muted">Запись занимает меньше минуты: выберите мастера, услугу и удобное время — подтверждение придёт в течение пятнадцати минут.</p></div><div class="text-image__media"><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Барбер за работой в парикмахерской «Точка стрижки»" class="image"><rect x="300" y="70" width="200" height="310" rx="18" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6"></rect><rect x="620" y="330" width="150" height="62" rx="12" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6"></rect><rect x="638" y="286" width="20" height="44" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="670" y="268" width="20" height="62" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="702" y="294" width="20" height="36" rx="6" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="386" y="460" width="28" height="78" fill="var(--theme-accent, #3b82f6)"></rect><rect x="328" y="536" width="144" height="18" rx="9" fill="var(--theme-accent, #3b82f6)"></rect><rect x="342" y="240" width="116" height="182" rx="22" fill="var(--theme-accent, #3b82f6)"></rect><rect x="318" y="406" width="164" height="58" rx="16" fill="var(--theme-accent, #3b82f6)"></rect><rect x="356" y="250" width="88" height="166" rx="32" fill="var(--theme-text, #1e293b)"></rect><circle cx="400" cy="214" r="36" fill="var(--theme-text, #1e293b)"></circle><rect x="176" y="196" width="80" height="256" rx="32" fill="var(--theme-text, #1e293b)"></rect><circle cx="216" cy="166" r="32" fill="var(--theme-text, #1e293b)"></circle><line x1="248" y1="248" x2="344" y2="198" stroke="var(--theme-text, #1e293b)" stroke-width="24" stroke-linecap="round"></line><line x1="366" y1="192" x2="416" y2="158" stroke="var(--theme-accent, #3b82f6)" stroke-width="8" stroke-linecap="round"></line><line x1="366" y1="158" x2="416" y2="192" stroke="var(--theme-accent, #3b82f6)" stroke-width="8" stroke-linecap="round"></line><circle cx="360" cy="198" r="11" fill="var(--theme-accent, #3b82f6)"></circle><circle cx="360" cy="152" r="11" fill="var(--theme-accent, #3b82f6)"></circle></svg></div></div></div></section><section id="iv7sl" class="section"><div class="container"><ul data-block="core-list-check" class="list list--check"><li>Консультация мастера и обсуждение формы до начала стрижки</li><li>Мытьё головы и укладка уже включены в стоимость услуги</li><li>Дезинфекция инструментов и одноразовые материалы для каждого гостя</li></ul></div></section><section data-block="core-steps" id="ir636" class="section steps"><div class="container"><h2 class="h2 steps__title">Как записаться</h2><div class="grid grid--3 steps__grid"><div class="steps__item"><div class="steps__num">1</div><h3 class="h3 steps__item-title">Выберите услугу</h3><p class="text text--muted">Посмотрите прайс и определитесь, что нужно: стрижка, оформление бороды или комплексный уход.</p></div><div class="steps__item"><div class="steps__num">2</div><h3 class="h3 steps__item-title">Забронируйте время</h3><p class="text text--muted">Оставьте заявку на сайте или позвоните — администратор подберёт удобный слот и мастера.</p></div><div class="steps__item"><div class="steps__num">3</div><h3 class="h3 steps__item-title">Приходите в барбершоп</h3><p class="text text--muted">Мастер уточнит пожелания, выполнит работу и подскажет, как поддерживать форму дома.</p></div></div></div></section><section data-block="core-gallery" id="iuwuf" class="section gallery fx-soft-diagonal-hatch"><div class="container"><h2 class="h2 gallery__title">Наши работы</h2><div class="grid grid--auto gallery__grid"><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Мужская стрижка с короткими висками" class="image gallery__item"><rect x="322" y="356" width="76" height="106" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="7"></rect><path d="M190 566 C200 476 262 442 360 442 C458 442 520 476 530 566 Z" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="7" stroke-linejoin="round"></path><ellipse cx="360" cy="270" rx="105" ry="128" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="7"></ellipse><path d="M258 268 h30 M258 292 h26 M264 316 h20" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6" stroke-linecap="round" fill="none"></path><path d="M432 268 h30 M436 292 h26 M436 316 h20" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6" stroke-linecap="round" fill="none"></path><path d="M255 248 C252 165 300 136 360 136 C420 136 468 165 465 248 C458 214 418 196 360 196 C302 196 262 214 255 248 Z" fill="var(--theme-text, #1e293b)"></path><g transform="rotate(-25 630 470)"><rect x="580" y="440" width="100" height="62" rx="20" fill="var(--theme-accent, #3b82f6)"></rect><path d="M616 456 h48 M616 470 h48 M616 484 h48" stroke="var(--theme-bg-soft, #f1f5f9)" stroke-width="5" stroke-linecap="round" fill="none"></path><rect x="558" y="452" width="26" height="38" rx="5" fill="var(--theme-text, #1e293b)"></rect><path d="M565 458 v26 M572 458 v26 M579 458 v26" stroke="var(--theme-accent, #3b82f6)" stroke-width="3" fill="none"></path></g></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Оформление бороды в барбершопе" class="image gallery__item"><rect x="450" y="205" width="30" height="205" rx="15" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="290" y="352" width="18" height="55" rx="9" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="472" y="352" width="18" height="55" rx="9" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="378" y="426" width="24" height="70" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="330" y="496" width="120" height="16" rx="8" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="300" y="400" width="180" height="26" rx="13" fill="var(--theme-text-muted, #94a3b8)"></rect><rect x="325" y="245" width="130" height="162" rx="34" fill="var(--theme-text, #1e293b)"></rect><circle cx="390" cy="200" r="58" fill="var(--theme-text, #1e293b)"></circle><path d="M 332 200 C 328 262 354 294 390 294 C 426 294 452 262 448 200 C 438 244 420 256 390 256 C 360 256 342 244 332 200 Z" fill="var(--theme-accent, #3b82f6)"></path><g transform="translate(505,295) rotate(20)" fill="var(--theme-text, #1e293b)"><rect x="-7" y="-115" width="14" height="120" rx="7" transform="rotate(-10)"></rect><rect x="-7" y="0" width="14" height="70" rx="7" transform="rotate(-10)"></rect><rect x="-7" y="-115" width="14" height="120" rx="7" transform="rotate(10)"></rect><rect x="-7" y="0" width="14" height="70" rx="7" transform="rotate(10)"></rect><circle cx="12" cy="69" r="12" fill="none" stroke="var(--theme-text, #1e293b)" stroke-width="9"></circle><circle cx="-12" cy="69" r="12" fill="none" stroke="var(--theme-text, #1e293b)" stroke-width="9"></circle><circle cx="0" cy="0" r="9" fill="var(--theme-accent, #3b82f6)"></circle></g></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Классическая стрижка ножницами" class="image gallery__item"><g stroke="var(--theme-accent, #3b82f6)" stroke-linecap="round" stroke-linejoin="round" fill="none"><polygon points="300,80 415,293 385,307" fill="var(--theme-accent, #3b82f6)" stroke-width="5"></polygon><polygon points="500,80 385,307 415,293" fill="var(--theme-accent, #3b82f6)" stroke-width="5"></polygon><path d="M400 300 L467 448" stroke-width="13"></path><path d="M400 300 L333 448" stroke-width="13"></path><circle cx="477" cy="470" r="30" stroke-width="13"></circle><circle cx="323" cy="470" r="30" stroke-width="13"></circle></g><circle cx="400" cy="300" r="12" fill="var(--theme-text, #1e293b)"></circle><g stroke="var(--theme-text-muted, #94a3b8)" stroke-width="6" fill="none" stroke-linecap="round"><path d="M400 40 C 432 88 368 128 400 172 C 428 210 372 240 400 276"></path><path d="M556 392 C 582 426 552 456 578 490"></path><path d="M636 440 C 662 474 632 504 658 538"></path></g></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Укладка волос после стрижки" class="image gallery__item"><rect x="370" y="380" width="60" height="110" rx="24" fill="var(--theme-text-muted, #94a3b8)"></rect><path d="M 175 600 C 175 500 265 445 400 445 C 535 445 625 500 625 600 Z" fill="var(--theme-text, #1e293b)"></path><circle cx="400" cy="290" r="125" fill="var(--theme-text-muted, #94a3b8)"></circle><path d="M 272 300 C 264 180 320 130 400 130 C 480 130 536 180 528 300 C 506 290 500 264 474 276 C 448 288 434 262 406 274 C 374 288 336 306 296 294 C 284 291 276 302 272 300 Z" fill="var(--theme-accent, #3b82f6)"></path><path d="M 516 200 C 576 174 604 212 654 192" fill="none" stroke="var(--theme-accent, #3b82f6)" stroke-width="12" stroke-linecap="round"></path><path d="M 524 254 C 588 248 610 284 662 266" fill="none" stroke="var(--theme-accent, #3b82f6)" stroke-width="12" stroke-linecap="round"></path><path d="M 512 322 C 570 340 596 308 646 324" fill="none" stroke="var(--theme-accent, #3b82f6)" stroke-width="12" stroke-linecap="round"></path><rect x="40" y="260" width="140" height="76" rx="32" fill="var(--theme-text, #1e293b)"></rect><path d="M 175 272 L 235 258 L 235 338 L 175 320 Z" fill="var(--theme-text, #1e293b)"></path><rect x="90" y="330" width="40" height="95" rx="16" fill="var(--theme-text, #1e293b)"></rect><path d="M 242 278 C 252 268 262 268 270 274" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="8" stroke-linecap="round"></path><path d="M 246 300 C 256 292 264 292 272 300" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="8" stroke-linecap="round"></path><path d="M 242 322 C 252 332 262 332 270 326" fill="none" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="8" stroke-linecap="round"></path></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Бритьё опасной бритвой" class="image gallery__item"><path d="M180 530 L200 470 C190 410 175 370 175 300 C175 185 245 120 330 120 C380 120 405 138 412 165 C416 182 408 196 402 208 C396 220 392 230 395 240 L418 270 L396 292 C390 300 394 308 402 312 L398 320 C408 324 410 332 402 342 C394 352 390 364 390 378 C390 415 370 448 336 470 C320 478 310 486 306 500 L306 530 Z" fill="var(--theme-text-muted, #94a3b8)"></path><g transform="translate(600,185) rotate(151) scale(0.68)"><path d="M-6 -15 L-168 -15 Q-190 -15 -190 0 Q-190 15 -168 15 L-6 15 Z" fill="var(--theme-accent, #3b82f6)" stroke="var(--theme-text, #1e293b)" stroke-width="5" stroke-linejoin="round"></path><path d="M0 -16 L230 -20 C248 -20 254 -10 256 0 C254 10 246 16 230 18 L0 16 Z" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text, #1e293b)" stroke-width="5" stroke-linejoin="round"></path><path d="M10 -9 L222 -12" fill="none" stroke="var(--theme-text, #1e293b)" stroke-width="3" stroke-linecap="round"></path><circle cx="0" cy="0" r="8" fill="var(--theme-text, #1e293b)"></circle></g></svg><svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Зал парикмахерской «Точка стрижки»" class="image gallery__item"><rect x="170" y="80" width="200" height="230" rx="18" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="8"></rect><rect x="450" y="120" width="170" height="190" rx="18" fill="var(--theme-bg-soft, #f1f5f9)" stroke="var(--theme-text-muted, #94a3b8)" stroke-width="8"></rect><rect x="220" y="330" width="100" height="110" rx="18" fill="var(--theme-accent, #3b82f6)"></rect><rect x="195" y="425" width="150" height="34" rx="14" fill="var(--theme-accent, #3b82f6)"></rect><rect x="258" y="459" width="24" height="55" fill="var(--theme-text-muted, #94a3b8)"></rect><ellipse cx="270" cy="520" rx="65" ry="14" fill="var(--theme-text-muted, #94a3b8)"></ellipse><rect x="497" y="330" width="80" height="90" rx="16" fill="var(--theme-accent, #3b82f6)"></rect><rect x="478" y="412" width="118" height="30" rx="13" fill="var(--theme-accent, #3b82f6)"></rect><rect x="526" y="442" width="20" height="50" fill="var(--theme-text-muted, #94a3b8)"></rect><ellipse cx="536" cy="498" rx="52" ry="12" fill="var(--theme-text-muted, #94a3b8)"></ellipse></svg></div></div></section><section class="section"><div class="container"><blockquote data-block="core-quote" class="quote">Хорошая стрижка — это когда гость выходит из зала с уверенностью, что вернётся снова.</blockquote></div></section><section data-block="core-faq" class="section faq"><div class="container"><h2 class="h2 faq__title">Частые вопросы</h2><div class="faq__list"><div class="faq__item"><h3 class="h3 faq__question">Нужно ли записываться заранее?</h3><p class="text text--muted faq__answer">Да, запись гарантирует визит к нужному мастеру в удобное время. Без предварительной записи принимаем, если есть свободное окно.</p></div><div class="faq__item"><h3 class="h3 faq__question">Сколько длится визит?</h3><p class="text text--muted faq__answer">Мужская стрижка занимает от 40 до 60 минут, оформление бороды — около 30 минут. Комплексные услуги обсуждаются при записи.</p></div><div class="faq__item"><h3 class="h3 faq__question">Можно ли перенести или отменить запись?</h3><p class="text text--muted faq__answer">Да, перенести визит можно не позднее чем за три часа до начала — позвоните администратору или напишите нам.</p></div></div></div></section><section data-block="core-cta" id="it0kdj" class="section cta fx-soft-diagonal-hatch"><div class="container cta__inner"><h2 class="h2 cta__title">Запишитесь в «Точку стрижки»</h2><p class="text cta__text">Выберите удобные дату и время — администратор подтвердит запись в течение пятнадцати минут.</p><a href="page:booking" class="btn cta__btn">Записаться онлайн</a></div></section><section data-block="core-contacts" class="section contacts"><div class="container"><h2 class="h2 contacts__title">Контакты</h2><div class="grid grid--3 contacts__grid"><div class="contacts__item"><div class="contacts__label">Адрес</div><div class="contacts__value">г. Москва, ул. Садовая, д. 12, 1 этаж</div></div><div class="contacts__item"><div class="contacts__label">Телефон</div><div class="contacts__value">+7 (495) 123-45-67</div></div><div class="contacts__item"><div class="contacts__label">Email</div><div class="contacts__value">hello@tochka-strizhki.ru</div></div></div></div></section><footer data-block="core-footer" class="section footer"><div class="container footer__inner"><div class="footer__brand">© Парикмахерская «Точка стрижки», 2024</div><nav class="footer__nav"><a href="page:index" class="footer__link">Главная</a><a href="page:services" class="footer__link">Услуги</a><a href="page:contacts" class="footer__link">Контакты</a></nav></div></footer></body>', '{"assets":[],"styles":[],"pages":[{"frames":[{"component":{"type":"wrapper","stylable":["background","background-color","background-image","background-repeat","background-attachment","background-position","background-size"],"components":[{"tagName":"section","classes":["section","hero","fx-soft-diagonal-hatch"],"attributes":{"data-block":"core-hero","id":"iwzn"},"components":[{"classes":["container","hero__inner"],"components":[{"tagName":"h1","type":"text","classes":["h1","hero__title"],"components":[{"type":"textnode","content":"Точка стрижки — парикмахерская, где вас стригут по-настоящему"}]},{"tagName":"p","type":"text","classes":["lead","hero__lead"],"components":[{"type":"textnode","content":"Стрижки, оформление бороды и уход за волосами от опытных мастеров. Работаем по записи и без неё, объясняем каждое действие и подбираем форму под ваш образ жизни."}]},{"type":"link","classes":["btn","hero__btn"],"attributes":{"href":"page:booking"},"components":[{"type":"textnode","content":"Записаться онлайн"}]}]}]},{"tagName":"section","classes":["section","features"],"attributes":{"data-block":"core-features","id":"imu7k"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","features__title"],"components":[{"type":"textnode","content":"Почему выбирают «Точку стрижки»"}]},{"classes":["grid","grid--3","features__grid"],"components":[{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Опытные мастера"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Барберы со стажем от пяти лет регулярно проходят внутреннее обучение и следят за новыми техниками."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Точный результат"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Форма обсуждается до начала работы: учитываем тип волос, черты лица и ваши привычки в укладке."}]}]},{"classes":["card","features__item"],"components":[{"tagName":"h3","type":"text","classes":["card__title"],"components":[{"type":"textnode","content":"Чистота и стерильность"}]},{"tagName":"p","type":"text","classes":["card__text"],"components":[{"type":"textnode","content":"Инструменты дезинфицируются после каждого гостя, одноразовые материалы уже включены в стоимость."}]}]}]}]}]},{"tagName":"section","classes":["section","text-image","fx-soft-diagonal-hatch"],"attributes":{"data-block":"core-text-image","id":"id8ib"},"components":[{"classes":["container"],"components":[{"classes":["grid","grid--2","text-image__grid"],"components":[{"classes":["text-image__text"],"components":[{"tagName":"h2","type":"text","classes":["h2"],"components":[{"type":"textnode","content":"Барбершоп с вниманием к деталям"}]},{"tagName":"p","type":"text","classes":["text"],"components":[{"type":"textnode","content":"В «Точке стрижки» шесть рабочих мест, отдельная зона бритья и лаунж-зона, где можно подождать с кофе. Мы не работаем по шаблону: каждая стрижка начинается с разговора о ваших пожеланиях и заканчивается укладкой."}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Запись занимает меньше минуты: выберите мастера, услугу и удобное время — подтверждение придёт в течение пятнадцати минут."}]}]},{"classes":["text-image__media"],"components":[{"type":"svg","resizable":{"ratioDefault":true},"classes":["image"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Барбер за работой в парикмахерской «Точка стрижки»"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"300","y":"70","width":"200","height":"310","rx":"18","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"620","y":"330","width":"150","height":"62","rx":"12","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"638","y":"286","width":"20","height":"44","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"670","y":"268","width":"20","height":"62","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"702","y":"294","width":"20","height":"36","rx":"6","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"386","y":"460","width":"28","height":"78","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"328","y":"536","width":"144","height":"18","rx":"9","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"342","y":"240","width":"116","height":"182","rx":"22","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"318","y":"406","width":"164","height":"58","rx":"16","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"356","y":"250","width":"88","height":"166","rx":"32","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"214","r":"36","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"176","y":"196","width":"80","height":"256","rx":"32","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"216","cy":"166","r":"32","fill":"var(--theme-text, #1e293b)"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"248","y1":"248","x2":"344","y2":"198","stroke":"var(--theme-text, #1e293b)","stroke-width":"24","stroke-linecap":"round"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"366","y1":"192","x2":"416","y2":"158","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"8","stroke-linecap":"round"}},{"tagName":"line","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x1":"366","y1":"158","x2":"416","y2":"192","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"8","stroke-linecap":"round"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"360","cy":"198","r":"11","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"360","cy":"152","r":"11","fill":"var(--theme-accent, #3b82f6)"}}]}]}]}]}]},{"tagName":"section","classes":["section"],"attributes":{"id":"iv7sl"},"components":[{"classes":["container"],"components":[{"tagName":"ul","classes":["list","list--check"],"attributes":{"data-block":"core-list-check"},"components":[{"tagName":"li","type":"text","components":[{"type":"textnode","content":"Консультация мастера и обсуждение формы до начала стрижки"}]},{"tagName":"li","type":"text","components":[{"type":"textnode","content":"Мытьё головы и укладка уже включены в стоимость услуги"}]},{"tagName":"li","type":"text","components":[{"type":"textnode","content":"Дезинфекция инструментов и одноразовые материалы для каждого гостя"}]}]}]}]},{"tagName":"section","classes":["section","steps"],"attributes":{"data-block":"core-steps","id":"ir636"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","steps__title"],"components":[{"type":"textnode","content":"Как записаться"}]},{"classes":["grid","grid--3","steps__grid"],"components":[{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"1"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Выберите услугу"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Посмотрите прайс и определитесь, что нужно: стрижка, оформление бороды или комплексный уход."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"2"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Забронируйте время"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Оставьте заявку на сайте или позвоните — администратор подберёт удобный слот и мастера."}]}]},{"classes":["steps__item"],"components":[{"type":"text","classes":["steps__num"],"components":[{"type":"textnode","content":"3"}]},{"tagName":"h3","type":"text","classes":["h3","steps__item-title"],"components":[{"type":"textnode","content":"Приходите в барбершоп"}]},{"tagName":"p","type":"text","classes":["text","text--muted"],"components":[{"type":"textnode","content":"Мастер уточнит пожелания, выполнит работу и подскажет, как поддерживать форму дома."}]}]}]}]}]},{"tagName":"section","classes":["section","gallery","fx-soft-diagonal-hatch"],"attributes":{"data-block":"core-gallery","id":"iuwuf"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","gallery__title"],"components":[{"type":"textnode","content":"Наши работы"}]},{"classes":["grid","grid--auto","gallery__grid"],"components":[{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Мужская стрижка с короткими висками"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"322","y":"356","width":"76","height":"106","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"7"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M190 566 C200 476 262 442 360 442 C458 442 520 476 530 566 Z","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"7","stroke-linejoin":"round"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"360","cy":"270","rx":"105","ry":"128","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"7"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M258 268 h30 M258 292 h26 M264 316 h20","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6","stroke-linecap":"round","fill":"none"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M432 268 h30 M436 292 h26 M436 316 h20","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6","stroke-linecap":"round","fill":"none"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M255 248 C252 165 300 136 360 136 C420 136 468 165 465 248 C458 214 418 196 360 196 C302 196 262 214 255 248 Z","fill":"var(--theme-text, #1e293b)"}},{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"transform":"rotate(-25 630 470)"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"580","y":"440","width":"100","height":"62","rx":"20","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M616 456 h48 M616 470 h48 M616 484 h48","stroke":"var(--theme-bg-soft, #f1f5f9)","stroke-width":"5","stroke-linecap":"round","fill":"none"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"558","y":"452","width":"26","height":"38","rx":"5","fill":"var(--theme-text, #1e293b)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M565 458 v26 M572 458 v26 M579 458 v26","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"3","fill":"none"}}]}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Оформление бороды в барбершопе"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"450","y":"205","width":"30","height":"205","rx":"15","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"290","y":"352","width":"18","height":"55","rx":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"472","y":"352","width":"18","height":"55","rx":"9","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"378","y":"426","width":"24","height":"70","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"330","y":"496","width":"120","height":"16","rx":"8","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"300","y":"400","width":"180","height":"26","rx":"13","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"325","y":"245","width":"130","height":"162","rx":"34","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"390","cy":"200","r":"58","fill":"var(--theme-text, #1e293b)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 332 200 C 328 262 354 294 390 294 C 426 294 452 262 448 200 C 438 244 420 256 390 256 C 360 256 342 244 332 200 Z","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"transform":"translate(505,295) rotate(20)","fill":"var(--theme-text, #1e293b)"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"-7","y":"-115","width":"14","height":"120","rx":"7","transform":"rotate(-10)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"-7","y":"0","width":"14","height":"70","rx":"7","transform":"rotate(-10)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"-7","y":"-115","width":"14","height":"120","rx":"7","transform":"rotate(10)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"-7","y":"0","width":"14","height":"70","rx":"7","transform":"rotate(10)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"12","cy":"69","r":"12","fill":"none","stroke":"var(--theme-text, #1e293b)","stroke-width":"9"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"-12","cy":"69","r":"12","fill":"none","stroke":"var(--theme-text, #1e293b)","stroke-width":"9"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"0","cy":"0","r":"9","fill":"var(--theme-accent, #3b82f6)"}}]}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Классическая стрижка ножницами"},"components":[{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"stroke":"var(--theme-accent, #3b82f6)","stroke-linecap":"round","stroke-linejoin":"round","fill":"none"},"components":[{"tagName":"polygon","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"points":"300,80 415,293 385,307","fill":"var(--theme-accent, #3b82f6)","stroke-width":"5"}},{"tagName":"polygon","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"points":"500,80 385,307 415,293","fill":"var(--theme-accent, #3b82f6)","stroke-width":"5"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M400 300 L467 448","stroke-width":"13"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M400 300 L333 448","stroke-width":"13"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"477","cy":"470","r":"30","stroke-width":"13"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"323","cy":"470","r":"30","stroke-width":"13"}}]},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"300","r":"12","fill":"var(--theme-text, #1e293b)"}},{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"6","fill":"none","stroke-linecap":"round"},"components":[{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M400 40 C 432 88 368 128 400 172 C 428 210 372 240 400 276"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M556 392 C 582 426 552 456 578 490"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M636 440 C 662 474 632 504 658 538"}}]}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Укладка волос после стрижки"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"370","y":"380","width":"60","height":"110","rx":"24","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 175 600 C 175 500 265 445 400 445 C 535 445 625 500 625 600 Z","fill":"var(--theme-text, #1e293b)"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"400","cy":"290","r":"125","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 272 300 C 264 180 320 130 400 130 C 480 130 536 180 528 300 C 506 290 500 264 474 276 C 448 288 434 262 406 274 C 374 288 336 306 296 294 C 284 291 276 302 272 300 Z","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 516 200 C 576 174 604 212 654 192","fill":"none","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"12","stroke-linecap":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 524 254 C 588 248 610 284 662 266","fill":"none","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"12","stroke-linecap":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 512 322 C 570 340 596 308 646 324","fill":"none","stroke":"var(--theme-accent, #3b82f6)","stroke-width":"12","stroke-linecap":"round"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"40","y":"260","width":"140","height":"76","rx":"32","fill":"var(--theme-text, #1e293b)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 175 272 L 235 258 L 235 338 L 175 320 Z","fill":"var(--theme-text, #1e293b)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"90","y":"330","width":"40","height":"95","rx":"16","fill":"var(--theme-text, #1e293b)"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 242 278 C 252 268 262 268 270 274","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"8","stroke-linecap":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 246 300 C 256 292 264 292 272 300","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"8","stroke-linecap":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M 242 322 C 252 332 262 332 270 326","fill":"none","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"8","stroke-linecap":"round"}}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Бритьё опасной бритвой"},"components":[{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M180 530 L200 470 C190 410 175 370 175 300 C175 185 245 120 330 120 C380 120 405 138 412 165 C416 182 408 196 402 208 C396 220 392 230 395 240 L418 270 L396 292 C390 300 394 308 402 312 L398 320 C408 324 410 332 402 342 C394 352 390 364 390 378 C390 415 370 448 336 470 C320 478 310 486 306 500 L306 530 Z","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"g","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"transform":"translate(600,185) rotate(151) scale(0.68)"},"components":[{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M-6 -15 L-168 -15 Q-190 -15 -190 0 Q-190 15 -168 15 L-6 15 Z","fill":"var(--theme-accent, #3b82f6)","stroke":"var(--theme-text, #1e293b)","stroke-width":"5","stroke-linejoin":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M0 -16 L230 -20 C248 -20 254 -10 256 0 C254 10 246 16 230 18 L0 16 Z","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text, #1e293b)","stroke-width":"5","stroke-linejoin":"round"}},{"tagName":"path","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"d":"M10 -9 L222 -12","fill":"none","stroke":"var(--theme-text, #1e293b)","stroke-width":"3","stroke-linecap":"round"}},{"tagName":"circle","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"0","cy":"0","r":"8","fill":"var(--theme-text, #1e293b)"}}]}]},{"type":"svg","resizable":{"ratioDefault":true},"classes":["image","gallery__item"],"attributes":{"viewBox":"0 0 800 600","xmlns":"http://www.w3.org/2000/svg","role":"img","aria-label":"Зал парикмахерской «Точка стрижки»"},"components":[{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"170","y":"80","width":"200","height":"230","rx":"18","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"450","y":"120","width":"170","height":"190","rx":"18","fill":"var(--theme-bg-soft, #f1f5f9)","stroke":"var(--theme-text-muted, #94a3b8)","stroke-width":"8"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"220","y":"330","width":"100","height":"110","rx":"18","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"195","y":"425","width":"150","height":"34","rx":"14","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"258","y":"459","width":"24","height":"55","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"270","cy":"520","rx":"65","ry":"14","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"497","y":"330","width":"80","height":"90","rx":"16","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"478","y":"412","width":"118","height":"30","rx":"13","fill":"var(--theme-accent, #3b82f6)"}},{"tagName":"rect","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"x":"526","y":"442","width":"20","height":"50","fill":"var(--theme-text-muted, #94a3b8)"}},{"tagName":"ellipse","type":"svg-in","resizable":{"ratioDefault":true},"attributes":{"cx":"536","cy":"498","rx":"52","ry":"12","fill":"var(--theme-text-muted, #94a3b8)"}}]}]}]}]},{"tagName":"section","classes":["section"],"components":[{"classes":["container"],"components":[{"tagName":"blockquote","type":"text","classes":["quote"],"attributes":{"data-block":"core-quote"},"components":[{"type":"textnode","content":"Хорошая стрижка — это когда гость выходит из зала с уверенностью, что вернётся снова."}]}]}]},{"tagName":"section","classes":["section","faq"],"attributes":{"data-block":"core-faq"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","faq__title"],"components":[{"type":"textnode","content":"Частые вопросы"}]},{"classes":["faq__list"],"components":[{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Нужно ли записываться заранее?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Да, запись гарантирует визит к нужному мастеру в удобное время. Без предварительной записи принимаем, если есть свободное окно."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Сколько длится визит?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Мужская стрижка занимает от 40 до 60 минут, оформление бороды — около 30 минут. Комплексные услуги обсуждаются при записи."}]}]},{"classes":["faq__item"],"components":[{"tagName":"h3","type":"text","classes":["h3","faq__question"],"components":[{"type":"textnode","content":"Можно ли перенести или отменить запись?"}]},{"tagName":"p","type":"text","classes":["text","text--muted","faq__answer"],"components":[{"type":"textnode","content":"Да, перенести визит можно не позднее чем за три часа до начала — позвоните администратору или напишите нам."}]}]}]}]}]},{"tagName":"section","classes":["section","cta","fx-soft-diagonal-hatch"],"attributes":{"data-block":"core-cta","id":"it0kdj"},"components":[{"classes":["container","cta__inner"],"components":[{"tagName":"h2","type":"text","classes":["h2","cta__title"],"components":[{"type":"textnode","content":"Запишитесь в «Точку стрижки»"}]},{"tagName":"p","type":"text","classes":["text","cta__text"],"components":[{"type":"textnode","content":"Выберите удобные дату и время — администратор подтвердит запись в течение пятнадцати минут."}]},{"type":"link","classes":["btn","cta__btn"],"attributes":{"href":"page:booking"},"components":[{"type":"textnode","content":"Записаться онлайн"}]}]}]},{"tagName":"section","classes":["section","contacts"],"attributes":{"data-block":"core-contacts"},"components":[{"classes":["container"],"components":[{"tagName":"h2","type":"text","classes":["h2","contacts__title"],"components":[{"type":"textnode","content":"Контакты"}]},{"classes":["grid","grid--3","contacts__grid"],"components":[{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Адрес"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"г. Москва, ул. Садовая, д. 12, 1 этаж"}]}]},{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Телефон"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"+7 (495) 123-45-67"}]}]},{"classes":["contacts__item"],"components":[{"type":"text","classes":["contacts__label"],"components":[{"type":"textnode","content":"Email"}]},{"type":"text","classes":["contacts__value"],"components":[{"type":"textnode","content":"hello@tochka-strizhki.ru"}]}]}]}]}]},{"tagName":"footer","classes":["section","footer"],"attributes":{"data-block":"core-footer"},"components":[{"classes":["container","footer__inner"],"components":[{"type":"text","classes":["footer__brand"],"components":[{"type":"textnode","content":"© Парикмахерская «Точка стрижки», 2024"}]},{"tagName":"nav","classes":["footer__nav"],"components":[{"type":"link","classes":["footer__link"],"attributes":{"href":"page:index"},"components":[{"type":"textnode","content":"Главная"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:services"},"components":[{"type":"textnode","content":"Услуги"}]},{"type":"link","classes":["footer__link"],"attributes":{"href":"page:contacts"},"components":[{"type":"textnode","content":"Контакты"}]}]}]}]}],"head":{"type":"head"},"docEl":{"tagName":"html"}},"id":"FwGolD44bWoDsInJ"}],"id":"qmTgruhJUbnThUVP"}],"symbols":[]}', 1, 0, '2026-09-27 15:28:12.443526', '2026-09-27 15:41:19.520294', NULL, 0, NULL, '/* app/core/engine/lib/word/editor/css/content.css */

/**
 * Content — theme variables + shared atoms + layout for CONTENT pages.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Uses ONLY --theme-* variables, defined at the top of this file.
 * Completely independent from base/css/00_variables.css (admin UI):
 * admin theme changes do NOT affect page content.
 *
 * Contents:
 *   THEME VARIABLES
 *     --theme-*                 all colors, fonts, radii, spacing
 *
 *   ATOMS
 *     .h1, .h2, .h3             headings
 *     .text, .text--muted, .text--center
 *     .lead                     intro paragraph
 *     .list, .list--check, .list--num
 *     .btn, .btn--ghost         buttons
 *     .card, .card__title, .card__text
 *     .badge, .quote, .image, .icon, .divider
 *
 *   LAYOUT
 *     .section                  vertical rhythm wrapper
 *     .container                centered max-width wrapper
 *     .grid, .grid--2/3/4/auto  base grids
 *     .col                      grid cell
 *
 * .flex-shell* lives in blocks/layout.css — it is block-specific
 * (only used by the flex-shell block).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   THEME VARIABLES — content
   ============================================ */

/*
 * Completely independent from base/css/00_variables.css (admin UI).
 * Admin theme changes do NOT affect these values.
 *
 * Scoped under .core-engine-lib-word-blocks — the same class sits
 * on the canvas <body> in the editor and on the article wrapper
 * on the public page.
 */
.core-engine-lib-word-blocks {

    /* ===== COLORS ===== */

    --theme-bg:             #ffffff;
    --theme-bg-subtle:      #f8fafc;
    --theme-bg-dark:        #0f172a;
    --theme-bg-hover:       #f1f5f9;

    --theme-text:           #1e293b;
    --theme-text-muted:     #64748b;
    --theme-text-invert:    #ffffff;

    --theme-accent:         #246eaa;
    --theme-accent-hover:   #1e5a8a;
    --theme-accent-soft:    #e0edf7;

    --theme-border:         #e2e8f0;
    --theme-border-strong:  #cbd5e1;

    --theme-success:        #16a34a;
    --theme-warning:        #d97706;
    --theme-danger:         #dc2626;

    /* ===== SHADOWS ===== */

    --theme-shadow-sm:  0 1px 3px rgba(15, 23, 42, 0.06);
    --theme-shadow-md:  0 4px 12px rgba(15, 23, 42, 0.08);
    --theme-shadow-lg:  0 12px 32px rgba(15, 23, 42, 0.12);

    /* ===== FONTS ===== */

    --theme-font-family:    ''Inter'', ''Golos Text'', sans-serif;
    --theme-font-size-xs:   0.75rem;
    --theme-font-size-sm:   0.875rem;
    --theme-font-size-base: 1rem;
    --theme-font-size-lg:   1.125rem;
    --theme-font-size-xl:   1.25rem;
    --theme-font-size-2xl:  1.5rem;
    --theme-font-size-3xl:  2rem;
    --theme-font-size-4xl:  2.5rem;

    --theme-font-weight-regular:  400;
    --theme-font-weight-medium:   500;
    --theme-font-weight-semibold: 600;
    --theme-font-weight-bold:     700;

    --theme-line-height-tight:  1.25;
    --theme-line-height-base:   1.6;
    --theme-line-height-loose:  1.8;

    /* ===== RADII ===== */

    --theme-radius-sm:   0.25rem;
    --theme-radius-md:   0.5rem;
    --theme-radius-lg:   0.75rem;
    --theme-radius-xl:   1rem;
    --theme-radius-pill: 9999px;

    /* ===== SPACING ===== */

    --theme-space-1:   0.25rem;
    --theme-space-2:   0.5rem;
    --theme-space-3:   0.75rem;
    --theme-space-4:   1rem;
    --theme-space-5:   1.25rem;
    --theme-space-6:   1.5rem;
    --theme-space-8:   2rem;
    --theme-space-10:  2.5rem;
    --theme-space-12:  3rem;
    --theme-space-16:  4rem;
    --theme-space-20:  5rem;

    --theme-space-section:  4rem;
    --theme-space-gutter:   1rem;
    --theme-space-grid:     1rem;

    /* ===== LAYOUT ===== */

    --theme-container-max:  75rem;
}


/* ============================================
   HEADINGS
   ============================================ */

.core-engine-lib-word-blocks .h1 {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-4xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.02em;
}

.core-engine-lib-word-blocks .h2 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-3xl);
    font-weight: var(--theme-font-weight-bold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
    letter-spacing: -0.01em;
}

.core-engine-lib-word-blocks .h3 {
    margin: 0 0 var(--theme-space-3);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-2xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}


/* ============================================
   TEXT
   ============================================ */

.core-engine-lib-word-blocks .text {
    margin: 0 0 var(--theme-space-4);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .text--muted {
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .text--center {
    text-align: center;
}

.core-engine-lib-word-blocks .text:last-child {
    margin-bottom: 0;
}


/* ============================================
   LEAD
   ============================================ */

.core-engine-lib-word-blocks .lead {
    margin: 0 0 var(--theme-space-5);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-regular);
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   LISTS
   ============================================ */

.core-engine-lib-word-blocks .list {
    margin: 0 0 var(--theme-space-4);
    padding-left: var(--theme-space-6);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .list li {
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .list li:last-child {
    margin-bottom: 0;
}

.core-engine-lib-word-blocks .list li::marker {
    color: var(--theme-accent);
}

.core-engine-lib-word-blocks .list--check {
    list-style: none;
    padding-left: 0;
}

.core-engine-lib-word-blocks .list--check li {
    position: relative;
    padding-left: var(--theme-space-6);
}

.core-engine-lib-word-blocks .list--check li::before {
    content: ''✓'';
    position: absolute;
    left: 0;
    top: 0;
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-bold);
}

.core-engine-lib-word-blocks .list--num {
    list-style: decimal;
}

.core-engine-lib-word-blocks .list--num li::marker {
    color: var(--theme-accent);
    font-weight: var(--theme-font-weight-semibold);
}


/* ============================================
   BUTTONS
   ============================================ */

.core-engine-lib-word-blocks .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-space-2);
    padding: var(--theme-space-3) var(--theme-space-6);
    border: 2px solid transparent;
    border-radius: var(--theme-radius-md);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    font-weight: var(--theme-font-weight-semibold);
    line-height: 1.2;
    text-decoration: none;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    background: var(--theme-accent);
    color: var(--theme-text-invert);
    border-color: var(--theme-accent);
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.core-engine-lib-word-blocks .btn:hover {
    background: var(--theme-accent-hover);
    border-color: var(--theme-accent-hover);
    color: var(--theme-text-invert);
}

.core-engine-lib-word-blocks .btn:active {
    transform: translateY(1px);
}

.core-engine-lib-word-blocks .btn--ghost {
    background: transparent;
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}

.core-engine-lib-word-blocks .btn--ghost:hover {
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    border-color: var(--theme-accent);
}


/* ============================================
   CARD
   ============================================ */

.core-engine-lib-word-blocks .card {
    padding: var(--theme-space-6);
    background: var(--theme-bg);
    border: 1px solid var(--theme-border);
    border-radius: var(--theme-radius-lg);
    box-shadow: var(--theme-shadow-sm);
}

.core-engine-lib-word-blocks .card__title {
    margin: 0 0 var(--theme-space-2);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-xl);
    font-weight: var(--theme-font-weight-semibold);
    line-height: var(--theme-line-height-tight);
    color: var(--theme-text);
}

.core-engine-lib-word-blocks .card__text {
    margin: 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-base);
    line-height: var(--theme-line-height-base);
    color: var(--theme-text-muted);
}


/* ============================================
   BADGE
   ============================================ */

.core-engine-lib-word-blocks .badge {
    display: inline-block;
    padding: var(--theme-space-1) var(--theme-space-3);
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    line-height: 1.4;
}


/* ============================================
   QUOTE
   ============================================ */

.core-engine-lib-word-blocks .quote {
    margin: var(--theme-space-6) 0;
    padding: var(--theme-space-4) var(--theme-space-5);
    border-left: 4px solid var(--theme-accent);
    background: var(--theme-bg-subtle);
    border-radius: 0 var(--theme-radius-md) var(--theme-radius-md) 0;
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-style: italic;
    line-height: var(--theme-line-height-loose);
    color: var(--theme-text-muted);
}


/* ============================================
   IMAGE
   ============================================ */

.core-engine-lib-word-blocks .image {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--theme-radius-md);
    margin: 0;
}


/* ============================================
   ICON
   ============================================ */

.core-engine-lib-word-blocks .icon {
    display: inline-block;
    width: 1.5em;
    height: 1.5em;
    vertical-align: middle;
    color: var(--theme-accent);
    flex-shrink: 0;
}


/* ============================================
   DIVIDER
   ============================================ */

.core-engine-lib-word-blocks .divider {
    margin: var(--theme-space-8) 0;
    border: none;
    height: 1px;
    background: var(--theme-border);
}


/* ============================================
   SECTION — vertical rhythm wrapper
   ============================================ */

.core-engine-lib-word-blocks .section {
    padding-top: var(--theme-space-section);
    padding-bottom: var(--theme-space-section);
}


/* ============================================
   CONTAINER — centered max-width wrapper
   ============================================ */

.core-engine-lib-word-blocks .container {
    width: 100%;
    max-width: var(--theme-container-max);
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--theme-space-gutter);
    padding-right: var(--theme-space-gutter);
    box-sizing: border-box;
}


/* ============================================
   GRID — base
   ============================================ */

.core-engine-lib-word-blocks .grid {
    display: grid;
    gap: var(--theme-space-grid);
}

.core-engine-lib-word-blocks .grid--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.core-engine-lib-word-blocks .grid--auto {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}


/* ============================================
   COLUMN — grid cell
   ============================================ */

/*
 * Minimal cell: only prevents overflow. Padding, background, border
 * are set per block (e.g. .card, .col--tile were removed on purpose).
 */
.core-engine-lib-word-blocks .col {
    min-width: 0;
}


/* ============================================
   GRID — responsive fallback
   ============================================ */

@media (max-width: 768px) {
    .core-engine-lib-word-blocks .grid--2,
    .core-engine-lib-word-blocks .grid--3,
    .core-engine-lib-word-blocks .grid--4 {
        grid-template-columns: minmax(0, 1fr);
    }
}

/* app/core/engine/lib/word/editor/blocks/ready.css */

/**
 * Ready — styles for the "Секции" (sections) blocks.
 *
 * Loaded BOTH in editor (GrapesJS canvas) and on public pages.
 * All selectors are scoped under .core-engine-lib-word-blocks.
 *
 * Covers section-specific classes from blocks/ready.js:
 *   - .hero, .hero__inner, .hero__title, .hero__lead, .hero__btn
 *   - .features, .features__title, .features__grid, .features__item
 *   - .steps, .steps__title, .steps__grid, .steps__item, .steps__num
 *   - .text-image, .text-image__grid, .text-image__text, .text-image__media
 *   - .image-text, .image-text__grid, .image-text__text, .image-text__media
 *   - .gallery, .gallery__title, .gallery__grid, .gallery__item
 *   - .faq, .faq__title, .faq__list, .faq__item, .faq__question, .faq__answer
 *   - .cta, .cta__inner, .cta__title, .cta__text, .cta__btn
 *   - .contacts, .contacts__title, .contacts__grid, .contacts__item,
 *     .contacts__label, .contacts__value
 *   - .footer, .footer__inner, .footer__brand, .footer__nav, .footer__link
 *
 * Shared atom classes (.h1, .h2, .text, .lead, .btn, .card, .image)
 * and layout classes (.section, .container, .grid) live in
 * editor/css/content.css — they are loaded globally.
 *
 * Uses ONLY --theme-* variables (see theme.css).
 *
 * Rules:
 *   - Never change existing class rules after release — only add
 *     new classes. Values come from --theme-* and can be changed
 *     centrally without breaking pages.
 */


/* ============================================
   HERO — .hero
   ============================================ */

.core-engine-lib-word-blocks .hero__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .hero__title {
    margin: 0;
    max-width: 48rem;
}

.core-engine-lib-word-blocks .hero__lead {
    margin: 0;
    max-width: 40rem;
}

.core-engine-lib-word-blocks .hero__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   FEATURES — .features
   ============================================ */

.core-engine-lib-word-blocks .features__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .features__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .features__item {
    /* uses .card from content.css */
    height: 100%;
}


/* ============================================
   STEPS — .steps
   ============================================ */

.core-engine-lib-word-blocks .steps__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .steps__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .steps__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--theme-radius-pill);
    background: var(--theme-accent-soft);
    color: var(--theme-accent);
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-bold);
    margin-bottom: var(--theme-space-2);
}

.core-engine-lib-word-blocks .steps__item-title {
    margin: 0;
}


/* ============================================
   TEXT + IMAGE — .text-image
   ============================================ */

.core-engine-lib-word-blocks .text-image__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .text-image__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .text-image__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .text-image__media .image {
    width: 100%;
}


/* ============================================
   IMAGE + TEXT — .image-text
   ============================================ */

.core-engine-lib-word-blocks .image-text__grid {
    align-items: center;
}

.core-engine-lib-word-blocks .image-text__text {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-3);
}

.core-engine-lib-word-blocks .image-text__media {
    display: flex;
    align-items: center;
    justify-content: center;
}

.core-engine-lib-word-blocks .image-text__media .image {
    width: 100%;
}


/* ============================================
   GALLERY — .gallery
   ============================================ */

.core-engine-lib-word-blocks .gallery__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .gallery__grid {
    /* uses .grid.grid--auto from content.css */
}

.core-engine-lib-word-blocks .gallery__item {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
}


/* ============================================
   FAQ — .faq
   ============================================ */

.core-engine-lib-word-blocks .faq__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .faq__list {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-6);
    max-width: 48rem;
    margin-left: auto;
    margin-right: auto;
}

.core-engine-lib-word-blocks .faq__item {
    padding-bottom: var(--theme-space-5);
    border-bottom: 1px solid var(--theme-border);
}

.core-engine-lib-word-blocks .faq__item:last-child {
    padding-bottom: 0;
    border-bottom: none;
}

.core-engine-lib-word-blocks .faq__question {
    margin: 0 0 var(--theme-space-2);
}

.core-engine-lib-word-blocks .faq__answer {
    margin: 0;
}


/* ============================================
   CTA — .cta
   ============================================ */

.core-engine-lib-word-blocks .cta {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
}

.core-engine-lib-word-blocks .cta__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .cta__title {
    margin: 0;
    color: var(--theme-text, #1e293b);
    max-width: 48rem;
}

.core-engine-lib-word-blocks .cta__text {
    margin: 0;
    color: var(--theme-text-muted, #64748b);
    max-width: 40rem;
}

.core-engine-lib-word-blocks .cta__btn {
    margin-top: var(--theme-space-2);
}


/* ============================================
   CONTACTS — .contacts
   ============================================ */

.core-engine-lib-word-blocks .contacts__title {
    margin: 0 0 var(--theme-space-8);
    text-align: center;
}

.core-engine-lib-word-blocks .contacts__grid {
    /* uses .grid.grid--3 from content.css */
}

.core-engine-lib-word-blocks .contacts__item {
    display: flex;
    flex-direction: column;
    gap: var(--theme-space-1);
}

.core-engine-lib-word-blocks .contacts__label {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    font-weight: var(--theme-font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted);
}

.core-engine-lib-word-blocks .contacts__value {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-lg);
    font-weight: var(--theme-font-weight-medium);
    color: var(--theme-text);
}


/* ============================================
   FOOTER — .footer
   ============================================ */

.core-engine-lib-word-blocks .footer {
    background: var(--theme-bg-soft, #f1f5f9);
    color: var(--theme-text, #1e293b);
    padding-top: var(--theme-space-6);
    padding-bottom: var(--theme-space-6);
}

.core-engine-lib-word-blocks .footer__inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__brand {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
}

.core-engine-lib-word-blocks .footer__nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--theme-space-4);
}

.core-engine-lib-word-blocks .footer__link {
    font-family: var(--theme-font-family);
    font-size: var(--theme-font-size-sm);
    color: var(--theme-text, #1e293b);
    opacity: 0.75;
    text-decoration: none;
    transition: opacity 0.15s ease;
}

.core-engine-lib-word-blocks .footer__link:hover {
    opacity: 1;
}

/* neurocad/core/engine/lib/word/editor/effects/fx/fx-soft-diagonal-hatch.css */

/* Мягкие диагональные штрихи по фону с лёгким размытием.
   Извлечено из pages/11.css (эффекты effect-a7k3 + effect-b9q2). */

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch {
    position: relative;
    overflow: hidden;
    background-image: url("data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''90'' height=''90''%3E%3Cg stroke=''%23808080'' stroke-width=''1.6'' stroke-linecap=''round'' opacity=''0.14''%3E%3Cline x1=''10'' y1=''13'' x2=''25'' y2=''19''/%3E%3Cline x1=''48'' y1=''30'' x2=''63'' y2=''35''/%3E%3Cline x1=''16'' y1=''56'' x2=''31'' y2=''62''/%3E%3Cline x1=''60'' y1=''70'' x2=''76'' y2=''63''/%3E%3Cline x1=''40'' y1=''8'' x2=''52'' y2=''15''/%3E%3Cline x1=''70'' y1=''44'' x2=''82'' y2=''50''/%3E%3C/g%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 90px 90px;
}

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.14;
    filter: blur(2.5px);
    background-repeat: repeat;
    background-image: repeating-linear-gradient(
        24deg,
        rgba(148, 163, 184, 0.38) 0 1px,
        transparent 1px 9px
    ),
    repeating-linear-gradient(
        -18deg,
        rgba(148, 163, 184, 0.22) 0 1px,
        transparent 1px 14px
    ),
    repeating-linear-gradient(
        68deg,
        rgba(148, 163, 184, 0.14) 0 1px,
        transparent 1px 22px
    ),
    repeating-linear-gradient(
        -52deg,
        rgba(148, 163, 184, 0.10) 0 1px,
        transparent 1px 28px
    );
    background-size: 220px 120px, 340px 160px, 180px 140px, 420px 200px;
    background-position-x: 0px, 70px, 130px, 40px;
    background-position-y: 0px, 60px, 30px, 120px;
    mask-image: repeating-linear-gradient(
        -45deg,
        #000 0px, #000 9px,
        transparent 9px, transparent 26px
    );
    -webkit-mask-image: repeating-linear-gradient(
        -45deg,
        #000 0px, #000 9px,
        transparent 9px, transparent 26px
    );
}

.core-engine-lib-word-blocks .fx-soft-diagonal-hatch > * {
    position: relative;
    z-index: 1;
}

* { box-sizing: border-box; } body {margin: 0;}');

PRAGMA foreign_keys = ON;
