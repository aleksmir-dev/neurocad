// neurocad/core/engine/lib/base/profile/domain/domain.js

/**
 * BaseProfileDomain — domain management page.
 *
 * Rendered into area-center by Base.showProfile('domain').
 *
 * Six blocks:
 *   1. Free subdomain — clickable link <login>.<APP_DOMAIN> + copy
 *      button + "Редактировать robots.txt" (data-which="3").
 *   2. Home page — select from the user's pages + Save / Reset.
 *   3. Custom domain — either input + "Подключить" or the current
 *      domain as a clickable link + status badge + copy button +
 *      "Редактировать robots.txt" (data-which="2") + "Отключить".
 *   4. Sitemap — read-only block; opens the generated sitemap.xml
 *      in a modal.
 *   5. Legal — Policy / Rules editors. Two editable markdown
 *      documents, each with a state badge and an "Редактировать"
 *      button (data-which="policy" / "rules"); opens the shared
 *      legal modal (see ./modal/legal/legal.js, opened from
 *      ./modals.js → openLegalModal).
 *
 * MODULE LAYOUT
 * -------------
 * This page grew enough that keeping everything in one file became
 * a maintenance problem. It is now split as:
 *
 *   domain.js    — this file: the BaseProfileDomain class, which
 *                  orchestrates lifecycle, render, bindEvents and
 *                  destroy. It only composes; it does not implement
 *                  the details.
 *
 *   cards.js     — makeCards(helpers) returns six render functions
 *                  (subdomain / home / custom / add-result / sitemap /
 *                  legal). Pure HTML-string builders.
 *
 *   actions.js   — submitAdd / submitRemove / submitHomeSave /
 *                  submitHomeClear. HTTP calls + UI state transitions.
 *
 *   modals.js    — openRobotsModal / openSitemapModal /
 *                  openLegalModal. Lazy import + open; one instance
 *                  per page. This file stays at the top level: it is
 *                  the bridge between this page and the modals, not
 *                  a page and not a modal itself.
 *
 *   helpers.js   — fullUrl / escapeAttr / statusBadge /
 *                  copyToClipboard. Stateless utilities.
 *
 *   domain.css   — styles for this page.
 *
 *   modal/robots/robots.js    — RobotsModal (separate).
 *   modal/robots/robots.css   — styles for RobotsModal.
 *   modal/sitemap/sitemap.js  — SitemapModal (read-only).
 *   modal/sitemap/sitemap.css — styles for SitemapModal.
 *   modal/legal/legal.js      — LegalModal (policy / rules editor).
 *   modal/legal/legal.css     — styles for LegalModal.
 *
 * IMPORT STYLE
 * ------------
 * Every module in this project is loaded with a `?v=<static_version>`
 * cache-buster. Static `import { X } from './cards.js'` would pin the
 * URL without a version and browsers would keep serving the pre-deploy
 * copy after an update. So all four sibling modules are imported
 * dynamically inside _init(), in parallel:
 *
 *     const [cards, actions, modals, helpers] = await Promise.all([
 *         import(`./cards.js?v=${version}`),
 *         import(`./actions.js?v=${version}`),
 *         import(`./modals.js?v=${version}`),
 *         import(`./helpers.js?v=${version}`),
 *     ]);
 *
 * The resolved namespaces are stored on the instance:
 *
 *     this._cards   = cards.makeCards(helpers);  // factory → object
 *     this._actions = actions;                   // namespace
 *     this._modals  = modals;                    // namespace
 *     this._helpers = helpers;                   // namespace
 *
 * render() and bindEvents() then use this._cards / this._actions /
 * this._modals / this._helpers. Nothing else is imported at the top
 * of this file.
 *
 * URL scheme: every domain is shown as a full URL (https://...) —
 * both as href on the <a> and as the payload of the copy button.
 *
 * robots.txt: one modal serves both subdomain and custom-domain
 * blocks (data-which="2" or "3"); on save it POSTs to /domain/robots
 * and calls onSaved() so we can update robots_2 / robots_3 without a
 * full reload.
 *
 * sitemap.xml: a SEPARATE read-only modal. Nothing is stored — the
 * file is generated on the fly from the `pages` table.
 *
 * policy / rules: one shared modal serves both documents
 * (data-which="policy" or "rules"); on save it POSTs to /domain/legal
 * and calls onSaved() so we can update the local state without a
 * full reload.
 *
 * API:
 *   GET    /core/engine/lib/base/profile/domain/
 *   POST   /core/engine/lib/base/profile/domain/add
 *   DELETE /core/engine/lib/base/profile/domain/remove
 *   POST   /core/engine/lib/base/profile/domain/home
 *   DELETE /core/engine/lib/base/profile/domain/home
 *   POST   /core/engine/lib/base/profile/domain/robots
 *   POST   /core/engine/lib/base/profile/domain/legal
 *   GET    /core/engine/lib/base/profile/domain/sitemap
 *
 * Uses window.coreEngine.fetchJson.
 *
 * Props:
 *   - section        {string}   — 'domain'
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved
 *   - restoreCaption {Function} — (saved) => void
 *   - onNavigate     {Function} — (section) => void
 */
