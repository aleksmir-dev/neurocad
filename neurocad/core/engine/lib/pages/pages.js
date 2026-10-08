// app/core/engine/lib/pages/pages.js

/**
 * Pages component — article catalog.
 * Thin wrapper around BaseCards.
 *
 * If items are not passed in props, loads the list from the server.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * NAV_ID:
 *   Requests may carry ?nav_id=<props.nav_id>. This scopes the
 *   catalog to a specific nav instance. When omitted, the backend
 *   resolves the nav from the authenticated user's session
 *   (first nav by id ASC). So nav_id is optional here — pass it
 *   only when a specific nav must be targeted.
 *
 * FOLDER MODE
 * -----------
 * The catalog is hierarchical: pages can be grouped into folders.
 * This is done by enabling `folders: true` on BaseCards. The
 * navigation (open folder / go up / ".." pseudo-card) is handled
 * entirely by BaseCards — see base/cards/cards.js and
 * base/cards/render.js.
 *
 *   - `card_type` on a page is either "page" or "folder".
 *   - `parent_id` is the folder the item lives in (null — root).
 *   - BaseCards appends `?parent_id=<id>` to the list request when
 *     a folder is open, prepends "..", and groups folders before
 *     pages. Pages.js only has to:
 *       * enable the mode (folders + folderField + folderValue);
 *       * declare `card_type` and `parent_id` in the form fields;
 *       * render folders / pages / ".." differently:
 *           - pages  → _renderArticleCard
 *           - folders → _renderArticleCard
 *           - ".."   → _renderUpCard
 *
 * The button "Создать папку" (showFolderButton) lives in the toolbar
 * and is wired by BaseCards through `onAddFolder`. Clicking it opens
 * the same create form as "+", but with `card_type = 'folder'`
 * pre-filled (see initool.js).
 *
 * Permissions:
 *   - Guests: read-only catalog view (no toolbar).
 *   - Authenticated users (including superadmin): full toolbar —
 *     add, edit, delete, restore, create folder.
 *
 * External link cards:
 *   A page may carry an external `url` (pages.url). When set, the
 *   card is a "link card": clicking it navigates to that URL in
 *   the CURRENT tab, instead of opening the internal editor.
 *
 *   This does NOT apply to folders — BaseCards intercepts folder
 *   clicks before they reach Pages (see cards.js → _handleActivate).
 *
 * Template system:
 *   - is_template: page can be used as a base template by other pages.
 *   - template_id: this page inherits layout from that template page;
 *     its own `content` is inserted into [data-slot="content"] slot.
 *
 * Logo generation:
 *   The "logo" media field declares an `extraButtons` entry — the
 *   "Генерировать" button. Its onClick lives in logo.js and is loaded
 *   dynamically, like every other module here.
 *
 * Extra toolbar buttons:
 *   In the toolbar's left group, after the standard buttons, two
 *   link-buttons are rendered:
 *
 *     - «Заголовок» (title.svg) — opens a modal to edit Nav.name.
 *     - «Открыть каталог статей» (link.svg) — opens the public
 *       catalog in a new tab (absolute URL from profile/domain).
 *
 *   Both are passed to BaseCards via `extraToolbarButtons`.
 *
 * Onboarding hints:
 *   Two independent hints (see ./hint.js), stored per-browser in
 *   localStorage: EmptyArticlesHint and CardActionsHint.
 *
 * Grid layout:
 *   Grid is defined in cards.css; we deliberately do NOT pass
 *   `listView.gridColumns` (an inline template would break the
 *   minmax() stretch).
 *
 * Caption: on _init() we ask PagesTitle to load Nav.name and set it
 * as the header/tab title. On destroy(), PagesTitle restores the
 * previous caption.
 *
 * User-facing strings are in Russian. Code comments, docstrings
 * and identifiers are in English.
 */

