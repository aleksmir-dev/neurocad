// neurocad/core/engine/lib/botinv/botinv.js

/**
 * BaseBotInv — inventory module controller.
 *
 * Rendered into area-center by BasePages.showServices('botinv').
 * Unlike other modules, it owns THREE areas at once:
 *
 *   area-left   → BotInvList (sheets sidebar)
 *   area-center → BotInvTable (inventory table)
 *   area-right  → BotInvChatHandler (chat)
 *
 * The controller itself is NOT a widget — it does not return a DOM
 * node. It creates the three widgets, mounts each into its own area
 * (side areas are accessed via window.coreEngine.base), and wires
 * them together:
 *
 *   list.onSelect(sheetId)   → activate + reload table
 *   list.onImport()          → file picker → api.importSheet
 *   list.onExport(sheetId)   → window.location.href = api.exportSheetUrl(id)
 *   list.onRename(sheetId)   → prompt → api.updateSheet
 *   list.onDelete(sheetId)   → confirm → api.deleteSheet
 *   chat.onItemFound(item)   → table.updateAndHighlight(item)
 *   chat.onToggleDrawer()    → list.openDrawer() / list.closeDrawer()
 *
 * Additionally, BotInvResizer is mounted to make the side panels
 * draggable. Handles are inserted between area-left ↔ area-center
 * and area-center ↔ area-right. Widths are persisted in localStorage
 * (keys: botinv:left-width, botinv:right-width). The resizer has no
 * effect on mobile — the side panels are hidden there.
 *
 * State kept here:
 *   - activeSheetId  — the currently displayed sheet
 *   - currentRoom    — the walk context (persisted to localStorage)
 *   - isMobile       — media query (min-width: 1024px) inverted
 *
 * Storage keys (localStorage):
 *   - botinv:currentRoom   — the room the accountant is walking
 *   - botinv:left-width    — sidebar width (px)
 *   - botinv:right-width   — chat panel width (px)
 *
 * No static imports. All widgets, the API client and the resizer
 * are loaded dynamically inside _init() with a cache-busting
 * ?v=<version>. No !important in CSS.
 */
export class BaseBotInv {
    constructor(options = {}) {
        console.log('[BaseBotInv] Constructor');

        this.options = options;
        this.section = options.section || 'botinv';
        this.user = options.user || null;
        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;
        this._savedCaption = null;

        // Runtime modules — created in _init.
        this.api = null;
        this.list = null;
        this.table = null;
        this.chat = null;
        this.resizer = null;

        // DOM — the wrapper that we mount into area-center.
        this.element = null;

        // Areas (from base).
        this.leftEl = null;
        this.centerEl = null;
        this.rightEl = null;

        // State.
        this.activeSheet = null;     // sheet dict
        this.activeSheetId = null;   // sheet.id (convenience)
        this.currentRoom = null;     // string | null
        this.isMobile = false;

        this._mediaQuery = null;
        this._mediaQueryHandler = null;

        this._initialized = false;
        this._initPromise = this._init();
    }

    // ========================================
    // INIT
    // ========================================

