// app/core/engine/lib/base/table/table.js

/**
 * Generic table component.
 * Renders a table with data, row selection, responsive layout.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 */
export class Table {
    /**
     * @param {HTMLElement} container - container for the table
     * @param {Object} props - table properties
     * @param {Array} props.columns - columns [{ field, label, width?, type? }]
     * @param {Array} props.data - data rows (array of objects)
     * @param {Array} props.actions - actions [{ label, action, class? }]
     * @param {boolean} props.selectable - row selection (default true)
     * @param {Function} props.onSelect - row select callback
     * @param {Function} props.onDblClick - double click callback
     * @param {string} props.apiUrl - URL to load data from
     * @param {Object} props.apiParams - request params
     */
    constructor(container, props = {}) {
        console.log('[Table] Constructor called');
        this.container = container;
        this.props = props;
        this.selectedId = null;
        this.data = props.data || [];
        this.columns = props.columns || [];
        this.actions = props.actions || [];
        this.selectable = props.selectable !== false;
        this.onSelect = props.onSelect || null;
        this.onDblClick = props.onDblClick || null;
        this.apiUrl = props.apiUrl || null;
        this.apiParams = props.apiParams || {};
        this.isLoading = false;
        this.error = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Load CSS
        this._loadCSS();

        // Start async init
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Table] _init() START');
        try {
            // If there is an API URL — load data
            if (this.apiUrl) {
                await this._loadData();
            }
            this._initialized = true;
            console.log('[Table] _init() COMPLETE');
        } catch (error) {
            console.error('[Table] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    /**
     * Load data from the server.
     */
    async _loadData() {
        console.log('[Table] _loadData()', this.apiUrl);
        this.isLoading = true;
        this.error = null;

        try {
            const url = new URL(this.apiUrl, window.location.origin);

            // Append params
            Object.keys(this.apiParams).forEach(key => {
                url.searchParams.append(key, this.apiParams[key]);
            });

            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url.toString());

            if (data.success) {
                this.data = data.data || [];
                console.log('[Table] Data loaded:', this.data.length);
            } else {
                throw new Error(data.message || 'Data load error');
            }
        } catch (error) {
            console.error('[Table] Data load error:', error);
            this.error = error.message;
            // If props.data is present — use it as fallback
            if (this.props.data && this.props.data.length > 0) {
                this.data = this.props.data;
            } else {
                this.data = [];
            }
        } finally {
            this.isLoading = false;
            // Render after load
            this.render();
        }
    }

    /**
     * Load CSS for the table.
     */
    _loadCSS() {
        console.log('[Table] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/table/table.css');
        }
    }

