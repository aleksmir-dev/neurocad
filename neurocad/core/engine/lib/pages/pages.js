// app/core/engine/lib/pages/pages.js

/**
 * Pages component — article catalog.
 * Thin wrapper around BaseCards.
 *
 * If items are not passed in props, loads the list from the server.
 */

export class Pages {
    constructor(container, props = {}) {
        console.log('[Pages] Constructor', { container, props });

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

            // If items are not passed in props — load from server
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items empty — loading from server');
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

                // ===== FIELDS FOR CREATE/EDIT FORM =====
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

                // Fields for standard render
                listFields: ['title', 'description'],

                // Entity type (used in UI messages)
                entityType: 'статью',

                // Grid — wide cards
                listView: {
                    gridColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                },

                // Buttons — admin only
                showAddButton: isAdmin,
                showEditButton: isAdmin,
                showDeleteButton: isAdmin,
                showTrashButton: false,
                showSearch: false,
                showStatusFilter: false,

                // Custom card render
                renderCard: (item) => this._renderArticleCard(item),
                cardOptions: { customClass: 'pages-card-wrapper' },

                // Click → navigate to editor/view
                onItemClick: (id) => this._openArticle(id),

                // Callbacks
                onReload: () => this._reload(),
                onRetry: () => this._reload(),

                widgetTitle: 'Статьи',
                widgetStatus: `${this.props.items?.length || 0} статей`,
            });

            await this.cardsInstance._initPromise;

            this._initialized = true;
            console.log('[Pages] _init() COMPLETE');
        } catch (error) {
            console.error('[Pages] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // LOAD FROM SERVER
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
                throw new Error(`Load error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.props.items = result.data || [];
                console.log('[Pages] Loaded from server:', this.props.items.length);
            } else {
                console.warn('[Pages] Response without success:', result);
                this.props.items = [];
            }
        } catch (error) {
            console.error('[Pages] List load error:', error);
            this.props.items = [];
        }
    }

    // ============================================
    // CARD RENDER
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
    // NAVIGATION
    // ============================================

    /**
     * Navigate to the article page.
     *
     * CoreEngine.baseUrl points to the current module URL
     * (e.g. /core/engine/app). The link is built as:
     *   {baseUrl}/page/{date}/{time}
     *   → /core/engine/app/page/20260919/015911
     *
     * Module segment in URL is required — otherwise route.py
     * cannot find the config.
     */
    _openArticle(id) {
        console.log('[Pages] _openArticle() id =', id, '(type:', typeof id, ')');

        const cardsItems = this.cardsInstance?.props?.items;
        const ownItems = this.props.items;
        const items = cardsItems || ownItems || [];

        // Find item with type coercion (id may be number or string)
        const item = items.find(i => String(i.id) === String(id));

        // Base URL — current module, e.g. /core/engine/app
        const baseUrl = window.coreEngine?.baseUrl || '/core/engine';
        console.log('[Pages] _openArticle() baseUrl =', baseUrl);

        if (!item) {
            console.warn(`[Pages] item not found, fallback to ${baseUrl}/page/item/${id}`);
            window.location.href = `${baseUrl}/page/item/${id}`;
            return;
        }

        if (!item.datetime) {
            console.warn(`[Pages] item has no datetime, fallback to ${baseUrl}/page/item/${id}`);
            window.location.href = `${baseUrl}/page/item/${id}`;
            return;
        }

        const date = this._formatDate(item.datetime);
        const time = this._formatTime(item.datetime);

        const url = `${baseUrl}/page/${date}/${time}`;
        console.log('[Pages] _openArticle() navigating to:', url);

        window.location.href = url;
    }

    // ============================================
    // RELOAD
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
    // UTILITIES
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
            console.warn('[Pages] Date format error:', e);
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
            console.warn('[Pages] Time format error:', e);
            return '';
        }
    }

    // ============================================
    // PUBLIC METHODS
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