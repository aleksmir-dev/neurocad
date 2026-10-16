// neurocad/core/engine/lib/botinv/chat/handler.js

/**
 * BotInvChatHandler — inventory chat.
 *
 * Wraps BaseChat (loaded dynamically from base/chat/chat.js — no
 * static imports) and wires it to the inventory API:
 *
 *   - user types "#405"        → api.changeRoom("405")
 *   - user types "22457"       → api.mark("22457", currentRoom)
 *                                (lookup only; never marks on its own)
 *   - user taps a candidate button
 *                              → api.mark(query, room, chosenId)
 *                                (this is the ONLY path that marks)
 *
 * The handler knows NOTHING about the drawer, the table or the list.
 * It gets callbacks via options and calls them at the right
 * moments:
 *
 *   - getCurrentRoom()          → returns the current room (string)
 *                                 or null
 *   - setCurrentRoom(room)      → persists a room after a change
 *   - onItemFound(item)         → a successful /mark returned an
 *                                 updated item — the controller uses
 *                                 this to highlight the table row
 *   - onToggleDrawer()          → the burger in the header was
 *                                 clicked (mobile only)
 *
 * Candidate list ("ambiguous")
 * ----------------------------
 * The service NEVER marks on the string-lookup path — even when a
 * fragment matches a single item, it returns status "ambiguous"
 * with 1..CANDIDATE_LIMIT candidates. The handler renders them as
 * a compact list of rows plus one button per row; the tap carries
 * the chosen item's id back to the API.
 *
 * Example:
 *
 *   Каб. 405: 22457
 *   Бот: • БП-00022457 — Тонер-картридж … (каб. 405)
 *        • БП-00022457-1 — Тонер-картридж … (каб. 303)
 *        • БП-00022457-2 — Тонер-картридж … (каб. 201)
  *        [ БП-00022457 ]
 *        [ БП-00022457-1 ]
 *        [ БП-00022457-2 ]
 *
 *   (пользователь тапает кнопку)
 *   Бот: ✅ Тонер-картридж … Отмечено в каб. 405.
 *
 * The candidate rows are built as HTML and passed with `html: true`;
 * the buttons are passed as a plain array of {text, payload}
 * descriptors and rendered by BaseChat as real <button> elements.
 * The tap handler is wired once in _init() via
 * chat.setOnButtonClick(...).
 *
 * Placeholder
 * -----------
 * The input placeholder is intentionally SHORT — it must fit on
 * one line even when the chat is narrow:
 *
 *   no room  → "Введите #кабинет"
 *   room 303 → "303: инв. номер"
 *
 * No static imports. No !important in CSS.
 */
export class BotInvChatHandler {
    constructor(options = {}) {
        console.log('[BotInvChatHandler] Constructor');

        this.options = options;

        // API — set by the controller before calling mount().
        this.api = options.api || null;

        // Callbacks — all optional.
        this.getCurrentRoom = options.getCurrentRoom || (() => null);
        this.setCurrentRoom = options.setCurrentRoom || (() => {});
        this.onItemFound = options.onItemFound || null;
        this.onToggleDrawer = options.onToggleDrawer || null;

        // BaseChat instance — created in _init.
        this.chat = null;

        // DOM / state
        this.container = null;
        this._burgerBtn = null;

        // Candidate list, set when the backend returns
        // status "ambiguous". Cleared as soon as the user picks one
        // or sends any other message.
        //   [ { id, inv_num, name, room_before, found }, ... ]
        this._candidates = null;

        // The original query string that produced the candidate list.
        // Sent back with chosen_id when the user picks a candidate —
        // the schema requires inv_num to be non-empty.
        this._candidateQuery = '';

        this._initPromise = this._init();
    }

    // ========================================
    // INIT
    // ========================================

