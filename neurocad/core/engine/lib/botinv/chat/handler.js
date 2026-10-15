// neurocad/core/engine/lib/botinv/chat/handler.js

/**
 * BotInvChatHandler — inventory chat.
 *
 * Wraps BaseChat (loaded dynamically from base/chat/chat.js — no
 * static imports) and wires it to the inventory API:
 *
 *   - user types "#405"        → api.changeRoom("405")
 *   - user types "0001380176"  → api.mark("0001380176", currentRoom)
 *   - user types "22457"       → api.mark("22457", currentRoom)
 *                                (substring; may return candidates)
 *   - user types "1" / "2" / "3" while a candidate list is open
 *                              → api.mark(..., chosenId)
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
 * When a substring query matches more than one item, the backend
 * returns status "ambiguous" with up to 3 candidates and the total
 * number of matches. The handler prints them as a numbered list,
 * stores them in `this._candidates`, and expects the next user
 * message to be "1", "2" or "3":
 *
 *   Каб. 405: 22457
 *   Бот: Найдено 3 позиции по запросу «22457»:
 *        1. БП-00022457 — Тонер-картридж … (каб. 405)
 *        2. БП-00022457-1 — Тонер-картридж … (каб. 303)
 *        3. БП-00022457-2 — Тонер-картридж … (каб. 201)
 *        Выберите номер: 1, 2 или 3.
 *
 *   Каб. 405: 1
 *   Бот: ✅ Тонер-картридж … Найдена. …
 *
 * If the user answers with anything other than 1/2/3, the candidate
 * list is discarded and the input is treated as a fresh query.
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
            // 1. Load our own CSS (burger, title tweaks).
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
    // SEND HANDLER
    // ========================================

    /**
     * Handle one user message.
     *
     * Order of checks:
     *   1. If a candidate list is open AND the message is exactly
     *      "1", "2" or "3" — treat it as a candidate pick.
     *   2. If the message starts with "#" — a room change.
     *   3. Otherwise — an inventory-number lookup.
     *
     * Any message that does not match rule 1 clears the candidate
     * list, so the next "1" is treated as a fresh query, not as a
     * late answer to a stale list.
     */
    async _handleSend(text) {
        console.log('[BotInvChatHandler] _handleSend()', text);

        if (!this.api) {
            return { text: '❌ API не подключён', variant: 'error' };
        }

        const trimmed = (text || '').trim();
        if (!trimmed) return { text: '', variant: null };

        // ---- 1. Candidate pick: "1", "2" or "3" ----
        if (this._candidates && /^[123]$/.test(trimmed)) {
            return await this._handleCandidatePick(trimmed);
        }

        // Any other message — drop the stale candidate list.
        this._candidates = null;
        this._candidateQuery = '';

        // ---- 2. Room change: "#405" ----
        if (trimmed.startsWith('#')) {
            return await this._handleRoom(trimmed);
        }

        // ---- 3. Inventory number ----
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
     * On a successful mark, onItemFound(item) is called so the
     * controller can highlight the row in the table.
     *
     * On "ambiguous", the candidate list is stored and printed —
     * the user then answers with 1, 2 or 3.
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

        // ---- Ambiguous: several matches, print a numbered list ----
        if (res.status === 'ambiguous') {
            this._candidates = Array.isArray(res.candidates)
                ? res.candidates
                : [];
            this._candidateQuery = invNum;

            return {
                text: this._formatCandidates(
                    invNum,
                    this._candidates,
                    res.total_matches,
                ),
                variant: 'warning',
            };
        }

        // ---- Single outcome: found / already_found / not_found / … ----
        return this._renderMarkResult(res);
    }

    /**
     * "1" | "2" | "3" → api.mark(query, room, chosenId).
     *
     * Called only when this._candidates is non-empty and the input
     * is exactly one of 1/2/3. The selected candidate's id is
     * passed as chosen_id; the backend looks it up directly.
     */
    async _handleCandidatePick(choice) {
        const idx = parseInt(choice, 10) - 1;
        const list = this._candidates || [];
        const picked = list[idx];

        // Defence in depth — _handleSend already validated 1/2/3,
        // but the list may be shorter than 3.
        if (!picked) {
            this._candidates = null;
            this._candidateQuery = '';
            return {
                text: `В списке нет варианта ${choice}.`,
                variant: 'error',
            };
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
            return {
                text: `❌ ${err.message || 'Не удалось отметить'}`,
                variant: 'error',
            };
        }

        if (!res || typeof res !== 'object') {
            return { text: '❌ Пустой ответ сервера', variant: 'error' };
        }

        return this._renderMarkResult(res);
    }

    // ========================================
    // RENDER HELPERS
    // ========================================

    /**
     * Render the final /mark result as { text, variant } and fire
     * onItemFound when an item was actually marked.
     *
     * Used by both the direct path (_handleMark) and the candidate
     * path (_handleCandidatePick).
     */
    _renderMarkResult(res) {
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

        return {
            text: res.message || 'Нет ответа',
            variant,
        };
    }

    /**
     * Format the candidate list for the chat.
     *
     * The final line tells a first-time user what to type next:
     * "Выберите номер: 1, 2 или 3." — listing only the numbers
     * that are actually present (when the list is shorter than 3,
     * or when the total exceeds 3 and we truncate).
     *
     * Example:
     *     Найдено 3 позиции по запросу «22457»:
     *     1. БП-00022457 — Тонер-картридж … (каб. 405)
     *     2. БП-00022457-1 — Тонер-картридж … (каб. 303)
     *     3. БП-00022457-2 — Тонер-картридж … (каб. 201)
     *     Выберите номер: 1, 2 или 3.
     */
    _formatCandidates(query, candidates, totalMatches) {
        const lines = [];

        const total = Number.isFinite(totalMatches)
            ? totalMatches
            : candidates.length;

        const header = (total === 1)
            ? `Найдена 1 позиция по запросу «${query}»:`
            : `Найдено ${total} позиций по запросу «${query}»:`;
        lines.push(header);

        candidates.forEach((c, i) => {
            const num = i + 1;
            const name = (c.name || '').trim();
            const room = c.room_before ? ` (каб. ${c.room_before})` : '';
            const foundMark = c.found ? ' ✓' : '';
            lines.push(`${num}. ${c.inv_num} — ${name}${room}${foundMark}`);
        });

        const shown = candidates.length;

        // Hint telling the user what to type next. Only list the
        // numbers that actually exist in the list — when the total
        // exceeds CANDIDATE_LIMIT, the list is truncated and the
        // numbers above are still 1..shown.
        if (shown === 1) {
            lines.push('Напишите 1, чтобы отметить эту позицию.');
        } else {
            const nums = [];
            for (let i = 1; i <= shown; i++) nums.push(String(i));
            const last = nums.pop();
            const list = nums.length ? `${nums.join(', ')} или ${last}` : last;
            lines.push(`Выберите номер: ${list}.`);
        }

        // If there are more matches than we can show, tell the user
        // the query is too broad — right after the pick-hint, so
        // both "how to pick" and "how to refine" are on screen.
        if (total > shown) {
            lines.push(`Всего найдено ${total} — уточните запрос, чтобы увидеть остальные.`);
        }

        return lines.join('\n');
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