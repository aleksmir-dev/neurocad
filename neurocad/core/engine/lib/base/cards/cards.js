// app/core/engine/lib/base/cards/cards.js

/**
 * BaseCards — card list container.
 *
 * Facade. All logic is in submodules:
 *   api.js        → CRUD (buildUrl, addItem, updateItem, deleteItem, restoreItem)
 *   dom.js        → DOM widget creation
 *   render.js     → grid render, loading, error, empty
 *   selection.js  → selection, updateUI, syncToolbar, delete/restore selected
 *   initool.js    → toolbar initialization (which buttons to show)
 *
 * All submodules are loaded dynamically with a version to avoid
 * browser cache issues on updates.
 *
 * extraToolbarButtons
 * -------------------
 * Optional array of link buttons rendered in the toolbar, in the
 * right group AFTER the standard buttons (add / edit / delete /
 * trash / search / status filter). Each entry is a plain object:
 *
 *     { href, label?, title?, icon?, target?, rel?, className? }
 *
 * `href` is required (entries without it are dropped). The buttons
 * are passed through to BaseCardsToolbar via initToolbar, which
 * renders them as <a class="cards-toolbar-btn cards-toolbar-btn-link">
 * with an optional <img class="icon">. This keeps BaseCards agnostic
 * about what the links actually do — consumers use it, for example,
 * to add an "open the public catalog in a new tab" link.
 *
 * The array is empty by default, so existing consumers that do not
 * pass it see no change.
 *
 * Copy button
 * -----------
 * Opt-in via `showCopyButton: true` on props. When set, the toolbar
 * renders an extra "Копировать" button next to Edit / Delete. The
 * button works on the CURRENT SELECTION — same model as Delete and
 * Restore — and calls back into the consumer through
 * `onCopySelected(ids)`.
 *
 * BaseCards itself does NOT know how to copy — it only:
 *   1. collects the selected ids from `selectedIds`;
 *   2. forwards them to `onCopySelected`.
 *
 * The consumer (e.g. Pages) is responsible for the actual API call
 * and for reloading the list afterwards. Without an `onCopySelected`
 * callback the button click logs a warning and does nothing.
 *
 * Move button
 * -----------
 * Opt-in via `showMoveButton: true` on props. When set, the toolbar
 * renders an extra "Переместить" button BETWEEN Edit and Delete.
 * Unlike Copy, Move works on EXACTLY ONE selected item — same rule
 * as Edit:
 *
 *   - disabled unless the selection has exactly 1 item;
 *   - disabled in trash mode.
 *
 * The button calls `_handleMoveSelected()`, which forwards the
 * single selected id to the consumer's `onMoveSelected(id)`
 * callback. BaseCards does NOT know what "move" means — the
 * consumer is responsible for the folder picker and the API call.
 *
 * Without an `onMoveSelected` callback the click logs a warning
 * and does nothing.
 *
 * Folder mode
 * -----------
 * Opt-in via `folders: true`. When enabled, the list becomes a
 * hierarchical browser — the same behaviour that used to live in
 * nav.js (and is still there, disabled, until it is rewritten to
 * reuse this).
 *
 *   - `parentId` is the currently-open folder. `null` — root.
 *   - `folderField` — which item field carries the type.
 *     Default: 'card_type'.
 *   - `folderValue` — which value means "folder".
 *     Default: 'folder'.
 *   - `parentHistory` — a stack of previously-open parents, so
 *     `_goUp()` can walk back.
 *   - `onFolderOpen(id)` — optional. If provided, the consumer
 *     takes over folder navigation (BaseCards will not change
 *     its own parentId). If omitted, BaseCards navigates itself.
 *
 * What changes in the UI:
 *   - a ".." pseudo-card is prepended when parentId !== null;
 *   - folders are grouped before non-folders (render.js);
 *   - clicking a folder navigates into it (BaseCards._handleActivate);
 *   - clicking ".." (id === 0) navigates one level up;
 *   - created items get `parent_id: <current parentId>`.
 *
 * Consumer hooks (all optional):
 *   - `renderCard(item)`    — custom content for a regular card;
 *   - `renderUpCard()`      — custom content for the ".." pseudo-card.
 *
 * Non-folder mode (default) is completely unaffected: no "..",
 * no grouping, no parent-history, no behaviour change.
 *
 * User-facing strings (button labels, prompts, error messages)
 * are in Russian. Code comments, docstrings and identifiers are
 * in English.
 */
