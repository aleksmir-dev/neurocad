// app/core/engine/lib/nav/nav.js

/**
 * Компонент навигации (проводник)
 * Загружает данные и передаёт их в BaseCards
 *
 * НЕ занимается иконками — они встроены в lib/base/images
 */
export class Nav {
    constructor(container, props = {}) {
        console.log('[Nav] Конструктор вызван', { container, props });

        this.container = container;
        this.props = props;

        this.parentId = props.parent_id || null;
        this.section = props.section || 2;  // 1 - общий, 2 - личный

        this.items = [];
        this.isLoading = false;
        this.error = null;
        this.cardsInstance = null;
        this.CardsClass = null;
        this.parentHistory = [];

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;
        this._isContainerReady = false;

        console.log('[Nav] Начало загрузки CSS');
        this._loadCSS();
        console.log('[Nav] Вызов _init()');
        this._initPromise = this._init();
    }

    _loadCSS() {
        console.log('[Nav] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            console.log('[Nav] Загрузка CSS через coreEngine');
            window.coreEngine.loadCSS('core/engine/lib/nav/nav.css');
        } else {
            console.warn('[Nav] coreEngine.loadCSS не найден');
        }
    }

    async _init() {
        console.log('[Nav] _init() START');
        try {
            console.log('[Nav] Загрузка Cards...');
            await this._loadCards();
            console.log('[Nav] Cards загружен:', !!this.CardsClass);

            console.log('[Nav] Загрузка Items...');
            await this._loadItems();
            console.log('[Nav] Items загружены:', this.items.length);

            this._initialized = true;
            console.log('[Nav] _init() COMPLETE');
        } catch (error) {
            console.error('[Nav] Ошибка в _init():', error);
            this._initialized = false;
            throw error;
        }
        console.log('[Nav] _init() END');
    }

    async _loadCards() {
        console.log('[Nav] _loadCards() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            console.log('[Nav] Версия для cards.js:', version);
            console.log('[Nav] Попытка импорта cards.js...');

            const module = await import(`../base/cards/cards.js?v=${version}`);
            console.log('[Nav] Модуль cards загружен:', module);

            this.CardsClass = module.BaseCards;
            console.log('[Nav] CardsClass установлен:', !!this.CardsClass);

            if (!this.CardsClass) {
                console.error('[Nav] BaseCards не найден в модуле');
                console.log('[Nav] Доступные экспорты:', Object.keys(module));
            }
        } catch (error) {
            console.error('[Nav] Ошибка загрузки Cards:', error);
            console.error('[Nav] Ошибка детали:', error.message);
            console.error('[Nav] Стек ошибки:', error.stack);
            throw error;
        }
        console.log('[Nav] _loadCards() END');
    }

    async _loadItems() {
        console.log('[Nav] _loadItems() START');

        // Проверяем авторизацию перед загрузкой
        const auth = window.coreEngine?.auth;
        console.log('[Nav] auth:', !!auth);

        // ===== ЕСЛИ НЕ АВТОРИЗОВАН — СРАЗУ ФОРМА ВХОДА, БЕЗ CARDS =====
        if (!auth || !auth.isAuth()) {
            console.log('[Nav] Пользователь не авторизован, показываем форму входа');
            this.isLoading = false;
            this.error = null;

            if (auth && typeof auth.showLogin === 'function') {
                auth.showLogin();
            }
            return;
        }

        this.isLoading = true;
        this.error = null;
        await this._updateCards();

        try {
            let url = '/core/engine/lib/nav/list';
            const params = [];

            if (this.parentId !== null && this.parentId !== undefined) {
                params.push(`parent_id=${this.parentId}`);
            }

            // section — обязательный параметр
            params.push(`section=${this.section}`);

            if (params.length > 0) {
                url += '?' + params.join('&');
            }

            console.log('[Nav] Загрузка данных по URL:', url);

            const response = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            console.log('[Nav] Ответ получен, статус:', response.status);

            // 401 — сессия истекла или пользователь не авторизован
            if (response.status === 401) {
                console.log('[Nav] 401 - сессия истекла, показываем форму входа');

                sessionStorage.setItem('auth_redirect_url', window.location.pathname);

                this.isLoading = false;
                this.error = null;

                document.dispatchEvent(new CustomEvent('auth:unauthorized'));

                console.log('[Nav] 401 обработан, Cards не обновляем');
                return;
            }

            if (!response.ok) {
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Nav] Данные получены:', data);

            if (data.success) {
                this.items = data.data || [];
                console.log('[Nav] Items обновлены:', this.items.length);
                this.isLoading = false;
                await this._updateCards();
            } else {
                throw new Error(data.message || 'Ошибка загрузки данных');
            }
        } catch (error) {
            console.error('[Nav] Ошибка загрузки:', error);
            this.error = error.message;
            this.isLoading = false;
            await this._updateCards();
        }
        console.log('[Nav] _loadItems() END');
    }

