// neurocad/core/engine/lib/word/llm/chat.js

/**
 * LLMChat — chat with LLM (bottom section of right panel).
 *
 * Tasks:
 *   - show chat history for the current page;
 *   - send user request (request -> LLM -> new HTML + CSS);
 *   - apply received HTML+CSS to GrapesJS canvas;
 *   - save messages to DB (page_chat).
 *
 * Container:
 *   editor.chatEl — .core-engine-lib-word-llm-chat-content
 *
 * Typing indicator:
 *   Dots are added one by one via setInterval:
 *   . → .. → ... → .... → ..... → ...... → ....... → (empty) → .
 *   and so on, until the response arrives.
 *
 * Error handling:
 *   - Network errors        → "Нет связи с сервером"
 *   - Timeout (120s)        → "Модель долго думает, попробуйте снова"
 *   - HTTP 4xx / 5xx        → "Сервер вернул ошибку: <detail>"
 *   - success:false         → "Модель ответила ошибкой: <message>"
 *   - Malformed response    → "Не удалось разобрать ответ модели"
 *   - Apply errors          → "Ошибка применения HTML+CSS: <message>"
 */
export class LLMChat {
    constructor(editor) {
        console.log('[LLMChat] Constructor');
        this.editor = editor;

        // DOM
        this.rootEl = editor.chatEl;         // .core-engine-lib-word-llm-chat-content
        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;

        // Data
        this.messages = [];                   // [{role, content, created_at}]

        // API
        this._apiBase = '/core/engine/lib/word/llm';

        // State
        this._sending = false;
        this._sendAbortController = null;     // to cancel fetch on timeout

        // Typing indicator state
        this._typingEl = null;
        this._typingDotsEl = null;
        this._typingInterval = null;
        this._typingCount = 0;
        this._typingMaxDots = 7;
        this._typingIntervalMs = 350;
    }

    async init() {
        console.log('[LLMChat] init() START');

        if (!this.rootEl) {
            console.error('[LLMChat] chatEl not found');
            return;
        }

        this._buildDOM();
        this._bindEvents();

        // Load chat history from backend
        await this._loadHistory();

        // If no history — greeting
        if (this.messages.length === 0) {
            this._addMessage({
                role: 'assistant',
                content: 'Опишите, что нужно изменить на странице. Например: «сделай фон синим» или «добавь блок с преимуществами».',
                created_at: new Date().toISOString(),
            });
        }

        console.log('[LLMChat] init() COMPLETE');
    }

    // ============================================
    // DOM
    // ============================================

    _buildDOM() {
        // Clear
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        // ===== Messages list =====
        const messages = document.createElement('div');
        messages.className = 'core-engine-lib-word-llm-chat-messages';
        messages.setAttribute('data-js', 'llm-chat-messages');
        this.messagesEl = messages;
        this.rootEl.appendChild(messages);

        // ===== Input form =====
        const form = document.createElement('form');
        form.className = 'core-engine-lib-word-llm-chat-form';

        const input = document.createElement('textarea');
        input.className = 'core-engine-lib-word-llm-chat-input';
        input.setAttribute('data-js', 'llm-chat-input');
        input.setAttribute('placeholder', 'Опишите изменение...');
        input.setAttribute('rows', '2');
        this.inputEl = input;
        form.appendChild(input);

        const sendBtn = document.createElement('button');
        sendBtn.type = 'submit';
        sendBtn.className = 'core-engine-lib-word-llm-chat-send';
        sendBtn.setAttribute('title', 'Отправить (Enter)');
        sendBtn.setAttribute('aria-label', 'Отправить');
        sendBtn.textContent = '▶';
        this.sendBtn = sendBtn;
        form.appendChild(sendBtn);

        this.formEl = form;
        this.rootEl.appendChild(form);
    }

