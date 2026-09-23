// app/core/engine/lib/word/editor/blocks/ready.js

/**
 * ReadyBlocks — ready-made sections for GrapesJS.
 *
 * Category: "Секции" (sections).
 *
 * Blocks:
 *   - Hero           — big intro: heading + lead + button
 *   - Features       — 3 cards with titles and text
 *   - Steps          — 3 numbered steps
 *   - Text + Image   — two columns: text left, image right
 *   - Image + Text   — two columns: image left, text right
 *   - Gallery        — grid of images
 *   - FAQ            — list of questions and answers
 *   - CTA            — dark call-to-action: heading + text + button
 *   - Contacts       — contact info: address, phone, email
 *   - Footer         — bottom section: logo, nav, copyright
 *
 * NOTE: blocks are NOT wrapped in .core-engine-lib-word-blocks anymore.
 * That class is the single scope wrapper for the whole page:
 *   - in the editor — added to the iframe <body> (GrapesLoader)
 *   - on public pages — added to <article> (public.html)
 *
 * Sections use atoms from editor/css/content.css (.h1, .h2, .text,
 * .lead, .btn, .card, .image, ...) and section-specific classes
 * from editor/blocks/ready.css (.hero, .features, .cta, ...).
 *
 * All section HTML uses the standard structure:
 *   <section class="section">
 *       <div class="container">
 *           ...
 *       </div>
 *   </section>
 *
 * Rules:
 *   - Never change existing class names after release.
 *   - Section styles live in ready.css and use only --theme-* vars.
 */
