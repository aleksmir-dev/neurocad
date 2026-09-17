// app/core/engine/lib/base/chat/chat.js

export class BaseChat {
    constructor(options = {}) {
        console.log('[Chat] Конструктор вызван');
        this.options = options;
        this.container = null;
        this.messages = [];
        this.isModalOpen = false;
        this.isSidebarMode = false;
        this.floatingBtn = null;
        this.onSend = null;
        this.apiUrl = options.apiUrl || '/core/chat/send';
        this.isLoading = false;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Загружаем CSS при создании объекта
        this._loadCSS();

        // Создаём DOM
        this._createDOM();
        this._bindEvents();
        this._createFloatingButton();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Chat] _init() START');
        try {
            // Загружаем историю сообщений, если есть API
            await this._loadHistory();
            this._initialized = true;
            console.log('[Chat] _init() COMPLETE, сообщений:', this.messages.length);
        } catch (error) {
            console.error('[Chat] Ошибка инициализации:', error);
            this._initialized = false;
            // Не выбрасываем ошибку, чтобы чат работал даже без истории
        }
    }

    /**
     * Загрузить историю сообщений с сервера
     */
    async _loadHistory() {
        console.log('[Chat] _loadHistory()');
        try {
            const response = await fetch('/core/chat/history', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    this.messages = data.data.map(msg => ({
                        id: msg.id || Date.now() + Math.random(),
                        text: msg.text || msg.message || '',
                        isUser: msg.is_user || msg.role === 'user',
                        timestamp: msg.created_at || msg.timestamp || new Date()
                    }));
                    // Перерендериваем сообщения
                    if (this.messagesContainer) {
                        this._renderMessages();
                        this._scrollToBottom();
                    }
                    console.log('[Chat] История загружена:', this.messages.length);
                }
            }
        } catch (error) {
            console.warn('[Chat] Не удалось загрузить историю:', error);
        }
    }

    /**
     * Загрузить CSS для чата
     */
    _loadCSS() {
        console.log('[Chat] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/chat/chat.css');
        }
    }

    /**
     * Создать DOM структуру чата
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

        // По умолчанию скрыт
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
        
        // Отправка по клику
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => {
                this._handleSend();
            });
        }

        // Отправка по Enter (без Shift)
        if (this.inputField) {
            this.inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleSend();
                }
            });

            // Авто-высота textarea
            this.inputField.addEventListener('input', () => {
                this.inputField.style.height = 'auto';
                this.inputField.style.height = this.inputField.scrollHeight + 'px';
            });
        }

        // Закрытие по крестику
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                this.close();
            });
        }

        // Закрытие по клику на оверлей (только в модальном режиме)
        if (this.container) {
            this.container.addEventListener('click', (e) => {
                if (e.target === this.container && this.isModalOpen) {
                    this.close();
                }
            });
        }

        // Закрытие по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen) {
                this.close();
            }
        });

        // Клик по плавающей кнопке
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
     * Создать плавающую кнопку для мобильных
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
     * Обработка отправки сообщения
     */
    async _handleSend() {
        if (!this.inputField) return;
        
        const text = this.inputField.value.trim();
        if (!text || this.isLoading) return;

        // Добавляем сообщение пользователя
        this.addMessage(text, true);
        this.inputField.value = '';
        this.inputField.style.height = 'auto';

        // Показываем индикатор загрузки
        const loadingId = this._addLoadingIndicator();
        this.isLoading = true;

        try {
            // Отправляем запрос к API
            const response = await this._sendToAPI(text);
            
            // Удаляем индикатор загрузки
            this._removeLoadingIndicator(loadingId);
            // Добавляем ответ AI
            this.addMessage(response, false);
        } catch (error) {
            this._removeLoadingIndicator(loadingId);
            this.addMessage('❌ Ошибка: ' + (error.message || 'Не удалось получить ответ'), false);
            console.error('[Chat] Ошибка API:', error);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Отправка запроса к API
     */
    async _sendToAPI(message) {
        console.log('[Chat] _sendToAPI()', message);
        
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                message: message,
                history: this.messages.slice(-10)
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Ошибка сервера: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            return data.data?.response || data.data?.message || 'Получен пустой ответ';
        } else {
            throw new Error(data.message || 'Неизвестная ошибка');
        }
    }

    /**
     * Добавить сообщение в историю
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
     * Добавить индикатор загрузки
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
     * Удалить индикатор загрузки
     */
    _removeLoadingIndicator(id) {
        const el = document.getElementById(id);
        if (el) {
            el.remove();
        }
    }

    /**
     * Рендер всех сообщений
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
     * Скролл вниз
     */
    _scrollToBottom() {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }, 50);
    }

    // ========== Публичные методы ==========

    /**
     * Встроить чат в боковую панель (десктоп)
     */
    attach(container) {
        console.log('[Chat] attach()');
        if (!container || !this.container) return;

        this.isSidebarMode = true;
        this.container.classList.add('sidebar-mode');
        this.container.classList.remove('modal-mode', 'hidden');
        this.container.style.display = 'flex';

        container.appendChild(this.container);

        // Скрываем плавающую кнопку в десктопном режиме
        if (this.floatingBtn) {
            this.floatingBtn.style.display = 'none';
        }

        // Показываем сообщение-приветствие, если пусто
        if (this.messages.length === 0) {
            this.addMessage('Привет! Я AI-ассистент. Задайте мне вопрос.', false);
        }

        console.log('[Chat] Встроен в боковую панель');
    }

    /**
     * Открыть чат как модальное окно (мобильные)
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

        console.log('[Chat] Открыт в модальном режиме');
    }

    /**
     * Закрыть чат (только модальный режим)
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

        console.log('[Chat] Закрыт');
    }

    /**
     * Установить обработчик отправки (для кастомной логики)
     */
    setOnSend(callback) {
        this.onSend = callback;
    }

    /**
     * Очистить историю сообщений
     */
    clearHistory() {
        console.log('[Chat] clearHistory()');
        this.messages = [];
        this._renderMessages();
    }

    /**
     * Проверяет, инициализирован ли компонент
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Ожидает завершения инициализации
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    /**
     * Уничтожить компонент
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