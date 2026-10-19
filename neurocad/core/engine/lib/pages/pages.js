// app/core/engine/lib/pages/pages.js

/**
 * Pages component — article catalog.
 * Thin wrapper around BaseCards.
 *
 * If items are not passed in props, loads the list from the server.
 * HTTP goes through window.coreEngine.fetchJson (loaded once by
 * CoreEngine.loadApi()).
 *
 * Structure
 * ---------
 * This file is an ORCHESTRATOR. The heavy lifting is split into
 * sibling modules, loaded dynamically with ?v=<version>:
 *
 *   ./utils.js      — apiUrl, canEdit, isSuperadmin, formatDate,
 *                     formatTime, nextArticleNumber,
 *                     patchPayloadNormalization, confirm, message
 *   ./loader.js     — loadFromServer, loadTemplates, loadCreatives,
 *                     loadPublicPagesUrl
 *   ./fields.js     — buildFields({ templates, creatives, makeLogoGeneratorButton })
 *   ./card.js       — renderArticleCard, renderUpCard (pure HTML)
 *   ./copy.js       — copySelected (works on the current selection)
 *   ./move.js       — moveSelected (works on exactly one item)
 *   ./logo.js       — makeLogoGeneratorButton (media field button)
 *   ./title.js      — PagesTitle (header caption + "Заголовок" modal)
 *   ./statusbar.js  — PagesStatusbar (titlebar text + breadcrumbs
 *                     path + mobile-hide of the statusbar)
 *   ./hint.js       — EmptyArticlesHint, CardActionsHint
 *
 * Pages itself keeps only:
 *   - state (navId, page list, templates, creatives, public URL),
 *   - wiring of loaders (_init / _reload),
 *   - navigation (_openArticle),
 *   - sub-module callbacks (copy / move / title / statusbar).
 *
 * No static imports — every dependency is resolved lazily at call
 * time with a ?v=<version> query. This matches the rest of the
 * project.
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
 * Opt-in via `folders: true` on BaseCards. The navigation (open
 * folder / go up / ".." pseudo-card) is handled entirely by
 * BaseCards — see base/cards/cards.js and base/cards/render.js.
 *
 *   - card_type on a page is either "page" or "folder".
 *   - parent_id is the folder the item lives in (null — root).
 *   - BaseCards appends ?parent_id=<id> to the list request when a
 *     folder is open, prepends "..", and groups folders before
 *     pages.
 *
 * COPY / MOVE
 * -----------
 * Opt-in via showCopyButton / showMoveButton. Copy works on the
 * current selection (forwarded to copy.js), Move — on exactly one
 * item (forwarded to move.js).
 *
 * Permissions
 * -----------
 *   - Guests: read-only catalog view (no toolbar).
 *   - Authenticated users: full toolbar — add, edit, delete, copy,
 *     move, restore, create folder.
 *
 * External link cards
 * -------------------
 * A page may carry an external `url`. When set, the card is a link
 * card — clicking navigates to that URL in the CURRENT tab,
 * instead of opening the internal editor. Folders are unaffected —
 * BaseCards intercepts folder clicks before they reach Pages.
 *
 * Template / creative / publication
 * ---------------------------------
 * All three concerns are declared as form fields in ./fields.js
 * and handled transparently by the backend when the page is saved:
 *
 *   - is_template  — the page can be used as a base template.
 *   - template_id  — inherit layout from another page.
 *   - creative_id  — attach a creative (creates/keeps an active
 *                    placement row; clearing it closes the
 *                    placement).
 *   - is_active    — publish checkbox (last field, on by default).
 *
 * Widget chrome (titlebar / statusbar)
 * ------------------------------------
 * BaseCards ships with both bars hidden by default. Pages turns
 * both on (showTitlebar / showStatusbar) and delegates their
 * contents to PagesStatusbar:
 *
 *   - titlebar   — name of the currently-open folder, or the nav
 *                  name at the root.
 *   - statusbar  — breadcrumb path from the root:
 *                    <nav name> / <folder> / <subfolder>
 *                  Hidden below 768px via matchMedia.
 *
 * Chrome sync order (important!)
 * ------------------------------
 * PagesStatusbar.sync(parentId, items) reconciles the breadcrumb
 * trail with the CURRENT parentId. When the user opens a folder,
 * the folder itself is one of the CURRENT items (the list we are
 * about to leave) — NOT one of the items we are about to fetch.
 * The new items are the CHILDREN of that folder, so they do not
 * contain the folder's own title.
 *
 * Therefore sync() MUST run BEFORE loadFromServer(): it needs to
 * see the folder in the old items list to push its title onto the
 * trail. Running it after the fetch (the old, broken order) always
 * looked up an id that was not in the freshly-loaded list and the
 * trail stayed at the root.
 *
 * On _goUp the same order works: the target folder is already
 * higher up in the trail, so sync() just truncates the stack — no
 * lookup in the items list is needed.
 *
 * Onboarding hints
 * ----------------
 * EmptyArticlesHint and CardActionsHint (see ./hint.js), stored
 * per-browser in localStorage.
 *
 * Caption
 * -------
 * PagesTitle loads Nav.name and sets it as the header/tab caption.
 * On destroy() it restores the previous caption.
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
        // Only loaded when the user can edit pages.
        this._creatives = [];

        // Caption helpers — filled from window.coreEngine.base in _init().
        this._setCaption = null;
        this._restoreCaption = null;

        // Title helper — owns Nav.name loading, the "Заголовок" modal
        // and saving. Created in _init().
        this._title = null;

        // Statusbar helper — owns the titlebar text, the breadcrumb
        // path and the mobile visibility of the statusbar. Created
        // in _init().
        this._statusbar = null;

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
        this._utils  = null;   // utils.js
        this._loader = null;   // loader.js
        this._card   = null;   // card.js
        this._copy   = null;   // copy.js
        this._move   = null;   // move.js

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
                { PagesStatusbar },
                { EmptyArticlesHint, CardActionsHint },
                { buildFields },
                loaderMod,
                utilsMod,
                cardMod,
                copyMod,
                moveMod,
            ] = await Promise.all([
                import(`../base/cards/cards.js?v=${version}`),
                import(`./logo.js?v=${version}`),
                import(`./title.js?v=${version}`),
                import(`./statusbar.js?v=${version}`),
                import(`./hint.js?v=${version}`),
                import(`./fields.js?v=${version}`),
                import(`./loader.js?v=${version}`),
                import(`./utils.js?v=${version}`),
                import(`./card.js?v=${version}`),
                import(`./copy.js?v=${version}`),
                import(`./move.js?v=${version}`),
            ]);

            this._utils  = utilsMod;
            this._loader = loaderMod;
            this._card   = cardMod;
            this._copy   = copyMod;
            this._move   = moveMod;

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

            // Statusbar helper — owns the titlebar text, the
            // breadcrumb path and the mobile visibility of the
            // statusbar. Bound to BaseCards later, in _init().
            this._statusbar = new PagesStatusbar();

            // Onboarding hints.
            this._EmptyArticlesHint = EmptyArticlesHint;
            this._CardActionsHint = CardActionsHint;
            this._emptyHint = new EmptyArticlesHint();
            this._cardHint = new CardActionsHint();

            const canEdit = this._utils.canEdit();

            // If items are not passed in props — load from server.
            if (!this.props.items || this.props.items.length === 0) {
                console.log('[Pages] items empty — loading from server');
                await this._loader.loadFromServer(this);
            }

            // Load templates list (for "Наследовать от" dropdown).
            if (canEdit) {
                await this._loader.loadTemplates(this);
            }

            // Load creatives list (for "Креатив" dropdown).
            if (canEdit) {
                await this._loader.loadCreatives(this);
            }

            // Public catalog URL — must be loaded BEFORE BaseCards is
            // constructed so extraToolbarButtons already carries the
            // final href.
            await this._loader.loadPublicPagesUrl(this);

            // Set header/tab title from Nav.name.
            await this._title.loadCaption();

            this.cardsInstance = new BaseCards(this.container, {
                items: this.props.items || [],
                isLoading: this.props.isLoading || false,
                error: this.props.error || null,

                // ===== WIDGET CHROME =====
                // Both bars are hidden by default on BaseCards.
                // Pages is the consumer that turns them on.
                showTitlebar: true,
                showStatusbar: true,

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
                // The field list lives in ./fields.js — pure data,
                // no logic. buildFields() only wires the two dynamic
                // dropdowns (template_id, creative_id) to the arrays
                // loaded above.
                fields: buildFields({
                    templates: () => this._templates,
                    creatives: () => this._creatives,
                    makeLogoGeneratorButton,
                }),

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
                //
                // cardOptions:
                //   customClass  — outer card class (pages-card-wrapper).
                //   contentClass — inner .card-content wrapper class.
                //                  We pass --centered so the folder
                //                  and ".." cards center their tile
                //                  (icon + label) inside the card.
                renderCard: (item) => this._card.renderArticleCard(item),
                renderUpCard: () => this._card.renderUpCard(),
                cardOptions: {
                    customClass: 'pages-card-wrapper',
                    contentClass: 'card-content-custom--centered',
                },

                // Click → open (folders and ".." are intercepted by
                // BaseCards before this handler).
                onItemClick: (id) => this._openArticle(id),

                // Callbacks
                onReload: () => this._reload(),
                onRetry: () => this._reload(),

                widgetTitle: this._title.getNavName() || 'Каталог статей',
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

            // Widget chrome — bind the statusbar helper to BaseCards
            // and paint the first titlebar + breadcrumb frame.
            // At this point parentId is null (root), so sync() only
            // seeds the root crumb — no folder lookup needed.
            this._statusbar.init(this.cardsInstance, this._title.getNavName());
            this._statusbar.sync(this.cardsInstance.parentId, this.props.items);
            this._statusbar.render();

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
     * Chrome first, then fetch — see "Chrome sync order" in the
     * class docstring. The breadcrumb trail is reconciled BEFORE
     * the new items arrive, because the folder the user just opened
     * lives in the OLD list (it is one of the children of the
     * previous parent). After loadFromServer() that folder is gone
     * from props.items — the new list is its own children.
     *
     * Order:
     *   1. statusbar.sync(parentId, old items) — push/truncate trail;
     *   2. loadFromServer() — fetch new items for parentId;
     *   3. loadTemplates() / loadCreatives() — refresh dropdowns;
     *   4. updateProps() — re-render the grid with the new items;
     *   5. statusbar.render() — paint titlebar + trail with the
     *      updated state (titlebar shows the last crumb, which is
     *      the folder we just entered).
     */
    async _reload() {
        console.log('[Pages] _reload()');

        const prevCount = (this.cardsInstance?.props?.items
                        || this.props.items
                        || []).length;

        // ---- 1. Chrome FIRST: sync trail against the OLD items.
        // The folder the user just opened is in props.items (it was
        // rendered as a card one level up). After the next line it
        // will be replaced by the folder's own children, and the
        // lookup would fail.
        if (this._statusbar) {
            this._statusbar.updateNavName(this._title?.getNavName());
            this._statusbar.sync(this.cardsInstance?.parentId, this.props.items);
        }

        // ---- 2. Fetch the new items for the current parentId.
        await this._loader.loadFromServer(this);

        // ---- 3. Refresh the dropdown sources.
        if (this._utils.canEdit()) {
            await this._loader.loadTemplates(this);
            await this._loader.loadCreatives(this);
        }

        // ---- 4. Push the new items into the grid.
        if (this.cardsInstance) {
            await this.cardsInstance.updateProps({
                items: this.props.items,
                isLoading: false,
                error: null,
                widgetStatus: `${this.props.items.length} статей`,
            });
        }

        // ---- 5. Paint the chrome with the freshly-synced trail.
        if (this._statusbar) {
            this._statusbar.render();
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

        if (this._statusbar) {
            this._statusbar.destroy();
            this._statusbar = null;
        }

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