    _bindEvents() {
        // Submit form
        if (this.formEl) {
            this.formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this._onSend();
            });
        }

        // Enter without Shift — send. Shift+Enter — new line.
        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._onSend();
                }
            });
        }
    }

    // ============================================
    // MESSAGES
    // ============================================

    _addMessage(msg) {
        this.messages.push(msg);
        this._renderMessage(msg);
        this._scrollToBottom();
    }

    _renderMessage(msg) {
        if (!this.messagesEl) return;

        const el = document.createElement('div');
        el.className = `core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-${msg.role}`;

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';
        bubble.textContent = msg.content;
        el.appendChild(bubble);

        this.messagesEl.appendChild(el);
    }

    _scrollToBottom() {
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    // ============================================
    // HISTORY
    // ============================================

    async _loadHistory() {
        const pageId = this.editor.pageId;
        if (!pageId) {
            console.warn('[LLMChat] No pageId — history not loaded');
            return;
        }

        try {
            const response = await fetch(`${this._apiBase}/chat/${pageId}/history`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                console.warn('[LLMChat] History not loaded:', response.status);
                return;
            }

            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                this.messages = result.data;
                this._renderAllMessages();
                console.log(`[LLMChat] Loaded messages: ${this.messages.length}`);
            }
        } catch (error) {
            console.error('[LLMChat] History load error:', error);
        }
    }

    _renderAllMessages() {
        if (!this.messagesEl) return;

        while (this.messagesEl.firstChild) {
            this.messagesEl.removeChild(this.messagesEl.firstChild);
        }
        for (const msg of this.messages) {
            this._renderMessage(msg);
        }
        this._scrollToBottom();
    }

    // ============================================
    // SEND
    // ============================================

    async _onSend() {
        if (this._sending) return;

        const text = (this.inputEl?.value || '').trim();
        if (!text) return;

        const pageId = this.editor.pageId;
        if (!pageId) {
            this._addErrorMessage('Не удалось определить страницу (pageId не задан).');
            return;
        }

        console.log('[LLMChat] _onSend() text:', text);

        this._sending = true;
        this._setSendingState(true);

        // Add user message locally (immediate feedback)
        this._addMessage({
            role: 'user',
            content: text,
            created_at: new Date().toISOString(),
        });

        // Clear input
        if (this.inputEl) {
            this.inputEl.value = '';
        }

        // Show "typing..." with animated dots
        this._showTyping();

        // ===== Timeout: abort fetch after 120 seconds =====
        this._sendAbortController = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn('[LLMChat] Request timeout — aborting');
            this._sendAbortController.abort();
        }, 120000);

        try {
            const response = await fetch(`${this._apiBase}/chat/${pageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ message: text }),
                signal: this._sendAbortController.signal,
            });

            // ===== HTTP errors =====
            if (!response.ok) {
                let detail = `HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData?.detail) detail = errorData.detail;
                    else if (errorData?.message) detail = errorData.message;
                } catch (_) { /* ignore — use default */ }
                throw new Error(`Сервер вернул ошибку: ${detail}`);
            }

            // ===== Parse JSON =====
            let result;
            try {
                result = await response.json();
            } catch (e) {
                throw new Error('Не удалось разобрать ответ сервера (не JSON).');
            }

            // ===== success: false =====
            if (!result.success) {
                const msg = result.message || result.detail || 'без деталей';
                throw new Error(`Модель ответила ошибкой: ${msg}`);
            }

            // ===== Validate data =====
            const data = result.data;
            if (!data || typeof data !== 'object') {
                throw new Error('Не удалось разобрать ответ модели (пустой data).');
            }

            const newHtml = data.html || '';
            const newCss = data.css || '';

            // ===== Apply new HTML + CSS =====
            if (this.editor.editor && (newHtml || newCss)) {
                try {
                    console.log('[LLMChat] Applying new HTML+CSS to canvas:', newHtml.length, '+', newCss.length);

                    // Clear existing CSS first, then add new (matches modals.js behavior)
                    if (newCss) {
                        if (this.editor.editor.Css?.clear) {
                            this.editor.editor.Css.clear();
                        }
                        if (this.editor.editor.Css?.addRules) {
                            this.editor.editor.Css.addRules(newCss);
                        }
                    }
                    // Then set components (HTML)
                    this.editor.editor.setComponents(newHtml);
                } catch (applyErr) {
                    console.error('[LLMChat] Apply error:', applyErr);
                    throw new Error(`Ошибка применения HTML+CSS: ${applyErr.message}`);
                }
            }

            // Hide "typing..."
            this._hideTyping();

            // ===== Replace user message with server version =====
            const lastUserIdx = this.messages.length - 1;
            if (lastUserIdx >= 0 && this.messages[lastUserIdx].role === 'user') {
                this.messages[lastUserIdx] = data.user_message || this.messages[lastUserIdx];
            }

            // ===== Add assistant message =====
            if (data.assistant_message) {
                this._addMessage(data.assistant_message);
            } else {
                this._addMessage({
                    role: 'assistant',
                    content: 'Изменения применены.',
                    created_at: new Date().toISOString(),
                });
            }

            console.log('[LLMChat] Response received and applied');

        } catch (error) {
            console.error('[LLMChat] Send error:', error);
            this._hideTyping();

            // ===== Friendly error message =====
            let message;
            if (error.name === 'AbortError') {
                message = 'Модель долго не отвечает (120 секунд). Попробуйте ещё раз.';
            } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                message = 'Нет связи с сервером. Проверьте подключение.';
            } else {
                message = error.message || 'Неизвестная ошибка.';
            }

            this._addErrorMessage(message);
        } finally {
            clearTimeout(timeoutId);
            this._sendAbortController = null;
            this._sending = false;
            this._setSendingState(false);
        }
    }

    _addErrorMessage(text) {
        this._addMessage({
            role: 'assistant',
            content: `⚠️ ${text}`,
            created_at: new Date().toISOString(),
        });
    }

    _setSendingState(sending) {
        if (this.sendBtn) {
            this.sendBtn.disabled = sending;
        }
        if (this.inputEl) {
            this.inputEl.disabled = sending;
        }
    }

    // ============================================
    // TYPING INDICATOR
    // ============================================

    /**
     * Show typing indicator with animated dots.
     *
     * Dots are added one by one via setInterval:
     *   . → .. → ... → .... → ..... → ...... → ....... → (empty) → .
     *
     * When the response arrives — _hideTyping() stops the interval
     * and removes the element.
     */
    _showTyping() {
        if (!this.messagesEl) return;

        // Prevent duplicates
        if (this.messagesEl.querySelector('.core-engine-lib-word-llm-chat-typing')) return;

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-assistant core-engine-lib-word-llm-chat-typing';

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';

        const dots = document.createElement('span');
        dots.className = 'core-engine-lib-word-llm-chat-typing-dots';
        bubble.appendChild(dots);

        el.appendChild(bubble);

        this.messagesEl.appendChild(el);
        this._scrollToBottom();

        this._typingEl = el;
        this._typingDotsEl = dots;
        this._typingCount = 0;

        // Start dot animation
        this._typingInterval = setInterval(() => {
            this._typingCount++;
            if (this._typingCount > this._typingMaxDots) {
                this._typingCount = 0;
            }
            if (this._typingDotsEl) {
                this._typingDotsEl.textContent = '.'.repeat(this._typingCount);
            }
        }, this._typingIntervalMs);
    }

    _hideTyping() {
        // Stop animation
        if (this._typingInterval) {
            clearInterval(this._typingInterval);
            this._typingInterval = null;
        }
        this._typingCount = 0;
        this._typingDotsEl = null;

        // Remove element
        if (this._typingEl && this._typingEl.parentNode) {
            this._typingEl.parentNode.removeChild(this._typingEl);
        }
        this._typingEl = null;
    }

    // ============================================
    // PUBLIC METHODS
    // ============================================

    getMessages() {
        return this.messages.slice();
    }

    setMessages(messages) {
        this.messages = messages || [];
        this._renderAllMessages();
    }

    destroy() {
        console.log('[LLMChat] destroy()');

        // Stop typing animation
        if (this._typingInterval) {
            clearInterval(this._typingInterval);
            this._typingInterval = null;
        }

        // Abort pending request
        if (this._sendAbortController) {
            try { this._sendAbortController.abort(); } catch (e) { /* ignore */ }
            this._sendAbortController = null;
        }

        this.rootEl = null;
        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;
        this.messages = [];
        this._sending = false;
        this._typingEl = null;
        this._typingDotsEl = null;
        this._typingCount = 0;
    }
}