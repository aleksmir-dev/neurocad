// app/core/engine/lib/base/chat/chat.js

/**
 * BaseChat — floating chat widget.
 *
 * Two modes:
 *   - modal (mobile / no sidebar) — opened by a floating button;
 *   - sidebar (desktop) — attached into the right area via attach().
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Visibility is controlled ENTIRELY through CSS classes — no inline
 * `style.display` anywhere. The CSS rules live in chat.css:
 *
 *   .core-engine-lib-base-chat               → display: none
 *   .core-engine-lib-base-chat.sidebar-mode  → display: flex
 *   .core-engine-lib-base-chat.modal-mode    → display: flex
 *   .core-engine-lib-base-chat.hidden        → display: none
 *
 * The `.hidden` class is declared LAST in chat.css, so it wins over
 * `.sidebar-mode` / `.modal-mode` when both are present.
 *
 * Customisation (all optional, via `options`):
 *   - title        — header text           (default: "Чат с AI")
 *   - welcomeText  — first bot message     (default: "Привет! Я AI-ассистент…")
 *   - placeholder  — input placeholder     (default: "Введите сообщение…")
 *   - icon         — emoji shown before the title (default: "🤖")
 *   - headerExtra  — raw HTML inserted into .chat-header between the
 *                    title and the close button (default: "")
 *   - apiUrl       — HTTP endpoint for _sendToAPI (default: /core/chat/send)
 *   - skipHistory  — do not load /core/chat/history (default: false)
 *   - onSend       — async (text) => reply; if set, replaces _sendToAPI
 *
 * Custom `onSend` takes priority over `_sendToAPI` when both are set.
 * The reply is rendered as a bot message. If the callback returns an
 * object `{ text, variant }`, the `variant` ("success" | "warning" |
 * "error") is forwarded to addMessage.
 *
 * HTML in messages
 * ----------------
 * addMessage() takes an optional fourth argument `asHtml` (default
 * false). When it is true, the message body is injected with
 * innerHTML; otherwise it is set with textContent. This is used by
 * the inventory chat to colour the numbered candidate list
 * (`.botinv-cand-num` / `.botinv-cand-inv`), while every other
 * message in the app stays plain text.
 *
 * SECURITY: pass `asHtml: true` ONLY with strings built by the
 * caller itself — never with raw user input or raw API output.
 * The caller is responsible for escaping interpolated values.
 *
 * `headerExtra` is inserted as-is (via innerHTML) into the header.
 * The caller is responsible for the markup and for binding any
 * events on the injected nodes — BaseChat only places them.
 *
 * Runtime updates:
 *   - setPlaceholder(text) — change the input placeholder after the
 *     widget was created. Used by modules whose placeholder depends
 *     on runtime state — the inventory chat flips between
 *     "Введите #NNN, чтобы выбрать кабинет" and
 *     "Каб. 303: инвентарный номер" as rooms are picked.
 */