    async _init() {
        console.log('[BaseBotInv] _init() START');
        try {
            // 1. Load shared CSS (container + drawer + resizer styles).
            await this._loadSharedCSS();

            // 2. Load state from localStorage.
            this._loadState();

            // 3. Dynamically import everything.
            const version = window.coreEngine?.static_version || Date.now();
            const [
                { BaseBotInvApi },
                { BotInvList },
                { BotInvTable },
                { BotInvChatHandler },
                { BotInvResizer },
            ] = await Promise.all([
                import(`./api.js?v=${version}`),
                import(`./list/list.js?v=${version}`),
                import(`./table/table.js?v=${version}`),
                import(`./chat/handler.js?v=${version}`),
                import(`./resizer.js?v=${version}`),
            ]);

            // 4. Instantiate API.
            this.api = new BaseBotInvApi();

            // 5. Instantiate widgets (they load their own CSS in _init).
            this.list = new BotInvList({
                onSelect:   (id) => this._onSelectSheet(id),
                onImport:   ()   => this._onImportSheet(),
                onExport:   (id) => this._onExportSheet(id),
                onRename:   (id) => this._onRenameSheet(id),
                onDelete:   (id) => this._onDeleteSheet(id),
            });

            this.table = new BotInvTable(
                document.createElement('div'),  // real container set in render()
                { data: [] }
            );

            this.chat = new BotInvChatHandler({
                api: this.api,
                getCurrentRoom: () => this.currentRoom,
                setCurrentRoom: (room) => this._setCurrentRoom(room),
                onItemFound:    (item) => this._onItemFound(item),
                onToggleDrawer: ()     => this._onToggleDrawer(),
            });

            // The resizer has no async init — its build() is called
            // in bindEvents, after the three widgets are mounted.
            this.resizer = new BotInvResizer();

            // 6. Wait for all widgets to finish their own init.
            await Promise.all([
                this.list.waitForInit(),
                this.table.waitForInit(),
                this.chat.waitForInit(),
            ]);

            // 7. Media query — mobile / desktop switch.
            this._setupMediaQuery();

            this._initialized = true;
            console.log('[BaseBotInv] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseBotInv] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadSharedCSS() {
        console.log('[BaseBotInv] _loadSharedCSS()');
        if (!window.coreEngine?.loadCSS) return;
        await Promise.all([
            window.coreEngine.loadCSS('core/engine/lib/botinv/botinv.css'),
            window.coreEngine.loadCSS('core/engine/lib/botinv/drawer.css'),
        ]);
    }

    // ========================================
    // RENDER
    // ========================================

    /**
     * Build the module DOM. Called once by BaseAreas.renderInArea
     * (via BasePages.showServices). The returned element goes into
     * area-center. Side areas are filled in bindEvents().
     */
    render() {
        console.log('[BaseBotInv] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Инвентаризация', 'Инвентаризация');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-botinv';
        wrapper.innerHTML = `
            <div class="core-engine-lib-botinv-table" data-role="table"></div>
        `;

        this.element = wrapper;
        this._tableContainer = wrapper.querySelector('[data-role="table"]');

        return wrapper;
    }

    bindEvents(container) {
        console.log('[BaseBotInv] bindEvents()');

        // 1. Area references from the shell.
        const base = window.coreEngine?.base;
        this.leftEl = base?.leftEl || document.querySelector('.core-engine-lib-base-area-left');
        this.centerEl = base?.centerEl || document.querySelector('.core-engine-lib-base-area-center');
        this.rightEl = base?.rightEl || document.querySelector('.core-engine-lib-base-area-right');

        // 2. Mount the list into area-left (as sidebar).
        if (this.leftEl && this.list) {
            const listEl = this.list.render();
            this.list.bindEvents(listEl);
            this.leftEl.innerHTML = '';
            this.leftEl.appendChild(listEl);
            this.leftEl.style.display = '';
        }

        // 3. Mount the table into the wrapper (area-center).
        if (this._tableContainer && this.table) {
            if (this.table.base) {
                this.table.base.container = this._tableContainer;
                this.table.base.render();
            }
        }

        // 4. Mount the chat into area-right.
        if (this.rightEl && this.chat) {
            this.rightEl.innerHTML = '';
            this.rightEl.style.display = '';
            this.chat.mount(this.rightEl);
        }

        // 5. Mount the resizer — insert the two drag handles between
        //    the areas and restore any saved widths. Must run AFTER
        //    the areas have their content, so getBoundingClientRect()
        //    in the drag handlers returns the real widths.
        if (this.resizer) {
            this.resizer.build();
        }

        // 6. Initial data load.
        this._loadActive().then(() => {
            this._loadSheets();
        });
    }

    // ========================================
    // DATA LOADING
    // ========================================

    /**
     * Load the active sheet + its items in one request and render.
     */
    async _loadActive() {
        console.log('[BaseBotInv] _loadActive()');
        if (!this.api) return;

        let data;
        try {
            data = await this.api.getActive();
        } catch (err) {
            console.error('[BaseBotInv] getActive error:', err);
            this.chat?.chat?.addMessage(
                `❌ ${err.message || 'Не удалось загрузить активную ведомость'}`,
                false,
                'error',
            );
            return;
        }

        const sheet = data?.sheet || null;
        const items = data?.items || [];

        this.activeSheet = sheet;
        this.activeSheetId = sheet?.id || null;

        // Update the chat header title.
        if (sheet) {
            this.chat?.setTitle(sheet.name || 'Инвентаризация');
        } else {
            this.chat?.setTitle('Инвентаризация');
        }

        // Fill the table.
        if (this.table) {
            this.table.updateData(items);
        }

        // Mark the active sheet in the list.
        if (this.list && this.activeSheetId) {
            this.list.setActive(this.activeSheetId);
        }
    }

    /**
     * Load all sheets of the nav and hand them to the list widget.
     */
    async _loadSheets() {
        console.log('[BaseBotInv] _loadSheets()');
        if (!this.api || !this.list) return;

        try {
            const sheets = await this.api.listSheets();
            this.list.setSheets(sheets || []);
            if (this.activeSheetId) {
                this.list.setActive(this.activeSheetId);
            }
        } catch (err) {
            console.error('[BaseBotInv] listSheets error:', err);
        }
    }

    // ========================================
    // STATE — current room (localStorage)
    // ========================================

    _loadState() {
        try {
            const room = window.localStorage.getItem('botinv:currentRoom');
            this.currentRoom = room || null;
        } catch (e) {
            this.currentRoom = null;
        }
    }

    _setCurrentRoom(room) {
        this.currentRoom = room || null;
        try {
            if (this.currentRoom) {
                window.localStorage.setItem('botinv:currentRoom', this.currentRoom);
            } else {
                window.localStorage.removeItem('botinv:currentRoom');
            }
        } catch (e) {
            // localStorage may be disabled — silently ignore.
        }
    }

    // ========================================
    // LIST CALLBACKS
    // ========================================

    async _onSelectSheet(sheetId) {
        console.log('[BaseBotInv] _onSelectSheet()', sheetId);
        if (!this.api) return;

        try {
            // 1. Activate the sheet on the server.
            await this.api.activateSheet(sheetId);

            // 2. Reload the active sheet + items.
            await this._loadActive();

            // 3. Clear the chat, show a fresh welcome.
            this.chat?.clearMessages();
            this.chat?.showWelcome();

            // 4. On mobile close the drawer.
            if (this.isMobile) {
                this.list?.closeDrawer();
            }
        } catch (err) {
            console.error('[BaseBotInv] activateSheet error:', err);
            this.chat?.chat?.addMessage(
                `❌ ${err.message || 'Не удалось выбрать ведомость'}`,
                false,
                'error',
            );
        }
    }

    /**
     * Open a file picker and import a new sheet.
     *
     * Three pieces of data are needed: file, name, batch_date.
     * The name is pre-filled with the filename without extension,
     * the date defaults to today. Both can be edited through two
     * quick prompts before the upload — a minimal UI with no
     * custom modal.
     */
    async _onImportSheet() {
        console.log('[BaseBotInv] _onImportSheet()');

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.csv';

        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if (!file) return;

            const defaultName = file.name.replace(/\.[^.]+$/, '');
            const name = window.prompt('Название ведомости:', defaultName);
            if (name === null) return;   // cancelled

            const today = new Date().toISOString().slice(0, 10);
            const batchDate = window.prompt('Дата ведомости (ГГГГ-ММ-ДД):', today);
            if (batchDate === null) return;

            try {
                await this.api.importSheet(file, name.trim(), batchDate.trim());
                await this._loadSheets();
                this.chat?.chat?.addMessage(
                    `✅ Ведомость «${name.trim()}» загружена.`,
                    false,
                    'success',
                );
            } catch (err) {
                console.error('[BaseBotInv] importSheet error:', err);
                this.chat?.chat?.addMessage(
                    `❌ ${err.message || 'Не удалось загрузить ведомость'}`,
                    false,
                    'error',
                );
            }
        });

        input.click();
    }

