// neurocad/core/engine/lib/botinv/list/list.js

/**
 * BotInvList — sheets sidebar.
 *
 * Rendered into area-left on desktop (always visible). On mobile
 * the SAME DOM becomes a drawer: the module controller asks the
 * list to `.openDrawer()`, which moves the root element out of
 * area-left and into <body>, and slides it in from the left.
 *
 * Structure:
 *
 *   <div class="core-engine-lib-botinv-sheets">
 *       <div class="botinv-sheets-header">
 *           <span class="botinv-sheets-title">Ведомости</span>
 *           <button class="botinv-sheets-add" title="Загрузить">+</button>
 *       </div>
 *       <div class="botinv-sheets-list">
 *           <div class="botinv-sheet-item" data-id="5">
 *               <div class="botinv-sheet-name">Ведомость 2026</div>
 *               <div class="botinv-sheet-meta">
 *                   <span class="botinv-sheet-counter">12 / 48</span>
 *                   <span>15.01.2026</span>
 *               </div>
 *               <div class="botinv-sheet-actions">
 *                   <button class="botinv-sheet-action" data-action="export">⤓</button>
 *                   <button class="botinv-sheet-action" data-action="rename">✎</button>
 *                   <button class="botinv-sheet-action is-danger" data-action="delete">✕</button>
 *               </div>
 *           </div>
 *           ...
 *       </div>
 *   </div>
 *
 * Events are delegated: one click listener on the root handles
 * every item and every action button. The root is re-rendered by
 * `setSheets()` — a per-item listener would be lost.
 *
 * Callbacks (passed via options):
 *   - onSelect(sheetId)          — a sheet was clicked
 *   - onImport()                 — the "+" button was clicked
 *   - onExport(sheetId)          — the "⤓" action was clicked
 *   - onRename(sheetId)          — the "✎" action was clicked
 *   - onDelete(sheetId)          — the "✕" action was clicked
 *
 * No static imports. The base list is standalone: it does not
 * import the api module or any other botinv module. Everything it
 * needs (the sheets array) comes in via setSheets().
 */