export class BaseChat {
    constructor(options = {}) {
        console.log('[Chat] Constructor called');
        this.options = options;
        this.container = null;
        this.messages = [];
        this.isModalOpen = false;
        this.isSidebarMode = false;
        this.floatingBtn = null;
        this.onSend = options.onSend || null;
        this.apiUrl = options.apiUrl || '/core/chat/send';
        this.isLoading = false;

        // UI texts (all overridable via options)
        this.titleText = options.title || 'Чат с AI';
        this.welcomeText = options.welcomeText
            || 'Привет! Я AI-ассистент. Задайте мне вопрос.';
        this.placeholderText = options.placeholder || 'Введите сообщение...';
        this.iconText = options.icon !== undefined ? options.icon : '🤖';
        this.headerExtra = options.headerExtra || '';
        this.skipHistory = options.skipHistory === true;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Load CSS on creation
        this._loadCSS();

        // Build DOM
        this._createDOM();
        this._bindEvents();
        this._createFloatingButton();

        // Start async init
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Chat] _init() START');
        try {
            if (!this.skipHistory) {
                await this._loadHistory();
            }
            this._initialized = true;
            console.log('[Chat] _init() COMPLETE, messages:', this.messages.length);
        } catch (error) {
            console.error('[Chat] Init error:', error);
            this._initialized = false;
            // Do not rethrow — chat should work even without history
        }
    }

    /**
     * Load message history from the server.
     * Skipped entirely if `options.skipHistory` is true.
     */
    async _loadHistory() {
        console.log('[Chat] _loadHistory()');
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson('/core/chat/history');

            if (data.success && data.data) {
                this.messages = data.data.map(msg => ({
                    id: msg.id || Date.now() + Math.random(),
                    text: msg.text || msg.message || '',
                    isUser: msg.is_user || msg.role === 'user',
                    variant: null,
                    // History always renders as plain text — the
                    // server does not know about our HTML messages.
                    asHtml: false,
                    timestamp: msg.created_at || msg.timestamp || new Date()
                }));
                if (this.messagesContainer) {
                    this._renderMessages();
                    this._scrollToBottom();
                }
                console.log('[Chat] History loaded:', this.messages.length);
            }
        } catch (error) {
            console.warn('[Chat] Failed to load history:', error);
        }
    }

    _loadCSS() {
        console.log('[Chat] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/chat/chat.css');
        }
    }

    _createDOM() {
        console.log('[Chat] _createDOM()');
        const existing = document.querySelector('.core-engine-lib-base-chat');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            this._applyTexts();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-chat hidden';
        container.innerHTML = `
            <div class="chat-window">
                <div class="chat-header">
                    ${this.headerExtra}
                    <span class="chat-title"></span>
                    <span class="chat-close-btn">✕</span>
                </div>
                <div class="chat-messages"></div>
                <div class="chat-input-area">
                    <textarea class="chat-input" rows="1"></textarea>
                    <button class="chat-send-btn">➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
        this._applyTexts();
    }

    /**
     * Set the title and the input placeholder from `options`.
     * Called from _createDOM, both for the fresh case and the
     * "reuse existing container" case.
     */
    _applyTexts() {
        if (this.title) {
            this.title.textContent = this.titleText;
            if (!this.iconText) {
                this.title.classList.add('chat-title-no-icon');
            }
        }
        if (this.inputField) {
            this.inputField.placeholder = this.placeholderText;
        }
    }

    _cacheElements() {
        this.messagesContainer = this.container?.querySelector('.chat-messages');
        this.inputField = this.container?.querySelector('.chat-input');
        this.sendBtn = this.container?.querySelector('.chat-send-btn');
        this.closeBtn = this.container?.querySelector('.chat-close-btn');
        this.title = this.container?.querySelector('.chat-title');
    }

    _bindEvents() {
        console.log('[Chat] _bindEvents()');

        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => {
                this._handleSend();
            });
        }

        if (this.inputField) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSend();
                }
            });

            this.inputField.addEventListener('input', () => {
                this.inputField.style.height = 'auto';
                this.inputField.style.height = this.inputField.scrollHeight + 'px';
            });
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.close();
            });
        }

        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.target === this.container && this.isModalOpen) {
                    this.close();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen) {
                this.close();
            }
        });

        if (this.floatingBtn) {
            this.floatingBtn.addEventListener('click', () => {
                if (this.isModalOpen || this.isSidebarMode) {
                    this.close();
                } else {
                    this.open();
                }
            });
        }
    }

    _createFloatingButton() {
        console.log('[Chat] _createFloatingButton()');
        const existing = document.querySelector('.core-engine-lib-base-chat-floating-btn');
        if (existing) {
            this.floatingBtn = existing;
            return;
        }

        const btn = document.createElement('button');
        btn.className = 'core-engine-lib-base-chat-floating-btn';
        btn.textContent = '💬';
        btn.setAttribute('aria-label', 'Открыть чат');
        document.body.appendChild(btn);
        this.floatingBtn = btn;
    }

    /**
     * Handle message send.
     *
     * If `onSend` is set, it replaces `_sendToAPI`. Its return value
     * is rendered as a bot message. It may be:
     *   - a string                     → plain bot text;
     *   - { text, variant }            → rendered with the variant;
     *   - { text, variant, html: true } → rendered as HTML.
     */
    async _handleSend() {
        if (!this.inputField) return;

        const text = this.inputField.value.trim();
        if (!text || this.isLoading) return;

        // Add user message
        this.addMessage(text, true);
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

        const loadingId = this._addLoadingIndicator();
        this.isLoading = true;

        try {
            let response;
            if (typeof this.onSend === 'function') {
                response = await this.onSend(text);
            } else {
                response = await this._sendToAPI(text);
            }

            this._removeLoadingIndicator(loadingId);

            // Response may be a string or { text, variant, html }.
            let replyText = '';
            let variant = null;
            let asHtml = false;
            if (response && typeof response === 'object') {
                replyText = response.text || '';
                variant = response.variant || null;
                asHtml = response.html === true;
            } else {
                replyText = String(response ?? '');
            }

            this.addMessage(replyText, false, variant, asHtml);
        } catch (error) {
            this._removeLoadingIndicator(loadingId);
            this.addMessage(
                '❌ Ошибка: ' + (error.message || 'Не удалось получить ответ'),
                false,
                'error',
            );
            console.error('[Chat] send handler error:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async _sendToAPI(message) {
        console.log('[Chat] _sendToAPI()', message);

        const fetchJson = window.coreEngine?.fetchJson;
        const data = await fetchJson(this.apiUrl, {
            method: 'POST',
            body: {
                message: message,
                history: this.messages.slice(-10),
            },
        });

        if (data.success) {
            return data.data?.response || data.data?.message || 'Получен пустой ответ';
        } else {
            throw new Error(data.message || 'Неизвестная ошибка');
        }
    }

    /**
     * Add a message to the history.
     *
     * @param {string} text
     * @param {boolean} isUser
     * @param {string|null} variant — "success" | "warning" | "error" | null
     * @param {boolean} asHtml  — if true, `text` is injected with
     *                            innerHTML; otherwise with textContent.
     *                            Default: false.
     *
     * SECURITY: pass `asHtml: true` ONLY with strings that the
     * caller built itself — never with raw user input or raw API
     * output. The inventory chat uses it for a fixed markup
     * template (numbered candidate list) with escaped values.
     */
    addMessage(text, isUser, variant = null, asHtml = false) {
        console.log('[Chat] addMessage()', text, isUser, variant, asHtml);
        const msg = {
            id: Date.now() + Math.random(),
            text: text,
            isUser: isUser,
            variant: variant,
            asHtml: asHtml === true,
            timestamp: new Date()
        };
        this.messages.push(msg);
        this._renderMessages();
        this._scrollToBottom();
    }

    _addLoadingIndicator() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message-ai loading';
        div.id = id;
        div.innerHTML = '<span class="chat-loading-dots">•••</span>';
        if (this.messagesContainer) {
            this.messagesContainer.appendChild(div);
            this._scrollToBottom();
        }
        return id;
    }

    _removeLoadingIndicator(id) {
        const el = document.getElementById(id);
        if (el) {
            el.remove();
        }
    }

    _renderMessages() {
        if (!this.messagesContainer) return;

        this.messagesContainer.innerHTML = '';
        this.messages.forEach(msg => {
            const div = document.createElement('div');
            let cls = `chat-message chat-message-${msg.isUser ? 'user' : 'ai'}`;
            if (!msg.isUser && msg.variant) {
                cls += ` chat-message-${msg.variant}`;
            }
            div.className = cls;
            // HTML only when the caller explicitly asked for it.
            // Everything else — plain text, exactly as before.
            if (msg.asHtml) {
                div.innerHTML = msg.text;
            } else {
                div.textContent = msg.text;
            }
            this.messagesContainer.appendChild(div);
        });
    }

    _scrollToBottom() {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }, 50);
    }

    // ========== Public methods ==========

    /**
     * Attach the chat into a sidebar container (desktop).
     *
     * Visibility is toggled by class names only:
     *   - remove `.hidden` (so it stops being display: none);
     *   - add `.sidebar-mode` (so chat.css switches it to flex).
     * The `!important`-free cascade in chat.css handles the rest.
     */
    attach(container) {
        console.log('[Chat] attach()');
        if (!container || !this.container) return;

        this.isSidebarMode = true;

        // Leave modal-mode if it was set; drop hidden; switch to sidebar.
        this.container.classList.remove('modal-mode', 'hidden');
        this.container.classList.add('sidebar-mode');

        container.appendChild(this.container);

        if (this.floatingBtn) {
            this.floatingBtn.classList.add('hidden');
        }

        if (this.messages.length === 0) {
            this.addMessage(this.welcomeText, false);
        }

        console.log('[Chat] Attached to sidebar');
    }

    /**
     * Open the chat as a modal (mobile).
     */
    open() {
        console.log('[Chat] open()');
        if (!this.container) return;

        this.isModalOpen = true;

        // Leave sidebar-mode if it was set; drop hidden; switch to modal.
        this.container.classList.remove('sidebar-mode', 'hidden');
        this.container.classList.add('modal-mode');

        // Defer the `.active` class for the CSS transition to work.
        requestAnimationFrame(() => {
            this.container.classList.add('active');
        });

        if (this.messages.length === 0) {
            this.addMessage(this.welcomeText, false);
        }

        setTimeout(() => {
            if (this.inputField) {
                this.inputField.focus();
            }
        }, 300);

        console.log('[Chat] Opened in modal mode');
    }

    /**
     * Close the chat (modal mode only).
     */
    close() {
        console.log('[Chat] close()');
        if (!this.isModalOpen || !this.container) return;

        this.isModalOpen = false;
        this.container.classList.remove('active');

        // Let the CSS transition finish, then add `.hidden`.
        setTimeout(() => {
            if (this.container) {
                this.container.classList.add('hidden');
            }
        }, 300);

        console.log('[Chat] Closed');
    }

    /**
     * Set a custom send handler.
     * Prefer passing `options.onSend` to the constructor.
     */
    setOnSend(callback) {
        this.onSend = callback;
    }

    /**
     * Update the input placeholder after the widget was created.
     *
     * Used by modules whose placeholder depends on runtime state —
     * the inventory chat flips between
     *   "Введите #NNN, чтобы выбрать кабинет"  (no room selected)
     *   "Каб. 303: инвентарный номер"          (room 303 selected)
     * as the accountant picks rooms.
     */
    setPlaceholder(text) {
        this.placeholderText = text || '';
        if (this.inputField) {
            this.inputField.placeholder = this.placeholderText;
        }
    }

    /**
     * Clear the message history.
     */
    clearHistory() {
        console.log('[Chat] clearHistory()');
        this.messages = [];
        this._renderMessages();
    }

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[Chat] destroy()');
        if (this.floatingBtn) {
            this.floatingBtn.remove();
            this.floatingBtn = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}