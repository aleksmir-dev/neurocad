// app/core/engine/lib/base/cards/toolbar/toolbar.js

/**
 * Toolbar for Cards.
 * Manages buttons, filtering and state.
 *
 * extraToolbarButtons
 * -------------------
 * Optional link-buttons passed by the consumer through props. Each
 * is a plain object { href, label?, title?, icon?, target?, rel?,
 * className? }. Rendered in the LEFT group, AFTER the standard
 * buttons (add / edit / delete / restore) and BEFORE the selection
 * counter — visually next to "+", the pencil and the bin, not next
 * to search and the status filter.
 *
 * Normalized in initool.js (and defensively in cards.js), but there
 * is a local guard here in case BaseCardsToolbar is used standalone.
 *
 * Folder mode
 * -----------
 * When the consumer enables `folders: true` on BaseCards and also
 * passes `showFolderButton: true`, an additional "Создать папку"
 * button is rendered BEFORE the standard "+" (add) button. Its
 * click handler is `props.onAddFolder`. If the handler is missing,
 * the button is not rendered (fail-closed).
 *
 * Copy button
 * -----------
 * When the consumer passes `showCopyButton: true`, a "Копировать"
 * button is rendered in the LEFT group. It is:
 *
 *   - disabled while nothing is selected;
 *   - enabled when the selection has 1 or more items;
 *   - hidden in trash mode (nothing to copy there).
 *
 * The click handler calls `props.onCopy()`. BaseCardsToolbar does
 * NOT know what "copy" means — the consumer decides. See
 * initool.js → onCopy for the wiring.
 *
 * Move button
 * -----------
 * When the consumer passes `showMoveButton: true`, a "Переместить"
 * button is rendered in the LEFT group, BETWEEN "Edit" and "Delete".
 * Unlike Copy, Move works on EXACTLY ONE selected item — the same
 * rule as Edit:
 *
 *   - disabled unless the selection has exactly 1 item;
 *   - disabled in trash mode.
 *
 * Rationale: moving is a per-item decision (which folder does THIS
 * card belong in?). Multi-select move would require a folder picker
 * for every batch and quickly turns into a "why did 8 cards land
 * here?" problem. One at a time is predictable and simple.
 *
 * The click handler calls `props.onMove()` with no arguments —
 * BaseCardsToolbar does NOT know what "move" means, the consumer
 * resolves the current selection itself.
 *
 * Layout of the LEFT group:
 *   folder (opt) → add → copy (opt) → edit → move (opt) → delete
 *                → restore → extras → counter
 *
 * User-facing strings (button labels, placeholder, counter, trash
 * titles) are in Russian. Code comments, docstrings and identifiers
 * are in English.
 */
export class BaseCardsToolbar {
    constructor(container, props = {}) {
        this.container = container;
        this.props = props;

        // Cache-buster for icons.
        this.version = window.coreEngine?.static_version || Date.now();
        this.iconPath = '/static/core/engine/lib/base/images';

        // Settings
        this.entityType = props.entityType || 'items';
        this.statusField = props.statusField || 'status';
        this.statuses = props.statuses || {};
        this.showSearch = props.showSearch !== false;
        this.showStatusFilter = props.showStatusFilter !== false;
        this.showAddButton = props.showAddButton !== false;
        this.showEditButton = props.showEditButton !== false;
        this.showDeleteButton = props.showDeleteButton !== false;
        this.showRestoreButton = props.showRestoreButton !== false;
        this.showTrashButton = props.showTrashButton !== false;

        // Copy button — fail-closed: only when explicitly requested
        // AND a click handler is provided.
        this.showCopyButton = props.showCopyButton === true
            && typeof props.onCopy === 'function';

        // Move button — fail-closed: only when explicitly requested
        // AND a click handler is provided.
        this.showMoveButton = props.showMoveButton === true
            && typeof props.onMove === 'function';

        // Folder mode: "Создать папку".
        // Fail-closed — requires an explicit `showFolderButton === true`
        // AND a handler `onAddFolder`. Otherwise the button is not
        // rendered at all.
        this.showFolderButton = props.showFolderButton === true
            && typeof props.onAddFolder === 'function';

        // Extra buttons — links rendered in the LEFT group, after
        // the standard buttons and before the selection counter.
        // Normalized in initool.js / cards.js, but guard here too
        // so BaseCardsToolbar can be used standalone.
        this.extraToolbarButtons = Array.isArray(props.extraToolbarButtons)
            ? props.extraToolbarButtons.filter(
                  (b) => b && typeof b === 'object' && typeof b.href === 'string' && b.href
              )
            : [];

        // State
        this.isDeletedMode = false;
        this.selectedCount = 0;
        this.currentFilter = '';
        this.currentStatusFilter = 'all';
        this.isLoading = false;

        // First selected id (for the "Edit" and "Move" buttons).
        this._firstSelectedId = null;

        // Callbacks
        this.onAdd = props.onAdd || null;
        this.onAddFolder = props.onAddFolder || null;
        this.onEdit = props.onEdit || null;
        this.onDelete = props.onDelete || null;
        this.onCopy = props.onCopy || null;
        this.onMove = props.onMove || null;
        this.onRestore = props.onRestore || null;
        this.onToggleTrash = props.onToggleTrash || null;
        this.onSearch = props.onSearch || null;
        this.onStatusFilter = props.onStatusFilter || null;
        this.onSelectAll = props.onSelectAll || null;

        // Global handler refs (for destroy).
        this._onKeyDown = null;

        // Build DOM.
        this._createDOM();
        this._bindEvents();
        this._updateUI();
    }

