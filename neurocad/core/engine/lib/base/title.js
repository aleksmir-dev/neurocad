// app/core/engine/lib/base/title.js

export class Title {
    constructor(config) {
        this.config = config || null;
        this.list = config?.list || [];
        this.index = 0;
        this.event = config?.event || 'title-change';
    }

    render() {
        if (!this.config || this.config.type !== 'select' || this.list.length === 0) {
            return `<div class="core-engine-lib-base-title">Заголовок страницы</div>`;
        }

        const current = this.list[this.index] || this.list[0];

        return `
            <div class="core-engine-lib-base-title" data-js="title-select">
                <button class="core-engine-lib-base-title-btn" data-action="title_prev">‹</button>
                <span class="core-engine-lib-base-title-text" data-js="title-text">${current}</span>
                <button class="core-engine-lib-base-title-btn" data-action="title_next">›</button>
            </div>
        `;
    }

    bindEvents() {
        const container = document.querySelector('[data-js="title-select"]');
        if (!container) return;

        const prevBtn = container.querySelector('[data-action="title_prev"]');
        const nextBtn = container.querySelector('[data-action="title_next"]');
        const textEl = container.querySelector('[data-js="title-text"]');

        if (!prevBtn || !nextBtn || !textEl) return;

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