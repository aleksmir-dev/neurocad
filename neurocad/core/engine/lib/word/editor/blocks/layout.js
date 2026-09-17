// app/core/engine/lib/word/editor/blocks/layout.js

/**
 * LayoutBlocks — библиотека блоков «Сетки».
 *
 * Категория: «Сетки»
 *
 * Что внутри:
 *   - Контейнер (max-width 1200px)
 *   - 2 колонки
 *   - 3 колонки
 *   - 4 колонки
 *   - Карточка (светлая с тенью)
 *   - Тёмная плашка (CTA-блок)
 *
 * Все сетки — на CSS Grid с auto-fit, чтобы адаптировались под ширину.
 * Никаких внешних CSS-файлов — только inline-стили.
 */
export class LayoutBlocks {
    /**
     * @param {Object} bm — editor.BlockManager
     */
    constructor(bm) {
        this.bm = bm;
        this.category = 'Сетки';
    }

    register() {
        console.log('[LayoutBlocks] Регистрация');

        // ===== КОНТЕЙНЕР =====

        this.bm.add('core-container', {
            label: 'Контейнер',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="max-width:1200px;margin:0 auto;padding:30px 15px;">
                    <p style="text-align:center;color:#94a3b8;font-style:italic;">Содержимое контейнера</p>
                </div>
            `,
        });

        // ===== СЕТКИ =====

        this.bm.add('core-grid-2', {
            label: '2 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="4" width="9" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin:24px 0;">
                    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
                        <h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">Колонка 1</h3>
                        <p style="color:#64748b;font-size:14px;">Описание первой колонки</p>
                    </div>
                    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
                        <h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">Колонка 2</h3>
                        <p style="color:#64748b;font-size:14px;">Описание второй колонки</p>
                    </div>
                </div>
            `,
        });

        this.bm.add('core-grid-3', {
            label: '3 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.25" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="16.5" y="4" width="5.5" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin:24px 0;">
                    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
                        <h4 style="font-size:16px;font-weight:600;margin-bottom:6px;">Блок 1</h4>
                        <p style="color:#64748b;font-size:14px;">Описание</p>
                    </div>
                    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
                        <h4 style="font-size:16px;font-weight:600;margin-bottom:6px;">Блок 2</h4>
                        <p style="color:#64748b;font-size:14px;">Описание</p>
                    </div>
                    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
                        <h4 style="font-size:16px;font-weight:600;margin-bottom:6px;">Блок 3</h4>
                        <p style="color:#64748b;font-size:14px;">Описание</p>
                    </div>
                </div>
            `,
        });

        this.bm.add('core-grid-4', {
            label: '4 колонки',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7.3" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="12.6" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="18" y="4" width="4" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
            content: `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:24px 0;">
                    <div style="padding:16px;background:#f8fafc;border-radius:8px;text-align:center;">Колонка 1</div>
                    <div style="padding:16px;background:#f8fafc;border-radius:8px;text-align:center;">Колонка 2</div>
                    <div style="padding:16px;background:#f8fafc;border-radius:8px;text-align:center;">Колонка 3</div>
                    <div style="padding:16px;background:#f8fafc;border-radius:8px;text-align:center;">Колонка 4</div>
                </div>
            `,
        });

        // ===== КАРТОЧКИ =====

        this.bm.add('core-card', {
            label: 'Карточка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/></svg>',
            content: `
                <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;box-shadow:0 4px 12px rgba(15,23,42,0.06);margin:20px 0;">
                    <h3 style="font-size:20px;font-weight:700;margin-bottom:10px;">Заголовок карточки</h3>
                    <p style="color:#475569;font-size:15px;line-height:1.6;">Содержимое карточки. Можно заменить на любой контент.</p>
                </div>
            `,
        });

        this.bm.add('core-card-dark', {
            label: 'Тёмная плашка',
            category: this.category,
            media: '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#0f172a"/></svg>',
            content: `
                <div style="background:#0f172a;color:#fff;border-radius:8px;padding:30px;margin:24px 0;text-align:center;">
                    <h3 style="font-size:22px;font-weight:700;color:#fbbf24;margin-bottom:12px;">Заголовок блока</h3>
                    <p style="font-size:15px;opacity:.9;max-width:600px;margin:0 auto 16px;">Описание блока на тёмном фоне. Хорошо подходит для CTA-секций.</p>
                    <a href="#" class="core-btn core-btn--primary">Кнопка</a>
                </div>
            `,
        });
    }
}