// app/core/engine/lib/word/word.js

/**
 * Word — page content display component.
 *
 * Orchestrator. Delegates work to submodules:
 *   data.js     — loadById, loadByParams, loadTemplateById
 *   view.js     — render, buildArticle, buildToolbarButtons, renderError
 *   actions.js  — setHeaderTitle, goBack, openPublicPage, saveContent, autoSaveContent
 *   bridge.js   — openEditor, closeEditor (GrapesJS editor)
 *   utils.js    — date formatting, safe JSON parse
 *
 * All submodules are loaded dynamically with a version to avoid
 * browser cache issues on updates.
 *
 * Scoping:
 *   Every word API request carries ?nav_id=<id>, which identifies
 *   the nav instance this page belongs to. The value comes from
 *   props.nav_id (injected by CoreEngine from <body data-nav-id>),
 *   with a fallback to window.coreEngine.navId / body dataset.
 *
 * Permissions:
 *   - Guests: read-only view of the page.
 *   - Any authenticated user (including superadmin): full toolbar
 *     (back / edit / public), editor, save.
 *
 * Caption: on _init() we pick up the shared caption helpers from
 * window.coreEngine.base (_setCaption / _restoreCaption). They are
 * used by actions.setHeaderTitle() to swap the header/tab title to the
 * page title, and by destroy() to restore whatever was there before.
 *
 * Effects: each effect is its own file under editor/effects/fx/,
 * loaded on every page — so that effects applied in the editor
 * (classes like .fx-shadow-top-n) render on the public page as well.
 * The list is fetched from GET /editor/effects (single source of
 * truth — effects/registry.json on the backend, served by the API).
 * Loading order matches the editor canvas:
 *   content.css → fx/*.css → blocks/*.css.
 *
 * Public API (to Renderer / Word):
 *   - waitForInit()
 *   - isInitialized()
 *   - destroy()
 */
export class Word {
    constructor(container, props = {}) {
        console.log('[Word] Constructor', { container, props });

        this.container = container;
        this.props = props;

        // Page data
        this.pageId = props.page_id || null;
        this.pageData = props.page_data || null;

        // Nav instance for multi-tenant scoping.
        // Priority:
        //   1. props.nav_id          (injected by CoreEngine)
        //   2. window.coreEngine.navId (set by CoreEngine constructor)
        //   3. document.body dataset  (raw data-nav-id attribute)
        this.navId = props.nav_id
            || window.coreEngine?.navId
            || document.body.dataset.navId
            || null;

        // Query string appended to every word API request.
        // Empty string when navId is not known — the request will then
        // fail with 422 (nav_id is required) rather than silently
        // returning foreign data.
        this._qs = this.navId != null
            ? `?nav_id=${encodeURIComponent(this.navId)}`
            : '';

        // State
        this.editorInstance = null;
        this.isEditing = false;
        this._initialized = false;
        this._initPromise = null;
        this._editorToken = 0;

        // DOM refs
        this.widgetEl = null;
        this.toolbarEl = null;
        this.widgetContentEl = null;

        // Caption helpers — filled from window.coreEngine.base in _init().
        this._setCaption = null;
        this._restoreCaption = null;
        this._savedCaption = null;

        // Fallback header title (used only if caption helpers are unavailable).
        this._originalHeaderTitle = null;

        // Path to Base icons
        this._iconsBase = '/static/core/engine/lib/base/images';

        // Submodules (loaded in _init)
        this._data = null;
        this._view = null;
        this._actions = null;
        this._utils = null;

        // CSS is loaded async — errors do not block Word creation.
        this._loadCSS().catch(e => {
            console.warn('[Word] _loadCSS() error:', e);
        });

        this._initPromise = this._init();
    }

