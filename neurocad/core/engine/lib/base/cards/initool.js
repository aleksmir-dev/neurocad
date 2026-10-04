// app/core/engine/lib/base/cards/initool.js

/**
 * Инициализация тулбара для BaseCards.
 *
 * Читает флаги показа кнопок из props и создаёт BaseCardsToolbar.
 * Дефолт — fail-closed (`=== true`): без явного разрешения кнопка
 * не показывается. Это защищает от случайного отображения админ-кнопок
 * для гостя.
 *
 * extraToolbarButtons — дополнительные кнопки-ссылки, которые
 * потребитель может передать через props. Каждая кнопка рендерится
 * в правой части тулбара, ПОСЛЕ стандартных кнопок (корзина и т.д.).
 * Это не админ-действия, а ссылки (например «Открыть публичный
 * каталог»), поэтому они живут в правой группе — рядом с поиском
 * и фильтром, а не рядом с «+».
 *
 * Формат элемента extraToolbarButtons:
 *   {
 *       href:      '/pages',                  // обязательно
 *       label:     'Открыть каталог статей',  // подпись (title)
 *       target:    '_blank',                  // опционально
 *       rel:       'noopener noreferrer',     // опционально
 *       title:     'Открыть в новой вкладке', // опционально, если
 *                                             // не задан — берётся label
 *       icon:      'link',                    // имя без .svg;
 *                                             // путь соберётся как
 *                                             // /static/.../images/link.svg
 *       className: '',                        // дополнительный класс
 *   }
 */

export function initToolbar(cards) {
    if (!cards._BaseCardsToolbar) {
        console.error('[BaseCards] _BaseCardsToolbar не загружен');
        return;
    }

    const toolbarContainer = cards.widgetToolbar || cards.container;

    const showAddButton     = cards.props.showAddButton === true;
    const showEditButton    = cards.props.showEditButton === true;
    const showDeleteButton  = cards.props.showDeleteButton === true;
    const showRestoreButton = cards.props.showRestoreButton === true;
    const showTrashButton   = cards.props.showTrashButton === true;
    const showSearch        = cards.props.showSearch === true;
    const showStatusFilter  = cards.props.showStatusFilter === true
        && Object.keys(cards.statuses).length > 0;

    // Extra buttons — fail-closed: only if explicitly an array.
    // Normalized here so toolbar.js does not have to validate.
    const extraToolbarButtons = Array.isArray(cards.props.extraToolbarButtons)
        ? cards.props.extraToolbarButtons.filter(
              (b) => b && typeof b === 'object' && typeof b.href === 'string' && b.href
          )
        : [];

    console.log('[BaseCards] initToolbar() флаги:', {
        showAddButton,
        showEditButton,
        showDeleteButton,
        showRestoreButton,
        showTrashButton,
        showSearch,
        showStatusFilter,
        extraToolbarButtons: extraToolbarButtons.length,
    });

    cards.toolbar = new cards._BaseCardsToolbar(toolbarContainer, {
        entityType: cards.entityType,
        statusField: cards.statusField,
        statuses: cards.statuses,

        showSearch,
        showStatusFilter,
        showAddButton,
        showEditButton,
        showDeleteButton,
        showRestoreButton,
        showTrashButton,

        // Extra buttons — rendered in the right group, after
        // the standard ones. See toolbar.js → _getTemplate().
        extraToolbarButtons,

        onAdd: () => cards.openCreateForm(),
        onEdit: (id) => cards.openEditForm(id),
        onDelete: () => cards._handleDeleteSelected(),
        onRestore: () => cards._handleRestoreSelected(),
        onToggleTrash: (enabled) => {
            cards.isDeletedMode = enabled;
            cards.selectedIds.clear();
            cards.render();
        },
        onSearch: (query) => {
            cards.filter = query;
            cards.render();
        },
        onStatusFilter: (status) => {
            cards.statusFilter = status;
            cards.render();
        },
        onSelectAll: () => cards._selectAll()
    });
}