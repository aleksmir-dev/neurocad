// app/core/engine/lib/base/title.js

/**
 * Title — заголовок в шапке (header).
 *
 * Поддерживает конфиг в нескольких форматах:
 *
 *   1. Строка:
 *        "title": "Главная"
 *
 *   2. Объект с текстом:
 *        "title": { "type": "text", "text": "Главная" }
 *
 *   3. Объект-селектор (переключение по списку):
 *        "title": {
 *            "type": "select",
 *            "list": ["Главная", "О проекте", "Контакты"],
 *            "event": "title-change"
 *        }
 *
 *   4. Пусто (null / undefined / отсутствует) → рендерится пустой <div>.
 */
export class Title {
    constructor(config) {
        this.config = config || null;
        this.list = config?.list || [];
        this.index = 0;
        this.event = config?.event || 'title-change';
    }

    render() {
        // ===== Строка =====
        if (typeof this.config === 'string') {
            return `<div class="core-engine-lib-base-title">${this.config}</div>`;
        }

        // ===== Объект с явным типом "text" =====
        if (this.config?.type === 'text') {
            const text = this.config.text || '';
            return `<div class="core-engine-lib-base-title">${text}</div>`;
        }

        // ===== Селектор (list + prev/next) =====
        if (this.config?.type === 'select' && this.list.length > 0) {
            const current = this.list[this.index] || this.list[0];
            return `
                <div class="core-engine-lib-base-title" data-js="title-select">
                    <button class="core-engine-lib-base-title-btn" data-action="title_prev">‹</button>
                    <span class="core-engine-lib-base-title-text" data-js="title-text">${current}</span>
                    <button class="core-engine-lib-base-title-btn" data-action="title_next">›</button>
                </div>
            `;
        }

        // ===== Пусто =====
        return `<div class="core-engine-lib-base-title"></div>`;
    }

    bindEvents() {
        const container = document.querySelector('[data-js="title-select"]');
        if (!container) return;

        const prevBtn = container.querySelector('[data-action="title_prev"]');
        const nextBtn = container.querySelector('[data-action="title_next"]');
        const textEl = container.querySelector('[data-js="title-text"]');

        if (!prevBtn || !nextBtn || !textEl) return;

        // Клонируем кнопки, чтобы снять старые обработчики
        const newPrev = prevBtn.cloneNode(true);
        const newNext = nextBtn.cloneNode(true);
        prevBtn.replaceWith(newPrev);
        nextBtn.replaceWith(newNext);

        newPrev.addEventListener('click', () => {
            this.index = (this.index - 1 + this.list.length) % this.list.length;
            textEl.textContent = this.list[this.index];
            this._dispatchEvent();
        });

        newNext.addEventListener('click', () => {
            this.index = (this.index + 1) % this.list.length;
            textEl.textContent = this.list[this.index];
            this._dispatchEvent();
        });
    }

    _dispatchEvent() {
        document.dispatchEvent(new CustomEvent(this.event, {
            detail: {
                index: this.index,
                value: this.list[this.index]
            }
        }));
    }
}