export class Pages {
    constructor(container, props = {}) {
        console.log('[Pages] Constructor', { container, props });

        this.container = container;
        this.props = props;

        // Nav instance this catalog belongs to.
        this.navId = props.nav_id || null;

        this.cardsInstance = null;
        this._initialized = false;
        this._initPromise = null;

        // Cached list of templates (is_template=1), for the dropdown.
        this._templates = [];

        // Caption helpers — filled from window.coreEngine.base in _init().
        this._setCaption = null;
        this._restoreCaption = null;

        // Title helper — owns Nav.name loading, the "Заголовок" modal
        // and saving. Created in _init().
        this._title = null;

        // Onboarding hints. Created in _init().
        this._emptyHint = null;
        this._cardHint = null;

        // Last known item count — used to detect "a card was created"
        // between two _reload() calls.
        this._lastItemCount = 0;

        // Bound click handler for the «Заголовок» button.
        this._onTitleBtnClick = null;

        // Absolute URL of the public catalog for the CURRENT user.
        this._publicPagesUrl = '/pages';

        this._loadCSS();

        this._initPromise = this._init();
    }

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/pages/pages.css');
            window.coreEngine.loadCSS('core/engine/lib/pages/hint.css');
        }
    }

    /**
     * Build a URL to the pages API with nav_id attached (if known).
     *
     * BaseCards appends endpoint paths to `apiBase` as-is, so we
     * keep `apiBase` clean and put nav_id directly into each
     * endpoint string. When navId is null, the backend resolves
     * the nav from the session — no query parameter needed.
     *
     * `parent_id` is NOT added here — Pages loads its list itself
     * (see _loadFromServer) and adds parent_id explicitly from
     * `this.cardsInstance.parentId`. BaseCards' own api.js handles
     * parent_id for ITS requests (create / update / delete / list
     * when the consumer goes through BaseCards' api module), but
     * Pages bypasses that for the initial list load.
     *
     * Also used by PagesTitle (passed in as `getApiUrl`) so the
     * nav-name endpoints get the exact same ?nav_id= handling.
     */
    _apiUrl(endpoint, extraQuery = '') {
        const sep = endpoint.includes('?') ? '&' : '?';
        const navPart = this.navId != null
            ? `nav_id=${encodeURIComponent(this.navId)}`
            : '';
        const extra = extraQuery ? `&${extraQuery}` : '';

        if (!navPart && !extra) return endpoint;
        if (!navPart) return `${endpoint}${sep}${extra}`;
        if (!extra) return `${endpoint}${sep}${navPart}`;
        return `${endpoint}${sep}${navPart}${extra}`;
    }

    /**
     * Load the ABSOLUTE public catalog URL for the current user
     * from `profile/domain` (`pages_url` field).
     */
    async _loadPublicPagesUrl() {
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) return;

            const res = await fetchJson('/core/engine/lib/base/profile/domain/');
            const url = res?.data?.pages_url;
            if (res?.success && typeof url === 'string' && url) {
                this._publicPagesUrl = url;
                console.log('[Pages] public catalog URL:', url);
            } else {
                console.warn('[Pages] pages_url not present in domain response');
            }
        } catch (e) {
            console.warn('[Pages] pages_url fetch failed, using /pages', e);
        }
    }

    async _init() {
        console.log('[Pages] _init() START, navId =', this.navId);
        try {
            // Pick up caption helpers from Base (loaded before Pages).
            const base = window.coreEngine?.base;
            this._setCaption = base?._setCaption || null;
            this._restoreCaption = base?._restoreCaption || null;

            const version = window.coreEngine?.static_version || Date.now();
            const { BaseCards } = await import(`../base/cards/cards.js?v=${version}`);

            // Logo generator button — used by the "logo" media field.
            const { makeLogoGeneratorButton } = await import(
                `./logo.js?v=${version}`
            );

            // Title helper — owns Nav.name loading, the "Заголовок" modal.
            const { PagesTitle } = await import(`./title.js?v=${version}`);
            this._title = new PagesTitle({
                navId: this.navId,
                getApiUrl: (endpoint, extraQuery) => this._apiUrl(endpoint, extraQuery),
            });
            this._title.setCaptionHelpers({
                setCaption: this._setCaption,
                restoreCaption: this._restoreCaption,
            });

            // Onboarding hints.
            const { EmptyArticlesHint, CardActionsHint } = await import(
                `./hint.js?v=${version}`
            );
            this._EmptyArticlesHint = EmptyArticlesHint;
            this._CardActionsHint = CardActionsHint;
            this._emptyHint = new EmptyArticlesHint();
            this._cardHint = new CardActionsHint();

            const canEdit = this._canEdit();

            // If items are not passed in props — load from server.
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items empty — loading from server');
                await this._loadFromServer();
            }

            // Load templates list (for "Наследовать от" dropdown).
            if (canEdit) {
                await this._loadTemplates();
            }

            // Public catalog URL — must be loaded BEFORE BaseCards is
            // constructed so extraToolbarButtons already carries the
            // final href.
            await this._loadPublicPagesUrl();

            // Set header/tab title from Nav.name.
            await this._title.loadCaption();

            this.cardsInstance = new BaseCards(this.container, {
                items: this.props.items || [],
                isLoading: this.props.isLoading || false,
                error: this.props.error || null,

                // ===== FOLDER MODE =====
                // Enables the hierarchical browser in BaseCards:
                // ".." pseudo-card, folder grouping, navigation.
                // Field name and value are configurable; here we use
                // the same convention as the rest of the project
                // (`card_type = 'folder' | 'page'`).
                folders: true,
                folderField: 'card_type',
                folderValue: 'folder',

                // API
                //
                // nav_id is put directly into each endpoint, not into
                // apiBase, because BaseCards appends endpoints to
                // apiBase and we don't want to guess how it handles
                // query strings. When navId is null, the backend
                // resolves the nav from the session.
                //
                // `parent_id` for BaseCards' own requests (create /
                // update / delete) is added by api.js → buildUrl().
                // Pages' initial list load adds it explicitly in
                // _loadFromServer (see the docstring there).
                apiBase: '/core/engine/lib/pages',
                apiEndpoints: {
                    list:    this._apiUrl('/list'),
                    create:  this._apiUrl('/item'),
                    update:  this._apiUrl('/item/{id}'),
                    delete:  this._apiUrl('/item/{id}'),
                    restore: this._apiUrl('/item/{id}/restore'),
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
                        key: 'card_type',
                        // Not user-editable in the create form for a
                        // regular page: the type is decided by which
                        // button was clicked ("+" — page, "Создать
                        // папку" — folder). We hide the field in the
                        // form to avoid confusing the user, but keep
                        // it declared so its value is submitted.
                        //
                        // Hidden via pages.css → .edit-group:has(...).
                        label: 'Тип',
                        type: 'text',
                        className: 'pages-field-hidden',
                        default: 'page',
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
                        key: 'url',
                        label: 'Внешняя ссылка',
                        type: 'text',
                        maxLength: 2048,
                        placeholder: 'https://example.com (необязательно)',
                        hint: 'Если заполнено — карточка в каталоге ведёт на этот адрес вместо статьи.',
                    },
                    {
                        key: 'logo',
                        label: 'Логотип',
                        type: 'media',
                        placeholder: 'Не выбрано',
                        mediaSources: ['media', 'logos'],
                        mediaSource: 'logos',
                        extraButtons: [ makeLogoGeneratorButton() ],
                    },

                    // ===== Template system =====
                    {
                        key: 'is_template',
                        label: 'сделать базовым шаблоном',
                        type: 'checkbox',
                        default: 0,
                    },
                    {
                        key: 'template_id',
                        label: 'Наследовать от',
                        type: 'select',
                        valueType: 'number',
                        options: () => this._templates.map(t => ({
                            value: t.id,
                            label: t.title,
                        })),
                        placeholder: '— Без шаблона —',
                    },

                    // ===== Folder mode — parent folder id =====
                    {
                        key: 'parent_id',
                        // Not user-editable. Carries the id of the
                        // folder the item is created in. The value
                        // comes from BaseCards.initialData (see
                        // cards.js → openCreateForm) and is submitted
                        // with the form. Hidden via pages.css →
                        // .edit-group:has([data-field="parent_id"]).
                        //
                        // Why this field must be declared here:
                        // BaseCardsEdit.getData() collects values
                        // ONLY from `fields[]`. `initialData` just
                        // prefills the form — it does not participate
                        // in submission. Without this entry the
                        // parent_id would be lost between the create
                        // form and the API request.
                        label: 'Родитель',
                        type: 'text',
                    },
                ],

                // ===== INITIAL DATA FOR "CREATE" FORM =====
                // The "+" button creates a regular page by default.
                // `parent_id` is added by BaseCards from the current
                // folder (see cards.js → openCreateForm).
                initialData: (cards) => {
                    const nextNum = this._nextArticleNumber(cards.items || []);
                    return {
                        title: `Статья ${nextNum}`,
                        card_type: 'page',
                        is_template: 0,
                        template_id: null,
                    };
                },

                // Fields for standard render
                listFields: ['title', 'description'],

                // Entity type (used in UI messages)
                entityType: 'статью',

                // Buttons — any authenticated user
                showAddButton: canEdit,
                showEditButton: canEdit,
                showDeleteButton: canEdit,
                showTrashButton: false,
                showSearch: false,
                showStatusFilter: false,

                // "Создать папку" — rendered by toolbar.js BEFORE
                // the "+" button. Only when the user can edit.
                showFolderButton: canEdit,

                // ===== EXTRA TOOLBAR BUTTONS =====
                extraToolbarButtons: canEdit
                    ? [
                        {
                            href: '#',
                            label: 'Заголовок',
                            title: 'Изменить заголовок каталога',
                            icon: 'title',
                            target: '_self',
                            rel: '',
                            className: 'js-open-title-modal',
                        },
                        {
                            href: this._publicPagesUrl,
                            label: 'Открыть каталог статей',
                            title: 'Открыть публичный каталог статей в новой вкладке',
                            icon: 'link',
                            target: '_blank',
                            rel: 'noopener noreferrer',
                        },
                    ]
                    : [],

                // ===== CUSTOM CARD RENDER =====
                // Pages and folders are rendered by _renderArticleCard.
                // The ".." pseudo-card is rendered by _renderUpCard —
                // BaseCards passes it through when the item's
                // is_up flag is set (see render.js → renderItem).
                renderCard: (item) => this._renderArticleCard(item),
                renderUpCard: () => this._renderUpCard(),
                cardOptions: { customClass: 'pages-card-wrapper' },

                // Click → open (only for non-folder, non-up items;
                // BaseCards intercepts ".." and folders before this).
                onItemClick: (id) => this._openArticle(id),

                // Callbacks
                onReload: () => this._reload(),
                onRetry: () => this._reload(),

                widgetTitle: 'Статьи',
                widgetStatus: `${this.props.items?.length || 0} статей`,
            });

            await this.cardsInstance._initPromise;

            // Normalize payload types before they hit the API.
            this._patchPayloadNormalization();

            // Bind the «Заголовок» click handler directly to the
            // button rendered by toolbar.js.
            const titleBtn = document.querySelector('.js-open-title-modal');
            if (titleBtn) {
                this._onTitleBtnClick = (e) => {
                    e.preventDefault();
                    this._title.openModal();
                };
                titleBtn.addEventListener('click', this._onTitleBtnClick);
            } else {
                console.warn('[Pages] «Заголовок» button not found in DOM');
            }

            this._lastItemCount = (this.cardsInstance?.props?.items
                                || this.props.items
                                || []).length;

            this._updateEmptyHint();

            this._initialized = true;
            console.log('[Pages] _init() COMPLETE');
        } catch (error) {
            console.error('[Pages] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // ONBOARDING HINTS
    // ============================================

    _updateEmptyHint() {
        if (!this._emptyHint) return;

        const items = this.cardsInstance?.props?.items
                   || this.props.items
                   || [];

        if (items.length === 0 && this._canEdit()) {
            setTimeout(() => {
                if (this._emptyHint) this._emptyHint.show();
            }, 0);
        } else {
            this._emptyHint.hide();
        }
    }

    _updateCardActionsHint(prevCount, newCount) {
        if (!this._cardHint) return;

        const created = newCount > prevCount;
        if (!created) return;

        if (this._emptyHint) {
            this._emptyHint.hide();
        }

        setTimeout(() => {
            if (!this._cardHint) return;

            const cardEl = document.querySelector(
                '.core-engine-lib-base-cards-card, .pages-card-wrapper'
            );

            this._cardHint.show(cardEl);
        }, 150);
    }

    // ============================================
    // PAYLOAD NORMALIZATION
    // ============================================

    _patchPayloadNormalization() {
        const cards = this.cardsInstance;
        if (!cards) return;

        const fields = cards.fields || [];

        const normalize = (data) => {
            if (!data || typeof data !== 'object') return data;

            const out = { ...data };

            for (const field of fields) {
                const key = field.key;
                if (!(key in out)) continue;

                const v = out[key];

                switch (field.type) {
                    case 'checkbox':
                        out[key] = v ? 1 : 0;
                        break;

                    case 'select': {
                        if (v === '' || v === null || v === undefined) {
                            out[key] = null;
                        } else if (field.valueType === 'number') {
                            const n = Number(v);
                            out[key] = Number.isNaN(n) ? null : n;
                        }
                        break;
                    }

                    case 'number': {
                        if (v === '' || v === null || v === undefined) {
                            out[key] = null;
                        } else {
                            const n = Number(v);
                            out[key] = Number.isNaN(n) ? null : n;
                        }
                        break;
                    }

                    default:
                        break;
                }
            }

            return out;
        };

        const origAdd = cards._addItem.bind(cards);
        cards._addItem = async (data) => origAdd(normalize(data));

        const origUpdate = cards._updateItem.bind(cards);
        cards._updateItem = async (id, data) => origUpdate(id, normalize(data));

        console.log('[Pages] _patchPayloadNormalization() applied');
    }

    // ============================================
    // LOAD FROM SERVER
    // ============================================

    /**
     * Load the list of items for the CURRENT folder level.
     *
     * BaseCards handles `parent_id` internally for ITS requests
     * (see api.js → buildUrl), but Pages loads its initial list
     * directly — bypassing BaseCards' api module. So we must add
     * `parent_id` ourselves.
     *
     * `this.cardsInstance.parentId` is the source of truth:
     *   - null / undefined → we send `parent_id=` (empty) so the
     *     backend returns ONLY the root level (parent_id IS NULL).
     *     If we omitted the parameter entirely, the backend would
     *     fall back to "return the whole flat list" — every item
     *     of every level, which is the old behaviour for callers
     *     that do not know about folders.
     *   - a real id        → `parent_id=<id>` → children of that
     *     folder.
     *
     * Before BaseCards exists (during the very first _init()),
     * `this.cardsInstance` is null — we send the empty parent_id,
     * which is correct: the catalog always opens at the root.
     *
     * The `?parent_id=` (empty) marker is understood by the
     * backend: see route.py → get_pages_list, which distinguishes
     * "parameter absent" from "parameter present but empty" via
     * request.query_params.
     */
    async _loadFromServer() {
        console.log('[Pages] _loadFromServer()');

        const parentId = this.cardsInstance?.parentId;

        // Always send `parent_id`:
        //   - real id → `parent_id=<id>`  (children of that folder);
        //   - null    → `parent_id=`      (root only).
        const extra = (parentId != null)
            ? `parent_id=${encodeURIComponent(parentId)}`
            : 'parent_id=';

        const url = this._apiUrl('/core/engine/lib/pages/list', extra);
        console.log('[Pages] _loadFromServer() url =', url);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const result = await fetchJson(url);

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

    async _loadTemplates() {
        console.log('[Pages] _loadTemplates()');

        try {
            const url = this._apiUrl('/core/engine/lib/pages/list', 'is_template=1');
            const fetchJson = window.coreEngine?.fetchJson;
            const result = await fetchJson(url);

            if (result.success) {
                this._templates = result.data || [];
                console.log('[Pages] Loaded templates:', this._templates.length);
            } else {
                console.warn('[Pages] Templates response without success:', result);
                this._templates = [];
            }
        } catch (error) {
            console.error('[Pages] Templates load error:', error);
            this._templates = [];
        }
    }

    // ============================================
    // CARD RENDER
    // ============================================

    /**
     * Render a card — either a page or a folder.
     *
     * Folders and pages look different:
     *   - a page  — the usual title / description / date / badges;
     *   - a folder — an icon, a name, a "(N)" children counter
     *     (if the backend provides one), no date, no badges.
     *
     * The ".." pseudo-card is NOT handled here — it is rendered by
     * _renderUpCard() (passed to BaseCards as `renderUpCard`).
     */
    _renderArticleCard(item) {
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

        // ---- Folder ----
        if (item.card_type === 'folder') {
            const childrenCount = Number.isFinite(item.children_count)
                ? item.children_count
                : null;

            const countLabel = childrenCount === null
                ? ''
                : `<span class="pages-folder-count">${childrenCount}</span>`;

            return `
                <div class="pages-folder">
                    <div class="pages-folder-icon" aria-hidden="true">📁</div>
                    <div class="pages-folder-body">
                        <h3 class="pages-folder-title">${esc(item.title)}</h3>
                        ${item.description ? `<p class="pages-folder-desc">${esc(item.description)}</p>` : ''}
                    </div>
                    ${countLabel}
                </div>
            `;
        }

        // ---- Regular page ----
        const date = item.datetime
            ? new Date(item.datetime).toLocaleDateString('ru-RU', {
                  year: 'numeric', month: 'long', day: 'numeric'
              })
            : '';

        const templateBadge = item.is_template
            ? `<span class="pages-card-badge">Шаблон</span>`
            : '';

        const externalBadge = item.url
            ? `<span class="pages-card-badge pages-card-badge-external" title="Ведёт на внешний сайт">↗</span>`
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
                    ${templateBadge}
                    ${externalBadge}
                </div>
            </div>
        `;
    }

    /**
     * Render the ".." pseudo-card (go one level up).
     *
     * The icon is the typographic arrow U+2934 (⤴), mirrored via
     * CSS (transform: scaleX(-1)) so it points to the upper-left —
     * the conventional "back" direction in Russian UI.
     *
     * Styling lives in pages.css → .pages-up.
     */
    _renderUpCard() {
        return `
            <div class="pages-up">
                <div class="pages-up-icon" aria-hidden="true">⤴</div>
                <div class="pages-up-body">
                    <h3 class="pages-up-title">Вернуться</h3>
                    <p class="pages-up-desc">На уровень выше</p>
                </div>
            </div>
        `;
    }

    // ============================================
    // NAVIGATION
    // ============================================

    /**
     * Open the clicked card.
     *
     * Called only for regular pages. BaseCards intercepts clicks on
     * folders and on the ".." pseudo-card BEFORE this handler — see
     * cards.js → _handleActivate.
     *
     * Two cases for a regular page:
     *   1. Has an external `url` — navigate to it in the current tab.
     *   2. No `url` — open the internal editor.
     */
    _openArticle(id) {
        console.log('[Pages] _openArticle() id =', id, '(type:', typeof id, ')');

        const cardsItems = this.cardsInstance?.props?.items;
        const ownItems = this.props.items;
        const items = cardsItems || ownItems || [];

        const item = items.find(i => String(i.id) === String(id));

        if (!item) {
            console.warn('[Pages] item not found');
            return;
        }

        // ---- 1. External link card ----
        const externalUrl = typeof item.url === 'string' ? item.url.trim() : '';
        if (externalUrl) {
            console.log('[Pages] _openArticle() external url:', externalUrl);
            window.location.href = externalUrl;
            return;
        }

        // ---- 2. Regular page — open the internal editor ----
        if (!item.datetime) {
            console.warn('[Pages] item has no datetime');
            return;
        }

        const date = this._formatDate(item.datetime);
        const time = this._formatTime(item.datetime);

        const baseUrl = window.coreEngine?.baseUrl || '/core/engine/default';

        const url = this.navId != null
            ? `${baseUrl}/page/${this.navId}/${date}/${time}`
            : `${baseUrl}/page/${date}/${time}`;

        console.log('[Pages] _openArticle() navigating to:', url);

        window.location.href = url;
    }

    // ============================================
    // RELOAD
    // ============================================

    /**
     * Reload the list for the CURRENT folder level.
     *
     * Called by BaseCards via onReload after folder navigation
     * (_openFolder / _goUp) and by other actions (create / delete).
     *
     * At this point `this.cardsInstance.parentId` already reflects
     * the new level:
     *   - `_openFolder(id)` sets parentId = id, then calls onReload;
     *   - `_goUp()` pops the history and sets parentId, then calls
     *     onReload.
     *
     * So `_loadFromServer` picks up the right parent_id from
     * `this.cardsInstance.parentId` — see its docstring.
     */
    async _reload() {
        console.log('[Pages] _reload()');

        const prevCount = (this.cardsInstance?.props?.items
                        || this.props.items
                        || []).length;

        await this._loadFromServer();

        if (this._canEdit()) {
            await this._loadTemplates();
        }

        if (this.cardsInstance) {
            await this.cardsInstance.updateProps({
                items: this.props.items,
                isLoading: false,
                error: null,
                widgetStatus: `${this.props.items.length} статей`,
            });
        }

        const newCount = (this.props.items || []).length;

        this._updateEmptyHint();
        this._updateCardActionsHint(prevCount, newCount);

        this._lastItemCount = newCount;
    }

    // ============================================
    // UTILITIES
    // ============================================

    _nextArticleNumber(items) {
        let max = 0;

        for (const item of items) {
            const title = String(item.title || '');
            const m = title.match(/^Статья\s+(\d+)/i);
            if (m) {
                const num = parseInt(m[1], 10);
                if (num > max) max = num;
            }
        }

        return max + 1;
    }

    _canEdit() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;

        if (typeof auth.isAuth === 'function' && auth.isAuth()) {
            return true;
        }
        if (typeof auth.isAuthenticated === 'boolean' && auth.isAuthenticated) {
            return true;
        }
        if (typeof auth.getUser === 'function') {
            return auth.getUser() != null;
        }
        return false;
    }

    _isSuperadmin() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;

        if (typeof auth.isSuperadmin === 'function') {
            return !!auth.isSuperadmin();
        }
        if (typeof auth.getUser === 'function') {
            const user = auth.getUser();
            if (!user) return false;
            const v = user.is_superadmin;
            return v === true || v === 1 || v === "1";
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

        if (this._title) {
            this._title.restoreCaption();
            this._title = null;
        }

        if (this._onTitleBtnClick) {
            const btn = document.querySelector('.js-open-title-modal');
            if (btn) btn.removeEventListener('click', this._onTitleBtnClick);
        }
        this._onTitleBtnClick = null;

        if (this._emptyHint) {
            this._emptyHint.remove();
            this._emptyHint = null;
        }
        if (this._cardHint) {
            this._cardHint.remove();
            this._cardHint = null;
        }

        if (this.cardsInstance?.destroy) {
            this.cardsInstance.destroy();
        }
        this.cardsInstance = null;
        this._initialized = false;
        this._initPromise = null;
    }
}