export class BaseProfileDomain {
    constructor(options = {}) {
        console.log('[BaseProfileDomain] Constructor called');

        this.options = options;
        this.section = options.section || 'domain';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;
        this._savedCaption = null;

        // Loaded from the server.
        this.data = null;

        // UI state (read by cards.js via the state object passed to
        // renderHomeCard / renderCustomCard).
        this._submitting = false;
        this._lastError = null;
        this._lastAddInfo = null; // { domain, dns_ok, caddy_available, server_ip, message }

        // Home page UI state.
        this._homeSaving = false;
        this._homeError = null;
        this._homeSaved = false;

        // Modal instances (created lazily on first open, stored here
        // so modals.js can reuse them).
        this._robotsModal = null;
        this._sitemapModal = null;
        this._legalModal = null;

        // Sibling modules, filled in _init(). Until then, render()
        // and bindEvents() must not be called — and they are not:
        // _rerender() is only ever reached from _reload(), which is
        // called by action handlers that run long after _init().
        this._cards = null;
        this._actions = null;
        this._modals = null;
        this._helpers = null;

        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    async _init() {
        console.log('[BaseProfileDomain] _init() START');
        try {
            // ---- Load sibling modules (dynamic, cache-busted) ----
            const version = window.coreEngine?.static_version || Date.now();

            const [cards, actions, modals, helpers] = await Promise.all([
                import(`./cards.js?v=${version}`),
                import(`./actions.js?v=${version}`),
                import(`./modals.js?v=${version}`),
                import(`./helpers.js?v=${version}`),
            ]);

            // cards.js is a FACTORY — it takes helpers and returns
            // an object with six render functions closed over them.
            // The other three are plain namespaces.
            this._cards   = cards.makeCards(helpers);
            this._actions = actions;
            this._modals  = modals;
            this._helpers = helpers;

            // ---- Load the page data ----
            await this._load();

            this._initialized = true;
            console.log('[BaseProfileDomain] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseProfileDomain] Init error:', error);
            this._initialized = false;
        }
    }

    _loadCSS() {
        console.log('[BaseProfileDomain] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            // Page styles — this file's own CSS lives right next to it.
            window.coreEngine.loadCSS('core/engine/lib/base/profile/domain/domain.css');

            // Modal styles — each modal lives in its own subfolder
            // under ./modal/. Preloading them here means the styles
            // are already in the DOM by the time the user opens a
            // modal, so there is no flash of unstyled content on the
            // first open. The modals themselves also load their own
            // CSS defensively (see modal/robots/robots.js →
            // _loadCSS, etc.), so a direct open without this
            // preload still works.
            window.coreEngine.loadCSS('core/engine/lib/base/profile/domain/modal/robots/robots.css');
            window.coreEngine.loadCSS('core/engine/lib/base/profile/domain/modal/sitemap/sitemap.css');
            window.coreEngine.loadCSS('core/engine/lib/base/profile/domain/modal/legal/legal.css');
        }
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/base/profile/domain';
    }

    async _load() {
        console.log('[BaseProfileDomain] _load()');
        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(`${this._apiBase}/`);
        this.data = json.data || null;
        console.log('[BaseProfileDomain] Loaded:', this.data);
    }

    async _reload() {
        try {
            await this._load();
        } catch (err) {
            console.error('[BaseProfileDomain] Reload error:', err);
        }
        this._rerender();
    }

    _rerender() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        const newEl = this.render();
        const container = document.querySelector('.core-engine-lib-base-area-center');
        if (container) {
            container.appendChild(newEl);
            this.bindEvents(newEl);
        }
    }

    // ============================================
    // RENDER
    // ============================================

