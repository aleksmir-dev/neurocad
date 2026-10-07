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
 * Permissions:
 *   - Guests: read-only catalog view (no toolbar).
 *   - Authenticated users (including superadmin): full toolbar —
 *     add, edit, delete, restore.
 *
 * External link cards:
 *   A page may carry an external `url` (pages.url). When set, the
 *   card is a "link card": clicking it navigates to that URL in
 *   the CURRENT tab, instead of opening the internal editor at
 *   /core/engine/<module>/page/<nav_id>/<date>/<time>. The editor
 *   itself is still reachable — the page keeps its own admin URL —
 *   the external url only changes where a catalog card click goes.
 *
 *   See _openArticle() for the exact branching.
 *
 * Template system:
 *   - is_template: page can be used as a base template by other pages.
 *   - template_id: this page inherits layout from that template page;
 *     its own `content` is inserted into [data-slot="content"] slot.
 *
 * Logo generation:
 *   The "logo" media field declares an `extraButtons` entry — the
 *   "Генерировать" button. Its onClick lives in logo.js and is loaded
 *   dynamically, like every other module here. BaseCardsEdit itself
 *   stays generic: it only renders the buttons and calls their
 *   onClick with a context object.
 *
 * Media sources:
 *   The "logo" field also declares `mediaSources` and `mediaSource`.
 *   The picker (BaseAssets) will show two tabs — «Медиатека» и
 *   «Логотипы» — and open on «Логотипы» by default. The user can
 *   still switch to «Медиатека» and pick any uploaded image.
 *
 * Extra toolbar buttons:
 *   In the toolbar's left group, after the standard buttons
 *   (add / edit / delete / restore), two link-buttons are rendered:
 *
 *     - «Заголовок» (title.svg) — opens a modal to edit Nav.name.
 *       The public catalog at /pages uses Nav.name as its title.
 *       The button is a plain <a href="#" class="js-open-title-modal">
 *       and its click is intercepted by a handler bound directly to
 *       the button (see _init) — not to this.container, because
 *       Pages is created in a staging <div style="display:none">
 *       that the renderer later replaces with the component's root
 *       element in .core-engine-lib-base-area-center.
 *
 *     - «Открыть каталог статей» (link.svg) — opens the public,
 *       JS-free catalog in a new tab.
 *
 *       The href is an ABSOLUTE URL pointing at the USER's public
 *       domain — see _loadPublicPagesUrl(). It must NOT be a
 *       relative "/pages": when the admin panel is impersonating
 *       another user from the ADMIN's host, a relative link would
 *       resolve against the admin's host (admin.<domain>/pages)
 *       instead of the user's domain (<login>.<domain>/pages or
 *       <custom-domain>/pages). The backend exposes the right
 *       base in profile/domain → `pages_url`.
 *
 *   Both are passed to BaseCards via `extraToolbarButtons` and
 *   rendered by toolbar.js in the LEFT group, last. Guests do not
 *   get either button — they already see the public catalog
 *   themselves.
 *
 * Title / Nav.name:
 *   Everything related to the catalog title — loading Nav.name for
 *   the caption, opening the "Заголовок" modal, saving it back — is
 *   in ./title.js (class PagesTitle). This file just creates one
 *   instance in _init() and calls its methods.
 *
 * Onboarding hints:
 *   Two independent hints (see ./hint.js), both stored per-browser
 *   in localStorage:
 *
 *     EmptyArticlesHint — when the catalog is empty. Points at the
 *       "+" button, explains how to create the first article.
 *
 *     CardActionsHint — after ANY card is created. Anchored to the
 *       newly created card. Explains right-click → «Редактировать»
 *       and double-click → open the article.
 *
 * Grid layout:
 *   Grid is defined in cards.css:
 *       grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
 *       grid-auto-rows: 220px
 *
 *   Cards are NOT less than 280px wide, and stretch to fill the row
 *   (no empty space on the right). The row height is fixed at 220px.
 *   We deliberately do NOT pass `listView.gridColumns` — an inline
 *   `grid-template-columns` would override the minmax() and break
 *   the stretch.
 *
 * Caption: on _init() we ask PagesTitle to load Nav.name and set it
 * as the header/tab title. On destroy(), PagesTitle restores the
 * previous caption.
 */