export class ReadyBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Секции';
    }

    register() {
        console.log('[ReadyBlocks] Регистрация');

        // ===== HERO =====

        /*
         * Big intro section: heading + lead + primary button.
         * Center-aligned by default.
         */
        this.bm.add('core-hero', {
            label: 'Hero (баннер)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" stroke-width="2"/><line x1="6" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <section class="section hero">
                    <div class="container hero__inner">
                        <h1 class="h1 hero__title">Заголовок страницы</h1>
                        <p class="lead hero__lead">Короткое вводное описание. Расскажите, чем вы полезны.</p>
                        <a href="#" class="btn hero__btn">Начать</a>
                    </div>
                </section>
            `,
        });

        // ===== FEATURES =====

        /*
         * Three feature cards in a grid.
         */
        this.bm.add('core-features', {
            label: 'Преимущества',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="6" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="4" width="6" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16" y="4" width="6" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <section class="section features">
                    <div class="container">
                        <h2 class="h2 features__title">Преимущества</h2>
                        <div class="grid grid--3 features__grid">
                            <div class="card features__item">
                                <h3 class="card__title">Первое преимущество</h3>
                                <p class="card__text">Короткое описание первого преимущества.</p>
                            </div>
                            <div class="card features__item">
                                <h3 class="card__title">Второе преимущество</h3>
                                <p class="card__text">Короткое описание второго преимущества.</p>
                            </div>
                            <div class="card features__item">
                                <h3 class="card__title">Третье преимущество</h3>
                                <p class="card__text">Короткое описание третьего преимущества.</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== STEPS =====

        /*
         * Three numbered steps.
         */
        this.bm.add('core-steps', {
            label: 'Шаги',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/><line x1="8" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="2"/><line x1="14" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <section class="section steps">
                    <div class="container">
                        <h2 class="h2 steps__title">Как это работает</h2>
                        <div class="grid grid--3 steps__grid">
                            <div class="steps__item">
                                <div class="steps__num">1</div>
                                <h3 class="h3 steps__item-title">Первый шаг</h3>
                                <p class="text text--muted">Описание первого шага.</p>
                            </div>
                            <div class="steps__item">
                                <div class="steps__num">2</div>
                                <h3 class="h3 steps__item-title">Второй шаг</h3>
                                <p class="text text--muted">Описание второго шага.</p>
                            </div>
                            <div class="steps__item">
                                <div class="steps__num">3</div>
                                <h3 class="h3 steps__item-title">Третий шаг</h3>
                                <p class="text text--muted">Описание третьего шага.</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== TEXT + IMAGE =====

        /*
         * Two columns: text on the left, image on the right.
         */
        this.bm.add('core-text-image', {
            label: 'Текст + картинка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="10" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="6" width="8" height="12" rx="1" fill="currentColor" opacity="0.3"/></svg>',
            content: `
                <section class="section text-image">
                    <div class="container">
                        <div class="grid grid--2 text-image__grid">
                            <div class="text-image__text">
                                <h2 class="h2">Заголовок блока</h2>
                                <p class="text">Описание. Расскажите о продукте, услуге или преимуществе.</p>
                                <p class="text text--muted">Дополнительный абзац.</p>
                            </div>
                            <div class="text-image__media">
                                <img class="image" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== IMAGE + TEXT =====

        /*
         * Two columns: image on the left, text on the right.
         */
        this.bm.add('core-image-text', {
            label: 'Картинка + текст',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="6" width="8" height="12" rx="1" fill="currentColor" opacity="0.3"/><rect x="12" y="4" width="10" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <section class="section image-text">
                    <div class="container">
                        <div class="grid grid--2 image-text__grid">
                            <div class="image-text__media">
                                <img class="image" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            </div>
                            <div class="image-text__text">
                                <h2 class="h2">Заголовок блока</h2>
                                <p class="text">Описание. Расскажите о продукте, услуге или преимуществе.</p>
                                <p class="text text--muted">Дополнительный абзац.</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== GALLERY =====

        /*
         * Grid of images (auto-fit).
         */
        this.bm.add('core-gallery', {
            label: 'Галерея',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/><rect x="9" y="4" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/><rect x="16" y="4" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/><rect x="2" y="12" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/><rect x="9" y="12" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/><rect x="16" y="12" width="6" height="6" rx="1" fill="currentColor" opacity="0.3"/></svg>',
            content: `
                <section class="section gallery">
                    <div class="container">
                        <h2 class="h2 gallery__title">Галерея</h2>
                        <div class="grid grid--auto gallery__grid">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                            <img class="image gallery__item" src="/static/core/engine/lib/base/images/placeholder.svg" alt="">
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== FAQ =====

        /*
         * List of questions and answers.
         */
        this.bm.add('core-faq', {
            label: 'FAQ (вопросы)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>',
            content: `
                <section class="section faq">
                    <div class="container">
                        <h2 class="h2 faq__title">Частые вопросы</h2>
                        <div class="faq__list">
                            <div class="faq__item">
                                <h3 class="h3 faq__question">Первый вопрос?</h3>
                                <p class="text text--muted faq__answer">Ответ на первый вопрос.</p>
                            </div>
                            <div class="faq__item">
                                <h3 class="h3 faq__question">Второй вопрос?</h3>
                                <p class="text text--muted faq__answer">Ответ на второй вопрос.</p>
                            </div>
                            <div class="faq__item">
                                <h3 class="h3 faq__question">Третий вопрос?</h3>
                                <p class="text text--muted faq__answer">Ответ на третий вопрос.</p>
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== CTA =====

        /*
         * Dark call-to-action: heading + text + primary button.
         */
        this.bm.add('core-cta', {
            label: 'CTA (призыв)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="20" height="16" rx="2" fill="#0f172a"/><line x1="6" y1="10" x2="18" y2="10" stroke="#ffffff" stroke-width="2"/><line x1="6" y1="14" x2="14" y2="14" stroke="#ffffff" stroke-width="2" opacity="0.6"/></svg>',
            content: `
                <section class="section cta">
                    <div class="container cta__inner">
                        <h2 class="h2 cta__title">Готовы начать?</h2>
                        <p class="text cta__text">Короткое описание призыва к действию.</p>
                        <a href="#" class="btn cta__btn">Оставить заявку</a>
                    </div>
                </section>
            `,
        });

        // ===== CONTACTS =====

        /*
         * Contact info: address, phone, email.
         */
        this.bm.add('core-contacts', {
            label: 'Контакты',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2" fill="currentColor"/></svg>',
            content: `
                <section class="section contacts">
                    <div class="container">
                        <h2 class="h2 contacts__title">Контакты</h2>
                        <div class="grid grid--3 contacts__grid">
                            <div class="contacts__item">
                                <div class="contacts__label">Адрес</div>
                                <div class="contacts__value">Город, улица, дом</div>
                            </div>
                            <div class="contacts__item">
                                <div class="contacts__label">Телефон</div>
                                <div class="contacts__value">+7 (000) 000-00-00</div>
                            </div>
                            <div class="contacts__item">
                                <div class="contacts__label">Email</div>
                                <div class="contacts__value">mail@example.com</div>
                            </div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== FOOTER =====

        /*
         * Bottom section: logo + nav + copyright.
         */
        this.bm.add('core-footer', {
            label: 'Подвал',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="18" width="20" height="4" fill="currentColor"/><line x1="2" y1="20" x2="8" y2="20" stroke="#ffffff" stroke-width="1"/><line x1="16" y1="20" x2="22" y2="20" stroke="#ffffff" stroke-width="1"/></svg>',
            content: `
                <footer class="section footer">
                    <div class="container footer__inner">
                        <div class="footer__brand">© Компания</div>
                        <nav class="footer__nav">
                            <a href="#" class="footer__link">Главная</a>
                            <a href="#" class="footer__link">Услуги</a>
                            <a href="#" class="footer__link">Контакты</a>
                        </nav>
                    </div>
                </footer>
            `,
        });
    }
}