    /**
     * Build the whole page: titlebar + scroll container with the six
     * blocks. Delegates each block to this._cards.* — see ./cards.js.
     *
     * The state object passed to renderHomeCard / renderCustomCard
     * carries the transient flags they read. Adding a new flag
     * later = one more key here, one more destructure there.
     */
    render() {
        console.log('[BaseProfileDomain] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Домены', 'Управление доменами');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-profile-domain';

        if (!this.data) {
            wrapper.innerHTML = `
                <div class="domain-body">
                    <div class="domain-error">
                        <div class="domain-error-icon">❌</div>
                        <div class="domain-error-text">Не удалось загрузить данные</div>
                        <button type="button" class="domain-btn" data-action="back">Назад</button>
                    </div>
                </div>
            `;
            this.element = wrapper;
            return wrapper;
        }

        const cardsState = {
            submitting: this._submitting,
            lastError: this._lastError,
            homeSaving: this._homeSaving,
            homeError: this._homeError,
            homeSaved: this._homeSaved,
        };

        wrapper.innerHTML = `
            <div class="domain-body">

                <div class="domain-titlebar">
                    <div class="domain-titlebar-left"></div>
                    <div class="domain-titlebar-title">Управление доменами</div>
                    <div class="domain-titlebar-right">
                        <button type="button" class="domain-icon-btn" data-action="close" title="Закрыть">
                            <span aria-hidden="true">✕</span>
                        </button>
                    </div>
                </div>

                <div class="domain-scroll">
                    ${this._cards.renderSubdomainCard(this.data)}
                    ${this._cards.renderHomeCard(this.data, cardsState)}
                    ${this._cards.renderCustomCard(this.data, cardsState)}
                    ${this._cards.renderAddResultBlock(this._lastAddInfo)}
                    ${this._cards.renderSitemapCard(this.data)}
                    ${this._cards.renderLegalCard(this.data)}
                </div>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    // ============================================
    // EVENTS
    // ============================================

    /**
     * Bind every event handler for the current page root.
     *
     * Handlers are thin: they call into this._actions.* / this._modals.*
     * / this._helpers.* — the actual work lives in the sibling modules.
     */
    bindEvents(container) {
        console.log('[BaseProfileDomain] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        // Close / back
        const closeBtn = root.querySelector('[data-action="close"], [data-action="back"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof this.onNavigate === 'function') {
                    this.onNavigate('main');
                }
            });
        }

        // Copy links (any data-action="copy-link" button)
        root.querySelectorAll('[data-action="copy-link"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-copy') || '';
                this._helpers.copyToClipboard(btn, text);
            });
        });

        // Add custom domain
        const addBtn = root.querySelector('[data-action="add-domain"]');
        if (addBtn) {
            addBtn.addEventListener('click', () => this._actions.submitAdd(this, root));
        }

        // Enter in the domain input submits the form
        const input = root.querySelector('[data-js="domain-input"]');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._actions.submitAdd(this, root);
                }
            });
        }

        // Remove custom domain
        const removeBtn = root.querySelector('[data-action="remove-domain"]');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this._actions.submitRemove(this));
        }

        // Edit robots.txt — there may be up to two such buttons on
        // the page: one in the subdomain card (data-which="3"), one
        // in the custom-domain card (data-which="2"). Bind them all.
        root.querySelectorAll('[data-action="edit-robots"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const which = btn.getAttribute('data-which') || '2';
                this._modals.openRobotsModal(this, which);
            });
        });

        // View sitemap.xml (read-only). There is exactly one such
        // button on the page, but we use querySelectorAll so that
        // adding a second entry point later is trivial.
        root.querySelectorAll('[data-action="view-sitemap"]').forEach((btn) => {
            btn.addEventListener('click', () => this._modals.openSitemapModal(this));
        });

        // Edit legal texts (Policy / Rules). Up to two such buttons:
        // one in the legal card's "Политика" row (data-which="policy"),
        // one in the "Правила" row (data-which="rules").
        root.querySelectorAll('[data-action="edit-legal"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const which = btn.getAttribute('data-which') || 'policy';
                this._modals.openLegalModal(this, which);
            });
        });

        // ---- Home page: save ----
        const homeSave = root.querySelector('[data-action="home-save"]');
        if (homeSave) {
            homeSave.addEventListener('click', () => this._actions.submitHomeSave(this, root));
        }

        // ---- Home page: clear ----
        const homeClear = root.querySelector('[data-action="home-clear"]');
        if (homeClear) {
            homeClear.addEventListener('click', () => this._actions.submitHomeClear(this));
        }
    }

    // ============================================
    // PUBLIC
    // ============================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[BaseProfileDomain] destroy()');

        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        // Close the robots modal if it is open. destroy() is safe to
        // call even if the modal was never created.
        if (this._robotsModal) {
            try {
                if (typeof this._robotsModal.destroy === 'function') {
                    this._robotsModal.destroy();
                }
            } catch (e) {
                console.warn('[BaseProfileDomain] robotsModal.destroy error:', e);
            }
            this._robotsModal = null;
        }

        // Close the sitemap modal if it is open — same safety as
        // for the robots modal.
        if (this._sitemapModal) {
            try {
                if (typeof this._sitemapModal.destroy === 'function') {
                    this._sitemapModal.destroy();
                }
            } catch (e) {
                console.warn('[BaseProfileDomain] sitemapModal.destroy error:', e);
            }
            this._sitemapModal = null;
        }

        // Close the legal modal if it is open — same safety as for
        // the robots and sitemap modals.
        if (this._legalModal) {
            try {
                if (typeof this._legalModal.destroy === 'function') {
                    this._legalModal.destroy();
                }
            } catch (e) {
                console.warn('[BaseProfileDomain] legalModal.destroy error:', e);
            }
            this._legalModal = null;
        }

        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
        this._submitting = false;
        this._lastError = null;
        this._lastAddInfo = null;
        this._homeSaving = false;
        this._homeError = null;
        this._homeSaved = false;
    }
}