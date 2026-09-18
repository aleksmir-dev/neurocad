// neurocad/core/engine/lib/word/llm/chat.js

/**
 * LLMChat — правая панель LLM-редактора: чат с LLM.
 *
 * Задачи:
 *   - показать историю чата по текущей странице;
 *   - отправить запрос пользователя (запрос → LLM → новый HTML);
 *   - применить полученный HTML к preview;
 *   - сохранить сообщения в БД (page_chat).
 *
 * Контейнеры:
 *   editor.chatEl — .core-engine-lib-word-llm-chat-content
 */
export class LLMChat {
    constructor(editor) {
        console.log('[LLMChat] Конструктор');
        this.editor = editor;

        // DOM
        this.rootEl = editor.chatEl;         // .core-engine-lib-word-llm-chat-content
        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;

        // Данные
        this.messages = [];                   // [{role, content, created_at}]

        // API
        this._apiBase = '/core/engine/lib/word/llm';

        // Состояние
        this._sending = false;
    }

    async init() {
        console.log('[LLMChat] init() START');

        if (!this.rootEl) {
            console.error('[LLMChat] chatEl не найден');
            return;
        }

        this._buildDOM();
        this._bindEvents();

        // Загружаем историю чата с бэкенда
        await this._loadHistory();

        // Если истории нет — приветствие
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
        // Очищаем
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        // ===== Список сообщений =====
        const messages = document.createElement('div');
        messages.className = 'core-engine-lib-word-llm-chat-messages';
        messages.setAttribute('data-js', 'llm-chat-messages');
        this.messagesEl = messages;
        this.rootEl.appendChild(messages);

        // ===== Форма ввода =====
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
        // Отправка формы
        if (this.formEl) {
            this.formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this._onSend();
            });
        }

        // Enter без Shift — отправить. Shift+Enter — новая строка.
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
    // СООБЩЕНИЯ
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
    // ИСТОРИЯ
    // ============================================

    async _loadHistory() {
        const pageId = this.editor.pageId;
        if (!pageId) {
            console.warn('[LLMChat] Нет pageId — история не загружена');
            return;
        }

        try {
            const response = await fetch(`${this._apiBase}/chat/${pageId}/history`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                console.warn('[LLMChat] История не загружена:', response.status);
                return;
            }

            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                this.messages = result.data;
                this._renderAllMessages();
                console.log(`[LLMChat] Загружено сообщений: ${this.messages.length}`);
            }
        } catch (error) {
            console.error('[LLMChat] Ошибка загрузки истории:', error);
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
    // ОТПРАВКА
    // ============================================

    async _onSend() {
        if (this._sending) return;

        const text = (this.inputEl?.value || '').trim();
        if (!text) return;

        const pageId = this.editor.pageId;
        if (!pageId) {
            console.error('[LLMChat] pageId не задан');
            return;
        }

        console.log('[LLMChat] _onSend() text:', text);

        this._sending = true;
        this._setSendingState(true);

        // Добавляем сообщение пользователя локально (сразу, для отзывчивости)
        this._addMessage({
            role: 'user',
            content: text,
            created_at: new Date().toISOString(),
        });

        // Очищаем поле
        if (this.inputEl) {
            this.inputEl.value = '';
        }

        // Показываем «печатает...»
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
                throw new Error(errorData.detail || `Ошибка ${response.status}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Ошибка LLM');
            }

            const data = result.data;
            const newHtml = data.html || '';

            // Прячем «печатает...»
            this._hideTyping();

            // ===== Заменяем сообщение пользователя на серверную версию =====
            // (у неё есть id, created_at из БД)
            const lastUserIdx = this.messages.length - 1;
            if (lastUserIdx >= 0 && this.messages[lastUserIdx].role === 'user') {
                this.messages[lastUserIdx] = data.user_message;
            }

            // ===== Добавляем ответ ассистента =====
            this._addMessage(data.assistant_message);

            // ===== Применяем HTML к preview =====
            if (newHtml && this.editor._preview) {
                console.log('[LLMChat] Применяем новый HTML к preview, длина:', newHtml.length);
                this.editor._preview.setHtml(newHtml);
            }

            // ===== Записываем в history (undo/redo) =====
            if (this.editor._history && newHtml) {
                this.editor._history.push(newHtml, 'ai_edit', text);
            }

            console.log('[LLMChat] Ответ получен и применён');

        } catch (error) {
            console.error('[LLMChat] Ошибка отправки:', error);
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
    // ИНДИКАТОР «ПЕЧАТАЕТ»
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
    // ПУБЛИЧНЫЕ МЕТОДЫ
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