    async _updateCards() {
        console.log('[Nav] _updateCards() START');
        console.log('[Nav] CardsClass:', !!this.CardsClass);
        console.log('[Nav] items:', this.items?.length || 0);
        console.log('[Nav] isLoading:', this.isLoading);
        console.log('[Nav] error:', this.error);

        const cardsData = this._prepareCardsData();
        console.log('[Nav] cardsData подготовлено:', cardsData.length);

        if (this.cardsInstance) {
            console.log('[Nav] Обновление существующего экземпляра Cards');
            await this.cardsInstance.updateProps({
                items: cardsData,
                isLoading: this.isLoading,
                error: this.error,
                widgetTitle: 'Навигация',
                widgetStatus: this.isLoading ? 'Загрузка...' : this.items.length > 0 ? `${this.items.length} элементов` : 'Пусто',
                onItemClick: (id) => this._handleCardClick(id),
                onReload: () => this._loadItems(),
                onRetry: () => this._loadItems()
            });
        } else if (this.CardsClass) {
            console.log('[Nav] Создание нового экземпляра Cards');
            console.log('[Nav] Container:', this.container);
            console.log('[Nav] Container дочерние элементы:', this.container.children);
            console.log('[Nav] Container в DOM?', document.body.contains(this.container));

            try {
                this.cardsInstance = new this.CardsClass(this.container, {
                    items: cardsData,
                    isLoading: this.isLoading,
                    error: this.error,

                    // Поля для формы редактирования
                    fields: [
                        {
                            key: 'name',
                            label: 'Название',
                            type: 'text',
                            required: true,
                            minLength: 1,
                            maxLength: 128,
                            placeholder: 'Введите название'
                        },
                        {
                            key: 'description',
                            label: 'Описание',
                            type: 'textarea',
                            maxLength: 255,
                            rows: 3,
                            placeholder: 'Описание (необязательно)'
                        },
                        {
                            key: 'card_type',
                            label: 'Тип',
                            type: 'select',
                            required: true,
                            options: [
                                { value: 'folder', label: 'Папка' },
                                { value: 'module', label: 'Модуль' }
                            ]
                        },
                        {
                            key: 'icon',
                            label: 'Иконка',
                            type: 'text',
                            maxLength: 64,
                            placeholder: '📂 (эмодзи)'
                        }
                    ],

                    // Поля для отображения в стандартном режиме
                    listFields: ['name', 'description'],
                    statusField: 'card_type',
                    icon: '📂',
                    entityType: 'элемент',

                    // API endpoints
                    apiBase: '/core/engine/lib/nav',
                    apiEndpoints: {
                        list: '/list',
                        create: '/item',
                        update: '/item/{id}',
                        delete: '/item/{id}',
                        restore: '/item/{id}/restore'
                    },

                    // Section и parentId
                    section: this.section,
                    parentId: this.parentId,

                    // Кастомный рендер карточек для Nav
                    renderCard: (item) => {
                        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#39;'
                        }[c]));

                        // Кнопка "Наверх"
                        if (item.is_up) {
                            return `
                                <div class="nav-folder">
                                    <span class="nav-folder-icon">📁</span>
                                    <span class="nav-folder-name">..</span>
                                    <span class="nav-folder-desc">На уровень выше</span>
                                </div>
                            `;
                        }

                        // Папка
                        if (item.card_type === 'folder') {
                            return `
                                <div class="nav-folder">
                                    <span class="nav-folder-icon">${esc(item.icon || '📁')}</span>
                                    <span class="nav-folder-name">${esc(item.name)}</span>
                                    ${item.description ? `<span class="nav-folder-desc">${esc(item.description)}</span>` : ''}
                                </div>
                            `;
                        }

                        // Модуль
                        if (item.card_type === 'module') {
                            return `
                                <div class="nav-module">
                                    <span class="nav-module-icon">${esc(item.icon || '📦')}</span>
                                    <span class="nav-module-name">${esc(item.name)}</span>
                                </div>
                            `;
                        }

                        // Fallback
                        return `<div>${esc(item.name || 'Без названия')}</div>`;
                    },

                    widgetTitle: 'Навигация',
                    widgetStatus: this.isLoading ? 'Загрузка...' : cardsData.length > 0 ? `${cardsData.length} элементов` : 'Пусто',
                    onItemClick: (id) => this._handleCardClick(id),
                    onReload: () => this._loadItems(),
                    onRetry: () => this._loadItems()
                });
                console.log('[Nav] Cards создан:', !!this.cardsInstance);
                console.log('[Nav] Cards container:', this.cardsInstance?.container);
                console.log('[Nav] Cards grid:', this.cardsInstance?.grid);