    /**
     * Download the sheet as .xlsx.
     *
     * The export endpoint sets
     *   Content-Disposition: attachment; filename="vedomost_...xlsx"
     * so a plain navigation is enough — the browser takes care of
     * the filename and the actual file write.
     *
     * window.location.href is used (not a hidden <a>) because in
     * some browsers an anchor click on an attachment URL is
     * blocked by the popup blocker, while a navigation is not.
     */
    _onExportSheet(sheetId) {
        console.log('[BaseBotInv] _onExportSheet()', sheetId);
        if (!this.api) return;

        const url = this.api.exportSheetUrl(sheetId);
        window.location.href = url;
    }

    async _onRenameSheet(sheetId) {
        console.log('[BaseBotInv] _onRenameSheet()', sheetId);
        if (!this.api) return;

        const sheet = (this.list?.sheets || []).find(s => s.id === sheetId);
        if (!sheet) return;

        const name = window.prompt('Новое название:', sheet.name || '');
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            await this.api.updateSheet(sheetId, { name: trimmed });
            await this._loadSheets();
            if (sheetId === this.activeSheetId) {
                await this._loadActive();
            }
        } catch (err) {
            console.error('[BaseBotInv] updateSheet error:', err);
            this.chat?.chat?.addMessage(
                `❌ ${err.message || 'Не удалось переименовать'}`,
                false,
                'error',
            );
        }
    }

    async _onDeleteSheet(sheetId) {
        console.log('[BaseBotInv] _onDeleteSheet()', sheetId);
        if (!this.api) return;

        const sheet = (this.list?.sheets || []).find(s => s.id === sheetId);
        const label = sheet?.name || `#${sheetId}`;

        if (!window.confirm(`Удалить ведомость «${label}»?`)) return;

        try {
            await this.api.deleteSheet(sheetId);
            await this._loadSheets();
            if (sheetId === this.activeSheetId) {
                await this._loadActive();
            }
        } catch (err) {
            console.error('[BaseBotInv] deleteSheet error:', err);
            this.chat?.chat?.addMessage(
                `❌ ${err.message || 'Не удалось удалить'}`,
                false,
                'error',
            );
        }
    }

    // ========================================
    // CHAT CALLBACKS
    // ========================================

    /**
     * Called by the chat handler after a successful /mark.
     * Highlights the row in the table and scrolls it into view.
     */
    _onItemFound(item) {
        console.log('[BaseBotInv] _onItemFound()', item?.inv_num);
        if (!item || !this.table) return;
        this.table.updateAndHighlight(item);
    }

    /**
     * Called by the chat handler when the burger in the header is
     * clicked (mobile only).
     */
    _onToggleDrawer() {
        console.log('[BaseBotInv] _onToggleDrawer()');
        if (!this.list) return;
        // Toggle — if open, close; else open.
        if (this.list._isDrawerOpen) {
            this.list.closeDrawer();
        } else {
            this.list.openDrawer();
        }
    }

    // ========================================
    // MOBILE / DESKTOP SWITCH
    // ========================================

    _setupMediaQuery() {
        if (!window.matchMedia) return;

        this._mediaQuery = window.matchMedia('(max-width: 1023px)');
        this.isMobile = this._mediaQuery.matches;

        this._mediaQueryHandler = (e) => this._onMediaChange(e.matches);
        if (this._mediaQuery.addEventListener) {
            this._mediaQuery.addEventListener('change', this._mediaQueryHandler);
        } else if (this._mediaQuery.addListener) {
            // Older Safari
            this._mediaQuery.addListener(this._mediaQueryHandler);
        }

        // Apply the initial mode.
        this._onMediaChange(this.isMobile);
    }

    _onMediaChange(isMobile) {
        console.log('[BaseBotInv] _onMediaChange()', isMobile);
        this.isMobile = isMobile;

        if (!this.list) return;

        if (isMobile) {
            this.list.enableDrawerMode();
        } else {
            this.list.disableDrawerMode();
        }
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
        console.log('[BaseBotInv] destroy()');

        // Media query listener.
        if (this._mediaQuery && this._mediaQueryHandler) {
            if (this._mediaQuery.removeEventListener) {
                this._mediaQuery.removeEventListener('change', this._mediaQueryHandler);
            } else if (this._mediaQuery.removeListener) {
                this._mediaQuery.removeListener(this._mediaQueryHandler);
            }
        }
        this._mediaQuery = null;
        this._mediaQueryHandler = null;

        // Resizer — remove the handles and detach listeners.
        if (this.resizer && typeof this.resizer.destroy === 'function') {
            this.resizer.destroy();
        }

        // Widgets.
        if (this.list && typeof this.list.destroy === 'function') {
            this.list.destroy();
        }
        if (this.table && typeof this.table.destroy === 'function') {
            this.table.destroy();
        }
        if (this.chat && typeof this.chat.destroy === 'function') {
            this.chat.destroy();
        }

        // Clear areas we filled.
        if (this.leftEl) this.leftEl.innerHTML = '';
        if (this.rightEl) this.rightEl.innerHTML = '';

        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this.api = null;
        this.list = null;
        this.table = null;
        this.chat = null;
        this.resizer = null;
        this.activeSheet = null;
        this.activeSheetId = null;
        this.currentRoom = null;

        this._initialized = false;
        this._initPromise = null;
    }
}