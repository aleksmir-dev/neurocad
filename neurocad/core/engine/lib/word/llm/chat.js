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
            console.error('[LLMChat] pageId not set');
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

        // Show "typing..."
        this._showTyping();

        try {
            const response = await fetch(`${this._apiBase}/chat/${pageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ message: text }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Error ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'LLM error');
            }

            const data = result.data;
            const newHtml = data.html || '';
            const newCss = data.css || '';

            // Hide "typing..."
            this._hideTyping();

            // ===== Replace user message with server version =====
            // (it has id, created_at from DB)
            const lastUserIdx = this.messages.length - 1;
            if (lastUserIdx >= 0 && this.messages[lastUserIdx].role === 'user') {
                this.messages[lastUserIdx] = data.user_message;
            }

            // ===== Add assistant message =====
            this._addMessage(data.assistant_message);

            // ===== Apply HTML + CSS to GrapesJS canvas =====
            if (this.editor.editor && (newHtml || newCss)) {
                console.log('[LLMChat] Applying new HTML+CSS to canvas:', newHtml.length, '+', newCss.length);
                this.editor.editor.setComponents(newHtml);
                if (newCss) {
                    this.editor.editor.setStyle(newCss);
                }
            }

            console.log('[LLMChat] Response received and applied');

        } catch (error) {
            console.error('[LLMChat] Send error:', error);
            this._hideTyping();
            this._addMessage({
                role: 'assistant',
                content: `⚠️ Ошибка: ${error.message}`,
                created_at: new Date().toISOString(),
            });
        } finally {
            this._sending = false;
            this._setSendingState(false);
        }
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

    _showTyping() {
        if (!this.messagesEl) return;

        if (this.messagesEl.querySelector('.core-engine-lib-word-llm-chat-typing')) return;

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-assistant core-engine-lib-word-llm-chat-typing';

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';
        bubble.textContent = '...';
        el.appendChild(bubble);

        this.messagesEl.appendChild(el);
        this._scrollToBottom();

        this._typingEl = el;
    }

    _hideTyping() {
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
        this.rootEl = null;
        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;
        this.messages = [];
        this._sending = false;
    }
}