    async _init() {
        console.log('[BotInvChatHandler] _init() START');
        try {
            // 1. Load our own CSS (burger, title tweaks, candidate
            //    list colours, inline buttons).
            await this._loadCSS();

            // 2. Dynamically import BaseChat.
            const version = window.coreEngine?.static_version || Date.now();
            const mod = await import(`../../base/chat/chat.js?v=${version}`);
            const BaseChat = mod.BaseChat;

            if (typeof BaseChat !== 'function') {
                throw new Error('base/chat/chat.js does not export BaseChat');
            }

            // 3. Create BaseChat with the inventory configuration.
            this.chat = new BaseChat({
                // No AI icon — this is not an AI assistant.
                icon: '',
                title: 'Инвентаризация',
                welcomeText:
                    'Выберите кабинет командой #NNN, затем вводите ' +
                    'инвентарные номера. Ответ появится здесь.',
                // Initial placeholder — replaced in step 6 with the
                // actual current-room hint. Kept SHORT on purpose:
                // the input is one line tall.
                placeholder: 'Введите #кабинет',
                // Inventory chat starts empty each time — the sheet
                // history is not a chat, it is the table.
                skipHistory: true,
                // The burger sits to the left of the title.
                headerExtra:
                    '<button type="button" class="botinv-drawer-toggle" ' +
                    'aria-label="Список ведомостей">☰</button>',
                // Our send handler replaces the default HTTP call.
                onSend: (text) => this._handleSend(text),
            });

            // 4. Tag the container so botinv/chat/chat.css can
            //    scope its rules to this chat only.
            if (this.chat.container) {
                this.chat.container.classList.add('botinv-chat');
            }

            // 5. Cache the burger and bind it.
            if (this.chat.container) {
                this._burgerBtn = this.chat.container.querySelector(
                    '.botinv-drawer-toggle'
                );
            }
            if (this._burgerBtn) {
                this._burgerBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.onToggleDrawer) this.onToggleDrawer();
                });
            }

            // 5b. Wire inline-button taps. When a user taps a
            //     candidate button, BaseChat calls this handler with
            //     the button's payload (the candidate id, as a
            //     string). The handler marks the item and posts the
            //     result as a new bot message.
            if (typeof this.chat.setOnButtonClick === 'function') {
                this.chat.setOnButtonClick((payload) =>
                    this._handleButtonTap(payload)
                );
            }

            // Wait for BaseChat's own init (history load, though we
            // skip it — the promise still resolves).
            if (this.chat.waitForInit) {
                await this.chat.waitForInit();
            }

            // 6. Set the placeholder according to the current room
            //    (if the controller already has one in localStorage).
            const initialRoom = this.getCurrentRoom();
            this._updatePlaceholder(initialRoom);

            console.log('[BotInvChatHandler] _init() COMPLETE');
        } catch (error) {
            console.error('[BotInvChatHandler] Init error:', error);
            throw error;
        }
    }

    async _loadCSS() {
        console.log('[BotInvChatHandler] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            await window.coreEngine.loadCSS('core/engine/lib/botinv/chat/chat.css');
        }
    }

    // ========================================
    // MOUNT
    // ========================================

    /**
     * Attach the chat into the given container (area-right).
     * Called once by the controller after area-right is ready.
     */
    mount(container) {
        console.log('[BotInvChatHandler] mount()');
        if (!container || !this.chat) return;

        this.container = container;
        this.chat.attach(container);
    }

    // ========================================
    // BUTTON TAP HANDLER
    // ========================================

    /**
     * Called by BaseChat when a candidate button is tapped.
     *
     * `payload` is the item id (string) attached to the button.
     * We look the candidate up in `this._candidates`, mark it via
     * the API, and post the result as a regular bot message.
     *
     * If the candidate list is no longer present (page reloaded,
     * sheet switched), the tap is a no-op with a short warning.
     */
    async _handleButtonTap(payload) {
        console.log('[BotInvChatHandler] _handleButtonTap()', payload);

        const list = this._candidates || [];
        const id = parseInt(payload, 10);
        const picked = list.find(c => c.id === id);

        if (!picked) {
            this.chat?.addMessage(
                'Список устарел. Введите номер заново.',
                false,
                'warning',
            );
            return;
        }

        const currentRoom = this.getCurrentRoom() || null;
        const query = this._candidateQuery || picked.inv_num || '';

        // Clear before the request — an error must not leave the
        // old list hanging around.
        this._candidates = null;
        this._candidateQuery = '';

        let res;
        try {
            res = await this.api.mark(query, currentRoom, picked.id);
        } catch (err) {
            this.chat?.addMessage(
                `❌ ${err.message || 'Не удалось отметить'}`,
                false,
                'error',
            );
            return;
        }

        if (!res || typeof res !== 'object') {
            this.chat?.addMessage('❌ Пустой ответ сервера', false, 'error');
            return;
        }

        this._postMarkResult(res);
    }

    /**
     * Post a mark result to the chat as a new bot message.
     *
     * Shared by _handleSend (indirect paths) and _handleButtonTap.
     */
    _postMarkResult(res) {
        // Status → variant mapping.
        let variant = 'warning';
        if (res.status === 'found') variant = 'success';
        else if (res.status === 'not_found') variant = 'error';
        else if (res.status === 'no_room') variant = 'error';
        else if (res.status === 'no_active_sheet') variant = 'error';

        // Highlight the row in the table.
        if (res.item && (res.status === 'found' || res.status === 'already_found')) {
            if (this.onItemFound) {
                try {
                    this.onItemFound(res.item);
                } catch (e) {
                    console.warn('[BotInvChatHandler] onItemFound error:', e);
                }
            }
        }

        this.chat?.addMessage(
            res.message || 'Нет ответа',
            false,
            variant,
        );
    }

    // ========================================
    // SEND HANDLER
    // ========================================

    /**
     * Handle one user message.
     *
     * Order of checks:
     *   1. If the message starts with "#" — a room change.
     *   2. Otherwise — an inventory-number lookup (which may return
     *      a candidate list to pick from).
     *
     * There is NO "type 1/2/3" branch: candidate picks arrive via
     * button taps (handled by _handleButtonTap, not here).
     */
    async _handleSend(text) {
        console.log('[BotInvChatHandler] _handleSend()', text);

        if (!this.api) {
            return { text: '❌ API не подключён', variant: 'error' };
        }

        const trimmed = (text || '').trim();
        if (!trimmed) return { text: '', variant: null };

        // Any message clears the previous candidate list — a
        // new query must not be treated as a stale answer.
        this._candidates = null;
        this._candidateQuery = '';

        // ---- 1. Room change: "#405" ----
        if (trimmed.startsWith('#')) {
            return await this._handleRoom(trimmed);
        }

        // ---- 2. Inventory number ----
        return await this._handleMark(trimmed);
    }

    /**
     * "#405" → api.changeRoom("405").
     *
     * On success the room is persisted via setCurrentRoom() and the
     * input placeholder is updated to reflect the new room. On
     * failure nothing is persisted and the error message is returned.
     */
    async _handleRoom(text) {
        // Strip the "#" and any surrounding whitespace.
        const room = text.slice(1).trim();
        if (!room) {
            return { text: 'Укажите кабинет: #405', variant: 'error' };
        }

        let res;
        try {
            res = await this.api.changeRoom(room);
        } catch (err) {
            return {
                text: `❌ ${err.message || 'Не удалось сменить кабинет'}`,
                variant: 'error',
            };
        }

        if (!res || typeof res !== 'object') {
            return { text: '❌ Пустой ответ сервера', variant: 'error' };
        }

        if (res.status === 'room_changed') {
            const newRoom = res.current_room || room;
            this.setCurrentRoom(newRoom);
            this._updatePlaceholder(newRoom);
            return {
                text: `Каб. ${newRoom}: кабинет выбран.`,
                variant: 'success',
            };
        }

        // "room_not_found" | "no_active_sheet" — both come with a
        // ready-made Russian message from the service. The placeholder
        // is NOT changed — the current room is left as it was.
        return {
            text: res.message || 'Кабинет не найден',
            variant: 'error',
        };
    }

    /**
     * "0001380176" (or a substring like "22457") →
     * api.mark(invNum, currentRoom).
     *
     * The current room comes from getCurrentRoom() — the controller
     * reads it from localStorage. If it is empty, the service will
     * refuse with "no_room" and we show that message.
     *
     * The service NEVER marks on this path — it returns either:
     *
     *   - "ambiguous" with 1..CANDIDATE_LIMIT candidates; the
     *     handler renders the list and one button per candidate;
     *   - "not_found" — no match;
     *   - "no_room" / "no_active_sheet" — the guard at the top of
     *     the service.
     *
     * The ONLY path that marks is the button tap
     * (_handleButtonTap), which calls the API with chosen_id.
     */
    async _handleMark(invNum) {
        const currentRoom = this.getCurrentRoom() || null;

        let res;
        try {
            res = await this.api.mark(invNum, currentRoom);
        } catch (err) {
            return {
                text: `❌ ${err.message || 'Не удалось отметить'}`,
                variant: 'error',
            };
        }

        if (!res || typeof res !== 'object') {
            return { text: '❌ Пустой ответ сервера', variant: 'error' };
        }

        // ---- Ambiguous: candidate list (1..CANDIDATE_LIMIT).
        //     Store them for later button taps and render the list
        //     with one button per candidate. ----
        if (res.status === 'ambiguous') {
            this._candidates = Array.isArray(res.candidates)
                ? res.candidates
                : [];
            this._candidateQuery = invNum;

            const formatted = this._formatCandidates(this._candidates);

            return {
                text: formatted.text,
                variant: 'warning',
                html: true,
                buttons: formatted.buttons,
            };
        }

        // ---- Single outcome: not_found / no_room / no_active_sheet / … ----
        let variant = 'warning';
        if (res.status === 'not_found') variant = 'error';
        else if (res.status === 'no_room') variant = 'error';
        else if (res.status === 'no_active_sheet') variant = 'error';

        return {
            text: res.message || 'Нет ответа',
            variant,
        };
    }

    // ========================================
    // RENDER HELPERS
    // ========================================

    /**
     * Format the candidate list for the chat.
     *
     * Returns { text, buttons }:
     *
     *   text    — an HTML string, one row per candidate, built as:
     *             "• ИНВ — Название (каб. X)"
     *             followed by a single short line "Выберите позицию:".
     *             Values from the sheet are HTML-escaped.
     *
     *   buttons — an array of { text, payload } descriptors, one
     *             per candidate. `text` is the full inventory
     *             number; `payload` is the item id (as a string),
     *             which BaseChat returns to the tap handler.
     *
     * The caller (_handleMark) passes both to BaseChat via the
     * reply object: `text` with `html: true`, `buttons` as-is.
     *
     * No header, no "Найдено N позиций", no "Всего найдено" —
     * the list speaks for itself, and every extra line clutters
     * the chat.
     */
    _formatCandidates(candidates) {
        const lines = [];

        candidates.forEach((c) => {
            const inv = this._escapeHtml(c.inv_num || '');
            const name = this._escapeHtml((c.name || '').trim());
            const room = c.room_before
                ? ` (каб. ${this._escapeHtml(c.room_before)})`
                : '';
            const foundMark = c.found ? ' ✓' : '';
            lines.push(`• ${inv} — ${name}${room}${foundMark}`);
        });

        // Одна короткая подсказка — что делать дальше. Без неё
        // кнопки не всегда очевидны для первого тапа.
        // lines.push('Выберите позицию:');

        // Buttons: one per candidate, text = full inv_num,
        // payload = item id as a string.
        const buttons = [];
        for (const c of candidates) {
            const inv = c.inv_num || '';
            if (!inv || c.id == null) continue;
            buttons.push({
                text: inv,
                payload: String(c.id),
            });
        }

        return {
            // <br> instead of \n — the message is rendered with
            // innerHTML, and plain newlines collapse to spaces.
            text: lines.join('<br>'),
            buttons,
        };
    }

    /**
     * Minimal HTML escape for values interpolated into the
     * candidate-list markup: inv_num, name, room_before, query.
     *
     * Escapes the four characters that matter inside element
     * content and double-quoted attributes: & < > ".
     */
    _escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ========================================
    // PLACEHOLDER
    // ========================================

    /**
     * Update the input placeholder based on the current room.
     *
     * Kept SHORT — the input is one line tall:
     *
     *   no room  → "Введите #кабинет"
     *   room 303 → "303: инв. номер"
     *
     * Called at init (with the room from localStorage, if any) and
     * after every successful room change.
     */
    _updatePlaceholder(room) {
        if (!this.chat || typeof this.chat.setPlaceholder !== 'function') return;

        const text = room
            ? `${room}: инв. номер`
            : 'Введите #кабинет';

        this.chat.setPlaceholder(text);
    }

    // ========================================
    // PUBLIC API (for the controller)
    // ========================================

    /**
     * Update the header title (e.g. when the active sheet changes).
     */
    setTitle(title) {
        if (!this.chat) return;
        this.chat.titleText = title || '';
        if (this.chat.title) {
            this.chat.title.textContent = this.chat.titleText;
        }
    }

    /**
     * Clear the message history (e.g. when switching sheets).
     * Also drops any open candidate list — a new sheet means the
     * old candidates are meaningless.
     */
    clearMessages() {
        this._candidates = null;
        this._candidateQuery = '';
        if (this.chat) this.chat.clearHistory();
    }

    /**
     * Show the welcome message again (used after clearing).
     */
    showWelcome() {
        if (this.chat && this.chat.welcomeText) {
            this.chat.addMessage(this.chat.welcomeText, false);
        }
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    isInitialized() {
        return !!(this.chat && this.chat.isInitialized());
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this.isInitialized();
    }

    destroy() {
        console.log('[BotInvChatHandler] destroy()');

        if (this._burgerBtn) {
            this._burgerBtn.removeEventListener('click', this.onToggleDrawer);
            this._burgerBtn = null;
        }

        if (this.chat && typeof this.chat.destroy === 'function') {
            this.chat.destroy();
        }

        this.chat = null;
        this.container = null;
        this._candidates = null;
        this._candidateQuery = '';
        this._initPromise = null;
    }
}