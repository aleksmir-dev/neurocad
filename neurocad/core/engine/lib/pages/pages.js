// app/core/engine/lib/pages/pages.js

/**
 * Компонент Pages — каталог статей.
 * Тонкая обёртка над BaseCards.
 *
 * Если items не переданы в props — загружает список с сервера.
 */

export class Pages {
    constructor(container, props = {}) {
        console.log('[Pages] Конструктор вызван', { container, props });

        this.container = container;
        this.props = props;

        this.cardsInstance = null;
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/pages/pages.css');
        }
    }

    async _init() {
        console.log('[Pages] _init() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();
            const { BaseCards } = await import(`../base/cards/cards.js?v=${version}`);

            const isAdmin = this._isAdmin();

            // Если items не переданы в props — загружаем с сервера
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items пусты — загружаем с сервера');
                await this._loadFromServer();
            }

            this.cardsInstance = new BaseCards(this.container, {
                items: this.props.items || [],
                isLoading: this.props.isLoading || false,
                error: this.props.error || null,

                // API
                apiBase: '/core/engine/lib/pages',
                apiEndpoints: {
                    list: '/list',
                    create: '/item',
                    update: '/item/{id}',
                    delete: '/item/{id}',
                    restore: '/item/{id}/restore',
                },

                // ===== ПОЛЯ ДЛЯ ФОРМЫ СОЗДАНИЯ/РЕДАКТИРОВАНИЯ =====
                fields: [
                    {
                        key: 'title',
                        label: 'Заголовок',
                        type: 'text',
                        required: true,
                        minLength: 1,
                        maxLength: 255,
                        placeholder: 'Введите заголовок статьи',
                    },
                    {
                        key: 'description',
                        label: 'Краткое описание',
                        type: 'textarea',
                        maxLength: 500,
                        rows: 3,
                        placeholder: 'Описание (необязательно)',
                    },
                    {
                        key: 'logo',
                        label: 'Логотип (URL)',
                        type: 'text',
                        maxLength: 500,
                        placeholder: 'URL изображения (необязательно)',
                    },
                ],

                // Поля для стандартного рендера
                listFields: ['title', 'description'],

                // Тип сущности
                entityType: 'статью',

                // Сетка — широкие карточки
                listView: {
                    gridColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                },

                // Кнопки — только для админа
                showAddButton: isAdmin,
                showEditButton: isAdmin,
                showDeleteButton: isAdmin,
                showTrashButton: false,
                showSearch: false,
                showStatusFilter: false,

                // Кастомный рендер карточки
                renderCard: (item) => this._renderArticleCard(item),
                cardOptions: { customClass: 'pages-card-wrapper' },

                // Клик → переход в редактор/просмотр
                onItemClick: (id) => this._openArticle(id),

                // Колбэки
                onReload: () => this._reload(),
                onRetry: () => this._reload(),

                widgetTitle: 'Статьи',
                widgetStatus: `${this.props.items?.length || 0} статей`,
            });

            await this.cardsInstance._initPromise;

            this._initialized = true;
            console.log('[Pages] _init() COMPLETE');
        } catch (error) {
            console.error('[Pages] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // ЗАГРУЗКА С СЕРВЕРА
    // ============================================

    async _loadFromServer() {
        console.log('[Pages] _loadFromServer()');

        const url = `/core/engine/lib/pages/list`;
        try {
            const response = await fetch(url, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.props.items = result.data || [];
                console.log('[Pages] Загружено с сервера:', this.props.items.length);
            } else {
                console.warn('[Pages] Ответ без success:', result);
                this.props.items = [];
            }
        } catch (error) {
            console.error('[Pages] Ошибка загрузки списка:', error);
            this.props.items = [];
        }
    }

    // ============================================
    // РЕНДЕР КАРТОЧКИ
    // ============================================

    _renderArticleCard(item) {
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

        const date = item.datetime
            ? new Date(item.datetime).toLocaleDateString('ru-RU', {
                  year: 'numeric', month: 'long', day: 'numeric'
              })
            : '';

        return `
            <div class="pages-card">
                <div class="pages-card-glow"></div>
                ${item.logo ? `
                    <div class="pages-card-logo">
                        <img src="${esc(item.logo)}" alt="${esc(item.title)}">
                    </div>
                ` : ''}
                <div class="pages-card-body">
                    <h3 class="pages-card-title">${esc(item.title)}</h3>
                    ${item.description ? `<p class="pages-card-desc">${esc(item.description)}</p>` : ''}
                    ${date ? `<time class="pages-card-date">${esc(date)}</time>` : ''}
                </div>
            </div>
        `;
    }

    // ============================================
    // ПЕРЕХОД ПО КАРТОЧКЕ
    // ============================================

    _openArticle(id) {
        // ===== ПОДРОБНОЕ ЛОГИРОВАНИЕ =====
        console.log('[Pages] _openArticle() START');
        console.log('[Pages] _openArticle() id =', id, '(type:', typeof id, ')');
        console.log('[Pages] _openArticle() window.coreEngine =', window.coreEngine);
        console.log('[Pages] _openArticle() window.coreEngine.baseUrl =',
            window.coreEngine?.baseUrl);

        const cardsItems = this.cardsInstance?.props?.items;
        const ownItems = this.props.items;
        const items = cardsItems || ownItems || [];

        console.log('[Pages] _openArticle() items из cardsInstance:',
            cardsItems?.length, 'items из props:', ownItems?.length);
        console.log('[Pages] _openArticle() items (всего):', items.length);
        console.log('[Pages] _openArticle() items[0]:', items[0]);

        // Ищем item с приведением типов (id может быть числом или строкой)
        const item = items.find(i => String(i.id) === String(id));

        console.log('[Pages] _openArticle() найденный item =', item);

        if (!item) {
            console.warn('[Pages] _openArticle() item не найден, fallback на /page/item/${id}');
            const baseUrl = window.coreEngine?.baseUrl || '';
            const url = `${baseUrl}/page/item/${id}`;
            console.log('[Pages] _openArticle() fallback URL =', url);
            window.location.href = url;
            return;
        }

        if (!item.datetime) {
            console.warn('[Pages] _openArticle() у item нет datetime, fallback на /page/item/${id}');
            const baseUrl = window.coreEngine?.baseUrl || '';
            const url = `${baseUrl}/page/item/${id}`;
            console.log('[Pages] _openArticle() fallback URL =', url);
            window.location.href = url;
            return;
        }

        const date = this._formatDate(item.datetime);
        const time = this._formatTime(item.datetime);

        console.log('[Pages] _openArticle() date =', date, 'time =', time);

        // ВАЖНО: baseUrl у CoreEngine указывает на URL текущего модуля,
        // например /core/engine/app. Для ссылки на другой модуль
        // нужен корень /core/engine.
        const engineRoot = this._getEngineRoot();
        console.log('[Pages] _openArticle() engineRoot =', engineRoot);

        const url = `${engineRoot}/page/${date}/${time}`;
        console.log('[Pages] _openArticle() итоговый URL =', url);
        console.log('[Pages] _openArticle() переход...');

        window.location.href = url;
    }

    // ============================================
    // ПОЛУЧЕНИЕ КОРНЯ ENGINE
    // ============================================

    _getEngineRoot() {
        // 1. Если coreEngine даёт отдельный корень — используем его
        if (window.coreEngine?.engineRoot) {
            return window.coreEngine.engineRoot;
        }

        // 2. Иначе — берём baseUrl и отрезаем последний сегмент (имя модуля)
        //    /core/engine/app  →  /core/engine
        const baseUrl = window.coreEngine?.baseUrl || '';
        if (baseUrl) {
            const parts = baseUrl.split('/').filter(Boolean);
            // parts = ['core', 'engine', 'app'] → отрезаем 'app'
            if (parts.length > 1) {
                parts.pop();
                return '/' + parts.join('/');
            }
            return '/' + parts.join('/');
        }

        // 3. Fallback — жёстко
        return '/core/engine';
    }

    // ============================================
    // ПЕРЕЗАГРУЗКА
    // ============================================

    async _reload() {
        console.log('[Pages] _reload()');

        await this._loadFromServer();

        if (this.cardsInstance) {
            await this.cardsInstance.updateProps({
                items: this.props.items,
                isLoading: false,
                error: null,
                widgetStatus: `${this.props.items.length} статей`,
            });
        }
    }

    // ============================================
    // УТИЛИТЫ
    // ============================================

    _isAdmin() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;
        if (typeof auth.isSuperadmin === 'function') {
            return auth.isSuperadmin();
        }
        if (typeof auth.getUser === 'function') {
            const user = auth.getUser();
            return user?.is_superadmin === true;
        }
        return false;
    }

    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}${mm}${dd}`;
        } catch (e) {
            console.warn('[Pages] Ошибка форматирования даты:', e);
            return '';
        }
    }

    _formatTime(isoString) {
        try {
            const d = new Date(isoString);
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${hh}${mi}${ss}`;
        } catch (e) {
            console.warn('[Pages] Ошибка форматирования времени:', e);
            return '';
        }
    }

    // ============================================
    // ПУБЛИЧНЫЕ МЕТОДЫ
    // ============================================

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }

    destroy() {
        console.log('[Pages] destroy()');
        if (this.cardsInstance?.destroy) {
            this.cardsInstance.destroy();
        }
        this.cardsInstance = null;
        this._initialized = false;
        this._initPromise = null;
    }
}