    /**
     * Load page-level CSS into the main document.
     *
     * Shared CSS (word.css, llm.css, content.css) — hardcoded.
     * Effect CSS (fx/*.css) — fetched from GET /editor/effects
     * (single source of truth). Block CSS (elements, layout, ready, ...)
     * — taken from blocks/manifest.js (dynamic import, versioned).
     *
     * ORDER MATTERS:
     *   content.css — shared atoms (.btn, .card, .grid, .h1, .text, ...)
     *                 AND --theme-* variables (they are defined at the
     *                 top of content.css, scoped under
     *                 .core-engine-lib-word-blocks).
     *   fx/*.css    — effect classes (.fx-shadow-top-n, ...).
     *                 Must load AFTER content.css (needs the theme vars),
     *                 BEFORE blocks/*.css (blocks may override).
     *                 One file per effect, matching the editor canvas
     *                 (see editor/grapes/index.js → canvasCss).
     *   blocks/*.css — block-specific classes (.hero, .flex-shell, ...).
     *                  Must load AFTER content.css so block rules can
     *                  override shared rules at equal specificity.
     *
     * NOTE: editor/css/theme.css is NOT loaded here. That file is the
     * GrapesJS UI theme (light override of GrapesJS dark panels),
     * only needed inside the editor top document — loaded by
     * grapes.js → cssFiles when the editor opens.
     *
     * coreEngine.loadCSS() expects a path relative to /static/
     * (no leading slash, no /static/ prefix).
     */
    async _loadCSS() {
        if (!window.coreEngine?.loadCSS) return;

        window.coreEngine.loadCSS('core/engine/lib/word/word.css');
        window.coreEngine.loadCSS('core/engine/lib/word/llm/llm.css');

        // Shared content classes (.btn, .card, .grid, .h1, .text, ...)
        // AND --theme-* variables (defined at the top of content.css).
        // Scoped under .core-engine-lib-word-blocks.
        window.coreEngine.loadCSS('core/engine/lib/word/editor/css/content.css');

        // Effect classes — one file per effect.
        // Same order as in the editor canvas: after content.css
        // (theme vars), before blocks/*.css.
        const version = window.coreEngine?.static_version || Date.now();
        const effectIds = await this._loadEffectIds(version);

        for (const id of effectIds) {
            window.coreEngine.loadCSS(
                `core/engine/lib/word/editor/effects/fx/${id}.css`
            );
        }

        // Block-specific classes — must load AFTER content.css,
        // so block rules can override shared rules at equal specificity.
        // List comes from blocks/manifest.js — dynamic, versioned
        // import (same rule as every other module here).
        try {
            const mod = await import(`./editor/blocks/manifest.js?v=${version}`);
            const blockCss = mod.blockCssUrls ? mod.blockCssUrls(version) : [];

            blockCss.forEach((url) => {
                // '/static/core/...?v=123' → 'core/...'
                const path = url
                    .replace(/^\/static\//, '')
                    .replace(/\?.*$/, '');
                window.coreEngine.loadCSS(path);
            });
        } catch (e) {
            console.warn('[Word] blocks/manifest.js not loaded:', e);
        }
    }

    /**
     * Fetch the list of effect ids from GET /editor/effects.
     *
     * The API is the single source of truth (backed by
     * editor/effects/registry.json on the backend). There is no
     * bundled fallback: on failure we return an empty list, and
     * the page just renders without effect CSS.
     *
     * NOTE: /editor/effects does not care about nav scoping — effects
     * are global. So we deliberately do NOT append this._qs here.
     * Effects are shared across all navs.
     *
     * @param {string|number} version — cache-busting version
     * @returns {Promise<string[]>}
     */
    async _loadEffectIds(version) {
        try {
            const url = `/core/engine/lib/word/editor/effects`;
            console.log('[Word] GET', url);

            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) throw new Error('coreEngine.fetchJson not available');

            const data = await fetchJson(url);
            if (data && data.success && Array.isArray(data.data)) {
                const ids = data.data.map(e => e.id).filter(Boolean);
                console.log('[Word] effects loaded from API:', ids.length);
                return ids;
            }
            throw new Error('unexpected payload');
        } catch (e) {
            console.warn('[Word] effects API failed:', e);
            return [];
        }
    }