                // Ждём инициализации Cards.
                // Внутри BaseCards._init() уже выполняется await this.render(),
                // поэтому дополнительный вызов render() здесь НЕ нужен.
                if (this.cardsInstance && this.cardsInstance._initPromise) {
                    console.log('[Nav] Ожидание инициализации Cards...');
                    try {
                        await this.cardsInstance._initPromise;
                        console.log('[Nav] Cards инициализирован');
                    } catch (error) {
                        console.error('[Nav] Ошибка инициализации Cards:', error);
                    }
                }

            } catch (error) {
                console.error('[Nav] Ошибка создания Cards:', error);
                if (this.container) {
                    this.container.innerHTML = `
                        <div class="core-engine-lib-nav-error">
                            <span>Ошибка создания компонента Cards</span>
                            <p style="font-size:14px;color:#666;margin-top:8px;">${error.message}</p>
                        </div>
                    `;
                }
            }
        } else {
            console.error('[Nav] CardsClass не загружен, невозможно создать Cards');
            if (this.container) {
                this.container.innerHTML = `
                    <div class="core-engine-lib-nav-error">
                        <span>Ошибка загрузки компонента Cards</span>
                        <p style="font-size:14px;color:#666;margin-top:8px;">Попробуйте обновить страницу</p>
                    </div>
                `;
            }
        }
        console.log('[Nav] _updateCards() END');
    }

    _prepareCardsData() {
        console.log('[Nav] _prepareCardsData() START');
        let items = [...this.items];

        // Добавляем кнопку "Наверх" если есть parentId
        if (this.parentId !== null && this.parentId !== undefined) {
            items.unshift({
                id: 0,
                parent_id: this.parentId,
                card_type: 'folder',
                name: '..',
                description: 'На уровень выше',
                icon: '📁',
                is_up: true
            });
        }

        // Разделяем на папки и модули
        const folders = items.filter(item => item.card_type === 'folder' && !item.is_up);
        const modules = items.filter(item => item.card_type === 'module' && !item.is_up);
        const upItem = items.find(item => item.is_up === true);

        // Сортировка
        const sortFn = (a, b) => {
            if (a.sort_order !== b.sort_order) {
                return (a.sort_order || 0) - (b.sort_order || 0);
            }
            return (a.name || '').localeCompare(b.name || '');
        };

        folders.sort(sortFn);
        modules.sort(sortFn);

        // Собираем в правильном порядке
        const allItems = [];
        if (upItem) allItems.push(upItem);
        allItems.push(...folders);
        allItems.push(...modules);

        console.log('[Nav] _prepareCardsData() END, результат:', allItems.length);
        return allItems;
    }

    _handleCardClick(id) {
        console.log('[Nav] _handleCardClick()', id);

        // id === 0 — псевдокарточка "Наверх" (её нет в this.items)
        if (id === 0) {
            console.log('[Nav] Переход вверх');
            this._goUp();
            return;
        }

        const item = this.items.find(i => i.id === id);
        if (!item) {
            console.warn('[Nav] Элемент не найден:', id);
            return;
        }

        if (item.is_up) {
            console.log('[Nav] Переход вверх');
            this._goUp();
            return;
        }

        if (item.card_type === 'folder') {
            console.log('[Nav] Открытие папки:', item.id);
            this._openFolder(item.id);
            return;
        }

        if (item.card_type === 'module') {
            console.log('[Nav] Открытие модуля:', item.id);
            this._openModule(item.id);
            return;
        }
    }

    async _goUp() {
        console.log('[Nav] _goUp()');
        if (this.parentHistory && this.parentHistory.length > 0) {
            const prevParent = this.parentHistory.pop();
            this.parentId = prevParent;
            await this._loadItems();
        } else {
            this.parentId = null;
            await this._loadItems();
        }
    }

    async _openFolder(folderId) {
        console.log('[Nav] _openFolder()', folderId);
        if (!this.parentHistory) {
            this.parentHistory = [];
        }
        this.parentHistory.push(this.parentId);

        this.parentId = folderId;
        await this._loadItems();
    }

    _openModule(moduleId) {
        console.log('[Nav] _openModule()', moduleId);
        const event = new CustomEvent('nav:open-module', {
            detail: { moduleId }
        });
        document.dispatchEvent(event);
    }

    /**
     * Проверяет, инициализирован ли Nav
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Ожидает завершения инициализации Nav
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    /**
     * Получить текущие элементы
     */
    getItems() {
        return this.items;
    }

    /**
     * Получить текущий parentId
     */
    getParentId() {
        return this.parentId;
    }

    /**
     * Получить текущий section
     */
    getSection() {
        return this.section;
    }

    /**
     * Установить parentId и перезагрузить
     */
    async setParentId(parentId) {
        this.parentId = parentId;
        await this._loadItems();
    }

    /**
     * Установить section и перезагрузить
     */
    async setSection(section) {
        this.section = section;
        this.parentId = null;
        await this._loadItems();
    }

    async destroy() {
        console.log('[Nav] destroy()');
        if (this.cardsInstance) {
            if (typeof this.cardsInstance.destroy === 'function') {
                await this.cardsInstance.destroy();
            }
            this.cardsInstance = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.parentHistory = [];
        this.items = [];
        this._initialized = false;
        this._initPromise = null;
    }
}