    /**
     * Render the table.
     */
    render() {
        console.log('[Table] render()');
        this.container.innerHTML = '';

        // Wrapper for the whole table
        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-table-wrapper';

        // Loading state
        if (this.isLoading) {
            const loading = document.createElement('div');
            loading.className = 'core-engine-lib-base-table-loading';
            loading.textContent = 'Загрузка...';
            wrapper.appendChild(loading);
            this.container.appendChild(wrapper);
            return;
        }

        // Error state
        if (this.error) {
            const error = document.createElement('div');
            error.className = 'core-engine-lib-base-table-error';
            error.innerHTML = `
                <span>❌ ${this.error}</span>
                <button class="core-engine-lib-base-btn core-engine-lib-base-btn-sm" data-js="table-retry">Повторить</button>
            `;
            wrapper.appendChild(error);
            this.container.appendChild(wrapper);

            const retryBtn = error.querySelector('[data-js="table-retry"]');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this._loadData();
                });
            }
            return;
        }

        // Toolbar
        if (this.actions.length > 0) {
            const toolbar = this._renderToolbar();
            wrapper.appendChild(toolbar);
        }

        // Scroll container
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'core-engine-lib-base-table-scroll';

        // Table
        const table = document.createElement('table');
        table.className = 'core-engine-lib-base-table';

        // Header
        const thead = this._renderHeader();
        table.appendChild(thead);

        // Body
        const tbody = this._renderBody();
        table.appendChild(tbody);

        scrollContainer.appendChild(table);
        wrapper.appendChild(scrollContainer);

        this.container.appendChild(wrapper);

        // Store tbody ref for updates
        this.tbody = tbody;
        this.scrollContainer = scrollContainer;

        // Restore selection
        if (this.selectedId) {
            this.selectRow(this.selectedId);
        }
    }

    /**
     * Render toolbar.
     */
    _renderToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-table-toolbar';

        this.actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `core-engine-lib-base-btn core-engine-lib-base-btn-sm ${action.class || ''}`;
            btn.innerHTML = action.label;
            btn.title = action.title || '';
            btn.addEventListener('click', () => {
                if (action.action) {
                    action.action(this.selectedId, this.getSelectedRow());
                }
            });
            toolbar.appendChild(btn);
        });

        return toolbar;
    }

    /**
     * Render table header.
     */
    _renderHeader() {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');

        this.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.label || col.field;
            if (col.width) {
                th.style.width = col.width;
            }
            if (col.type === 'number') {
                th.style.textAlign = 'right';
            }
            tr.appendChild(th);
        });

        thead.appendChild(tr);
        return thead;
    }

    /**
     * Render table body.
     */
    _renderBody() {
        const tbody = document.createElement('tbody');

        if (this.data.length === 0) {
            const tr = document.createElement('tr');
            tr.className = 'core-engine-lib-base-table-empty';
            const td = document.createElement('td');
            td.colSpan = this.columns.length;
            td.textContent = 'Нет данных';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return tbody;
        }

        this.data.forEach((item, index) => {
            const tr = document.createElement('tr');
            const itemId = item.id !== undefined ? item.id : index;
            tr.dataset.id = itemId;

            // Row selection
            if (this.selectable) {
                tr.addEventListener('click', () => {
                    const id = tr.dataset.id;
                    this.selectRow(id);
                });
            }

            // Double click
            if (this.onDblClick) {
                tr.addEventListener('dblclick', () => {
                    this.onDblClick(tr.dataset.id, item);
                });
            }

            // Columns
            this.columns.forEach(col => {
                const td = document.createElement('td');
                td.dataset.label = col.label || col.field;
                const value = this._getNestedValue(item, col.field);

                // Format depending on the type
                if (col.type === 'date' && value) {
                    td.textContent = new Date(value).toLocaleDateString();
                } else if (col.type === 'datetime' && value) {
                    td.textContent = new Date(value).toLocaleString();
                } else if (col.type === 'number' && value !== undefined && value !== null) {
                    td.textContent = typeof value === 'number' ? value : parseFloat(value);
                    td.style.textAlign = 'right';
                } else if (col.type === 'boolean') {
                    td.textContent = value ? '✅' : '❌';
                    td.style.textAlign = 'center';
                } else {
                    td.textContent = value !== undefined && value !== null ? value : '';
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        return tbody;
    }

    /**
     * Get a nested value from an object by path.
     */
    _getNestedValue(obj, path) {
        if (!path) return obj;
        const keys = path.split('.');
        let result = obj;
        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return undefined;
            }
        }
        return result;
    }

    /**
     * Select a row by ID.
     */
    selectRow(id) {
        if (!this.selectable) return;

        // Deselect previous row
        if (this.selectedId !== null && this.selectedId !== undefined) {
            const prevRow = this.tbody?.querySelector(`tr[data-id="${this.selectedId}"]`);
            if (prevRow) {
                prevRow.classList.remove('selected');
            }
        }

        this.selectedId = id;

        // Select new row
        const row = this.tbody?.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            row.classList.add('selected');
            // Scroll to the selected row
            row.scrollIntoView({ block: 'nearest' });
        }

        // Fire callback
        if (this.onSelect) {
            const data = this.data.find(item => {
                const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
                return itemId == id;
            });
            this.onSelect(id, data);
        }
    }

    /**
     * Get the selected row.
     */
    getSelectedRow() {
        if (this.selectedId === null || this.selectedId === undefined) return null;
        return this.data.find(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == this.selectedId;
        });
    }

    /**
     * Update table data.
     */
    updateData(newData) {
        console.log('[Table] updateData()', newData?.length || 0);
        this.data = newData || [];
        this.selectedId = null;
        this.render();
    }

    /**
     * Reload data from the server.
     */
    async reload() {
        console.log('[Table] reload()');
        if (this.apiUrl) {
            await this._loadData();
        } else {
            this.render();
        }
    }

    /**
     * Add a row.
     */
    addRow(item) {
        console.log('[Table] addRow()', item);
        this.data.push(item);
        this.render();
        // Select the added row
        const id = item.id !== undefined ? item.id : this.data.length - 1;
        this.selectRow(id);
    }

    /**
     * Remove a row by ID.
     */
    removeRow(id) {
        console.log('[Table] removeRow()', id);
        const index = this.data.findIndex(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == id;
        });
        if (index !== -1) {
            this.data.splice(index, 1);
            this.selectedId = null;
            this.render();
            return true;
        }
        return false;
    }

    /**
     * Update a row by ID.
     */
    updateRow(id, newData) {
        console.log('[Table] updateRow()', id, newData);
        const index = this.data.findIndex(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == id;
        });
        if (index !== -1) {
            this.data[index] = { ...this.data[index], ...newData };
            this.render();
            // Restore selection
            this.selectRow(id);
            return true;
        }
        return false;
    }

    /**
     * Whether the component is initialized.
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Wait for init to complete.
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    /**
     * Destroy the component.
     */
    destroy() {
        console.log('[Table] destroy()');
        this.container.innerHTML = '';
        this.selectedId = null;
        this.data = [];
        this._initialized = false;
        this._initPromise = null;
    }
}