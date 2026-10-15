// neurocad/core/engine/lib/botinv/table/table.js

/**
 * BotInvTable — inventory table.
 *
 * A thin wrapper around base/table/table.js. The base Table is
 * loaded dynamically inside _init() (no static imports — see the
 * project convention). This wrapper adds the things the base
 * Table does not know about:
 *
 *   - Filter row — one input / select per column, right under the
 *     header row, all filter state applied on the client. The full
 *     sheet (typically ≤ 1000 rows) is loaded at once, so filtering
 *     is a simple display toggle — instant, no server round-trip.
 *
 *   - highlight(itemId)          — flash a row for ~2s and scroll
 *                                  it into view;
 *   - updateAndHighlight(item)   — update the row and flash it in
 *                                  one call (used right after a
 *                                  successful POST /mark). Filters
 *                                  are RESET first — the chat just
 *                                  found an item, the user must see
 *                                  it; leaving stale filters on
 *                                  could hide the row.
 *
 *   - setFound / _reapplyFoundClasses — keep the green "found" tint
 *     after a full re-render.
 *
 * Deferred mount
 * --------------
 * The controller (botinv.js) constructs BotInvTable in _init()
 * with a throwaway <div>, because the real area-center node does
 * not exist until render() runs. The filter row and toolbar are
 * injected into the base Table's DOM — <thead> and the scroll
 * wrapper respectively. Those nodes belong to the base Table's
 * container, so building them against the throwaway <div> produces
 * "thead not found" / "wrapper not found" and the filters never
 * appear.
 *
 * The controller therefore calls remount(realContainer) from
 * bindEvents() once the real node is in the DOM. remount()
 * reattaches the base Table, re-renders it, and reinstalls the
 * filter row + toolbar against the fresh DOM.
 *
 * Reinstall after updateData / updateRow
 * --------------------------------------
 * The base Table rebuilds <table> (its <thead> and <tbody>) on
 * every updateData() / updateRow() / addRow() / removeRow(). The
 * filter row and toolbar live inside that DOM, so they are wiped
 * with it. That is exactly the "filters flashed and disappeared"
 * bug: remount() installed them, then _loadActive() called
 * updateData(), the base Table re-rendered, and the freshly
 * installed nodes ended up detached.
 *
 * Every delegate that can trigger a base re-render therefore
 * checks whether its nodes are still attached (Node.isConnected)
 * and reinstalls them if not. The guards inside _installFilterRow
 * / _installToolbar make the call idempotent — reinstalling when
 * nothing was wiped is a safe no-op.
 *
 * Everything else is delegated to the base Table instance:
 * updateData, updateRow, addRow, removeRow, render, destroy.
 *
 * Columns (inventory-specific):
 *
 *   inv_num     — inventory number (mono, nowrap)  — text filter
 *   name        — item name                        — text filter
 *   room_before — "Кабинет до"                     — select
 *   room_after  — "Кабинет после"                  — select
 *   found       — boolean → ✅ / ❌                 — select
 *   note        — cumulative free-form text        — text filter
 *
 * Filter model
 * ------------
 * Six independent conditions, combined with AND. Text conditions
 * are case-insensitive substring matches; select conditions are
 * exact matches on the picked value ("(все)" = no filter). Empty
 * text = no filter.
 *
 * The filter row lives INSIDE <thead>, as a second <tr>, so it
 * scrolls with the header and stays visible on the sticky thead.
 *
 * The counter "Показано N из M" and the "Сбросить" button are
 * rendered in a small toolbar above the scroll container. Both
 * are always present; the counter is hidden while no filter is
 * active (N === M).
 *
 * The base Table renders rows as <tr data-id="...">. We find rows
 * by that attribute and toggle display: none / '' — no DOM
 * rebuild on every keystroke.
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

        // Current filter values. Kept in sync with the DOM on every
        // input / change, and used by applyFilters().
        // Keys match the column fields.
        this._filters = {
            inv_num:     '',
            name:        '',
            room_before: '',
            room_after:  '',
            found:       '',
            note:        '',
        };

        this._filterRow = null;      // <tr> with inputs
        this._toolbar = null;        // counter + reset button
        this._counter = null;        // "Показано N из M"

        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BotInvTable] _init() START');
        try {
            // 1. Load our own CSS (highlight + is-found + filters).
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

            // 4. Try to inject the filter row + toolbar into the base
            //    Table's DOM. This only succeeds if `this.container`
            //    is already the real area-center node. In the normal
            //    flow the controller passes a throwaway <div> here
            //    and calls remount() later from bindEvents(); in that
            //    case _installFilterRow logs "thead not found" and
            //    _installToolbar logs "wrapper not found" — both are
            //    benign, they will run again on remount().
            this._installFilterRow();
            this._installToolbar();

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
     *
     * The base Table rebuilds <table> from scratch on updateData()
     * — <thead> and <tbody> are recreated. That means the filter
     * row and the toolbar, which live inside that DOM, are wiped
     * with it. Re-install them BEFORE reapplying found-classes and
     * filters, otherwise _filterRow / _toolbar hold references to
     * detached nodes and the user sees the filters flash and
     * disappear.
     *
     * Order matters:
     *   1. base.updateData()          — rebuild rows
     *   2. _installFilterRow()        — re-add the <tr> in <thead>
     *   3. _installToolbar()          — re-add the toolbar above scroll
     *   4. _rebuildRoomOptions()      — new rooms may have appeared
     *   5. _reapplyFoundClasses()     — keep green tint
     *   6. _reapplyFilters()          — keep current filter state
     */
    updateData(items) {
        if (!this.base) return;
        this.base.updateData(items);

        // The old filter row / toolbar were wiped by the base
        // re-render. Drop stale refs and reinstall.
        this._filterRow = null;
        this._toolbar = null;
        this._counter = null;

        this._installFilterRow();
        this._installToolbar();
        this._rebuildRoomOptions();
        this._reapplyFoundClasses();
        this._reapplyFilters();
    }

    /**
     * Update one row in place (by item.id).
     *
     * If the base Table rebuilds the whole <table> here as well,
     * the filter row and toolbar are wiped — same story as
     * updateData(). Re-install them if that happened. The guard
     * inside _installFilterRow / _installToolbar makes the call
     * idempotent, so calling them unconditionally is safe even if
     * the base only patched the row.
     */
    updateRow(id, data) {
        if (!this.base) return;
        this.base.updateRow(id, data);

        // Cheap and safe: if the base rebuilt the DOM, the guards
        // will reinstall fresh nodes; if it didn't, they will be
        // no-ops.
        if (!this._filterRow || !this._filterRow.isConnected) {
            this._filterRow = null;
            this._installFilterRow();
        }
        if (!this._toolbar || !this._toolbar.isConnected) {
            this._toolbar = null;
            this._counter = null;
            this._installToolbar();
        }

        this._rebuildRoomOptions();
        this._reapplyFoundClasses();
        this._reapplyFilters();
    }

    /**
     * Add a row.
     */
    addRow(item) {
        if (!this.base) return;
        this.base.addRow(item);
        this._reapplyFilters();
    }

    /**
     * Remove a row by id.
     */
    removeRow(id) {
        if (!this.base) return;
        this.base.removeRow(id);
        this._reapplyFilters();
    }

    /**
     * Re-render as is.
     */
    render() {
        if (!this.base) return;
        this.base.render();
    }

    /**
     * Reattach the base Table to a new container and rebuild the
     * filter row / toolbar on top of it.
     *
     * WHY this exists
     * ---------------
     * The controller constructs BotInvTable in _init() with a
     * throwaway <div>, then swaps in the real area-center node in
     * bindEvents(). The base Table is re-rendered against the new
     * container, but the filter row and the toolbar — which are
     * injected into the base Table's DOM by _installFilterRow()
     * and _installToolbar() — were built against the throwaway
     * node (which has no <thead> / scroll wrapper) and never
     * appeared.
     *
     * remount() does three things:
     *   1. reattaches the base Table to the given container;
     *   2. re-renders the base Table against it;
     *   3. reinstalls the filter row + toolbar and reapplies the
     *      current found / filter state.
     *
     * Must be called AFTER the container is in the live DOM — the
     * installers query it by selector.
     */
    remount(container) {
        if (!this.base || !container) return;

        console.log('[BotInvTable] remount()');

        this.container = container;
        this.base.container = container;
        this.base.render();

        // The old filter row / toolbar are gone with the previous
        // DOM — drop stale references before rebuilding.
        this._filterRow = null;
        this._toolbar = null;
        this._counter = null;

        this._installFilterRow();
        this._installToolbar();
        this._reapplyFoundClasses();
        this._reapplyFilters();
    }

    // ========================================
    // FILTERS — install
    // ========================================

    /**
     * Build a second <tr> inside <thead>, one filter control per
     * column. The base Table has already rendered its <thead>;
     * we append.
     *
     * Controls:
     *   inv_num     — <input type="text">
     *   name        — <input type="text">
     *   room_before — <select> (options built from data)
     *   room_after  — <select> (options built from data)
     *   found       — <select> (все / найден / не найден)
     *   note        — <input type="text">
     */
    _installFilterRow() {
        const table = this.base?.container?.querySelector('.core-engine-lib-base-table');
        const thead = table?.querySelector('thead');
        if (!thead) {
            console.warn('[BotInvTable] filter row: thead not found');
            return;
        }

        // Guard against double-install (remount is idempotent).
        const existing = thead.querySelector('.botinv-filter-row');
        if (existing) existing.remove();

        const tr = document.createElement('tr');
        tr.className = 'botinv-filter-row';

        tr.appendChild(this._filterCellText('inv_num', 'Инв. №'));
        tr.appendChild(this._filterCellText('name', 'Наименование'));
        tr.appendChild(this._filterCellRoom('room_before', 'Каб. до'));
        tr.appendChild(this._filterCellRoom('room_after', 'Каб. после'));
        tr.appendChild(this._filterCellFound());
        tr.appendChild(this._filterCellText('note', 'Примечание'));

        thead.appendChild(tr);
        this._filterRow = tr;
        this._rebuildRoomOptions();
    }

    /**
     * Toolbar above the scroll container: "Показано N из M" + reset.
     */
    _installToolbar() {
        const wrapper = this.base?.container?.querySelector('.core-engine-lib-base-table-wrapper');
        const scroll = this.base?.container?.querySelector('.core-engine-lib-base-table-scroll');
        if (!wrapper || !scroll) {
            console.warn('[BotInvTable] toolbar: wrapper/scroll not found');
            return;
        }

        // Guard against double-install (remount is idempotent).
        const existing = wrapper.querySelector('.botinv-table-toolbar');
        if (existing) existing.remove();

        const bar = document.createElement('div');
        bar.className = 'botinv-table-toolbar';

        const counter = document.createElement('span');
        counter.className = 'botinv-table-counter';
        counter.textContent = '';

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'botinv-table-reset';
        reset.textContent = 'Сбросить';
        reset.addEventListener('click', () => this.resetFilters());

        bar.appendChild(counter);
        bar.appendChild(reset);

        // Insert before the scroll container — inside the wrapper,
        // but above the table.
        wrapper.insertBefore(bar, scroll);

        this._toolbar = bar;
        this._counter = counter;
    }

    _filterCellText(field, label) {
        const td = document.createElement('th');
        td.className = 'botinv-filter-cell';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'botinv-filter-input';
        input.placeholder = label;
        input.dataset.field = field;
        input.addEventListener('input', () => this._onFilterChange(field, input.value));

        td.appendChild(input);
        return td;
    }

    _filterCellRoom(field, label) {
        const td = document.createElement('th');
        td.className = 'botinv-filter-cell';

        const select = document.createElement('select');
        select.className = 'botinv-filter-select';
        select.dataset.field = field;
        select.addEventListener('change', () => this._onFilterChange(field, select.value));

        // Options are (re)built in _rebuildRoomOptions.
        td.appendChild(select);
        return td;
    }

    _filterCellFound() {
        const td = document.createElement('th');
        td.className = 'botinv-filter-cell';

        const select = document.createElement('select');
        select.className = 'botinv-filter-select';
        select.dataset.field = 'found';
        select.addEventListener('change', () => this._onFilterChange('found', select.value));

        select.appendChild(this._option('', 'Все'));
        select.appendChild(this._option('1', 'Найден'));
        select.appendChild(this._option('0', 'Не найден'));

        td.appendChild(select);
        return td;
    }

    _option(value, label) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        return opt;
    }

    /**
     * Rebuild the room select options from the current data. Called
     * at init and after updateData — a new room may have appeared
     * in the loaded sheet.
     */
    _rebuildRoomOptions() {
        if (!this._filterRow || !Array.isArray(this.base?.data)) return;

        for (const field of ['room_before', 'room_after']) {
            const select = this._filterRow.querySelector(`select[data-field="${field}"]`);
            if (!select) continue;

            // Preserve the currently picked value across rebuilds.
            const current = select.value || this._filters[field] || '';

            // Unique non-empty rooms, sorted as strings (so "300-Б"
            // stays next to "300", not after "99" — string sort).
            const rooms = Array.from(new Set(
                this.base.data
                    .map(it => it?.[field])
                    .filter(v => v !== null && v !== undefined && v !== '')
                    .map(v => String(v))
            )).sort((a, b) => a.localeCompare(b, 'ru'));

            // Reset options: "(все)" + rooms.
            select.innerHTML = '';
            select.appendChild(this._option('', 'Все'));
            for (const room of rooms) {
                select.appendChild(this._option(room, room));
            }

            // Restore the picked value if it still exists.
            select.value = rooms.includes(current) ? current : '';
            this._filters[field] = select.value;
        }
    }

    // ========================================
    // FILTERS — apply
    // ========================================

    _onFilterChange(field, value) {
        this._filters[field] = value || '';
        this.applyFilters();
    }

    /**
     * Apply every active filter to <tbody> rows. Called from
     * _onFilterChange and after any data refresh.
     *
     * Display toggle only — no DOM rebuild, so typing in a filter
     * is instant even for thousands of rows.
     */
    applyFilters() {
        if (!this.base?.tbody) return;

        const f = this._filters;
        const rows = this.base.tbody.querySelectorAll('tr[data-id]');

        let shown = 0;
        rows.forEach(row => {
            const id = parseInt(row.dataset.id, 10);
            if (isNaN(id)) { row.style.display = ''; return; }

            const item = (this.base.data || []).find(it => it && it.id === id);
            if (!item) { row.style.display = ''; return; }

            const visible = this._matches(item, f);
            row.style.display = visible ? '' : 'none';
            if (visible) shown++;
        });

        this._updateCounter(shown, rows.length);
    }

    /**
     * Whether an item passes every active filter (AND).
     */
    _matches(item, f) {
        // inv_num — substring, case-insensitive
        if (f.inv_num && !this._includes(item.inv_num, f.inv_num)) return false;

        // name — substring, case-insensitive
        if (f.name && !this._includes(item.name, f.name)) return false;

        // room_before — exact match on the picked value
        if (f.room_before && String(item.room_before ?? '') !== f.room_before) return false;

        // room_after — exact match
        if (f.room_after && String(item.room_after ?? '') !== f.room_after) return false;

        // found — exact match on 1 / 0
        if (f.found !== '' && String(item.found ?? '') !== f.found) return false;

        // note — substring, case-insensitive
        if (f.note && !this._includes(item.note, f.note)) return false;

        return true;
    }

    _includes(haystack, needle) {
        if (haystack === null || haystack === undefined) return false;
        return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
    }

    _updateCounter(shown, total) {
        if (!this._counter) return;

        if (shown === total) {
            // No active filter — hide the counter to reduce noise.
            this._counter.textContent = '';
            this._counter.style.display = 'none';
        } else {
            this._counter.textContent = `Показано ${shown} из ${total}`;
            this._counter.style.display = '';
        }
    }

    /**
     * Clear every filter and re-show all rows.
     *
     * Called by the "Сбросить" button, and by updateAndHighlight —
     * the chat just found an item, the user must see it; stale
     * filters could hide the row.
     */
    resetFilters() {
        // Reset internal state.
        for (const key of Object.keys(this._filters)) {
            this._filters[key] = '';
        }

        // Reset DOM controls.
        if (this._filterRow) {
            this._filterRow.querySelectorAll('input.botinv-filter-input').forEach(inp => {
                inp.value = '';
            });
            this._filterRow.querySelectorAll('select.botinv-filter-select').forEach(sel => {
                sel.value = '';
            });
        }

        this.applyFilters();
    }

    /**
     * Reapply the current filter state. Used after a full re-render
     * — the base Table rebuilds <tbody> and loses inline styles.
     */
    _reapplyFilters() {
        this.applyFilters();
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
     * Update one row, RESET filters, and flash the row.
     *
     * Used by the chat handler after a successful POST /mark. The
     * filter reset is deliberate: the chat just found a specific
     * item, and leaving stale filters on could hide the very row
     * the user needs to see.
     */
    updateAndHighlight(item) {
        if (!item || item.id === undefined) return;

        this.resetFilters();
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
        this._filterRow = null;
        this._toolbar = null;
        this._counter = null;
        this._initPromise = null;
    }
}