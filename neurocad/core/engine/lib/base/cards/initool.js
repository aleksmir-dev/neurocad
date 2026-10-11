// app/core/engine/lib/base/cards/initool.js

/**
 * Toolbar initialization for BaseCards.
 *
 * Reads button-visibility flags from props and creates
 * BaseCardsToolbar. Default is fail-closed (`=== true`): without an
 * explicit permission the button is not rendered. This protects
 * against admin buttons accidentally showing up for a guest.
 *
 * Folder mode
 * -----------
 * When `cards.folders === true`, an additional "Создать папку"
 * button is registered in the toolbar — BEFORE the standard "+"
 * (add) button. It opens the same create form as "+", but with
 * `card_type = <folderValue>` pre-set, so the user can create a
 * folder without having to switch the type in the form.
 *
 * The button is controlled by `props.showFolderButton`:
 *   - true   → shown (only meaningful when `folders === true`);
 *   - absent / false → hidden.
 *
 * The toolbar itself does not need to know about folders — the flag
 * is resolved here, and the click is wired to `cards.openCreateForm()`
 * with a pre-filled initialData. See below.
 *
 * Copy button
 * -----------
 * When the consumer passes `showCopyButton: true`, an extra
 * "Копировать" button is rendered in the LEFT group. It is
 * disabled while nothing is selected, enabled when the selection
 * has 1+ items, and hidden in trash mode (there is nothing to
 * copy from the deleted items view).
 *
 * The click handler calls `cards._handleCopySelected(ids)` with
 * the array of currently selected ids. BaseCards itself does not
 * know how to copy — the consumer must provide an
 * `onCopySelected` callback in `cards.props`. Without it, the
 * button click logs a warning and does nothing.
 *
 * Move button
 * -----------
 * When the consumer passes `showMoveButton: true`, an extra
 * "Переместить" button is rendered in the LEFT group, BETWEEN
 * "Edit" and "Delete". Unlike Copy, Move works on EXACTLY ONE
 * selected item — the same rule as Edit. The click handler calls
 * `cards._handleMoveSelected()` with no arguments; BaseCards
 * resolves the current selection itself and forwards it to the
 * consumer's `onMoveSelected` callback. Without that callback,
 * the click logs a warning and does nothing.
 *
 * extraToolbarButtons
 * -------------------
 * Optional array of link-buttons rendered in the right group of the
 * toolbar, AFTER the standard buttons (trash, search, filter). Each
 * entry is a plain object:
 *
 *   {
 *       href:      '/pages',                  // required
 *       label:     'Открыть каталог статей',  // title text
 *       target:    '_blank',                  // optional
 *       rel:       'noopener noreferrer',     // optional
 *       title:     'Открыть в новой вкладке', // optional (falls back to label)
 *       icon:      'link',                    // name without .svg;
 *                                             // path is assembled as
 *                                             // /static/.../images/link.svg
 *       className: '',                        // extra class
 *   }
 *
 * User-facing strings (button labels, titles) are in Russian.
 * Code comments, docstrings and identifiers are in English.
 */

export function initToolbar(cards) {
    if (!cards._BaseCardsToolbar) {
        console.error('[BaseCards] _BaseCardsToolbar is not loaded');
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

    // Copy button — fail-closed: only when explicitly requested.
    // Consumers that don't want it simply omit the flag.
    const showCopyButton    = cards.props.showCopyButton === true;

    // Move button — fail-closed: only when explicitly requested.
    const showMoveButton    = cards.props.showMoveButton === true;

    // Folder mode: "Создать папку" button.
    // Only makes sense together with `folders === true`. Fail-closed:
    // requires an explicit `showFolderButton === true`.
    const showFolderButton  = cards.folders === true
        && cards.props.showFolderButton === true;

    // Extra buttons — fail-closed: only if explicitly an array.
    // Normalized here so toolbar.js does not have to validate.
    const extraToolbarButtons = Array.isArray(cards.props.extraToolbarButtons)
        ? cards.props.extraToolbarButtons.filter(
              (b) => b && typeof b === 'object' && typeof b.href === 'string' && b.href
          )
        : [];

    console.log('[BaseCards] initToolbar() flags:', {
        showAddButton,
        showEditButton,
        showDeleteButton,
        showRestoreButton,
        showTrashButton,
        showSearch,
        showStatusFilter,
        showCopyButton,
        showMoveButton,
        showFolderButton,
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
        showCopyButton,
        showMoveButton,
        showFolderButton,

        // Extra buttons — rendered in the right group, after
        // the standard ones. See toolbar.js → _getTemplate().
        extraToolbarButtons,

        onAdd: () => cards.openCreateForm(),

        // "Создать папку" — opens the create form with the folder
        // type pre-filled. We temporarily wrap `cards.initialData`
        // to inject `card_type` without mutating the original value.
        onAddFolder: () => {
            const original = cards.initialData;
            cards.initialData = (self) => {
                const base = typeof original === 'function'
                    ? (original(self) || {})
                    : (original && typeof original === 'object' ? original : {});
                return {
                    ...base,
                    [cards.folderField]: cards.folderValue,
                };
            };
            try {
                cards.openCreateForm();
            } finally {
                // Restore the original initialData as soon as the
                // form has been created — the wrapper is one-shot.
                cards.initialData = original;
            }
        },

        onEdit: (id) => cards.openEditForm(id),
        onDelete: () => cards._handleDeleteSelected(),
        onRestore: () => cards._handleRestoreSelected(),

        // Copy — pass the array of selected ids to BaseCards.
        // BaseCards delegates to the consumer's onCopySelected.
        onCopy: () => {
            const ids = Array.from(cards.selectedIds);
            if (ids.length === 0) return;
            cards._handleCopySelected(ids);
        },

        // Move — works on EXACTLY ONE selected item (same rule as
        // Edit). Forward to BaseCards, which resolves the selection
        // itself and calls the consumer's onMoveSelected(id).
        onMove: () => {
            cards._handleMoveSelected();
        },

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