    /**
     * Path to an icon.
     */
    _icon(name) {
        return `${this.iconPath}/${name}.svg?v=${this.version}`;
    }

    /**
     * Build the toolbar DOM.
     */
    _createDOM() {
        const existing = this.container.querySelector('.core-engine-lib-base-cards-toolbar');
        if (existing) {
            this.toolbar = existing;
            this._cacheElements();
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-cards-toolbar';
        toolbar.innerHTML = this._getTemplate();
        this.container.prepend(toolbar);
        this.toolbar = toolbar;
        this._cacheElements();
    }

    /**
     * Toolbar template.
     *
     * Order of buttons in the LEFT group:
     *   folder → add → copy → edit → move → delete → restore
     *          → extras → counter
     *
     * Order in the RIGHT group:
     *   status-filter → search → trash
     *
     * extrasHtml sits in the LEFT group because link-buttons
     * ("Заголовок", "Открыть каталог") are catalog actions, not
     * filters. See the class JSDoc.
     */
    _getTemplate() {
        const statusOptions = this._getStatusOptions();
        const extrasHtml = this._getExtraButtonsHtml();

        return `
            <div class="cards-toolbar-left">

                ${this.showAddButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-add" title="Добавить ${this.entityType}">
                        <img class="icon" src="${this._icon('add')}" alt="Добавить" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showFolderButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-folder" title="Создать папку">
                        <img class="icon" src="${this._icon('folder')}" alt="Создать папку" width="20" height="20">
                    </button>
                ` : ''}                

                ${this.showCopyButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-copy" title="Копировать" disabled>
                        <img class="icon" src="${this._icon('copy')}" alt="Копировать" width="20" height="20">
                    </button>
                ` : ''}                

                ${this.showEditButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-edit" title="Редактировать" disabled>
                        <img class="icon" src="${this._icon('edit')}" alt="Редактировать" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showMoveButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-move" title="Переместить" disabled>
                        <img class="icon" src="${this._icon('move')}" alt="Переместить" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showDeleteButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-delete" title="Удалить" disabled>
                        <img class="icon" src="${this._icon('delete')}" alt="Удалить" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showRestoreButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-restore" title="Восстановить" disabled style="display:none;">
                        <img class="icon" src="${this._icon('restore')}" alt="Восстановить" width="20" height="20">
                    </button>
                ` : ''}

                ${extrasHtml}

                <span class="cards-toolbar-selected" data-js="selected-counter"></span>
            </div>

            <div class="cards-toolbar-right">
                ${this.showStatusFilter && statusOptions.length > 0 ? `
                    <select class="cards-toolbar-status-filter" data-js="status-filter">
                        <option value="all">Все статусы</option>
                        ${statusOptions.map(opt => `
                            <option value="${opt.value}">${opt.icon || ''} ${opt.label}</option>
                        `).join('')}
                    </select>
                ` : ''}

                ${this.showSearch ? `
                    <input class="cards-toolbar-search" type="text" placeholder="Поиск..." data-js="search-input">
                ` : ''}

                ${this.showTrashButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-trash" title="Корзина" data-js="trash-btn">
                        <img class="icon" src="${this._icon('eye')}" alt="Корзина" width="20" height="20">
                    </button>
                ` : ''}
            </div>
        `;
    }

    /**
     * Build HTML for extraToolbarButtons.
     *
     * Each button is an <a>, not a <button>, because it is a
     * navigation link or an action that opens a modal, not a
     * built-in toolbar button. The styling matches .cards-toolbar-btn,
     * with the .cards-toolbar-btn-link modifier for <a>-specific
     * tweaks (text-decoration: none etc.). The icon is an
     * <img class="icon">, same 20×20 size as the other buttons.
     *
     * The button class is passed through `className` and used by the
     * consumer for delegated click interception (for example,
     * js-open-title-modal opens the "Заголовок" modal).
     */
    _getExtraButtonsHtml() {
        if (!this.extraToolbarButtons.length) return '';

        return this.extraToolbarButtons.map((btn) => {
            const label = String(btn.label || '').trim();
            const title = String(btn.title || label || '').trim();
            const target = String(btn.target || '_blank').trim();
            const rel = String(btn.rel || 'noopener noreferrer').trim();
            const extraClass = String(btn.className || '').trim();

            const iconHtml = btn.icon
                ? `<img class="icon" src="${this._icon(btn.icon)}" alt="" aria-hidden="true" width="20" height="20">`
                : '';

            return `
                <a class="cards-toolbar-btn cards-toolbar-btn-link ${extraClass}"
                   href="${btn.href}"
                   target="${target}"
                   rel="${rel}"
                   title="${title}"
                   aria-label="${label || title}">
                    ${iconHtml}
                </a>
            `;
        }).join('');
    }

    /**
     * Status filter options.
     */
    _getStatusOptions() {
        const options = [];
        if (this.statuses && typeof this.statuses === 'object') {
            for (const [key, value] of Object.entries(this.statuses)) {
                options.push({
                    value: key,
                    label: value.label || key,
                    icon: value.icon || ''
                });
            }
        }
        return options;
    }

    /**
     * Cache DOM elements.
     */
    _cacheElements() {
        this.folderBtn = this.toolbar.querySelector('.cards-toolbar-btn-folder');
        this.addBtn = this.toolbar.querySelector('.cards-toolbar-btn-add');
        this.copyBtn = this.toolbar.querySelector('.cards-toolbar-btn-copy');
        this.editBtn = this.toolbar.querySelector('.cards-toolbar-btn-edit');
        this.moveBtn = this.toolbar.querySelector('.cards-toolbar-btn-move');
        this.deleteBtn = this.toolbar.querySelector('.cards-toolbar-btn-delete');
        this.restoreBtn = this.toolbar.querySelector('.cards-toolbar-btn-restore');
        this.trashBtn = this.toolbar.querySelector('[data-js="trash-btn"]');
        this.searchInput = this.toolbar.querySelector('[data-js="search-input"]');
        this.statusFilter = this.toolbar.querySelector('[data-js="status-filter"]');
        this.selectedCounter = this.toolbar.querySelector('[data-js="selected-counter"]');
    }

    /**
     * Bind events.
     */
    _bindEvents() {
        // Create folder — must be BEFORE add, and is independent of it.
        if (this.folderBtn) {
            this.folderBtn.addEventListener('click', () => {
                if (this.onAddFolder) this.onAddFolder();
            });
        }

        // Add
        if (this.addBtn) {
            this.addBtn.addEventListener('click', () => {
                if (this.onAdd) this.onAdd();
            });
        }

        // Edit
        if (this.editBtn) {
            this.editBtn.addEventListener('click', () => {
                if (this.onEdit && this.selectedCount > 0) {
                    this.onEdit(this.getFirstSelectedId());
                }
            });
        }

        // Delete
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', () => {
                if (this.onDelete) this.onDelete();
            });
        }

        // Copy — pass the whole selection to the consumer.
        // Enabled state is managed in _updateUI().
        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', () => {
                if (this.onCopy && this.selectedCount > 0) {
                    this.onCopy();
                }
            });
        }

        // Move — works on EXACTLY ONE selected item (same rule as
        // Edit). The consumer resolves the current selection
        // itself; we only forward "the user asked to move".
        if (this.moveBtn) {
            this.moveBtn.addEventListener('click', () => {
                if (this.onMove && this.selectedCount === 1) {
                    this.onMove();
                }
            });
        }

        // Restore
        if (this.restoreBtn) {
            this.restoreBtn.addEventListener('click', () => {
                if (this.onRestore) this.onRestore();
            });
        }

        // Trash toggle
        if (this.trashBtn) {
            this.trashBtn.addEventListener('click', () => {
                this.isDeletedMode = !this.isDeletedMode;
                this.trashBtn.classList.toggle('active', this.isDeletedMode);
                if (this.onToggleTrash) {
                    this.onToggleTrash(this.isDeletedMode);
                }
                this._updateUI();
            });
        }

        // Search (debounced)
        if (this.searchInput) {
            let timeout;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.currentFilter = e.target.value;
                    if (this.onSearch) {
                        this.onSearch(this.currentFilter);
                    }
                }, 300);
            });
        }

        // Status filter
        if (this.statusFilter) {
            this.statusFilter.addEventListener('change', (e) => {
                this.currentStatusFilter = e.target.value;
                if (this.onStatusFilter) {
                    this.onStatusFilter(this.currentStatusFilter);
                }
            });
        }

        // Keyboard shortcuts — keep the ref so destroy() can remove it.
        this._onKeyDown = (e) => {
            // Ctrl+A — select all, but only when the focus is NOT in
            // an editable field.
            if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                const tag = e.target?.tagName;
                const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
                if (isEditable) return;

                if (this.onSelectAll) {
                    e.preventDefault();
                    this.onSelectAll();
                }
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    /**
     * Get the first selected id.
     */
    getFirstSelectedId() {
        return this._firstSelectedId || null;
    }

    /**
     * Set the first selected id (for the "Edit" and "Move" buttons).
     */
    setFirstSelectedId(id) {
        this._firstSelectedId = id;
        this._updateUI();
    }

    /**
     * Update button state.
     */
    _updateUI() {
        const selected = this.selectedCount;

        // Edit — only when exactly one item is selected.
        if (this.editBtn) {
            const disabled = selected !== 1 || this.isDeletedMode || !this._firstSelectedId;
            this.editBtn.disabled = disabled;
            this.editBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Delete — one or more items selected.
        if (this.deleteBtn) {
            const disabled = selected === 0 || this.isDeletedMode;
            this.deleteBtn.disabled = disabled;
            this.deleteBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Copy — one or more items selected, and not in trash mode.
        // (Copying from the trash view makes no sense — the items
        // are soft-deleted.)
        if (this.copyBtn) {
            const disabled = selected === 0 || this.isDeletedMode;
            this.copyBtn.disabled = disabled;
            this.copyBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Move — EXACTLY ONE item selected (same rule as Edit),
        // and not in trash mode.
        if (this.moveBtn) {
            const disabled = selected !== 1 || this.isDeletedMode || !this._firstSelectedId;
            this.moveBtn.disabled = disabled;
            this.moveBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Restore — only in trash mode.
        if (this.restoreBtn) {
            const disabled = selected === 0 || !this.isDeletedMode;
            this.restoreBtn.disabled = disabled;
            this.restoreBtn.style.opacity = disabled ? '0.4' : '1';
            this.restoreBtn.style.display = this.isDeletedMode ? 'inline-flex' : 'none';
        }

        // Selected counter.
        if (this.selectedCounter) {
            if (selected > 0) {
                this.selectedCounter.textContent = `Выбрано: ${selected}`;
                this.selectedCounter.style.display = 'inline';
            } else {
                this.selectedCounter.textContent = '';
                this.selectedCounter.style.display = 'none';
            }
        }

        // Trash icon.
        if (this.trashBtn) {
            const iconImg = this.trashBtn.querySelector('img.icon');
            if (iconImg) {
                iconImg.src = this.isDeletedMode
                    ? this._icon('eyec')
                    : this._icon('eye');
            }
            this.trashBtn.title = this.isDeletedMode ? 'Выйти из корзины' : 'Корзина';
        }
    }

    /**
     * Set the selected count.
     */
    setSelectedCount(count) {
        this.selectedCount = count;
        // Reset firstSelectedId when the selection is cleared.
        if (count === 0) {
            this._firstSelectedId = null;
        }
        this._updateUI();
    }

    /**
     * Set loading mode.
     */
    setLoading(loading) {
        this.isLoading = loading;
        if (this.addBtn) {
            this.addBtn.disabled = loading;
        }
        if (this.folderBtn) {
            this.folderBtn.disabled = loading;
        }
    }

    /**
     * Reset filters.
     */
    resetFilters() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this.currentFilter = '';
            if (this.onSearch) {
                this.onSearch('');
            }
        }
        if (this.statusFilter) {
            this.statusFilter.value = 'all';
            this.currentStatusFilter = 'all';
            if (this.onStatusFilter) {
                this.onStatusFilter('all');
            }
        }
    }

    /**
     * Set trash mode.
     */
    setTrashMode(enabled) {
        this.isDeletedMode = enabled;
        if (this.trashBtn) {
            this.trashBtn.classList.toggle('active', enabled);
        }
        this._updateUI();
    }

    /**
     * Get state.
     */
    getState() {
        return {
            isDeletedMode: this.isDeletedMode,
            filter: this.currentFilter,
            statusFilter: this.currentStatusFilter,
            selectedCount: this.selectedCount
        };
    }

    /**
     * Destroy.
     */
    destroy() {
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
    }
}