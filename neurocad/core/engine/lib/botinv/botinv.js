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
 *   list.onImport()          → file picker → modal form → api.importSheet
 *   list.onExport(sheetId)   → window.location.href = api.exportSheetUrl(id)
 *   list.onRename(sheetId)   → modal input → api.updateSheet
 *   list.onDelete(sheetId)   → modal confirm → api.deleteSheet
 *   chat.onItemFound(item)   → table.updateAndHighlight(item)
 *   chat.onToggleDrawer()    → list.openDrawer() / list.closeDrawer()
 *
 * Additionally, BotInvResizer is mounted to make the side panels
 * draggable. Handles are inserted between area-left ↔ area-center
 * and area-center ↔ area-right. Widths are persisted in localStorage
 * (keys: botinv:left-width, botinv:right-width). The resizer has no
 * effect on mobile — the side panels are hidden there.
 *
 * Deferred table mount
 * --------------------
 * BotInvTable is a wrapper around the base Table. Its _init()
 * builds the filter row and the toolbar, which live INSIDE the
 * base Table's DOM (inside <thead> and inside the wrapper,
 * respectively). That means the wrapper must already be attached
 * to the real container when BotInvTable._init() runs.
 *
 * In this controller _init() only creates the widgets — the real
 * area-center node (this._tableContainer) does not exist yet, it
 * is built in render(). So BotInvTable is constructed in _init()
 * with a throwaway <div>, and bindEvents() calls
 * this.table.remount(this._tableContainer) once the real node is
 * in the DOM. remount() re-attaches the base Table and re-installs
 * the filter row + toolbar against the fresh DOM.
 *
 * Without remount(), the filters would be built against the
 * throwaway <div> (which has no <thead>) and would never appear.
 *
 * Layout: desktop vs mobile
 * -------------------------
 * Two completely different layouts, switched by _onMediaChange():
 *
 *   Desktop (> 1024px):
 *     area-left   → BotInvList (sheets sidebar)
 *     area-center → BotInvTable (inventory table)
 *     area-right  → BotInvChatHandler (chat, sidebar-mode)
 *     BotInvResizer handles between all three.
 *     Floating 💬 button hidden (the chat is already in view).
 *
 *   Mobile (<= 1023px):
 *     area-left   → hidden by 07_mobile.css
 *     area-right  → hidden by 07_mobile.css
 *     area-center → BotInvChatHandler (chat, sidebar-mode)
 *     The chat fills area-center edge to edge — it IS the main
 *     screen. The hamburger ☰ in the chat header opens the sheets
 *     list as a left drawer (drawer.css).
 *     The table is NOT mounted at all — there is nowhere to put
 *     it, and the accountant works through the chat anyway.
 *     The floating 💬 button is hidden — the chat is already
 *     visible, a floating shortcut would just overlap it.
 *
 * The switch is driven by _onMediaChange(), which fires on the
 * initial load (via _setupMediaQuery) and on every viewport
 * crossing of the 1024px breakpoint.
 *
 * Because the same BaseChat instance is reused in both modes,
 * switching calls _teardownChatMount() first and then the
 * appropriate _mount*Chat() — the widget itself keeps its
 * message history, only its parent node changes.
 *
 * Modals
 * ------
 * The import / rename / delete flows use the shared BaseModal*
 * components (createModal factory) instead of window.prompt /
 * window.confirm. This gives:
 *
 *   - a native-looking date picker for the batch date (no more
 *     "ГГГГ-ММ-ДД" text entry, no format mistakes);
 *   - a proper confirm dialog for deletion;
 *   - consistent look with the rest of the admin UI.
 *
 * The modal factory is imported lazily via _createModal() —
 * only when the user actually triggers an action.
 *
 * The date picker is special-cased: see _createDateModal() below.
 * Every other modal in the project receives an options OBJECT
 * from createModal(type, props); BaseModalDate is the only one
 * whose constructor signature is (years: number[] | null). The
 * factory in base/modal/index.js forwards the raw props object,
 * which would make BaseModalDate receive {} instead of an array
 * and crash on `this.years.forEach`. Since neither date.js nor
 * index.js is in our scope to change, we bypass the factory for
 * this one type and instantiate BaseModalDate directly with a
 * proper years array.
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
        this._tableContainer = null;

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

        // Which mount path is currently applied — so that
        // _onMediaChange() can tell whether a rebuild is needed.
        //   null | 'desktop' | 'mobile'
        this._mountMode = null;

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

            // 5b. BotInvTable is built against a throwaway <div>.
            //     The real area-center node is created in render().
            //     bindEvents() will call remount() to re-attach the
            //     base Table and re-install the filter row + toolbar
            //     (which must live inside the base Table's DOM).
            this.table = new BotInvTable(
                document.createElement('div'),
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
            //    Must run BEFORE bindEvents (bindEvents reads
            //    this.isMobile to decide which layout to build).
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
     *
     * The wrapper always contains a single .core-engine-lib-botinv-table
     * node — the anchor for the table. On mobile it stays empty
     * (the table is never mounted there), but keeping it in the
     * markup is cheap and keeps render() branch-free.
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

        // 2. Mount the sheets list into area-left. Always — even
        //    on mobile, where area-left is hidden: on mobile the
        //    list becomes the drawer (BotInvList.enableDrawerMode()
        //    moves the SAME DOM out of area-left into <body> when
        //    the burger is tapped).
        if (this.leftEl && this.list) {
            const listEl = this.list.render();
            this.list.bindEvents(listEl);
            this.leftEl.innerHTML = '';
            this.leftEl.appendChild(listEl);
            this.leftEl.style.display = '';
        }

        // 3. Mount the layout for the current media mode.
        //
        //    Desktop — table in area-center, chat in area-right,
        //              resizer between the three.
        //    Mobile  — chat in area-center, no table, no resizer.
        if (this.isMobile) {
            this._mountMobile();
        } else {
            this._mountDesktop();
        }

        // 4. Initial data load. The table is only updated on
        //    desktop — on mobile it was never mounted.
        this._loadActive().then(() => {
            this._loadSheets();
        });
    }

    // ========================================
    // LAYOUT — DESKTOP
    // ========================================

    /**
     * Desktop layout:
     *   area-center → BotInvTable
     *   area-right  → BaseChat (sidebar mode)
     *   handles between area-left ↔ area-center ↔ area-right
     *   floating 💬 button hidden (chat is already visible)
     */
    _mountDesktop() {
        console.log('[BaseBotInv] _mountDesktop()');

        this._mountMode = 'desktop';

        // Table into area-center.
        if (this._tableContainer && this.table) {
            this.table.remount(this._tableContainer);
        }

        // Chat into area-right.
        if (this.rightEl && this.chat) {
            this.rightEl.innerHTML = '';
            this.rightEl.style.display = '';
            this.chat.mount(this.rightEl);
        }

        // Resizer handles (no-op on mobile, but this is desktop).
        if (this.resizer) {
            this.resizer.build();
        }
    }

    // ========================================
    // LAYOUT — MOBILE
    // ========================================

    /**
     * Mobile layout:
     *   area-center → BaseChat (sidebar mode — no border, full
     *                 width; the floating 💬 is hidden by
     *                 BaseChat.attach())
     *   no table, no resizer
     *   sheets list stays mounted in area-left (hidden by
     *   07_mobile.css) and is shown as a left drawer via the
     *   burger ☰ in the chat header
     */
    _mountMobile() {
        console.log('[BaseBotInv] _mountMobile()');

        this._mountMode = 'mobile';

        // The table container stays empty on mobile. If we
        // previously rendered into it (user resized the window
        // from desktop to mobile), clear it now.
        if (this._tableContainer) {
            this._tableContainer.innerHTML = '';
        }

        // Chat into area-center. BaseChat.attach() switches the
        // widget to .sidebar-mode and hides the floating button —
        // both are what we want on mobile.
        if (this.centerEl && this.chat) {
            this.centerEl.innerHTML = '';
            this.centerEl.style.display = '';
            this.chat.mount(this.centerEl);
        }

        // Hide the floating 💬 button. attach() already does this,
        // but if a previous desktop run left the button visible
        // and something else re-showed it, we want to be sure.
        this._hideFloatingChatButton();
    }

    // ========================================
    // LAYOUT — TEARDOWN (used when switching modes)
    // ========================================

    /**
     * Detach the chat from whatever parent it currently has and
     * move it back to <body> in its "neutral" hidden state.
     *
     * Called before switching layouts, so the next _mount*Chat()
     * starts from a clean slate. The BaseChat instance itself is
     * NOT destroyed — message history, current room and the
     * handler state all survive.
     */
    _teardownChatMount() {
        const container = this.chat?.chat?.container;
        if (!container) return;

        console.log('[BaseBotInv] _teardownChatMount()');

        if (container.parentNode !== document.body) {
            document.body.appendChild(container);
        }

        container.classList.remove('sidebar-mode', 'modal-mode', 'active');
        container.classList.add('hidden');

        if (this.chat?.chat) {
            this.chat.chat.isSidebarMode = false;
        }
    }

    /**
     * Force the floating 💬 button into the hidden state, whatever
     * state it was in. On desktop it is hidden by CSS anyway
     * (media query min-width: 1024px), but on mobile we want to be
     * sure it never overlays the full-screen chat.
     */
    _hideFloatingChatButton() {
        const f = this.chat?.chat?.floatingBtn;
        if (f) f.classList.add('hidden');
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

        // Fill the table — desktop only. On mobile the table
        // was never mounted, so this is a no-op there.
        if (this.table && this._mountMode === 'desktop') {
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
    // MODALS — small factory helpers
    // ========================================

    /**
     * Lazily load the modal factory and return a fresh instance.
     *
     * Modals are not needed until the user actually imports /
     * renames / deletes something, so the factory is imported on
     * demand — same dynamic-import rule as everything else.
     *
     * The factory path is relative to this file:
     *   ./botinv/botinv.js → ../base/modal/index.js
     *
     * Use this for every modal type EXCEPT 'date' — see
     * _createDateModal() for why.
     */
    async _createModal(type, props = {}) {
        const version = window.coreEngine?.static_version || Date.now();
        const mod = await import(
            `../base/modal/index.js?v=${version}`
        );
        return await mod.createModal(type, props);
    }

    /**
     * Create a BaseModalDate instance.
     *
     * WHY this bypasses the factory
     * -----------------------------
     * base/modal/index.js forwards the raw `props` object to
     * every modal constructor:
     *
     *     return new BaseModalDate(props);
     *
     * But BaseModalDate's constructor signature is:
     *
     *     constructor(years = null) { this.years = years || []; ... }
     *
     * — it wants an ARRAY of years, not an options object. If the
     * factory is called without a second argument, props is {},
     * this.years becomes {}, and _populateYearSelect() crashes on
     * `this.years.forEach is not a function`.
     *
     * Neither date.js nor index.js is in our scope to change, so
     * we import date.js directly and instantiate it with a proper
     * years array. The array is built by _buildYearRange().
     */
    async _createDateModal() {
        const version = window.coreEngine?.static_version || Date.now();
        const mod = await import(
            `../base/modal/date.js?v=${version}`
        );
        const BaseModalDate = mod.BaseModalDate;
        if (typeof BaseModalDate !== 'function') {
            throw new Error('base/modal/date.js does not export BaseModalDate');
        }
        return new BaseModalDate(this._buildYearRange());
    }

    /**
     * Years offered in the date picker: current year minus 5
     * through current year plus 5. Wide enough for any realistic
     * batch date, narrow enough that the dropdown is not a wall
     * of numbers.
     *
     * If BaseModalDate ever needs a wider range, this is the one
     * place to change it.
     */
    _buildYearRange() {
        const thisYear = new Date().getFullYear();
        const years = [];
        for (let y = thisYear - 5; y <= thisYear + 5; y++) {
            years.push(y);
        }
        return years;
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
     * Import a sheet: file picker → name modal → date modal → upload.
     *
     * The batch date is picked from BaseModalDate (a real calendar,
     * dd.mm.yyyy on screen) — no more "ГГГГ-ММ-ДД" string entry.
     * The Date object returned by the modal is converted to ISO
     * (YYYY-MM-DD) only for the API call.
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

            // ---- 1. Sheet name ----
            const nameModal = await this._createModal('input');
            const namePromise = new Promise((resolve) => {
                nameModal.setOnOk((v) => resolve(v));
                nameModal.setOnCancel(() => resolve(null));
            });
            nameModal.open(
                'Название ведомости:',
                'Загрузка ведомости',
                defaultName,
                defaultName,
            );
            const rawName = await namePromise;
            if (rawName === null) return;
            const name = String(rawName).trim();
            if (!name) return;

            // ---- 2. Batch date (calendar) ----
            //
            // Deliberately NOT _createModal('date'): the factory
            // forwards an options object, while BaseModalDate
            // expects a years array. See _createDateModal().
            const dateModal = await this._createDateModal();
            const datePromise = new Promise((resolve) => {
                dateModal.setOnOk((d) => resolve(d));
                dateModal.setOnCancel(() => resolve(null));
            });
            dateModal.open();
            const picked = await datePromise;
            if (!picked) return;

            const batchDate = this._dateToIso(picked);

            // ---- 3. Upload ----
            try {
                await this.api.importSheet(file, name, batchDate);
                await this._loadSheets();
                this.chat?.chat?.addMessage(
                    `✅ Ведомость «${name}» загружена.`,
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
     * Rename a sheet via BaseModalInput.
     */
    async _onRenameSheet(sheetId) {
        console.log('[BaseBotInv] _onRenameSheet()', sheetId);
        if (!this.api) return;

        const sheet = (this.list?.sheets || []).find(s => s.id === sheetId);
        if (!sheet) return;

        const modal = await this._createModal('input');
        const promise = new Promise((resolve) => {
            modal.setOnOk((v) => resolve(v));
            modal.setOnCancel(() => resolve(null));
        });
        modal.open(
            'Новое название:',
            'Переименовать',
            'Например: Ведомость 2026',
            sheet.name || '',
        );
        const raw = await promise;
        if (raw === null) return;
        const name = String(raw).trim();
        if (!name) return;

        try {
            await this.api.updateSheet(sheetId, { name });
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

    /**
     * Delete a sheet after confirmation via BaseModalConfirm.
     */
    async _onDeleteSheet(sheetId) {
        console.log('[BaseBotInv] _onDeleteSheet()', sheetId);
        if (!this.api) return;

        const sheet = (this.list?.sheets || []).find(s => s.id === sheetId);
        const label = sheet?.name || `#${sheetId}`;

        const modal = await this._createModal('confirm');
        const promise = new Promise((resolve) => {
            modal.setOnOk(() => resolve(true));
            modal.setOnCancel(() => resolve(false));
        });
        modal.open(
            `Удалить ведомость «${label}»?`,
            'Удаление',
            'Удалить',
            'Отмена',
        );
        const confirmed = await promise;
        if (!confirmed) return;

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

    /**
     * Download the sheet as .xlsx.
     *
     * The export endpoint sets
     *   Content-Disposition: attachment; filename="vedomost_...xlsx"
     * so a plain navigation is enough — the browser takes care of
     * the filename and the actual file write.
     */
    _onExportSheet(sheetId) {
        console.log('[BaseBotInv] _onExportSheet()', sheetId);
        if (!this.api) return;

        const url = this.api.exportSheetUrl(sheetId);
        window.location.href = url;
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * Convert a Date to the ISO date string ("YYYY-MM-DD") that
     * the backend / Pydantic expect. Used only for the API call —
     * the user never sees this format; the calendar shows
     * dd.mm.yyyy via BaseModalDate, and the sheets list shows
     * dd.mm.yyyy via BotInvList._formatDate.
     */
    _dateToIso(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    // ========================================
    // CHAT CALLBACKS
    // ========================================

    /**
     * Called by the chat handler after a successful /mark.
     * Highlights the row in the table and scrolls it into view.
     * No-op on mobile — the table is not mounted there.
     */
    _onItemFound(item) {
        console.log('[BaseBotInv] _onItemFound()', item?.inv_num);
        if (!item || !this.table) return;
        if (this._mountMode !== 'desktop') return;
        this.table.updateAndHighlight(item);
    }

    /**
     * Called by the chat handler when the burger in the header is
     * clicked (mobile only). Opens or closes the sheets drawer.
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

        // Sheets list — drawer mode on mobile, sidebar on desktop.
        if (this.list) {
            if (isMobile) {
                this.list.enableDrawerMode();
            } else {
                this.list.disableDrawerMode();
            }
        }

        // Layout switch — only if areas are already set up
        // (bindEvents has run). On the very first _onMediaChange
        // (called from _init via _setupMediaQuery) area refs are
        // still null, and bindEvents will do the initial mount
        // itself using the same isMobile value.
        const areasReady = !!(this.centerEl && this.rightEl);
        if (!areasReady) {
            console.log('[BaseBotInv] _onMediaChange: areas not ready, skip layout');
            return;
        }

        // Already in the right mode? Nothing to do.
        const wanted = isMobile ? 'mobile' : 'desktop';
        if (this._mountMode === wanted) {
            console.log('[BaseBotInv] _onMediaChange: already', wanted);
            return;
        }

        // Switch: tear down the current chat mount, rebuild the
        // layout for the new mode.
        this._teardownChatMount();

        if (isMobile) {
            this._mountMobile();
        } else {
            this._mountDesktop();
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
        if (this.centerEl) this.centerEl.innerHTML = '';
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
        this._mountMode = null;

        this._initialized = false;
        this._initPromise = null;
    }
}