export class BaseCards {
    constructor(container, props = {}) {
        console.log('[BaseCards] ===== CONSTRUCTOR =====');
        console.log('[BaseCards] container:', container);
        console.log('[BaseCards] props:', props);

        this.container = container;
        this.props = props;

        // Settings from props
        this.entityType = props.entityType || 'items';
        this.title = props.title || 'Список';
        this.icon = props.icon || '📋';
        this.fields = props.fields || [];
        this.listFields = props.listView?.fields || [];
        this.statusField = props.statusField || 'status';
        this.statuses = props.statuses || {};
        this.contextId = props.contextId || null;
        this.contextField = props.contextField || 'plan_id';

        // Grid template for the cards grid.
        //
        // `gridColumns` may be provided by the consumer through
        // `props.listView.gridColumns`. It is applied as an INLINE
        // style on the grid element — which overrides whatever is
        // defined in cards.css.
        //
        // IMPORTANT: do NOT hardcode a fallback here. Previously this
        // line was
        //     props.listView?.gridColumns || 'repeat(auto-fill, minmax(180px, 180px))'
        // — which meant that any consumer who did not pass
        // `gridColumns` got a 180×180 inline grid, and there was no
        // way to override it from CSS. Now, if the consumer does not
        // pass a value, the inline style is not applied at all, and
        // the grid layout comes from cards.css
        // (grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))).
        this.gridColumns = props.listView?.gridColumns || '';

        this.widgetTitle = props.widgetTitle || this.title;
        this.widgetStatus = props.widgetStatus || 'Готово';

        this.section = props.section || null;
        this.parentId = props.parentId || null;

        // ---- Folder mode ----
        // Opt-in. When true, the list is rendered as a hierarchy.
        // See the class docstring for details.
        this.folders = props.folders === true;
        this.folderField = props.folderField || 'card_type';
        this.folderValue = props.folderValue || 'folder';
        // Callback for consumers that want to control navigation
        // themselves (e.g. keep their own URL / breadcrumbs).
        // When null, BaseCards navigates on its own.
        this.onFolderOpen = typeof props.onFolderOpen === 'function'
            ? props.onFolderOpen
            : null;
        // Stack of previously-open parents for _goUp().
        this.parentHistory = [];

        // Custom content renderers.
        //   renderCard   — for regular items (pages, folders, …)
        //   renderUpCard — for the ".." pseudo-card (folder mode only)
        // Both receive the item (renderUpCard ignores it) and return
        // an HTML string or an HTMLElement.
        this.renderCard = props.renderCard || null;
        this.renderUpCard = props.renderUpCard || null;
        this.cardOptions = props.cardOptions || {};

        // Initial data for "Create" form.
        // Can be:
        //   - an object  → merged as-is into initialData;
        //   - a function → called with `this` (cards instance), returns object.
        // Consumer can use this to prefill fields (e.g. default title).
        this.initialData = props.initialData || null;

        this.apiBase = props.apiBase || '/api';
        this.apiEndpoints = props.apiEndpoints || {
            list: '/items',
            create: '/items',
            update: '/items/{id}',
            delete: '/items/{id}',
            restore: '/items/{id}/restore'
        };

        // Optional extra toolbar link-buttons. Passed through to
        // BaseCardsToolbar via initToolbar. Filtered here (fail-closed)
        // so initToolbar / toolbar.js can assume the shape is sane.
        this.extraToolbarButtons = Array.isArray(props.extraToolbarButtons)
            ? props.extraToolbarButtons.filter(
                  (b) => b && typeof b === 'object'
                        && typeof b.href === 'string' && b.href
              )
            : [];

        this.items = props.items || [];
        this.selectedIds = new Set();
        this.isDeletedMode = false;
        this.isLoading = props.isLoading || false;
        this.error = props.error || null;
        this.filter = '';
        this.statusFilter = 'all';
        this.itemInstances = new Map();

        // Callbacks
        this.onItemClick = props.onItemClick || null;   // navigation (for Nav)
        this.onReload = props.onReload || null;
        this.onRetry = props.onRetry || null;

        // Copy callback — provided by the consumer (e.g. Pages).
        // Called with the array of selected ids when the "Копировать"
        // button is clicked. BaseCards does NOT perform the copy —
        // it just forwards the selection.
        this.onCopySelected = typeof props.onCopySelected === 'function'
            ? props.onCopySelected
            : null;

        // Move callback — provided by the consumer (e.g. Pages).
        // Called with the single selected id when the "Переместить"
        // button is clicked. BaseCards does NOT perform the move —
        // it just forwards the selection.
        this.onMoveSelected = typeof props.onMoveSelected === 'function'
            ? props.onMoveSelected
            : null;

        this._initialized = false;
        this._initPromise = null;

        // Classes (loaded dynamically)
        this._BaseCardsCard = null;
        this._BaseCardsToolbar = null;
        this._BaseCardsEdit = null;

        // Modules (loaded dynamically)
        this._api = null;
        this._dom = null;
        this._render = null;
        this._selection = null;
        this._initool = null;

        // Global handler refs (for destroy)
        this._onKeyDownEscape = null;
        this._onKeyDownDelete = null;
        this._onGridClick = null;

        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseCards] _init() START');
        try {
            await this._loadDependencies();
            await this._loadCSS();
            this._dom.createDOM(this);
            this._initool.initToolbar(this);
            this._bindEvents();
            await this._render.render(this);
            this._initialized = true;
            console.log('[BaseCards] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseCards] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadDependencies() {
        console.log('[BaseCards] _loadDependencies()');
        try {
            const version = window.coreEngine?.static_version || Date.now();

            const [
                apiModule,
                domModule,
                renderModule,
                selectionModule,
                initoolModule,
                cardModule,
                toolbarModule,
                editModule,
            ] = await Promise.all([
                import(`./api.js?v=${version}`),
                import(`./dom.js?v=${version}`),
                import(`./render.js?v=${version}`),
                import(`./selection.js?v=${version}`),
                import(`./initool.js?v=${version}`),
                import(`./card/card.js?v=${version}`),
                import(`./toolbar/toolbar.js?v=${version}`),
                import(`./edit/edit.js?v=${version}`),
            ]);

            this._api = apiModule;
            this._dom = domModule;
            this._render = renderModule;
            this._selection = selectionModule;
            this._initool = initoolModule;

            this._BaseCardsCard = cardModule.BaseCardsCard;
            this._BaseCardsToolbar = toolbarModule.BaseCardsToolbar;
            this._BaseCardsEdit = editModule.BaseCardsEdit;

            console.log('[BaseCards] Dependencies loaded:',
                !!this._BaseCardsCard, !!this._BaseCardsToolbar, !!this._BaseCardsEdit);
        } catch (error) {
            console.error('[BaseCards] Dependency load error:', error);
            throw error;
        }
    }

    async _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            const cssFiles = [
                'core/engine/lib/base/cards/cards.css',
                'core/engine/lib/base/cards/card/card.css',
                'core/engine/lib/base/cards/toolbar/toolbar.css',
                'core/engine/lib/base/cards/edit/edit.css'
            ];
            const loadPromises = cssFiles.map(file => new Promise((resolve) => {
                window.coreEngine.loadCSS(file);
                setTimeout(resolve, 50);
            }));
            await Promise.all(loadPromises);
        } else {
            console.warn('[BaseCards] coreEngine.loadCSS not found');
        }
    }

    _icon(name) {
        const version = window.coreEngine?.static_version || Date.now();
        return `/static/core/engine/lib/base/images/${name}.svg?v=${version}`;
    }

    _bindEvents() {
        // Escape — clear selection
        this._onKeyDownEscape = (e) => {
            if (e.key === 'Escape') {
                this._selection.clearSelection(this);
            }
        };

        // Delete/Backspace — delete (or restore) selected
        this._onKeyDownDelete = (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds.size > 0) {
                if (!e.target.closest('input, textarea, select')) {
                    e.preventDefault();
                    if (this.isDeletedMode) {
                        this._selection.handleRestoreSelected(this);
                    } else {
                        this._selection.handleDeleteSelected(this);
                    }
                }
            }
        };

        document.addEventListener('keydown', this._onKeyDownEscape);
        document.addEventListener('keydown', this._onKeyDownDelete);

        // Click on empty grid area — clear selection
        this._onGridClick = (e) => {
            if (e.target.closest('.core-engine-lib-base-cards-card')) return;
            this._selection.clearSelection(this);
        };

        if (this.grid) {
            this.grid.addEventListener('click', this._onGridClick);
        }
    }

    // ============================================
    // DELEGATION TO MODULES
    // ============================================

    async render() {
        return this._render.render(this);
    }

    _getItemsToShow() {
        return this._render.getItemsToShow(this);
    }

    _handleActivate(id, e) {
        // ---- Folder mode: ".." pseudo-card ----
        // id === 0 is reserved for the "go up" pseudo-card. It is
        // never a real item, so we intercept it BEFORE the selection
        // module gets a chance to look up the item.
        if (this.folders && id === 0) {
            this._goUp();
            return;
        }

        // ---- Folder mode: navigate into a folder ----
        // If the item is a folder, either hand navigation over to the
        // consumer (onFolderOpen) or navigate ourselves.
        if (this.folders) {
            const item = this.items.find(i => i.id === id);
            if (item && item[this.folderField] === this.folderValue) {
                if (this.onFolderOpen) {
                    this.onFolderOpen(id, item);
                } else {
                    this._openFolder(id);
                }
                return;
            }
        }

        return this._selection.handleActivate(this, id, e);
    }

    _handleSelect(id, e) {
        // ".." is not a real item — it cannot be selected.
        if (this.folders && id === 0) return;

        return this._selection.handleSelect(this, id, e);
    }

    _clearSelection() {
        return this._selection.clearSelection(this);
    }

    _selectAll() {
        return this._selection.selectAll(this);
    }

    _syncToolbar() {
        return this._selection.syncToolbar(this);
    }

    _updateUI() {
        return this._selection.updateUI(this);
    }

    async _handleDeleteSelected() {
        return this._selection.handleDeleteSelected(this);
    }

    async _handleRestoreSelected() {
        return this._selection.handleRestoreSelected(this);
    }

    /**
     * Copy selected items.
     *
     * Called by BaseCardsToolbar when the "Копировать" button is
     * clicked. BaseCards does NOT know what copying means — it just
     * forwards the selected ids to the consumer's `onCopySelected`
     * callback.
     *
     * The consumer is expected to:
     *   - perform the actual copy (e.g. POST /item/<id>/duplicate);
     *   - reload the list afterwards (via onReload).
     *
     * If no callback was provided, the click is logged and ignored.
     * This keeps BaseCards agnostic — a consumer that enables the
     * copy button but forgets the callback sees a warning instead
     * of a silent no-op.
     *
     * @param {number[]} ids — array of selected item ids
     */
    async _handleCopySelected(ids) {
        if (!this.onCopySelected) {
            console.warn(
                '[BaseCards] _handleCopySelected(): onCopySelected ' +
                'callback is not set — nothing to do'
            );
            return;
        }

        console.log('[BaseCards] _handleCopySelected() ids =', ids);
        await this.onCopySelected(ids);
    }

    /**
     * Move the single selected item.
     *
     * Called by BaseCardsToolbar when the "Переместить" button is
     * clicked. The toolbar only enables the button when the
     * selection has EXACTLY ONE item, so we can safely resolve the
     * single id here.
     *
     * BaseCards does NOT know what "move" means — it just forwards
     * the id to the consumer's `onMoveSelected` callback. The
     * consumer is expected to:
     *   - open a folder picker (or any other UI);
     *   - send the update (e.g. PUT /item/<id> with parent_id);
     *   - reload the list afterwards (via onReload).
     *
     * If no callback was provided, or the selection is not exactly
     * one item, the click is logged and ignored.
     */
    async _handleMoveSelected() {
        if (!this.onMoveSelected) {
            console.warn(
                '[BaseCards] _handleMoveSelected(): onMoveSelected ' +
                'callback is not set — nothing to do'
            );
            return;
        }

        const ids = Array.from(this.selectedIds);
        if (ids.length !== 1) {
            console.warn(
                '[BaseCards] _handleMoveSelected(): expected exactly 1 ' +
                'selected item, got', ids.length
            );
            return;
        }

        const id = ids[0];
        console.log('[BaseCards] _handleMoveSelected() id =', id);
        await this.onMoveSelected(id);
    }

    async _deleteItem(id) {
        return this._api.deleteItem(this, id);
    }

    async _restoreItem(id) {
        return this._api.restoreItem(this, id);
    }

    _buildUrl(endpoint, params = {}) {
        return this._api.buildUrl(this, endpoint, params);
    }

    async _addItem(data) {
        // ===== [DEBUG] =====
        console.log('=== [BaseCards] _addItem ===');
        console.log('[DEBUG] payload =', JSON.stringify(data));
        console.log('[DEBUG] data.parent_id =', data?.parent_id, '| typeof =', typeof data?.parent_id);
        console.log('[DEBUG] this.parentId =', this.parentId, '| typeof =', typeof this.parentId);
        // ===== [/DEBUG] =====

        await this._api.addItem(this, data);
        if (this.onReload) await this.onReload();
    }

    async _updateItem(id, data) {
        await this._api.updateItem(this, id, data);
        if (this.onReload) await this.onReload();
    }

    // ============================================
    // FOLDER NAVIGATION
    // ============================================

    /**
     * Navigate one level up.
     *
     * Pops the previous parent off the stack. If the stack is empty,
     * goes to the root (parentId = null).
     *
     * Only meaningful when `folders === true`. In non-folder mode
     * this is never called.
     *
     * After updating parentId, the list is reloaded via the
     * consumer's onReload callback — BaseCards does not know how to
     * fetch its own list.
     */
    _goUp() {
        // ===== [DEBUG] =====
        console.log('=== [BaseCards] _goUp ===');
        console.log('[DEBUG] parentId ДО:', this.parentId);
        console.log('[DEBUG] parentHistory ДО:', [...this.parentHistory]);
        // ===== [/DEBUG] =====

        if (this.parentHistory.length > 0) {
            this.parentId = this.parentHistory.pop();
        } else {
            this.parentId = null;
        }

        // ===== [DEBUG] =====
        console.log('[DEBUG] parentId ПОСЛЕ:', this.parentId);
        console.log('[DEBUG] parentHistory ПОСЛЕ:', [...this.parentHistory]);
        // ===== [/DEBUG] =====

        if (this.onReload) {
            this.onReload();
        }
    }

    /**
     * Navigate into a folder.
     *
     * Pushes the current parentId onto the history stack, sets the
     * new parent, and asks the consumer to reload.
     *
     * Only meaningful when `folders === true`. In non-folder mode
     * this is never called.
     */
    _openFolder(id) {
        // ===== [DEBUG] =====
        console.log('=== [BaseCards] _openFolder ===');
        console.log('[DEBUG] входящий id:', id, '| typeof id:', typeof id);
        console.log('[DEBUG] parentId ДО:', this.parentId);
        console.log('[DEBUG] parentHistory ДО:', [...this.parentHistory]);
        // ===== [/DEBUG] =====

        this.parentHistory.push(this.parentId);
        this.parentId = id;

        // ===== [DEBUG] =====
        console.log('[DEBUG] parentId ПОСЛЕ:', this.parentId);
        console.log('[DEBUG] parentHistory ПОСЛЕ:', [...this.parentHistory]);
        // ===== [/DEBUG] =====

        if (this.onReload) {
            this.onReload();
        }
    }

    /**
     * Set the current parent explicitly (no history push).
     *
     * Useful when the consumer wants to jump somewhere (e.g. from a
     * breadcrumb click) without affecting the history stack.
     */
    setParentId(id) {
        this.parentId = id;
        if (this.onReload) {
            this.onReload();
        }
    }

    /**
     * Reset the navigation history and return to the root.
     */
    resetParent() {
        this.parentHistory = [];
        this.parentId = null;
        if (this.onReload) {
            this.onReload();
        }
    }

    // ============================================
    // FORMS
    // ============================================

    /**
     * Open the "Create" form.
     *
     * initialData priority:
     *   1. this.initialData as a function → called with `this`, returns object.
     *   2. this.initialData as an object  → used as-is.
     *   3. Fallback — basic card defaults.
     *
     * Consumer can use this to prefill fields (e.g. default title "Статья N").
     *
     * In folder mode the fallback also carries `parent_id` so a new
     * item is created inside the currently-open folder. Consumers
     * that set their own `initialData` may override this — the value
     * they provide wins (see the merge below).
     */
    openCreateForm() {
        // ===== [DEBUG] =====
        console.log('=== [BaseCards] openCreateForm ===');
        console.log('[DEBUG] this.parentId =', this.parentId, '| typeof =', typeof this.parentId);
        console.log('[DEBUG] this.folders =', this.folders);
        // ===== [/DEBUG] =====

        let initialData = {
            parent_id: this.parentId,
        };

        try {
            if (typeof this.initialData === 'function') {
                const extra = this.initialData(this) || {};
                initialData = { ...initialData, ...extra };
                console.log('[BaseCards] initialData (function):',
                    JSON.stringify(initialData));
            } else if (this.initialData && typeof this.initialData === 'object') {
                initialData = { ...initialData, ...this.initialData };
                console.log('[BaseCards] initialData (object):',
                    JSON.stringify(initialData));
            }
        } catch (e) {
            console.warn('[BaseCards] initialData provider failed:', e);
        }

        // ===== [DEBUG] =====
        console.log('[DEBUG] initialData перед передачей в форму =',
            JSON.stringify(initialData));
        console.log('[DEBUG] initialData.parent_id =', initialData?.parent_id,
            '| typeof =', typeof initialData?.parent_id);
        // ===== [/DEBUG] =====

        // Fallback — no BaseCardsEdit available
        if (!this._BaseCardsEdit) {
            const title = prompt('Введите название:', initialData.title || '');
            if (title) {
                this._addItem({ name: title, ...initialData });
            }
            return;
        }

        const edit = new this._BaseCardsEdit({
            fields: this.fields,
            title: 'Создать',
            entityType: this.entityType,
            initialData,
            onSubmit: async (data) => {
                // ===== [DEBUG] =====
                console.log('=== [BaseCards] onSubmit (create) ===');
                console.log('[DEBUG] data из формы =', JSON.stringify(data));
                console.log('[DEBUG] data.parent_id =', data?.parent_id,
                    '| typeof =', typeof data?.parent_id);
                console.log('[DEBUG] this.parentId в момент submit =', this.parentId);
                // ===== [/DEBUG] =====
                await this._addItem(data);
            }
        });

        edit.open();
    }

    openEditForm(id) {
        const item = this.items.find(i => i.id === id);
        if (!item) {
            console.warn('[BaseCards] item not found:', id);
            return;
        }

        if (!this._BaseCardsEdit) {
            const newTitle = prompt('Изменить название:', item.name || item.title || '');
            if (newTitle !== null) this._updateItem(id, { name: newTitle });
            return;
        }

        const edit = new this._BaseCardsEdit({
            fields: this.fields,
            title: 'Редактировать',
            entityType: this.entityType,
            initialData: item,
            onSubmit: async (data) => { await this._updateItem(id, data); }
        });

        edit.open();
    }

    // ============================================
    // PUBLIC API
    // ============================================

    async updateProps(props) {
        this.props = { ...this.props, ...props };

        if (props.items !== undefined) this.items = props.items;
        if (props.isLoading !== undefined) this.isLoading = props.isLoading;
        if (props.error !== undefined) this.error = props.error;
        if (props.contextId !== undefined) this.contextId = props.contextId;
        if (props.onReload !== undefined) this.onReload = props.onReload;
        if (props.onRetry !== undefined) this.onRetry = props.onRetry;
        if (props.onItemClick !== undefined) this.onItemClick = props.onItemClick;

        // Folder mode: parentId may be updated from outside too (e.g.
        // when the consumer restores the UI from a URL). Update it
        // without touching history — the consumer is in charge here.
        if (props.parentId !== undefined) this.parentId = props.parentId;

        if (props.widgetTitle !== undefined) {
            this.widgetTitle = props.widgetTitle;
            const titlebar = this.widget?.querySelector('.core-engine-lib-base-widget-titlebar span:first-child');
            if (titlebar) titlebar.textContent = this.widgetTitle;
        }

        if (props.widgetStatus !== undefined) {
            this.widgetStatus = props.widgetStatus;
            if (this.statusTextEl) {
                this.statusTextEl.textContent = this.selectedIds.size > 0
                    ? `Выбрано: ${this.selectedIds.size}`
                    : this.widgetStatus;
            }
        }

        await this.render();
    }

    getSelectedItems() {
        const items = [];
        for (const id of this.selectedIds) {
            const item = this.items.find(i => i.id === id);
            if (item) items.push(item);
        }
        return items;
    }

    getAllItems() {
        return this.items;
    }

    async destroy() {
        if (this._onKeyDownEscape) {
            document.removeEventListener('keydown', this._onKeyDownEscape);
            this._onKeyDownEscape = null;
        }
        if (this._onKeyDownDelete) {
            document.removeEventListener('keydown', this._onKeyDownDelete);
            this._onKeyDownDelete = null;
        }
        if (this.grid && this._onGridClick) {
            this.grid.removeEventListener('click', this._onGridClick);
            this._onGridClick = null;
        }

        if (this.toolbar) {
            if (typeof this.toolbar.destroy === 'function') this.toolbar.destroy();
            this.toolbar = null;
        }

        for (const [, instance] of this.itemInstances) {
            if (typeof instance.destroy === 'function') instance.destroy();
        }
        this.itemInstances.clear();

        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}