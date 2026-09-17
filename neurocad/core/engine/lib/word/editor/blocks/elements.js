// app/core/engine/lib/word/editor/blocks/elements.js

/**
 * ElementBlocks — библиотека элементарных блоков GrapesJS.
 *
 * Категория: «Базовые»
 *
 * Что внутри:
 *   - Кнопки (primary / secondary / ghost)
 *   - Заголовки (H1 / H2 / H3)
 *   - Параграф
 *   - Лид (вводный текст)
 *   - Список с галочками
 *   - Нумерованный список
 *   - Цитата
 *   - Изображение (с SVG-заглушкой)
 *   - Разделитель
 *   - Поле ввода
 *   - Textarea
 *   - Select
 *
 * Классы блоков — с префиксом core- (core-btn, core-card и т.д.).
 * Картинка-заглушка — из editor/placeholder.svg (скопируется в /static/).
 */
export class ElementBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Базовые';
        this.placeholder = '/static/core/engine/lib/word/editor/placeholder.svg';
    }

    register() {
        console.log('[ElementBlocks] Регистрация');

        // ===== КНОПКИ =====

        this.bm.add('core-btn-primary', {
            label: 'Кнопка (акцентная)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="3" fill="#3b82f6"/></svg>',
            content: `<div style="text-align:center;margin:12px 0;"><a href="#" class="core-btn core-btn--primary">Кнопка</a></div>`,
        });

        this.bm.add('core-btn-secondary', {
            label: 'Кнопка (вторичная)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="3" fill="#ffffff" stroke="#3b82f6" stroke-width="2"/></svg>',
            content: `<div style="text-align:center;margin:12px 0;"><a href="#" class="core-btn core-btn--secondary">Кнопка</a></div>`,
        });

        this.bm.add('core-btn-ghost', {
            label: 'Кнопка (прозрачная)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="3" fill="none" stroke="#64748b" stroke-width="2"/></svg>',
            content: `<div style="text-align:center;margin:12px 0;"><a href="#" class="core-btn core-btn--ghost">Кнопка</a></div>`,
        });

        // ===== ЗАГОЛОВКИ =====

        this.bm.add('core-h1', {
            label: 'Заголовок H1',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"/></svg>',
            content: `<h1 style="font-size:36px;font-weight:700;margin:20px 0 16px;line-height:1.25;">Заголовок страницы</h1>`,
        });

        this.bm.add('core-h2', {
            label: 'Заголовок H2',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"/></svg>',
            content: `<h2 style="font-size:28px;font-weight:700;margin:24px 0 14px;line-height:1.3;">Заголовок раздела</h2>`,
        });

        this.bm.add('core-h3', {
            label: 'Заголовок H3',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4v16h2.5v-6.5h7V20H15V4h-2.5v7h-7V4H3z"/></svg>',
            content: `<h3 style="font-size:22px;font-weight:600;margin:16px 0 10px;line-height:1.35;">Подзаголовок</h3>`,
        });

        // ===== ТЕКСТ =====

        this.bm.add('core-p', {
            label: 'Параграф',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/></svg>',
            content: `<p style="font-size:16px;line-height:1.7;margin-bottom:16px;">Текст параграфа. Замените его своим содержимым.</p>`,
        });

        this.bm.add('core-lead', {
            label: 'Лид (вводный текст)',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 5h18v3H3zm0 6h18v2H3zm0 5h14v2H3z"/></svg>',
            content: `<p style="font-size:20px;line-height:1.6;margin-bottom:20px;">Крупный вводный текст, который привлекает внимание к разделу.</p>`,
        });

        // ===== СПИСКИ =====

        this.bm.add('core-list-check', {
            label: 'Список с галочками',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
            content: `
                <ul style="list-style:none;padding-left:0;margin:16px 0;">
                    <li style="margin-bottom:10px;display:flex;gap:10px;align-items:flex-start;"><span style="color:#16a34a;font-weight:700;">✔</span> Первый пункт списка</li>
                    <li style="margin-bottom:10px;display:flex;gap:10px;align-items:flex-start;"><span style="color:#16a34a;font-weight:700;">✔</span> Второй пункт списка</li>
                    <li style="margin-bottom:10px;display:flex;gap:10px;align-items:flex-start;"><span style="color:#16a34a;font-weight:700;">✔</span> Третий пункт списка</li>
                </ul>
            `,
        });

        this.bm.add('core-list-num', {
            label: 'Нумерованный список',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M3 4h2v5H3zm0 7h2v6H3zm0 8h2v2H3zm4-15h14v2H7zm0 7h14v2H7zm0 8h14v2H7z"/></svg>',
            content: `
                <ol style="padding-left:24px;margin:16px 0;line-height:1.8;">
                    <li>Первый пункт</li>
                    <li>Второй пункт</li>
                    <li>Третий пункт</li>
                </ol>
            `,
        });

        // ===== ЦИТАТА =====

        this.bm.add('core-quote', {
            label: 'Цитата',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>',
            content: `<blockquote style="border-left:4px solid #3b82f6;padding:16px 20px;background:#f1f5f9;margin:20px 0;font-style:italic;">Текст цитаты или выделенной мысли.</blockquote>`,
        });

        // ===== ИЗОБРАЖЕНИЕ =====

        this.bm.add('core-image', {
            label: 'Изображение',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3L14.5 12l4.5 6H5z"/></svg>',
            content: `<div style="text-align:center;margin:20px 0;"><img src="${this.placeholder}" alt="" style="max-width:100%;height:auto;border-radius:8px;"></div>`,
        });

        // ===== РАЗДЕЛИТЕЛЬ =====

        this.bm.add('core-hr', {
            label: 'Разделитель',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="11" width="20" height="2" fill="currentColor"/></svg>',
            content: `<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">`,
        });

        // ===== ФОРМЫ =====

        this.bm.add('core-input', {
            label: 'Поле ввода',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="margin-bottom:15px;max-width:400px;">
                    <label style="display:block;font-size:14px;font-weight:600;margin-bottom:6px;">Подпись поля:</label>
                    <input type="text" placeholder="Введите текст" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px;box-sizing:border-box;">
                </div>
            `,
        });

        this.bm.add('core-textarea', {
            label: 'Многострочное поле',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="margin-bottom:15px;max-width:500px;">
                    <label style="display:block;font-size:14px;font-weight:600;margin-bottom:6px;">Комментарий:</label>
                    <textarea rows="3" placeholder="Введите текст" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px;box-sizing:border-box;font-family:inherit;"></textarea>
                </div>
            `,
        });

        this.bm.add('core-select', {
            label: 'Выпадающий список',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="7" width="18" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 11l-2 2-2-2" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
            content: `
                <div style="margin-bottom:15px;max-width:400px;">
                    <label style="display:block;font-size:14px;font-weight:600;margin-bottom:6px;">Выберите вариант:</label>
                    <select style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:15px;box-sizing:border-box;background:#fff;">
                        <option>Вариант 1</option>
                        <option>Вариант 2</option>
                        <option>Вариант 3</option>
                    </select>
                </div>
            `,
        });
    }
}