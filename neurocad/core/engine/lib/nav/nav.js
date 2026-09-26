// app/core/engine/lib/nav/nav.js

/**
 * Nav — navigation component (file explorer).
 * Loads data and passes it to BaseCards.
 *
 * Does NOT deal with icons — they live in lib/base/images.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 */
export class Nav {
    constructor(container, props = {}) {
        console.log('[Nav] Constructor called', { container, props });

        this.container = container;
        this.props = props;

        this.parentId = props.parent_id || null;
        this.section = props.section || 2;  // 1 — public, 2 — personal

        this.items = [];
        this.isLoading = false;
        this.error = null;
        this.cardsInstance = null;
        this.CardsClass = null;
        this.parentHistory = [];

        // Init state
        this._initialized = false;
        this._initPromise = null;
        this._isContainerReady = false;

        console.log('[Nav] Loading CSS');
        this._loadCSS();
        console.log('[Nav] Calling _init()');
        this._initPromise = this._init();
    }

    _loadCSS() {
        console.log('[Nav] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            console.log('[Nav] Loading CSS via coreEngine');
            window.coreEngine.loadCSS('core/engine/lib/nav/nav.css');
        } else {
            console.warn('[Nav] coreEngine.loadCSS not found');
        }
    }

    async _init() {
        console.log('[Nav] _init() START');
        try {
            console.log('[Nav] Loading Cards...');
            await this._loadCards();
            console.log('[Nav] Cards loaded:', !!this.CardsClass);

            console.log('[Nav] Loading Items...');
            await this._loadItems();
            console.log('[Nav] Items loaded:', this.items.length);

            this._initialized = true;
            console.log('[Nav] _init() COMPLETE');
        } catch (error) {
            console.error('[Nav] _init() error:', error);
            this._initialized = false;
            throw error;
        }
        console.log('[Nav] _init() END');
    }

    async _loadCards() {
        console.log('[Nav] _loadCards() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            console.log('[Nav] Cards version:', version);
            console.log('[Nav] Importing cards.js...');

            const module = await import(`../base/cards/cards.js?v=${version}`);
            console.log('[Nav] Cards module loaded:', module);

            this.CardsClass = module.BaseCards;
            console.log('[Nav] CardsClass set:', !!this.CardsClass);

            if (!this.CardsClass) {
                console.error('[Nav] BaseCards not found in module');
                console.log('[Nav] Available exports:', Object.keys(module));
            }
        } catch (error) {
            console.error('[Nav] Cards load error:', error);
            console.error('[Nav] Error message:', error.message);
            console.error('[Nav] Error stack:', error.stack);
            throw error;
        }
        console.log('[Nav] _loadCards() END');
    }

