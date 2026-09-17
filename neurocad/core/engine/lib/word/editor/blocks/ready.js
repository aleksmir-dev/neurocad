// app/core/engine/lib/word/editor/blocks/ready.js

/**
 * ReadyBlocks — библиотека готовых блоков GrapesJS.
 *
 * Категория: «Готовые»
 *
 * Что внутри:
 *   - Hero-баннер (градиент + заголовок + 2 кнопки)
 *   - Сетка преимуществ (4 иконки-эмодзи + заголовок + описание)
 *   - Сетка фактов (3 крупных числа + подписи)
 *   - Блок «фото слева / текст справа»
 *   - Блок «текст слева / фото справа»
 *   - Галерея 3 фото (заглушки)
 *   - Таблица цен (универсальная)
 *   - Инфо-блок (акцент, иконка + текст)
 *
 * Все картинки — SVG-заглушки из editor/placeholder.svg.
 * Пользователь заменяет их через медиатеку.
 */
export class ReadyBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Готовые';
        this.placeholder = '/static/core/engine/lib/word/editor/placeholder.svg';
    }

    register() {
        console.log('[ReadyBlocks] Регистрация');

        // ===== HERO =====

        this.bm.add('core-hero', {
            label: 'Hero (баннер)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="20" height="16" rx="2" fill="#0f172a"/><circle cx="12" cy="10" r="3" fill="#fbbf24"/></svg>',
            content: `
                <section style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);color:#fff;padding:70px 20px;text-align:center;border-radius:8px;margin:20px 0;">
                    <div style="max-width:800px;margin:0 auto;">
                        <h1 style="font-size:38px;font-weight:700;margin-bottom:16px;color:#fff;">Заголовок баннера</h1>
                        <p style="font-size:18px;margin-bottom:25px;line-height:1.6;opacity:.95;">Короткое описание или подзаголовок к баннеру.</p>
                        <div style="display:flex;justify-content:center;gap:15px;flex-wrap:wrap;">
                            <a href="#" class="core-btn core-btn--primary">Основное действие</a>
                            <a href="#" class="core-btn core-btn--ghost" style="color:#fff;border-color:rgba(255,255,255,0.5);">Дополнительно</a>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== ПРЕИМУЩЕСТВА =====

        this.bm.add('core-features', {
            label: 'Сетка преимуществ',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z"/></svg>',
            content: `
                <section style="padding:35px 15px;background:#f8fafc;border-radius:8px;margin:20px 0;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;max-width:1200px;margin:0 auto;">
                        <div style="text-align:center;padding:15px;">
                            <div style="width:60px;height:60px;margin:0 auto 12px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 10px rgba(0,0,0,0.06);">⭐</div>
                            <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Преимущество 1</div>
                            <div style="font-size:13px;color:#64748b;">Краткое описание преимущества</div>
                        </div>
                        <div style="text-align:center;padding:15px;">
                            <div style="width:60px;height:60px;margin:0 auto 12px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 10px rgba(0,0,0,0.06);">⚡</div>
                            <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Преимущество 2</div>
                            <div style="font-size:13px;color:#64748b;">Краткое описание преимущества</div>
                        </div>
                        <div style="text-align:center;padding:15px;">
                            <div style="width:60px;height:60px;margin:0 auto 12px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 10px rgba(0,0,0,0.06);">✓</div>
                            <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Преимущество 3</div>
                            <div style="font-size:13px;color:#64748b;">Краткое описание преимущества</div>
                        </div>
                        <div style="text-align:center;padding:15px;">
                            <div style="width:60px;height:60px;margin:0 auto 12px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 10px rgba(0,0,0,0.06);">♥</div>
                            <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Преимущество 4</div>
                            <div style="font-size:13px;color:#64748b;">Краткое описание преимущества</div>
                        </div>
                    </div>
                </section>
            `,
        });

        // ===== ФАКТЫ (ЦИФРЫ) =====

        this.bm.add('core-stats', {
            label: 'Сетка фактов (цифры)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin:30px 0;text-align:center;">
                    <div style="padding:25px 20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-size:40px;font-weight:800;color:#3b82f6;line-height:1;margin-bottom:8px;">100+</div>
                        <div style="font-size:16px;font-weight:600;color:#1e293b;margin-bottom:4px;">Первое значение</div>
                        <div style="font-size:13px;color:#64748b;">Короткое пояснение</div>
                    </div>
                    <div style="padding:25px 20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-size:40px;font-weight:800;color:#0f172a;line-height:1;margin-bottom:8px;">10 лет</div>
                        <div style="font-size:16px;font-weight:600;color:#1e293b;margin-bottom:4px;">Второе значение</div>
                        <div style="font-size:13px;color:#64748b;">Короткое пояснение</div>
                    </div>
                    <div style="padding:25px 20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                        <div style="font-size:40px;font-weight:800;color:#3b82f6;line-height:1;margin-bottom:8px;">24/7</div>
                        <div style="font-size:16px;font-weight:600;color:#1e293b;margin-bottom:4px;">Третье значение</div>
                        <div style="font-size:13px;color:#64748b;">Короткое пояснение</div>
                    </div>
                </div>
            `,
        });

        // ===== ФОТО СЛЕВА / ТЕКСТ СПРАВА =====

        this.bm.add('core-split-img-left', {
            label: 'Фото слева / текст справа',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="10" height="16" rx="1" fill="#cbd5e1"/><rect x="14" y="6" width="8" height="2" fill="#64748b"/><rect x="14" y="10" width="8" height="2" fill="#94a3b8"/><rect x="14" y="14" width="6" height="2" fill="#94a3b8"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;align-items:center;margin:30px 0;">
                    <div style="border-radius:8px;overflow:hidden;">
                        <img src="${this.placeholder}" alt="" style="width:100%;height:auto;display:block;">
                    </div>
                    <div>
                        <h2 style="font-size:26px;font-weight:700;margin-bottom:12px;">Заголовок блока</h2>
                        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px;">Описание блока. Здесь может быть текст о продукте, услуге или преимуществах. Отредактируйте в правой панели.</p>
                        <a href="#" class="core-btn core-btn--primary">Подробнее</a>
                    </div>
                </div>
            `,
        });

        // ===== ТЕКСТ СЛЕВА / ФОТО СПРАВА =====

        this.bm.add('core-split-img-right', {
            label: 'Текст слева / фото справа',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="12" y="4" width="10" height="16" rx="1" fill="#cbd5e1"/><rect x="2" y="6" width="8" height="2" fill="#64748b"/><rect x="2" y="10" width="8" height="2" fill="#94a3b8"/><rect x="2" y="14" width="6" height="2" fill="#94a3b8"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;align-items:center;margin:30px 0;">
                    <div>
                        <h2 style="font-size:26px;font-weight:700;margin-bottom:12px;">Заголовок блока</h2>
                        <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:16px;">Описание блока. Здесь может быть текст о продукте, услуге или преимуществах. Отредактируйте в правой панели.</p>
                        <a href="#" class="core-btn core-btn--primary">Подробнее</a>
                    </div>
                    <div style="border-radius:8px;overflow:hidden;">
                        <img src="${this.placeholder}" alt="" style="width:100%;height:auto;display:block;">
                    </div>
                </div>
            `,
        });

        // ===== ГАЛЕРЕЯ 3 ФОТО =====

        this.bm.add('core-gallery-3', {
            label: 'Галерея 3 фото',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="6" width="6" height="12" rx="1" fill="#cbd5e1"/><rect x="9" y="6" width="6" height="12" rx="1" fill="#94a3b8"/><rect x="16" y="6" width="6" height="12" rx="1" fill="#cbd5e1"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:24px 0;">
                    <div style="border-radius:8px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                        <img src="${this.placeholder}" alt="" style="width:100%;height:auto;display:block;">
                    </div>
                    <div style="border-radius:8px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                        <img src="${this.placeholder}" alt="" style="width:100%;height:auto;display:block;">
                    </div>
                    <div style="border-radius:8px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                        <img src="${this.placeholder}" alt="" style="width:100%;height:auto;display:block;">
                    </div>
                </div>
            `,
        });

        // ===== ТАБЛИЦА ЦЕН =====

        this.bm.add('core-price-table', {
            label: 'Таблица цен',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 3h18v18H3V3zm2 2v4h6V5H5zm8 0v4h6V5h-6zM5 11v4h6v-4H5zm8 0v4h6v-4h-6zM5 17v2h6v-2H5zm8 0v2h6v-2h-6z"/></svg>',
            content: `
                <div style="overflow-x:auto;margin:25px 0;">
                    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);font-size:15px;">
                        <thead>
                            <tr style="background:#0f172a;color:#fff;text-align:left;">
                                <th style="padding:14px 18px;">Наименование</th>
                                <th style="padding:14px 18px;">Описание</th>
                                <th style="padding:14px 18px;">Стоимость</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:14px 18px;font-weight:600;">Позиция 1</td>
                                <td style="padding:14px 18px;color:#64748b;">Краткое описание</td>
                                <td style="padding:14px 18px;font-weight:700;color:#0f172a;">1 000 ₽</td>
                            </tr>
                            <tr style="border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                                <td style="padding:14px 18px;font-weight:600;">Позиция 2</td>
                                <td style="padding:14px 18px;color:#64748b;">Краткое описание</td>
                                <td style="padding:14px 18px;font-weight:700;color:#0f172a;">2 500 ₽</td>
                            </tr>
                            <tr>
                                <td style="padding:14px 18px;font-weight:600;">Позиция 3</td>
                                <td style="padding:14px 18px;color:#64748b;">Краткое описание</td>
                                <td style="padding:14px 18px;font-weight:700;color:#0f172a;">4 000 ₽</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `,
        });

        // ===== ИНФО-БЛОК =====

        this.bm.add('core-info', {
            label: 'Инфо-блок',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#3b82f6" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
            content: `
                <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:18px 22px;margin:25px 0;">
                    <div style="font-weight:700;color:#1e40af;font-size:16px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                        <span>ℹ️</span> Заголовок информационного блока
                    </div>
                    <p style="font-size:14px;color:#1e3a8a;line-height:1.6;margin-bottom:0;">
                        Полезная информация для читателя. Можно использовать для важных замечаний, правил или подсказок.
                    </p>
                </div>
            `,
        });
    }
}