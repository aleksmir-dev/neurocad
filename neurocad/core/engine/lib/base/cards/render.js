// app/core/engine/lib/base/cards/render.js

/**
 * Grid rendering. Every function takes the `cards` instance.
 *
 * Folder mode
 * -----------
 * When `cards.folders === true`, the list is rendered as a
 * hierarchical browser:
 *
 *   [ ".." ]   [ folder A ]   [ folder B ]   [ card 1 ]   [ card 2 ]
 *
 * Rules (only when folders mode is on):
 *
 *   1. A pseudo-card ".." is prepended when `cards.parentId`
 *      is not null — a way to go one level up.
 *
 *   2. Items are split into two groups:
 *        - folders   : item[cards.folderField] === cards.folderValue
 *        - the rest  : everything else (cards / modules / files)
 *
 *   3. Each group is sorted internally:
 *        - by `sort_order` (ascending; missing = 0)
 *        - then by `name` (fallback: `title`)
 *      The ".." pseudo-card always stays first.
 *
 *   4. The final order is: [ ".." ] → folders → the rest.
 *
 * When `cards.folders !== true`, everything works exactly as before:
 * `getItemsToShow()` is called directly, no grouping, no "..".
 *
 * Field names are configurable:
 *   cards.folderField  — which field carries the type
 *                        (default: 'card_type')
 *   cards.folderValue  — which value means "folder"
 *                        (default: 'folder')
 *
 * Consumer hooks (all optional):
 *   cards.renderCard    — content for a regular item
 *   cards.renderUpCard  — content for the ".." pseudo-card
 *
 * User-facing strings (button labels, error messages, empty
 * states) are in Russian. Code comments, docstrings and
 * identifiers are in English.
 */

/**
 * Render the list. Async because every card is created through
 * BaseCardsCard, and this may be extended in the future.
 */
export async function render(cards) {
    if (!cards.grid) {
        console.error('[BaseCards] GRID NOT FOUND');
        return;
    }

    cards.grid.innerHTML = '';
    cards.itemInstances.clear();
    cards.grid.style.gridTemplateColumns = cards.gridColumns;

    // Clear selection on full re-render (instances are removed anyway).
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

    const itemsToShow = buildItemsWithFolders(cards);
    if (itemsToShow.length === 0) {
        // No items — hide the grid entirely (no empty state).
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
 * Filter items for the current mode (normal / trash), taking
 * `filter` (search) and `statusFilter` into account.
 *
 * This is the "raw" filter — the base list without folder
 * grouping. In folder mode it is called first, then the result
 * is rearranged by buildItemsWithFolders().
 *
 * Exported so external callers (e.g. selection) can reuse the
 * same visibility rules — currently not used outside, but kept
 * stable.
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
 * Build the final list to render, applying folder mode when enabled.
 *
 * Non-folder mode  → returns getItemsToShow(cards) unchanged.
 *
 * Folder mode      → returns:
 *                      [ ".." ]  (if cards.parentId != null)
 *                      folders   (item[field] === value)
 *                      rest      (everything else)
 *                    with internal sorting inside each group.
 *
 * The ".." pseudo-card is NOT part of cards.items — it is created
 * here on the fly. Its id is 0, which is safe: real ids are >= 1.
 * BaseCards._handleActivate() must recognise id === 0 and call
 * cards._goUp() (see cards.js).
 */
export function buildItemsWithFolders(cards) {
    const base = getItemsToShow(cards);

    if (cards.folders !== true) {
        return base;
    }

    const field = cards.folderField || 'card_type';
    const value = cards.folderValue || 'folder';

    const folders = [];
    const rest = [];

    for (const item of base) {
        if (item[field] === value) {
            folders.push(item);
        } else {
            rest.push(item);
        }
    }

    sortByOrderAndName(folders);
    sortByOrderAndName(rest);

    const result = [];

    // ".." always first — only when we are inside a folder.
    if (cards.parentId !== null && cards.parentId !== undefined) {
        result.push({
            id: 0,
            is_up: true,
            parent_id: cards.parentId,
            [field]: value,
            name: '..',
            title: '..',
            description: 'На уровень выше',
        });
    }

    result.push(...folders);
    result.push(...rest);

    return result;
}

/**
 * Sort a group in place:
 *   1. by sort_order (ascending; missing / null → 0)
 *   2. then by name (fallback: title) — locale-aware
 */
function sortByOrderAndName(items) {
    items.sort((a, b) => {
        const ao = Number(a.sort_order) || 0;
        const bo = Number(b.sort_order) || 0;
        if (ao !== bo) return ao - bo;

        const an = String(a.name ?? a.title ?? '');
        const bn = String(b.name ?? b.title ?? '');
        return an.localeCompare(bn);
    });
}

/**
 * Render one card.
 *
 * Folder mode extras:
 *   - The ".." pseudo-card gets the `card-up` CSS class and, if
 *     the consumer provided `renderUpCard`, its own content. When
 *     no `renderUpCard` is given, the default BaseCardsCard layout
 *     is used (title field with the raw ".." text).
 *   - Regular items keep using cards.renderCard (if provided).
 */
export async function renderItem(cards, item) {
    if (!cards._BaseCardsCard) {
        console.error('[BaseCards] _BaseCardsCard is not loaded');
        return document.createElement('div');
    }

    const cardOptions = { ...cards.cardOptions };

    // ".." pseudo-card — its own content (if provided) + the
    // `card-up` class so the stylesheet can target it.
    if (item && item.is_up === true) {
        cardOptions.customClass = [
            cardOptions.customClass || '',
            'card-up',
        ].filter(Boolean).join(' ');

        if (cards.renderUpCard) {
            cardOptions.renderContent = cards.renderUpCard;
        }
    } else if (cards.renderCard) {
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
        // onActivate — left click / tap → navigate.
        (id, e) => {
            cards._handleActivate(id, e);
        },
        // onSelect — right click / long press → select.
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