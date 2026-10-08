// app/core/engine/lib/base/cards/render.js

/**
 * Рендер сетки карточек.
 * Все функции принимают `cards` (инстанс BaseCards).
 */

/**
 * Отрисовать список. Асинхронно, потому что каждая карточка создаётся
 * через BaseCardsCard, и это может быть расширено в будущем.
 */
export async function render(cards) {
    if (!cards.grid) {
        console.error('[BaseCards] GRID НЕ НАЙДЕН!');
        return;
    }

    cards.grid.innerHTML = '';
    cards.itemInstances.clear();
    cards.grid.style.gridTemplateColumns = cards.gridColumns;

    // Снимаем выделение при полном ре-рендере (инстансы всё равно удаляются)
    cards.selectedIds.clear();

    if (cards.isLoading) {
        cards.grid.style.display = 'grid';
        renderLoading(cards);
        cards._updateUI();
        return;
    }

    if (cards.error) {
        cards.grid.style.display = 'grid';
        renderError(cards, cards.error);
        cards._updateUI();
        return;
    }

    const itemsToShow = getItemsToShow(cards);
    if (itemsToShow.length === 0) {
        // Нет карточек — скрываем grid полностью (без empty state)
        cards.grid.style.display = 'none';
        cards._updateUI();
        return;
    }

    cards.grid.style.display = 'grid';
    for (const item of itemsToShow) {
        const cardEl = await renderItem(cards, item);
        cards.grid.appendChild(cardEl);
    }

    cards._updateUI();
}

export function renderLoading(cards) {
    const loading = document.createElement('div');
    loading.className = 'core-engine-lib-base-cards-loading';
    loading.innerHTML = `<span>Загрузка...</span>`;
    cards.grid.appendChild(loading);
}

export function renderError(cards, message) {
    const error = document.createElement('div');
    error.className = 'core-engine-lib-base-cards-error';
    error.innerHTML = `
        <span class="core-engine-lib-base-cards-error-text">${message}</span>
        <button class="core-engine-lib-base-cards-error-retry" data-js="cards-retry">Повторить</button>
    `;
    cards.grid.appendChild(error);

    const retryBtn = error.querySelector('[data-js="cards-retry"]');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (cards.onRetry) cards.onRetry();
        });
    }
}

export function renderEmptyState(cards) {
    const empty = document.createElement('div');
    empty.className = 'core-engine-lib-base-cards-empty';
    empty.innerHTML = `
        <img class="core-engine-lib-base-cards-empty-icon"
             src="${cards._icon('add')}"
             alt="Нет элементов"
             width="48" height="48">
        <span class="core-engine-lib-base-cards-empty-text">Нет элементов</span>
        <span class="core-engine-lib-base-cards-empty-hint">Нажмите кнопку "Добавить" чтобы создать</span>
    `;
    cards.grid.appendChild(empty);
}

/**
 * Отфильтровать items для текущего режима (обычный / корзина),
 * с учётом filter (поиск) и statusFilter.
 */
export function getItemsToShow(cards) {
    let items = cards.items;

    if (!cards.isDeletedMode) {
        items = items.filter(item => !item.is_delete && !item.is_deleted);
    } else {
        items = items.filter(item => item.is_delete || item.is_deleted);
    }

    if (cards.statusFilter !== 'all') {
        items = items.filter(item => (item[cards.statusField] || '') === cards.statusFilter);
    }

    if (cards.filter) {
        const firstField = cards.listFields[0] || 'title';
        items = items.filter(item => {
            const value = item[firstField] || '';
            return String(value).toLowerCase().includes(cards.filter.toLowerCase());
        });
    }

    return items;
}

/**
 * Отрендерить одну карточку.
 */
export async function renderItem(cards, item) {
    if (!cards._BaseCardsCard) {
        console.error('[BaseCards] _BaseCardsCard не загружен');
        return document.createElement('div');
    }

    const cardOptions = { ...cards.cardOptions };

    if (cards.renderCard) {
        cardOptions.renderContent = cards.renderCard;
        cardOptions.customClass = cardOptions.customClass || 'card-nav';
    }

    const card = new cards._BaseCardsCard(
        item,
        cards.fields,
        cards.statusField,
        cards.listFields,
        cardOptions
    );

    const el = card.render(
        // onActivate — левый клик / тап → переход
        (id, e) => {
            cards._handleActivate(id, e);
        },
        // onSelect — правый клик / долгое нажатие → выделение
        (id, e) => {
            cards._handleSelect(id, e);
        }
    );

    cards.itemInstances.set(item.id, card);

    if (cards.selectedIds.has(item.id)) {
        card.setSelected(true);
    }

    return el;
}