    async _loadItems() {
        console.log('[Nav] _loadItems() START');

        // Check auth before loading
        const auth = window.coreEngine?.auth;
        console.log('[Nav] auth:', !!auth);

        // ===== NOT AUTHORIZED — SHOW LOGIN FORM, NO CARDS =====
        if (!auth || !auth.isAuth()) {
            console.log('[Nav] Not authorized, showing login form');
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

            // section is required
            params.push(`section=${this.section}`);

            if (params.length > 0) {
                url += '?' + params.join('&');
            }

            console.log('[Nav] Loading data from URL:', url);

            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url);

            console.log('[Nav] Data received:', data);

            if (data.success) {
                this.items = data.data || [];
                console.log('[Nav] Items updated:', this.items.length);
                this.isLoading = false;
                await this._updateCards();
            } else {
                throw new Error(data.message || 'Data load error');
            }
        } catch (error) {
            console.error('[Nav] Load error:', error);

            // 401 is already handled by fetchJson (auth:unauthorized was emitted).
            // Here we just stop loading and let the auth layer take over.
            if (error.status === 401) {
                console.log('[Nav] 401 — session expired, auth layer handles it');
                this.isLoading = false;
                this.error = null;
                return;
            }

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
        console.log('[Nav] cardsData prepared:', cardsData.length);

        if (this.cardsInstance) {
            console.log('[Nav] Updating existing Cards instance');
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
            console.log('[Nav] Creating new Cards instance');
            console.log('[Nav] Container:', this.container);
            console.log('[Nav] Container children:', this.container.children);
            console.log('[Nav] Container in DOM?', document.body.contains(this.container));

            try {
                this.cardsInstance = new this.CardsClass(this.container, {
                    items: cardsData,
                    isLoading: this.isLoading,
                    error: this.error,

                    // Fields for the edit form
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

                    // Fields for the standard view
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

                    // Section and parentId
                    section: this.section,
                    parentId: this.parentId,

                    // Custom card render for Nav
                    renderCard: (item) => {
                        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            '"': '&quot;',
                            "'": '&#39;'
                        }[c]));

                        // "Up" button
                        if (item.is_up) {
                            return `
                                <div class="nav-folder">
                                    <span class="nav-folder-icon">📁</span>
                                    <span class="nav-folder-name">..</span>
                                    <span class="nav-folder-desc">На уровень выше</span>
                                </div>
                            `;
                        }

                        // Folder
                        if (item.card_type === 'folder') {
                            return `
                                <div class="nav-folder">
                                    <span class="nav-folder-icon">${esc(item.icon || '📁')}</span>
                                    <span class="nav-folder-name">${esc(item.name)}</span>
                                    ${item.description ? `<span class="nav-folder-desc">${esc(item.description)}</span>` : ''}
                                </div>
                            `;
                        }

                        // Module
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
                console.log('[Nav] Cards created:', !!this.cardsInstance);
                console.log('[Nav] Cards container:', this.cardsInstance?.container);
                console.log('[Nav] Cards grid:', this.cardsInstance?.grid);

                // Wait for Cards init.
                // BaseCards._init() already calls await this.render(),
                // so an extra render() call is NOT needed here.
                if (this.cardsInstance && this.cardsInstance._initPromise) {
                    console.log('[Nav] Waiting for Cards init...');
                    try {
                        await this.cardsInstance._initPromise;
                        console.log('[Nav] Cards initialized');
                    } catch (error) {
                        console.error('[Nav] Cards init error:', error);
                    }
                }

            } catch (error) {
                console.error('[Nav] Cards create error:', error);
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
            console.error('[Nav] CardsClass not loaded, cannot create Cards');
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

        // Add "Up" button if there is a parentId
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

        // Split into folders and modules
        const folders = items.filter(item => item.card_type === 'folder' && !item.is_up);
        const modules = items.filter(item => item.card_type === 'module' && !item.is_up);
        const upItem = items.find(item => item.is_up === true);

        // Sort
        const sortFn = (a, b) => {
            if (a.sort_order !== b.sort_order) {
                return (a.sort_order || 0) - (b.sort_order || 0);
            }
            return (a.name || '').localeCompare(b.name || '');
        };

        folders.sort(sortFn);
        modules.sort(sortFn);

        // Assemble in the right order
        const allItems = [];
        if (upItem) allItems.push(upItem);
        allItems.push(...folders);
        allItems.push(...modules);

        console.log('[Nav] _prepareCardsData() END, result:', allItems.length);
        return allItems;
    }

    _handleCardClick(id) {
        console.log('[Nav] _handleCardClick()', id);

        // id === 0 — pseudo-card "Up" (not present in this.items)
        if (id === 0) {
            console.log('[Nav] Going up');
            this._goUp();
            return;
        }

        const item = this.items.find(i => i.id === id);
        if (!item) {
            console.warn('[Nav] Item not found:', id);
            return;
        }

        if (item.is_up) {
            console.log('[Nav] Going up');
            this._goUp();
            return;
        }

        if (item.card_type === 'folder') {
            console.log('[Nav] Opening folder:', item.id);
            this._openFolder(item.id);
            return;
        }

        if (item.card_type === 'module') {
            console.log('[Nav] Opening module:', item.id);
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
     * Whether Nav is initialized.
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Wait for Nav init to complete.
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    /**
     * Get current items.
     */
    getItems() {
        return this.items;
    }

    /**
     * Get current parentId.
     */
    getParentId() {
        return this.parentId;
    }

    /**
     * Get current section.
     */
    getSection() {
        return this.section;
    }

    /**
     * Set parentId and reload.
     */
    async setParentId(parentId) {
        this.parentId = parentId;
        await this._loadItems();
    }

    /**
     * Set section and reload.
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