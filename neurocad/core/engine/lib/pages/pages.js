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
 * Structure
 * ---------
 * This file is an ORCHESTRATOR. The heavy lifting is split into
 * sibling modules, loaded dynamically with ?v=<version>:
 *
 *   ./utils.js   — apiUrl, canEdit, isSuperadmin, formatDate,
 *                  formatTime, nextArticleNumber,
 *                  patchPayloadNormalization, confirm, message
 *   ./card.js    — renderArticleCard, renderUpCard (pure HTML)
 *   ./copy.js    — copySelected (works on the current selection)
 *   ./move.js    — moveSelected (works on exactly one item)
 *   ./logo.js    — makeLogoGeneratorButton (media field button)
 *   ./title.js   — PagesTitle (header caption + "Заголовок" modal)
 *   ./hint.js    — EmptyArticlesHint, CardActionsHint
 *
 * Pages itself keeps only:
 *   - state (navId, page list, templates, creatives, public URL),
 *   - loading from server (_loadFromServer, _loadTemplates,
 *     _loadCreatives),
 *   - navigation (_openArticle),
 *   - wiring sub-modules into BaseCards callbacks.
 *
 * No static imports — every dependency is resolved lazily at call
 * time. This matches the rest of the project.
 *
 * NAV_ID
 * ------
 * Requests may carry ?nav_id=<props.nav_id>. This scopes the
 * catalog to a specific nav instance. When omitted, the backend
 * resolves the nav from the authenticated user's session (first
 * nav by id ASC). So nav_id is optional here — pass it only when a
 * specific nav must be targeted.
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
 *       * provide the render callbacks (see card.js):
 *           - pages   → renderArticleCard
 *           - folders → renderArticleCard
 *           - ".."    → renderUpCard
 *
 * The button "Создать папку" (showFolderButton) lives in the toolbar
 * and is wired by BaseCards through `onAddFolder`.
 *
 * COPY
 * ----
 * Opt-in via `showCopyButton`. Works on the current selection.
 * Forwarded to copy.js → copySelected(pages, ids).
 *
 * MOVE
 * ----
 * Opt-in via `showMoveButton`. Works on EXACTLY ONE selected item
 * (same rule as Edit). Forwarded to move.js → moveSelected(pages, id).
 *
 * Permissions
 * -----------
 *   - Guests: read-only catalog view (no toolbar).
 *   - Authenticated users: full toolbar — add, edit, delete, copy,
 *     move, restore, create folder.
 *
 * External link cards
 * -------------------
 * A page may carry an external `url`. When set, the card is a
 * "link card": clicking it navigates to that URL in the CURRENT
 * tab, instead of opening the internal editor. This does NOT apply
 * to folders — BaseCards intercepts folder clicks before they
 * reach Pages (see cards.js → _handleActivate).
 *
 * Template system
 * ---------------
 *   - is_template: page can be used as a base template by others.
 *   - template_id: this page inherits layout from that template;
 *     its own `content` is inserted into [data-slot="content"].
 *
 * Creative attachment
 * -------------------
 * A page may be linked to a creative. In the form, this is the
 * "Креатив" select (optional, above "Публиковать"). The chosen
 * creative id is sent as `creative_id` in the payload.
 *
 * On the backend, saving the page creates (or keeps) an active
 * placement row in the `placements` table, linking this page to
 * the chosen creative. Clearing the select (or setting
 * `is_active = 0`) closes the active placement (sets date_end).
 *
 * The field itself is NOT stored on the page — the placement is
 * the single source of truth. The list/response payloads carry
 * `creative_id` (read from the active placement) so the edit form
 * can pre-select the current creative.
 *
 * Publication
 * -----------
 * `is_active` is surfaced in the edit form as a "Публиковать"
 * checkbox (last field, on by default). When cleared, the page is
 * saved with is_active = 0. Whether that hides the page from the
 * public catalog depends on the public route/service — see
 * pages/public/.
 *
 * Onboarding hints
 * ----------------
 * Two independent hints (see ./hint.js), stored per-browser in
 * localStorage: EmptyArticlesHint and CardActionsHint.
 *
 * Caption
 * -------
 * On _init() we ask PagesTitle to load Nav.name and set it as the
 * header/tab title. On destroy(), PagesTitle restores the previous
 * caption.
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

        // Cached list of creatives, for the "Креатив" dropdown.
        // Only loaded when the user can edit pages. A creative is
        // offered as-is; the select shows "(неактивен)" next to
        // archived ones so the user understands why they are still
        // listed.
        this._creatives = [];

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

        // Sub-modules (loaded in _init).
        this._utils = null;   // utils.js
        this._card  = null;   // card.js
        this._copy  = null;   // copy.js
        this._move  = null;   // move.js

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
     * Thin wrapper around utils.apiUrl(pages, endpoint, extraQuery).
     *
     * Kept on Pages so existing call sites inside this file — and
     * PagesTitle's getApiUrl — keep working without changes.
     */
    _apiUrl(endpoint, extraQuery = '') {
        return this._utils.apiUrl(this, endpoint, extraQuery);
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

            // ---- Load all sub-modules in parallel ----
            const [
                { BaseCards },
                { makeLogoGeneratorButton },
                { PagesTitle },
                { EmptyArticlesHint, CardActionsHint },
                utilsMod,
                cardMod,
                copyMod,
                moveMod,
            ] = await Promise.all([
                import(`../base/cards/cards.js?v=${version}`),
                import(`./logo.js?v=${version}`),
                import(`./title.js?v=${version}`),
                import(`./hint.js?v=${version}`),
                import(`./utils.js?v=${version}`),
                import(`./card.js?v=${version}`),
                import(`./copy.js?v=${version}`),
                import(`./move.js?v=${version}`),
            ]);

            this._utils = utilsMod;
            this._card  = cardMod;
            this._copy  = copyMod;
            this._move  = moveMod;

            // Title helper — owns Nav.name loading, the "Заголовок"
            // modal and saving.
            this._title = new PagesTitle({
                navId: this.navId,
                getApiUrl: (endpoint, extraQuery) =>
                    this._apiUrl(endpoint, extraQuery),
            });
            this._title.setCaptionHelpers({
                setCaption: this._setCaption,
                restoreCaption: this._restoreCaption,
            });

            // Onboarding hints.
            this._EmptyArticlesHint = EmptyArticlesHint;
            this._CardActionsHint = CardActionsHint;
            this._emptyHint = new EmptyArticlesHint();
            this._cardHint = new CardActionsHint();

            const canEdit = this._utils.canEdit();

            // If items are not passed in props — load from server.
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items empty — loading from server');
                await this._loadFromServer();
            }

            // Load templates list (for "Наследовать от" dropdown).
            if (canEdit) {
                await this._loadTemplates();
            }

            // Load creatives list (for "Креатив" dropdown).
            if (canEdit) {
                await this._loadCreatives();
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
                folders: true,
                folderField: 'card_type',
                folderValue: 'folder',

                // ===== API =====
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
                        // Not user-editable — hidden via pages.css.
                        // Declared so its value is submitted.
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
                        // Not user-editable — hidden via pages.css.
                        // Declared so BaseCardsEdit.getData() submits it.
                        label: 'Родитель',
                        type: 'text',
                    },

                    // ===== Creative attachment =====
                    // Optional. When set, saving the page creates (or
                    // keeps) an active placement row on the backend;
                    // clearing it (or unchecking "Публиковать" below)
                    // closes the active placement.
                    //
                    // The select is populated from this._creatives,
                    // which is loaded in _init() / _reload() from
                    // /core/engine/lib/creatives/list. Inactive
                    // creatives are shown with a "(неактивен)"
                    // suffix so the user understands why a creative
                    // they archived is still selectable.
                    {
                        key: 'creative_id',
                        label: 'Креатив',
                        type: 'select',
                        valueType: 'number',
                        options: () => this._creatives.map(c => ({
                            value: c.id,
                            label: c.is_active
                                ? c.name
                                : `${c.name} (неактивен)`,
                        })),
                        placeholder: '— Без креатива —',
                    },

                    // ===== Publication =====
                    // Last field, by design: "Публиковать" is the
                    // final decision the user makes before saving.
                    // On by default for every new page.
                    {
                        key: 'is_active',
                        label: 'Публиковать',
                        type: 'checkbox',
                        default: 1,
                    },
                ],

                // ===== INITIAL DATA FOR "CREATE" FORM =====
                initialData: (cards) => {
                    const nextNum = this._utils.nextArticleNumber(cards.items || []);
                    return {
                        title: `Статья ${nextNum}`,
                        card_type: 'page',
                        is_template: 0,
                        template_id: null,
                        creative_id: null,
                        is_active: 1,
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

                // "Создать папку" — rendered by toolbar.js BEFORE "+".
                showFolderButton: canEdit,

                // "Копировать" — works on the current selection.
                showCopyButton: canEdit,
                onCopySelected: (ids) => this._copySelected(ids),

                // "Переместить" — works on EXACTLY ONE item.
                showMoveButton: canEdit,
                onMoveSelected: (id) => this._moveSelected(id),

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
                // Moved to ./card.js — pure functions, no state.
                renderCard: (item) => this._card.renderArticleCard(item),
                renderUpCard: () => this._card.renderUpCard(),
                cardOptions: { customClass: 'pages-card-wrapper' },

                // Click → open (folders and ".." are intercepted by
                // BaseCards before this handler).
                onItemClick: (id) => this._openArticle(id),

                // Callbacks
                onReload: () => this._reload(),
                onRetry: () => this._reload(),

                widgetTitle: 'Статьи',
                widgetStatus: `${this.props.items?.length || 0} статей`,
            });

            await this.cardsInstance._initPromise;

            // Normalize payload types before they hit the API.
            this._utils.patchPayloadNormalization(this);

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

        if (items.length === 0 && this._utils.canEdit()) {
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
    // LOAD FROM SERVER
    // ============================================

    /**
     * Load the list of items for the CURRENT folder level.
     *
     * `this.cardsInstance.parentId` is the source of truth:
     *   - null / undefined → `parent_id=` (empty) → backend returns
     *     ONLY the root level (parent_id IS NULL);
     *   - a real id        → `parent_id=<id>` → children of that
     *     folder.
     *
     * Before BaseCards exists (during the very first _init()),
     * `this.cardsInstance` is null — we send the empty parent_id,
     * which is correct: the catalog always opens at the root.
     */
    async _loadFromServer() {
        console.log('[Pages] _loadFromServer()');

        const parentId = this.cardsInstance?.parentId;

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

    /**
     * Load the list of creatives for the "Креатив" dropdown.
     *
     * Loaded from /core/engine/lib/creatives/list — the same
     * endpoint the Creatives admin page uses. Both active and
     * inactive creatives are returned. The select shows
     * "(неактивен)" next to archived ones, so the user can keep an
     * archived creative attached to a page without being confused
     * by its presence in the list.
     *
     * Called from _init() and _reload() — the latter so that a
     * creative created in another tab shows up on the next reload.
     */
    async _loadCreatives() {
        console.log('[Pages] _loadCreatives()');

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const result = await fetchJson('/core/engine/lib/creatives/list');

            if (result.success) {
                this._creatives = result.data || [];
                console.log('[Pages] Loaded creatives:', this._creatives.length);
            } else {
                console.warn('[Pages] Creatives response without success:', result);
                this._creatives = [];
            }
        } catch (error) {
            console.error('[Pages] Creatives load error:', error);
            this._creatives = [];
        }
    }

    // ============================================
    // NAVIGATION
    // ============================================

    /**
     * Open the clicked card.
     *
     * Called only for regular pages. BaseCards intercepts clicks on
     * folders and on the ".." pseudo-card BEFORE this handler.
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

        const date = this._utils.formatDate(item.datetime);
        const time = this._utils.formatTime(item.datetime);

        const baseUrl = window.coreEngine?.baseUrl || '/core/engine/default';

        const url = this.navId != null
            ? `${baseUrl}/page/${this.navId}/${date}/${time}`
            : `${baseUrl}/page/${date}/${time}`;

        console.log('[Pages] _openArticle() navigating to:', url);

        window.location.href = url;
    }

    // ============================================
    // COPY / MOVE — thin delegates
    // ============================================

    /**
     * Copy the selected items.
     *
     * Thin delegate to copy.js → copySelected(pages, ids). Kept here
     * so BaseCards callbacks stay one-liners and the debugger stack
     * shows a meaningful entry point.
     */
    async _copySelected(ids) {
        return this._copy.copySelected(this, ids);
    }

    /**
     * Move the single selected item.
     *
     * Thin delegate to move.js → moveSelected(pages, id).
     */
    async _moveSelected(id) {
        return this._move.moveSelected(this, id);
    }

    // ============================================
    // RELOAD
    // ============================================

    /**
     * Reload the list for the CURRENT folder level.
     *
     * Called by BaseCards via onReload after folder navigation
     * (_openFolder / _goUp) and by other actions (create / delete /
     * copy / move).
     *
     * Also reloads the templates and creatives lists — a template
     * or creative created in another tab should show up in the
     * dropdowns on the next reload, without a full page refresh.
     */
    async _reload() {
        console.log('[Pages] _reload()');

        const prevCount = (this.cardsInstance?.props?.items
                        || this.props.items
                        || []).length;

        await this._loadFromServer();

        if (this._utils.canEdit()) {
            await this._loadTemplates();
            await this._loadCreatives();
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