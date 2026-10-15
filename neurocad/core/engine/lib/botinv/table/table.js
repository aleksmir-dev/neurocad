// neurocad/core/engine/lib/botinv/table/table.js

/**
 * BotInvTable — inventory table.
 *
 * A thin wrapper around base/table/table.js. The base Table is
 * loaded dynamically inside _init() (no static imports — see the
 * project convention). This wrapper adds the two things the base
 * Table does not know about:
 *
 *   - highlight(itemId)          — flash a row for ~2s and scroll
 *                                  it into view;
 *   - updateAndHighlight(item)   — update the row and flash it in
 *                                  one call (used right after a
 *                                  successful POST /mark).
 *
 * Everything else is delegated to the base Table instance:
 * updateData, updateRow, addRow, removeRow, render, destroy.
 *
 * Columns (inventory-specific):
 *
 *   inv_num     — inventory number (mono, nowrap)
 *   name        — item name
 *   room_before — "Кабинет до" (from Excel, never changes)
 *   room_after  — "Кабинет после" (first find, never changes)
 *   found       — boolean → ✅ / ❌
 *   note        — cumulative free-form text
 *
 * Base Table API (kept as-is):
 *   updateData(items)   — replace all rows
 *   updateRow(id, data) — update one row in place and re-render
 *   addRow(item)        — append a row
 *   removeRow(id)       — delete a row
 *   render()            — re-render as is
 *   destroy()           — remove the DOM
 *
 * Highlighting relies on the base Table rendering rows as
 * <tr data-id="...">. We find the row by that attribute and toggle
 * the CSS classes .is-highlighted / .is-found (defined in
 * table/table.css).
 *
 * No static imports. No !important in the CSS.
 */
export class BotInvTable {
    constructor(container, props = {}) {
        console.log('[BotInvTable] Constructor');

        this.container = container;
        this.props = props;

        // Base Table instance — created in _init after the dynamic import.
        this.base = null;

        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BotInvTable] _init() START');
        try {
            // 1. Load our own CSS (highlight + is-found).
            await this._loadCSS();

            // 2. Dynamically import the base Table.
            const version = window.coreEngine?.static_version || Date.now();
            const mod = await import(`../../base/table/table.js?v=${version}`);
            const Table = mod.Table;

            if (typeof Table !== 'function') {
                throw new Error('base/table/table.js does not export Table');
            }

            // 3. Instantiate the base Table.
            this.base = new Table(this.container, {
                columns: [
                    { field: 'inv_num',     label: 'Инв. №',      width: '120px' },
                    { field: 'name',        label: 'Наименование' },
                    { field: 'room_before', label: 'Каб. до',     width: '80px' },
                    { field: 'room_after',  label: 'Каб. после',  width: '80px' },
                    { field: 'found',       label: '✅',          width: '36px', type: 'boolean' },
                    { field: 'note',        label: 'Примечание' },
                ],
                data: this.props.data || [],
                selectable: false,
                // apiUrl not set — data comes from the controller
                // via updateData() / updateRow().
            });

            if (this.base.waitForInit) {
                await this.base.waitForInit();
            }

            console.log('[BotInvTable] _init() COMPLETE');
        } catch (error) {
            console.error('[BotInvTable] Init error:', error);
            throw error;
        }
    }

    async _loadCSS() {
        console.log('[BotInvTable] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            await window.coreEngine.loadCSS('core/engine/lib/botinv/table/table.css');
        }
    }

    // ========================================
    // BASE TABLE — DELEGATES
    // ========================================

    /**
     * Replace all rows with the given array.
     */
    updateData(items) {
        if (!this.base) return;
        this.base.updateData(items);
        this._reapplyFoundClasses();
    }

    /**
     * Update one row in place (by item.id).
     */
    updateRow(id, data) {
        if (!this.base) return;
        this.base.updateRow(id, data);
        this._reapplyFoundClasses();
    }

    /**
     * Add a row.
     */
    addRow(item) {
        if (!this.base) return;
        this.base.addRow(item);
    }

    /**
     * Remove a row by id.
     */
    removeRow(id) {
        if (!this.base) return;
        this.base.removeRow(id);
    }

    /**
     * Re-render as is.
     */
    render() {
        if (!this.base) return;
        this.base.render();
    }

    // ========================================
    // BOTINV-SPECIFIC
    // ========================================

    /**
     * Flash a row (yellow → normal over 2s) and scroll it into view.
     *
     * Used right after the bot marks an item:
     *   table.highlight(item.id)
     *
     * The animation is CSS (@keyframes botinv-row-flash on
     * tr.is-highlighted — see table/table.css). This method only
     * toggles the class; it restarts the animation if the row is
     * already highlighted.
     */
    highlight(itemId) {
        if (!this.base || !this.base.tbody) return;

        const row = this.base.tbody.querySelector(`tr[data-id="${itemId}"]`);
        if (!row) {
            console.warn('[BotInvTable] highlight: row not found', itemId);
            return;
        }

        // Remove and re-add to restart the CSS animation.
        row.classList.remove('is-highlighted');
        void row.offsetWidth;   // force reflow
        row.classList.add('is-highlighted');

        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /**
     * Update one row and immediately flash it.
     * Used by the chat handler after a successful POST /mark.
     */
    updateAndHighlight(item) {
        if (!item || item.id === undefined) return;
        this.updateRow(item.id, item);
        this.highlight(item.id);
    }

    /**
     * Mark a row's "found" state visually.
     *
     * Toggles the .is-found class on the <tr>. If the underlying
     * data object is available (via the base Table's data array),
     * its `found` flag is also updated so that future re-renders
     * keep the tint.
     */
    setFound(itemId, isFound) {
        if (!this.base) return;

        // 1. Update the data so re-renders keep the state.
        if (Array.isArray(this.base.data)) {
            const item = this.base.data.find(it => it && it.id === itemId);
            if (item) item.found = isFound ? 1 : 0;
        }

        // 2. Toggle the row class directly (no full re-render).
        if (this.base.tbody) {
            const row = this.base.tbody.querySelector(`tr[data-id="${itemId}"]`);
            if (row) row.classList.toggle('is-found', !!isFound);
        }
    }

    // ========================================
    // INTERNAL
    // ========================================

    /**
     * After a full re-render, restore the .is-found class on rows
     * whose `found` flag is set. Needed because the base Table
     * rebuilds <tbody> from scratch on every updateData/updateRow,
     * losing per-row classes.
     */
    _reapplyFoundClasses() {
        if (!this.base || !this.base.tbody || !Array.isArray(this.base.data)) return;

        const rows = this.base.tbody.querySelectorAll('tr[data-id]');
        rows.forEach(row => {
            const id = parseInt(row.dataset.id, 10);
            if (isNaN(id)) return;

            const item = this.base.data.find(it => it && it.id === id);
            if (item && item.found) {
                row.classList.add('is-found');
            }
        });
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    isInitialized() {
        return this.base ? this.base.isInitialized() : false;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this.base ? this.base.isInitialized() : false;
    }

    destroy() {
        console.log('[BotInvTable] destroy()');

        if (this.base && typeof this.base.destroy === 'function') {
            this.base.destroy();
        }

        this.base = null;
        this._initPromise = null;
    }
}