export class Pages {
    constructor(container, props = {}) {
        console.log('[Pages] Constructor', { container, props });

        this.container = container;
        this.props = props;

        // Nav instance this catalog belongs to. Comes from
        // <body data-nav-id="..."> via CoreEngine. If missing,
        // the backend resolves it from the session.
        this.navId = props.nav_id || null;

        this.cardsInstance = null;
        this._initialized = false;
        this._initPromise = null;

        // Cached list of templates (is_template=1), for the dropdown
        this._templates = [];

        // Caption helpers — filled from window.coreEngine.base in _init().
        this._setCaption = null;
        this._restoreCaption = null;

        // Title helper — owns Nav.name loading, the "Заголовок" modal
        // and saving. Created in _init().
        this._title = null;

        // Onboarding hints. Created in _init().
        this._emptyHint = null;    // empty-catalog tooltip
        this._cardHint = null;     // how-to-use-a-card tooltip

        // Last known item count — used to detect "a card was created"
        // between two _reload() calls (prevCount < newCount).
        this._lastItemCount = 0;

        // Bound click handler for the «Заголовок» button.
        // Kept on the instance so destroy() can remove it.
        this._onTitleBtnClick = null;

        // Absolute URL of the public catalog for the CURRENT user.
        // Defaults to a relative "/pages" so the button never ends
        // up without a href; real value is loaded in _init() from
        // profile/domain → `pages_url`.
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
     * Also used by PagesTitle (passed in as `getApiUrl`) so the
     * nav-name endpoints get the exact same ?nav_id= handling.
     */
    _apiUrl(endpoint, extraQuery = '') {
        const sep = endpoint.includes('?') ? '&' : '?';
        const navPart = this.navId != null
            ? `nav_id=${encodeURIComponent(this.navId)}`
            : '';
        const extra = extraQuery ? `&${extraQuery}` : '';

        // Avoid trailing "?" / "&" when both parts are empty.
        if (!navPart && !extra) return endpoint;
        if (!navPart) return `${endpoint}${sep}${extra}`;
        if (!extra) return `${endpoint}${sep}${navPart}`;
        return `${endpoint}${sep}${navPart}${extra}`;
    }

    /**
     * Load the ABSOLUTE public catalog URL for the current user
     * from `profile/domain` (`pages_url` field).
     *
     * Why this exists:
     *   The «Открыть каталог статей» button used to be `href: '/pages'`.
     *   That works when the panel runs on the user's own domain, but
     *   breaks when an admin impersonates a user from the ADMIN's
     *   host — the relative URL resolves against the admin host, not
     *   the user's public domain.
     *
     *   The backend already knows the user's login, custom domain,
     *   and APP_DOMAIN, so it returns a ready-made `pages_url`:
     *       https://<login>.<APP_DOMAIN>/pages
     *   or, if a 2nd-level custom domain is attached:
     *       https://<custom-domain>/pages
     *
     * Failure mode:
     *   If the request fails (network, endpoint missing), we keep
     *   the relative `/pages` fallback set in the constructor — the
     *   button still works, just not cross-domain. Logged at warn.
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

            // Logo generator button — used by the "logo" media field
            // below. Loaded dynamically, like every other module here.
            const { makeLogoGeneratorButton } = await import(
                `./logo.js?v=${version}`
            );

            // Title helper — owns Nav.name loading, the "Заголовок"
            // modal and saving it back. See ./title.js.
            const { PagesTitle } = await import(`./title.js?v=${version}`);
            this._title = new PagesTitle({
                navId: this.navId,
                getApiUrl: (endpoint, extraQuery) => this._apiUrl(endpoint, extraQuery),
            });
            this._title.setCaptionHelpers({
                setCaption: this._setCaption,
                restoreCaption: this._restoreCaption,
            });

            // Onboarding hints (both variants live in the same module).
            const { EmptyArticlesHint, CardActionsHint } = await import(
                `./hint.js?v=${version}`
            );
            this._EmptyArticlesHint = EmptyArticlesHint;
            this._CardActionsHint = CardActionsHint;
            this._emptyHint = new EmptyArticlesHint();
            this._cardHint = new CardActionsHint();

            const canEdit = this._canEdit();

            // If items are not passed in props — load from server
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items empty — loading from server');
                await this._loadFromServer();
            }

            // Load templates list (for "Наследовать от" dropdown)
            if (canEdit) {
                await this._loadTemplates();
            }

            // Public catalog URL — needed for the "Открыть каталог
            // статей" button. Must be loaded BEFORE BaseCards is
            // constructed so extraToolbarButtons already carries the
            // final href.
            await this._loadPublicPagesUrl();

            // Set header/tab title from Nav.name (falls back to the
            // generic "Каталог статей" inside PagesTitle.loadCaption).
            await this._title.loadCaption();

            this.cardsInstance = new BaseCards(this.container, {
                items: this.props.items || [],
                isLoading: this.props.isLoading || false,
                error: this.props.error || null,

                // API
                //
                // nav_id is put directly into each endpoint, not into
                // apiBase, because BaseCards appends endpoints to
                // apiBase and we don't want to guess how it handles
                // query strings. When navId is null, the backend
                // resolves the nav from the session.
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
                        // Picker sources: two tabs in BaseAssets.
                        // Opens on «Логотипы» by default, but the user
                        // can switch to «Медиатека» and pick any uploaded
                        // image.
                        mediaSources: ['media', 'logos'],
                        mediaSource: 'logos',
                        // Extra button: "Генерировать".
                        // Rendered between "Выбрать" и "Очистить".
                        // The behaviour lives in logo.js.
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
                        // Opt-in: values are numbers (page ids)
                        valueType: 'number',
                        // Function — evaluated on every form render, so the
                        // dropdown always shows the latest templates
                        // (including ones created after init, without
                        // a page reload).
                        options: () => this._templates.map(t => ({
                            value: t.id,
                            label: t.title,
                        })),
                        placeholder: '— Без шаблона —',
                    },
                ],

                // ===== INITIAL DATA FOR "CREATE" FORM =====
                initialData: (cards) => {
                    const nextNum = this._nextArticleNumber(cards.items || []);
                    return {
                        title: `Статья ${nextNum}`,
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

                // ===== EXTRA TOOLBAR BUTTONS =====
                //
                // Two link-buttons in the LEFT group of the toolbar,
                // AFTER the standard buttons (add / edit / delete /
                // restore) and BEFORE the selection counter.
                //
                //   1. «Заголовок» — opens a modal to edit Nav.name.
                //      The click is handled by _onTitleBtnClick,
                //      bound directly to the button in _init (see
                //      the comment there for why not this.container).
                //
                //   2. «Открыть каталог статей» — opens the public,
                //      JS-free catalog in a new tab.
                //
                //      href is an ABSOLUTE URL from profile/domain →
                //      `pages_url` (see _loadPublicPagesUrl). It MUST
                //      be absolute: a relative "/pages" would resolve
                //      against the ADMIN host when impersonating from
                //      the admin panel, sending the admin to
                //      admin.<domain>/pages instead of the user's
                //      <login>.<domain>/pages. See the class JSDoc.
                //
                // Guests do not get either button — they already
                // see the public catalog themselves, and an
                // admin-side link would be noise. See initool.js /
                // toolbar.js: the array is optional and empty by
                // default, so nothing else changes for other
                // consumers of BaseCards.
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

            // Normalize payload types before they hit the API.
            // BaseCardsEdit sends checkbox as boolean and empty select
            // as '', while the backend schema expects int (0/1) and null.
            // We patch the instance methods so cards.js and edit.js
            // stay untouched.
            this._patchPayloadNormalization();

            // Bind the «Заголовок» click handler directly to the
            // button rendered by toolbar.js.
            //
            // Why not this.container.addEventListener('click', ...):
            // Pages is created inside a staging <div style="display:
            // none">, and the renderer then moves the component's
            // root element into .core-engine-lib-base-area-center.
            // By the time the user can click the button, this.container
            // is already detached from the live DOM, so events never
            // reach it.
            //
            // Same pattern as BaseCardsToolbar._bindEvents: the
            // handler lives on the button, not on a parent.
            //
            // document.querySelector is fine here: js-open-title-modal
            // is unique on the page.
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

            // Remember the current item count so the first _reload()
            // can tell "created" from "unchanged".
            this._lastItemCount = (this.cardsInstance?.props?.items
                                || this.props.items
                                || []).length;

            // Show the empty-catalog hint if the catalog is empty.
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

    /**
     * Show or hide the empty-catalog hint based on the current item count.
     *
     * Shown when:
     *   - items array is empty;
     *   - the user can edit (has a "+" button in the toolbar);
     *   - the user has not chosen "never show again".
     *
     * Called from _init() (first paint) and _reload() (after create /
     * delete). The show() is deferred to the next tick so the toolbar
     * DOM node exists by the time we measure its position.
     */
    _updateEmptyHint() {
        if (!this._emptyHint) return;

        const items = this.cardsInstance?.props?.items
                   || this.props.items
                   || [];

        if (items.length === 0 && this._canEdit()) {
            // Defer so the toolbar (with the "+" button) is in the DOM.
            setTimeout(() => {
                if (this._emptyHint) this._emptyHint.show();
            }, 0);
        } else {
            this._emptyHint.hide();
        }
    }

    /**
     * Show the "how to use a card" hint right after a card is created.
     *
     * Trigger: previous item count < current item count. This fires
     * for ANY new card, not only the first one. It stays visible
     * until the user closes it, checks "never show again", or the
     * next catalog reload happens without a new card.
     *
     * Suppressed by its own localStorage flag — independent from the
     * empty-catalog hint.
     *
     * @param {number} prevCount — item count before the reload
     * @param {number} newCount  — item count after the reload
     */
    _updateCardActionsHint(prevCount, newCount) {
        if (!this._cardHint) return;

        const created = newCount > prevCount;

        if (!created) {
            // Nothing was created — do not show, but keep an already
            // visible hint (the user may still be reading it).
            return;
        }

        // A card was created — hide the empty-catalog hint if it was
        // still on screen, then show the card-actions hint.
        if (this._emptyHint) {
            this._emptyHint.hide();
        }

        // Give the grid a beat to render the new card, then anchor
        // the hint to it.
        setTimeout(() => {
            if (!this._cardHint) return;

            // Newest card is at the top of the grid (backend returns
            // items sorted by datetime desc). Fall back to the first
            // card in the DOM if the class name ever changes.
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
                        // text / textarea / media / date / time — as-is
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

    async _loadFromServer() {
        console.log('[Pages] _loadFromServer()');

        const url = this._apiUrl('/core/engine/lib/pages/list');
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

    /**
     * Load templates list (pages with is_template=1).
     */
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

    _renderArticleCard(item) {
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));

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

    // ============================================
    // NAVIGATION
    // ============================================

    /**
     * Open the clicked card.
     *
     * Two cases:
     *
     *   1. The page has an external `url` (link card).
     *      Navigate to that URL in the CURRENT tab. The card is
     *      used to point at an external site from inside the
     *      catalog, so a click should leave the panel and land on
     *      the target. The editor for this page is still reachable
     *      by opening its admin URL directly — `url` only changes
     *      what a card click does.
     *
     *   2. The page has no `url` (regular page).
     *      Navigate to the internal editor:
     *
     *        /core/engine/<module>/page/<nav_id>/<date>/<time>
     *
     *      Example:
     *        /core/engine/default/page/2/20260927/084039
     *
     *      Where:
     *        - <module>  — the current module
     *                      (window.coreEngine.baseUrl, e.g.
     *                      /core/engine/default). Its config lives
     *                      at app/<module>/<module>.json and
     *                      app/<module>/page.json.
     *        - "page"    — the module page
     *                      (app/<module>/page.json), which renders
     *                      the "word" component.
     *        - <nav_id>  — the first numeric segment; _parse_path
     *                      on the backend puts it into
     *                      paramsList[0]. Word uses it to scope the
     *                      page lookup.
     *        - <date>/<time> — the page's publication date and time.
     *
     *      When navId is null, the URL is still built — the
     *      backend resolves the nav from the session. The path
     *      shape stays the same.
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
        // If the page has an external url, follow it. Trim and
        // ignore whitespace-only values so a page that once had a
        // url and later was cleared (or set to spaces) behaves as
        // a regular page.
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

        // Base URL — the current module, e.g. /core/engine/default.
        const baseUrl = window.coreEngine?.baseUrl || '/core/engine/default';

        // Path: <module>/page/<nav_id>/<date>/<time>
        // nav_id is optional here; the backend resolves it from the
        // session when omitted. Keeping it explicit when known makes
        // the URL self-describing.
        const url = this.navId != null
            ? `${baseUrl}/page/${this.navId}/${date}/${time}`
            : `${baseUrl}/page/${date}/${time}`;

        console.log('[Pages] _openArticle() navigating to:', url);

        window.location.href = url;
    }

    // ============================================
    // RELOAD
    // ============================================

    async _reload() {
        console.log('[Pages] _reload()');

        // Remember the count BEFORE we reload — to detect a creation.
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

        // Update the empty-catalog hint after every reload.
        this._updateEmptyHint();

        // Show the card-actions hint if a card was just created.
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

    /**
     * Whether the current user can edit (add / update / delete / restore)
     * articles. Any authenticated user qualifies; guests do not.
     *
     * The check tries several auth shapes so it works regardless of
     * how BaseAuth exposes state:
     *   - auth.isAuth()      → boolean
     *   - auth.isAuthenticated → boolean
     *   - auth.getUser()     → user object or null
     */
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

    /**
     * Whether the current user is a superadmin.
     * Used only where superadmin-only behaviour is required.
     *
     * is_superadmin may come from the backend as bool, int (0/1)
     * or string ("0"/"1"), so all three are accepted.
     */
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

        // Restore the caption PagesTitle set on _init(). Done via the
        // helper so the saved value stays in one place.
        if (this._title) {
            this._title.restoreCaption();
            this._title = null;
        }

        // Remove the click handler bound to the «Заголовок» button.
        // The button itself is removed with the rest of the DOM, but
        // we drop the listener to avoid a leak if the same instance
        // of Pages is ever destroyed and re-created on the same page.
        if (this._onTitleBtnClick) {
            const btn = document.querySelector('.js-open-title-modal');
            if (btn) btn.removeEventListener('click', this._onTitleBtnClick);
        }
        this._onTitleBtnClick = null;

        // Remove both onboarding hints (if visible).
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