export class BotInvList {
    constructor(options = {}) {
        console.log('[BotInvList] Constructor');

        this.options = options;

        // Data
        this.sheets = options.sheets || [];
        this.activeId = options.activeId || null;

        // Callbacks
        this.onSelect = options.onSelect || null;
        this.onImport = options.onImport || null;
        this.onExport = options.onExport || null;
        this.onRename = options.onRename || null;
        this.onDelete = options.onDelete || null;

        // DOM
        this.element = null;
        this.listEl = null;
        this.backdrop = null;

        // Drawer state
        this._savedParent = null;
        this._savedNextSibling = null;
        this._isDrawerOpen = false;
        this._isDrawerMode = false;

        // Init
        this._initialized = false;
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BotInvList] _init() START');
        try {
            await this._loadCSS();
            this._initialized = true;
            console.log('[BotInvList] _init() COMPLETE');
        } catch (error) {
            console.error('[BotInvList] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadCSS() {
        console.log('[BotInvList] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            await window.coreEngine.loadCSS('core/engine/lib/botinv/list/list.css');
        }
    }

    // ========================================
    // RENDER
    // ========================================

    /**
     * Build the root DOM and return it. Called once by the module
     * controller, which mounts it into area-left.
     */
    render() {
        console.log('[BotInvList] render()');

        const root = document.createElement('div');
        root.className = 'core-engine-lib-botinv-sheets';

        root.innerHTML = `
            <div class="botinv-sheets-header">
                <span class="botinv-sheets-title">Ведомости</span>
                <button type="button"
                        class="botinv-sheets-add"
                        title="Загрузить ведомость"
                        data-action="import">+</button>
            </div>
            <div class="botinv-sheets-list" data-role="list"></div>
        `;

        this.element = root;
        this.listEl = root.querySelector('[data-role="list"]');

        this._renderList();
        return root;
    }

    /**
     * Render (or re-render) the list body from `this.sheets`.
     */
    _renderList() {
        if (!this.listEl) return;

        if (!this.sheets || this.sheets.length === 0) {
            this.listEl.innerHTML = `
                <div class="botinv-sheets-empty">
                    Нет ведомостей.<br>
                    Загрузите первую — кнопкой «+».
                </div>
            `;
            return;
        }

        const html = this.sheets.map(sheet => this._renderItem(sheet)).join('');
        this.listEl.innerHTML = html;
    }

    /**
     * Render one sheet item.
     */
    _renderItem(sheet) {
        const isActive = sheet.id === this.activeId;
        const cls = 'botinv-sheet-item' + (isActive ? ' is-active' : '');

        const itemsCount = Number(sheet.items_count || 0);
        const markedCount = Number(sheet.marked_count || 0);
        const dateStr = this._formatDate(sheet.batch_date);
        const name = this._escape(sheet.name || 'Без названия');

        return `
            <div class="${cls}" data-id="${sheet.id}">
                <div class="botinv-sheet-name">${name}</div>
                <div class="botinv-sheet-meta">
                    <span class="botinv-sheet-counter">${markedCount} / ${itemsCount}</span>
                    <span>${dateStr}</span>
                </div>
                <div class="botinv-sheet-actions">
                    <button type="button"
                            class="botinv-sheet-action"
                            title="Скачать ведомость"
                            data-action="export">⤓</button>
                    <button type="button"
                            class="botinv-sheet-action"
                            title="Переименовать"
                            data-action="rename">✎</button>
                    <button type="button"
                            class="botinv-sheet-action is-danger"
                            title="Удалить"
                            data-action="delete">✕</button>
                </div>
            </div>
        `;
    }

    // ========================================
    // EVENTS
    // ========================================

    /**
     * Attach the delegated click listener on the root element.
     * Called once by the module controller after render().
     */
    bindEvents(container) {
        console.log('[BotInvList] bindEvents()');

        if (!this.element) return;

        this.element.addEventListener('click', (e) => {
            // Action button?
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                e.stopPropagation();
                const action = actionBtn.dataset.action;

                if (action === 'import') {
                    if (this.onImport) this.onImport();
                    return;
                }

                // export / rename / delete need the sheet id —
                // find the closest item.
                const item = actionBtn.closest('.botinv-sheet-item');
                if (!item) return;
                const sheetId = this._parseId(item.dataset.id);
                if (sheetId === null) return;

                if (action === 'export' && this.onExport) {
                    this.onExport(sheetId);
                } else if (action === 'rename' && this.onRename) {
                    this.onRename(sheetId);
                } else if (action === 'delete' && this.onDelete) {
                    this.onDelete(sheetId);
                }
                return;
            }

            // Whole item click?
            const item = e.target.closest('.botinv-sheet-item');
            if (item) {
                const sheetId = this._parseId(item.dataset.id);
                if (sheetId !== null && this.onSelect) {
                    this.onSelect(sheetId);
                }
            }
        });
    }

    // ========================================
    // DATA
    // ========================================

    /**
     * Replace the whole list.
     */
    setSheets(sheets) {
        console.log('[BotInvList] setSheets()', sheets?.length || 0);
        this.sheets = Array.isArray(sheets) ? sheets : [];
        this._renderList();
    }

    /**
     * Highlight one sheet as the active one.
     */
    setActive(sheetId) {
        console.log('[BotInvList] setActive()', sheetId);
        this.activeId = sheetId;

        if (!this.listEl) return;
        const items = this.listEl.querySelectorAll('.botinv-sheet-item');
        items.forEach(el => {
            const id = this._parseId(el.dataset.id);
            el.classList.toggle('is-active', id === sheetId);
        });
    }

    // ========================================
    // DRAWER MODE
    // ========================================

