// app/core/engine/lib/word/word.js

import { blockCssUrls } from './editor/blocks/manifest.js';

/**
 * Word — page content display component.
 *
 * Orchestrator. Delegates work to submodules:
 *   data.js     — loadById, loadByParams, loadTemplateById
 *   view.js     — render, buildArticle, buildToolbarButtons, renderError
 *   actions.js  — setHeaderTitle, goBack, openPublicPage, saveContent
 *   bridge.js   — openEditor, closeEditor (GrapesJS editor)
 *   utils.js    — date formatting, safe JSON parse
 *
 * All submodules are loaded dynamically with a version to avoid
 * browser cache issues on updates.
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

        // Module name for multi-site support
        this.moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        this._qs = this.moduleName
            ? `?module=${encodeURIComponent(this.moduleName)}`
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

        // Original header title
        this._originalHeaderTitle = null;

        // Path to Base icons
        this._iconsBase = '/static/core/engine/lib/base/images';

        // Submodules (loaded in _init)
        this._data = null;
        this._view = null;
        this._actions = null;
        this._utils = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    /**
     * Load page-level CSS into the main document.
     *
     * Shared CSS (word.css, llm.css, content.css) — hardcoded.
     * Block CSS (elements, layout, ready, ...) — taken from
     * blocks/manifest.js, so adding a new block = one entry in the
     * manifest, nothing to change here.
     *
     * ORDER MATTERS:
     *   content.css — shared atoms (.btn, .card, .grid, .h1, .text, ...)
     *                 AND --theme-* variables (they are defined at the
     *                 top of content.css, scoped under
     *                 .core-engine-lib-word-blocks).
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
     * (no leading slash, no /static/ prefix). blockCssUrls() returns
     * full /static/... URLs, so we strip the prefix before passing.
     */
    _loadCSS() {
        if (!window.coreEngine?.loadCSS) return;

        window.coreEngine.loadCSS('core/engine/lib/word/word.css');
        window.coreEngine.loadCSS('core/engine/lib/word/llm/llm.css');

        // Shared content classes (.btn, .card, .grid, .h1, .text, ...)
        // AND --theme-* variables (defined at the top of content.css).
        // Scoped under .core-engine-lib-word-blocks.
        window.coreEngine.loadCSS('core/engine/lib/word/editor/css/content.css');

        // Block-specific classes — must load AFTER content.css,
        // so block rules can override shared rules at equal specificity.
        // List comes from the manifest, in order.
        const version = window.coreEngine?.static_version || Date.now();
        blockCssUrls(version).forEach((url) => {
            // '/static/core/...?v=123' → 'core/...'
            const path = url
                .replace(/^\/static\//, '')
                .replace(/\?.*$/, '');
            window.coreEngine.loadCSS(path);
        });
    }

    async _init() {
        console.log('[Word] _init() START');
        const version = window.coreEngine?.static_version || Date.now();

        try {
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

    async _saveContent(data) {
        await this._actions?.saveContent(this, data);
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

        // Restore original header title
        if (this._originalHeaderTitle !== null) {
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