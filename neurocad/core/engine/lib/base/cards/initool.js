// app/core/engine/lib/base/cards/initool.js

/**
 * Инициализация тулбара для BaseCards.
 *
 * Читает флаги показа кнопок из props и создаёт BaseCardsToolbar.
 * Дефолт — fail-closed (`=== true`): без явного разрешения кнопка
 * не показывается. Это защищает от случайного отображения админ-кнопок
 * для гостя.
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

    console.log('[BaseCards] initToolbar() флаги:', {
        showAddButton,
        showEditButton,
        showDeleteButton,
        showRestoreButton,
        showTrashButton,
        showSearch,
        showStatusFilter,
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