    /**
     * Enable drawer mode (mobile). Creates the backdrop element in
     * <body>, ready to be toggled with openDrawer() / closeDrawer().
     *
     * Safe to call multiple times — the backdrop is created only
     * once.
     */
    enableDrawerMode() {
        console.log('[BotInvList] enableDrawerMode()');
        this._isDrawerMode = true;

        if (this.backdrop) return;

        const backdrop = document.createElement('div');
        backdrop.className = 'botinv-drawer-backdrop';
        backdrop.addEventListener('click', () => this.closeDrawer());
        document.body.appendChild(backdrop);
        this.backdrop = backdrop;
    }

    /**
     * Disable drawer mode (desktop). Closes the drawer if open and
     * removes the backdrop element.
     */
    disableDrawerMode() {
        console.log('[BotInvList] disableDrawerMode()');
        this._isDrawerMode = false;

        if (this._isDrawerOpen) this.closeDrawer();

        if (this.backdrop) {
            this.backdrop.remove();
            this.backdrop = null;
        }
    }

    /**
     * Open the drawer. Moves the root element into <body> (the
     * original parent — area-left — is hidden by base CSS on
     * mobile, which would take the drawer down with it). Then adds
     * the .is-open class to trigger the slide-in.
     */
    openDrawer() {
        console.log('[BotInvList] openDrawer()');
        if (!this.element) return;
        if (this._isDrawerOpen) return;

        this._moveToBody();

        // Adding .is-drawer before .is-open lets the transition
        // start from translateX(-100%) rather than jumping.
        this.element.classList.add('is-drawer');

        // Force reflow so the browser sees the initial state
        // (translateX(-100%)) before we toggle .is-open.
        void this.element.offsetWidth;

        this.element.classList.add('is-open');
        if (this.backdrop) this.backdrop.classList.add('is-open');

        this._isDrawerOpen = true;
    }

    /**
     * Close the drawer. Removes .is-open (triggers the slide-out),
     * and after the transition moves the element back to its
     * original place in area-left.
     */
    closeDrawer() {
        console.log('[BotInvList] closeDrawer()');
        if (!this.element) return;
        if (!this._isDrawerOpen) return;

        this._isDrawerOpen = false;

        this.element.classList.remove('is-open');
        if (this.backdrop) this.backdrop.classList.remove('is-open');

        // Move back after the slide-out finishes (0.22s in CSS).
        // 250ms gives a small safety margin.
        setTimeout(() => this._moveBack(), 250);
    }

    /**
     * Move the root element into <body>, remembering where it was.
     */
    _moveToBody() {
        if (!this.element) return;
        if (this.element.parentNode === document.body) return;

        this._savedParent = this.element.parentNode;
        this._savedNextSibling = this.element.nextSibling;
        document.body.appendChild(this.element);
    }

    /**
     * Move the root element back to its original parent.
     */
    _moveBack() {
        if (!this.element) return;
        if (!this._savedParent) return;
        if (this.element.parentNode === this._savedParent) return;

        if (this._savedNextSibling && this._savedNextSibling.parentNode === this._savedParent) {
            this._savedParent.insertBefore(this.element, this._savedNextSibling);
        } else {
            this._savedParent.appendChild(this.element);
        }

        this.element.classList.remove('is-drawer', 'is-open');
        this._savedParent = null;
        this._savedNextSibling = null;
    }

    // ========================================
    // HELPERS
    // ========================================

    _parseId(raw) {
        if (raw === undefined || raw === null || raw === '') return null;
        const n = parseInt(raw, 10);
        return isNaN(n) ? null : n;
    }

    _formatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
        } catch (e) {
            return iso;
        }
    }

    _escape(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }

    destroy() {
        console.log('[BotInvList] destroy()');

        if (this.backdrop) {
            this.backdrop.remove();
            this.backdrop = null;
        }

        if (this.element && this.element.parentNode) {
            this.element.remove();
        }

        this.element = null;
        this.listEl = null;
        this.sheets = [];
        this.activeId = null;
        this._savedParent = null;
        this._savedNextSibling = null;
        this._isDrawerOpen = false;
        this._isDrawerMode = false;
        this._initialized = false;
        this._initPromise = null;
    }
}