    async _init() {
        console.log('[Word] _init() START');
        const version = window.coreEngine?.static_version || Date.now();

        try {
            // Pick up caption helpers from Base (loaded before Word).
            const base = window.coreEngine?.base;
            this._setCaption = base?._setCaption || null;
            this._restoreCaption = base?._restoreCaption || null;

            // Load all submodules in parallel
            const [data, view, actions, utils] = await Promise.all([
                import(`./data.js?v=${version}`),
                import(`./view.js?v=${version}`),
                import(`./actions.js?v=${version}`),
                import(`./utils.js?v=${version}`),
            ]);

            this._data = data;
            this._view = view;
            this._actions = actions;
            this._utils = utils;

            // Load page data if not provided
            if (!this.pageData) {
                if (this.pageId) {
                    await data.loadById(this);
                } else {
                    const loaded = await data.loadByParams(this);
                    if (!loaded) {
                        throw new Error('No data to load: no page_data, page_id, or URL params');
                    }
                }
            }

            // Set header title and render
            actions.setHeaderTitle(this);
            await view.render(this);

            this._initialized = true;
            console.log('[Word] _init() COMPLETE');
        } catch (error) {
            console.error('[Word] Init error:', error);
            this._renderError(error.message);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // DELEGATION
    // ============================================

    _renderError(message) {
        this._view?.renderError(this, message);
    }

    _goBack() {
        this._actions?.goBack(this);
    }

    _openPublicPage() {
        this._actions?.openPublicPage(this);
    }

    /**
     * Manual save — delegated to actions.saveContent.
     * Persists AND closes the editor.
     */
    async _saveContent(data) {
        await this._actions?.saveContent(this, data);
    }

    /**
     * Auto-save — delegated to actions.autoSaveContent.
     * Persists only; the editor stays open.
     */
    async _autoSaveContent(data) {
        await this._actions?.autoSaveContent(this, data);
    }

    _setHeaderTitle() {
        this._actions?.setHeaderTitle(this);
    }

    // ============================================
    // EDITOR (delegated to bridge.js)
    // ============================================

    async _openEditor() {
        const version = window.coreEngine?.static_version || Date.now();
        const mod = await import(`./bridge.js?v=${version}`);
        await mod.openEditor(this);
    }

    _closeEditor() {
        const version = window.coreEngine?.static_version || Date.now();
        import(`./bridge.js?v=${version}`).then(mod => {
            mod.closeEditor(this);
        });
    }

    // ============================================
    // RESIZER HANDLES
    // ============================================

    _clearAllResizers() {
        document.querySelectorAll('.core-engine-lib-word-editor-resizer').forEach(h => h.remove());
    }

    // ============================================
    // PERMISSIONS
    // ============================================

    /**
     * Whether the current user can edit pages (open the editor,
     * save, use the toolbar).
     *
     * Any authenticated user qualifies; guests do not.
     *
     * The check tries several auth shapes so it works regardless of
     * how BaseAuth exposes state:
     *   - auth.isAuth()        → boolean
     *   - auth.isAuthenticated → boolean
     *   - auth.getUser()       → user object or null
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
     *
     * Kept for callers that specifically need superadmin-only
     * behaviour. is_superadmin may come from the backend as bool,
     * int (0/1) or string ("0"/"1"), so all three are accepted.
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

    /**
     * Deprecated alias for _canEdit().
     *
     * Kept temporarily so existing callers (view.js, etc.) don't
     * break if they still reference _isAdmin(). New code should
     * call _canEdit() (any authenticated user) or _isSuperadmin()
     * (superadmin only).
     */
    _isAdmin() {
        return this._canEdit();
    }

    // ============================================
    // PUBLIC METHODS
    // ============================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }

    destroy() {
        console.log('[Word] destroy()');

        // Restore the title that was on screen before Word opened.
        if (this._restoreCaption) {
            this._restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        // Fallback — if caption helpers were unavailable, use the old path.
        if (!this._restoreCaption && this._originalHeaderTitle !== null) {
            const el = document.querySelector('.core-engine-lib-base-title');
            if (el) el.textContent = this._originalHeaderTitle;
            this._originalHeaderTitle = null;
        }

        // Destroy editor if open
        if (this.editorInstance?.destroy) {
            try {
                this.editorInstance.destroy();
            } catch (e) {
                console.warn('[Word] destroy() error:', e);
            }
        }
        this.editorInstance = null;
        this._editorToken = (this._editorToken || 0) + 1;

        this._clearAllResizers();

        this._initialized = false;
        this._initPromise = null;
    }
}