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
        this.gridColumns = props.listView?.gridColumns || 'repeat(auto-fill, minmax(180px, 180px))';
        this.widgetTitle = props.widgetTitle || this.title;
        this.widgetStatus = props.widgetStatus || 'Готово';

        this.section = props.section || null;
        this.parentId = props.parentId || null;

        this.renderCard = props.renderCard || null;
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
        return this._selection.handleActivate(this, id, e);
    }

    _handleSelect(id, e) {
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
        await this._api.addItem(this, data);
        if (this.onReload) await this.onReload();
    }

    async _updateItem(id, data) {
        await this._api.updateItem(this, id, data);
        if (this.onReload) await this.onReload();
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
     */
    openCreateForm() {
        console.log('[BaseCards] openCreateForm()');

        let initialData = {
            parent_id: this.parentId,
            card_type: 'folder',
        };

        try {
            if (typeof this.initialData === 'function') {
                const extra = this.initialData(this) || {};
                initialData = { ...initialData, ...extra };
                console.log('[BaseCards] initialData (function):', initialData);
            } else if (this.initialData && typeof this.initialData === 'object') {
                initialData = { ...initialData, ...this.initialData };
                console.log('[BaseCards] initialData (object):', initialData);
            }
        } catch (e) {
            console.warn('[BaseCards] initialData provider failed:', e);
        }

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
            onSubmit: async (data) => { await this._addItem(data); }
        });

        edit.open();
    }

    openEditForm(id) {
        const item = this.items.find(i => i.id === id);
        if (!item) {
            console.warn('[BaseCards] Item not found:', id);
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