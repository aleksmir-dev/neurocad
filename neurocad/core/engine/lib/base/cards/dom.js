// app/core/engine/lib/base/cards/dom.js

/**
 * Создание DOM widget'а для BaseCards.
 */

/**
 * Создать структуру widget'а внутри контейнера.
 */
export function createDOM(cards) {
    console.log('[BaseCards] _createDOM() START');

    if (cards.container) {
        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget';
        widget.id = 'cards-widget-' + Date.now();
        widget.innerHTML = `
            <div class="core-engine-lib-base-widget-titlebar" style="display: none;">
                <span>${cards.widgetTitle}</span>
                <span class="core-engine-lib-base-widget-toggle" title="Скрыть/Показать">👁️</span>
            </div>
            <div class="core-engine-lib-base-widget-toolbar" data-js="widget-toolbar">
                <!-- Тулбар будет вставлен сюда -->
            </div>
            <div class="core-engine-lib-base-widget-content" data-js="widget-content">
                <div class="core-engine-lib-base-cards-grid" data-js="cards-grid"></div>
            </div>
            <div class="core-engine-lib-base-widget-statusbar" data-js="widget-statusbar" style="display: none;">
                ${cards.widgetStatus}
            </div>
        `;

        cards.container.appendChild(widget);

        cards.widget = widget;
        cards.widgetToolbar = widget.querySelector('[data-js="widget-toolbar"]');
        cards.widgetContent = widget.querySelector('[data-js="widget-content"]');
        cards.widgetStatusbar = widget.querySelector('[data-js="widget-statusbar"]');
        cards.grid = widget.querySelector('[data-js="cards-grid"]');
        cards.toggleBtn = widget.querySelector('.core-engine-lib-base-widget-toggle');

        if (cards.widgetContent) {
            cards.widgetContent.style.flex = '1';
            cards.widgetContent.style.minHeight = '0';
            cards.widgetContent.style.overflow = 'auto';
        }

        if (cards.toggleBtn) {
            cards.toggleBtn.addEventListener('click', () => {
                const content = cards.widgetContent;
                if (content.style.display === 'none') {
                    content.style.display = '';
                    cards.toggleBtn.textContent = '👁️';
                } else {
                    content.style.display = 'none';
                    cards.toggleBtn.textContent = '👁️‍🗨️';
                }
            });
        }

        // Счётчики в статусбаре
        cards.countEl = document.createElement('span');
        cards.countEl.className = 'core-engine-lib-base-cards-count';
        cards.countEl.textContent = '0 элементов';

        cards.selectedEl = document.createElement('span');
        cards.selectedEl.className = 'core-engine-lib-base-cards-selected';
        cards.selectedEl.textContent = '';
        cards.selectedEl.style.display = 'none';

        // Статус-текст как отдельный узел, чтобы не затирать счётчики
        cards.statusTextEl = document.createElement('span');
        cards.statusTextEl.className = 'core-engine-lib-base-widget-status-text';
        cards.statusTextEl.textContent = cards.widgetStatus;

        if (cards.widgetStatusbar) {
            cards.widgetStatusbar.innerHTML = '';
            cards.widgetStatusbar.appendChild(cards.statusTextEl);
            cards.widgetStatusbar.appendChild(cards.countEl);
            cards.widgetStatusbar.appendChild(cards.selectedEl);
        }
        return;
    }

    console.warn('[BaseCards] Контейнер НЕ ПЕРЕДАН!');
    const existing = document.querySelector('.core-engine-lib-base-cards');
    if (existing) {
        cards.container = existing;
        cacheElements(cards);
        return;
    }
    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-cards';
    container.id = 'cards-container-' + Date.now();
    container.innerHTML = `
        <div class="core-engine-lib-base-cards-grid" data-js="cards-grid"></div>
        <div class="core-engine-lib-base-cards-footer">
            <span class="core-engine-lib-base-cards-count" data-js="cards-count">0 элементов</span>
            <span class="core-engine-lib-base-cards-selected" data-js="cards-selected"></span>
        </div>
    `;
    document.body.appendChild(container);
    cards.container = container;
    cacheElements(cards);
}

/**
 * Найти и закешировать ссылки на grid/count/selected.
 */
export function cacheElements(cards) {
    cards.grid = cards.container.querySelector('[data-js="cards-grid"]');
    cards.countEl = cards.container.querySelector('[data-js="cards-selected"]');
    cards.selectedEl = cards.container.querySelector('[data-js="cards-selected"]');
}