// app/core/engine/lib/base/cards/selection.js

/**
 * Выделение карточек и UI-синхронизация.
 * Все функции принимают `cards` (инстанс BaseCards).
 */

/**
 * Переход по карточке (левый клик / тап).
 * Прокидывается наружу через onItemClick.
 */
export function handleActivate(cards, id, e) {
    console.log('[BaseCards] _handleActivate() для id:', id);
    if (cards.onItemClick) {
        cards.onItemClick(id, e);
    }
}

/**
 * Выделение карточки (правый клик / долгое нажатие).
 * Работает только с одним выделением.
 */
export function handleSelect(cards, id, e) {
    console.log('[BaseCards] _handleSelect() для id:', id);

    const card = cards.itemInstances.get(id);
    if (!card) {
        console.warn('[BaseCards] Карточка не найдена:', id);
        return;
    }

    if (cards.selectedIds.size === 1 && cards.selectedIds.has(id)) {
        cards.selectedIds.clear();
        card.setSelected(false);
    } else {
        for (const [, instance] of cards.itemInstances) {
            instance.setSelected(false);
        }
        cards.selectedIds.clear();

        card.setSelected(true);
        cards.selectedIds.add(id);
    }

    updateUI(cards);
    syncToolbar(cards);
}

/**
 * Снять выделение со всех карточек (без полного ре-рендера).
 */
export function clearSelection(cards) {
    if (cards.selectedIds.size === 0) return;

    for (const [, instance] of cards.itemInstances) {
        instance.setSelected(false);
    }
    cards.selectedIds.clear();
    updateUI(cards);
    syncToolbar(cards);
}

/**
 * Синхронизировать состояние тулбара с выделением.
 */
export function syncToolbar(cards) {
    if (!cards.toolbar) return;

    const count = cards.selectedIds.size;
    cards.toolbar.setSelectedCount(count);

    if (count === 1) {
        cards.toolbar.setFirstSelectedId(Array.from(cards.selectedIds)[0]);
    } else {
        cards.toolbar.setFirstSelectedId(null);
    }
}

export function selectAll(cards) {
    const itemsToShow = getItemsToShowSafe(cards);
    cards.selectedIds.clear();

    itemsToShow.forEach(item => {
        cards.selectedIds.add(item.id);
        const card = cards.itemInstances.get(item.id);
        if (card) card.setSelected(true);
    });

    updateUI(cards);
    syncToolbar(cards);
}

export async function handleDeleteSelected(cards) {
    if (cards.selectedIds.size === 0) return;
    if (cards.isDeletedMode) return;

    const ids = Array.from(cards.selectedIds);
    if (!confirm(`Удалить ${ids.length} элементов?`)) return;

    for (const id of ids) {
        await cards._deleteItem(id);
    }
    cards.selectedIds.clear();
    if (cards.onReload) await cards.onReload();
}

export async function handleRestoreSelected(cards) {
    if (cards.selectedIds.size === 0) return;
    if (!cards.isDeletedMode) return;

    const ids = Array.from(cards.selectedIds);
    if (!confirm(`Восстановить ${ids.length} элементов?`)) return;

    for (const id of ids) {
        await cards._restoreItem(id);
    }
    cards.selectedIds.clear();
    if (cards.onReload) await cards.onReload();
}

/**
 * Обновить счётчики и состояние тулбара.
 */
export function updateUI(cards) {
    const total = getItemsToShowSafe(cards).length;
    const selected = cards.selectedIds.size;

    if (cards.countEl) {
        cards.countEl.textContent = `${total} элементов`;
    }

    if (cards.selectedEl) {
        cards.selectedEl.textContent = selected > 0 ? `Выбрано: ${selected}` : '';
        cards.selectedEl.style.display = selected > 0 ? 'inline' : 'none';
    }

    if (cards.statusTextEl) {
        cards.statusTextEl.textContent = selected > 0
            ? `Выбрано: ${selected}`
            : cards.widgetStatus;
    }

    if (cards.toolbar) {
        cards.toolbar.setSelectedCount(selected);
    }
}

// Внутренний хелпер: получить items для отображения через модуль render,
// чтобы не дублировать логику фильтрации.
function getItemsToShowSafe(cards) {
    if (cards._render && typeof cards._render.getItemsToShow === 'function') {
        return cards._render.getItemsToShow(cards);
    }
    return cards.items || [];
}