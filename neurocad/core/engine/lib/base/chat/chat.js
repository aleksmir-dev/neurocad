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
        this.onSend = null;
        this.apiUrl = options.apiUrl || '/core/chat/send';
        this.isLoading = false;

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
            // Load message history (if API is available)
            await this._loadHistory();
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
                    timestamp: msg.created_at || msg.timestamp || new Date()
                }));
                // Re-render messages
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

    /**
     * Load CSS for the chat.
     */
    _loadCSS() {
        console.log('[Chat] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/chat/chat.css');
        }
    }

    /**
     * Build the chat DOM structure.
     */
    _createDOM() {
        console.log('[Chat] _createDOM()');
        const existing = document.querySelector('.core-engine-lib-base-chat');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-chat';
        container.style.display = 'none';
        container.innerHTML = `
            <div class="chat-window">
                <div class="chat-header">
                    <span class="chat-title">Чат с AI</span>
                    <span class="chat-close-btn">✕</span>
                </div>
                <div class="chat-messages"></div>
                <div class="chat-input-area">
                    <textarea class="chat-input" placeholder="Введите сообщение..." rows="1"></textarea>
                    <button class="chat-send-btn">➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();

        // Hidden by default
        this.container.classList.add('hidden');
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

        // Send on click
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => {
                this._handleSend();
            });
        }

        // Send on Enter (without Shift)
        if (this.inputField) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSend();
                }
            });

            // Auto-height for textarea
            this.inputField.addEventListener('input', () => {
                this.inputField.style.height = 'auto';
                this.inputField.style.height = this.inputField.scrollHeight + 'px';
            });
        }

        // Close on ×
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.close();
            });
        }

        // Close on overlay click (modal mode only)
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.target === this.container && this.isModalOpen) {
                    this.close();
                }
            });
        }

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen) {
                this.close();
            }
        });

        // Floating button click
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

    /**
     * Create the floating button (for mobile).
     */
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
     */
    async _handleSend() {
        if (!this.inputField) return;

        const text = this.inputField.value.trim();
        if (!text || this.isLoading) return;

        // Add user message
        this.addMessage(text, true);
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

        // Show loading indicator
        const loadingId = this._addLoadingIndicator();
        this.isLoading = true;

        try {
            // Send request to API
            const response = await this._sendToAPI(text);

            // Remove loading indicator
            this._removeLoadingIndicator(loadingId);
            // Add AI response
            this.addMessage(response, false);
        } catch (error) {
            this._removeLoadingIndicator(loadingId);
            this.addMessage('❌ Ошибка: ' + (error.message || 'Не удалось получить ответ'), false);
            console.error('[Chat] API error:', error);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Send request to the API.
     */
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
     */
    addMessage(text, isUser) {
        console.log('[Chat] addMessage()', text, isUser);
        const msg = {
            id: Date.now() + Math.random(),
            text: text,
            isUser: isUser,
            timestamp: new Date()
        };
        this.messages.push(msg);
        this._renderMessages();
        this._scrollToBottom();
    }

    /**
     * Add loading indicator.
     */
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

    /**
     * Remove loading indicator.
     */
    _removeLoadingIndicator(id) {
        const el = document.getElementById(id);
        if (el) {
            el.remove();
        }
    }

    /**
     * Render all messages.
     */
    _renderMessages() {
        if (!this.messagesContainer) return;

        this.messagesContainer.innerHTML = '';
        this.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `chat-message chat-message-${msg.isUser ? 'user' : 'ai'}`;
            div.textContent = msg.text;
            this.messagesContainer.appendChild(div);
        });
    }

    /**
     * Scroll to bottom.
     */
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
     */
    attach(container) {
        console.log('[Chat] attach()');
        if (!container || !this.container) return;

        this.isSidebarMode = true;
        this.container.classList.add('sidebar-mode');
        this.container.classList.remove('modal-mode', 'hidden');
        this.container.style.display = 'flex';

        container.appendChild(this.container);

        // Hide the floating button in desktop mode
        if (this.floatingBtn) {
            this.floatingBtn.style.display = 'none';
        }

        // Show welcome message if empty
        if (this.messages.length === 0) {
            this.addMessage('Привет! Я AI-ассистент. Задайте мне вопрос.', false);
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
        this.container.classList.remove('hidden');
        this.container.classList.add('modal-mode');
        this.container.classList.remove('sidebar-mode');
        this.container.style.display = 'flex';

        setTimeout(() => {
            this.container.classList.add('active');
        }, 10);

        if (this.messages.length === 0) {
            this.addMessage('Привет! Я AI-ассистент. Задайте мне вопрос.', false);
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

        setTimeout(() => {
            this.container.classList.add('hidden');
            this.container.style.display = 'none';
        }, 300);

        console.log('[Chat] Closed');
    }

    /**
     * Set a custom send handler.
     */
    setOnSend(callback) {
        this.onSend = callback;
    }

    /**
     * Clear the message history.
     */
    clearHistory() {
        console.log('[Chat] clearHistory()');
        this.messages = [];
        this._renderMessages();
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