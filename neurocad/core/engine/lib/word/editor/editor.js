// app/core/engine/lib/word/editor/editor.js

/**
 * Editor — GrapesJS visual editor (part of the Word component).
 *
 * Orchestrator class. Does nothing itself, assembles submodules:
 *
 *   widgets.js    -> builds DOM of three areas (left / center / right) + toolbar
 *   styles.js     -> provides StyleManager sections
 *   grapes.js     -> loads GrapesJS CSS/JS and calls grapesjs.init()
 *   assets.js     -> works with media library (GET /assets, POST /assets/upload)
 *   blocks/       -> registers block library
 *   resizer.js    -> handles for dragging borders between areas
 *   template.js   -> base template rendering + slot height sync
 *   toolbar.js    -> editor toolbar + hotkeys + device switcher
 *   dataloader.js -> load project data + re-apply scope class / body traits
 *   modals.js     -> HTML+CSS page modal and element CSS modal
 *   history.js    -> page history modal (list, preview, rollback)
 *   formatter.js  -> js-beautify wrapper (CSS / HTML pretty-print)
 *   base/modal    -> Base modals (incl. code modal for HTML + CSS)
 *   ../llm/chat.js    -> LLM chat panel (right)
 *   ../llm/presets.js -> Presets list (left tab)
 *
 * All internal modules are loaded dynamically, with version from coreEngine,
 * to avoid browser cache on updates.
 *
 * Template mode:
 *   If props.templateHtml is provided:
 *     - Rendered into .editor-template (outside GrapesJS iframe).
 *     - If the template contains [data-slot="content"], the slot is
 *       replaced with .editor-slot and GrapesJS mounts into it.
 *     - If the template has no slot, GrapesJS is NOT created at all —
 *       the template is shown as a read-only preview. The toolbar is
 *       still rendered (only the "Close" button).
 *
 *   Device behavior (when the template has a slot):
 *     - desktop: template is visible, slot lives inside .editor-template.
 *     - tablet / mobile: template is hidden, slot is moved into
 *       .editor-canvas so the user can test how the slot content fits
 *       narrow viewports without the surrounding template layout.
 *
 *   Otherwise (no template):
 *     - GrapesJS mounts into .editor-canvas — same as before.
 *
 * Exposes (to Word):
 *   - waitForInit()   — wait for readiness
 *   - isInitialized() — check readiness
 *   - destroy()       — destroy editor
 *   - editor          — GrapesJS instance (or null in preview mode)
 *
 * Save / cancel — via onSave / onCancel callbacks from props.
 */
export class Editor {
    constructor(container, props = {}) {
        console.log('[Editor] Constructor', { container, props });

        this.container = container;
        this.props = props;

        // Data to load
        this.initialHtml = props.html || '';
        this.initialProject = props.project || null;
        this.templateHtml = props.templateHtml || null;

        // Callbacks
        this.onSave = props.onSave || null;
        this.onCancel = props.onCancel || null;

        // State
        this.editor = null;
        this._initialized = false;
        this._initPromise = null;

        // Submodules (created in _init)
        this._widgets = null;
        this._stylesConfig = null;
        this._grapes = null;
        this._assets = null;
        this._blocks = null;
        this._resizer = null;
        this._templateMgr = null;   // template.js module
        this._toolbarMgr = null;    // toolbar.js module
        this._dataLoader = null;    // dataloader.js module
        this._createModal = null;
        this._modals = null;        // modals.js module
        this._history = null;       // history.js module
        this._chat = null;          // LLM chat
        this._presets = null;       // LLM presets

        // DOM elements (filled by widgets.build())
        this.leftArea = null;
        this.rightArea = null;
        this.blocksEl = null;
        this.presetsEl = null;
        this.canvasEl = null;     // whole center area
        this.templateEl = null;   // static template HTML (when template exists)
        this.slotEl = null;       // GrapesJS mount point (when template exists)
        this.toolbarEl = null;
        this.stylesEl = null;
        this.traitsEl = null;
        this.chatEl = null;
        this.tabsEl = null;

        // Page data for LLM chat / presets
        this.pageId = props.pageId || null;
        this.pageData = props.pageData || null;

        // Media library API — with module_name for multi-site support.
        const moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        const qs = moduleName
            ? `?module=${encodeURIComponent(moduleName)}`
            : '';

        this._assetsApi = `/core/engine/lib/word/assets${qs}`;
        this._assetsUploadApi = `/core/engine/lib/word/assets/upload${qs}`;

        // History API base
        this._historyApi = `/core/engine/lib/word${qs}`;

        // Scope class — must match GrapesLoader.scopeClass
        this._scopeClass = 'core-engine-lib-word-blocks';

        this._initPromise = this._init();
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async _init() {
        console.log('[Editor] _init() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();

            // 1. Load all submodules in parallel
            const [
                { GrapesLoader },
                { WidgetsBuilder },
                { StylesConfig },
                { AssetsManager },
                { BlocksRegistry },
                { Resizer },
                { TemplateManager },
                { ToolbarManager },
                { DataLoader },
                modalsModule,
                { createModal },
                { LLMChat },
                { LLMPresets },
            ] = await Promise.all([
                import(`./grapes.js?v=${version}`),
                import(`./widgets.js?v=${version}`),
                import(`./styles.js?v=${version}`),
                import(`./assets.js?v=${version}`),
                import(`./blocks/index.js?v=${version}`),
                import(`./resizer.js?v=${version}`),
                import(`./template.js?v=${version}`),
                import(`./toolbar.js?v=${version}`),
                import(`./dataloader.js?v=${version}`),
                import(`./modals.js?v=${version}`),
                import(`../../base/modal/index.js?v=${version}`),
                import(`../llm/chat.js?v=${version}`),
                import(`../llm/presets.js?v=${version}`),
            ]);

            this._createModal = createModal;
            this._modals = modalsModule;

            // 2. Build DOM of three areas (left / center / right) + toolbar
            this._widgets = new WidgetsBuilder(this);
            this._widgets.build();

            // 2.5. Template manager — render template HTML into .editor-template
            // (if any). If the template contains [data-slot="content"],
            // GrapesLoader will later replace that slot and mount into it.
            this._templateMgr = new TemplateManager(this);
            this._templateMgr.render();

            // 2.6. Bind tabs [Styles|Traits|Blocks|Presets]
            this._bindTabs();

            // 2.7. Resizer handles — BEFORE grapesjs.init(),
            // so panel widths from localStorage are applied,
            // and GrapesJS calculates canvas at the right size.
            this._resizer = new Resizer(this);
            this._resizer.build();

            // 3. StyleManager config
            this._stylesConfig = new StylesConfig(this);

            // 4. GrapesJS init.
            //    Returns the instance, OR null if the template has no
            //    [data-slot="content"] — in that case we are in preview mode.
            this._grapes = new GrapesLoader(this, {
                styleManagerSectors: this._stylesConfig.sectors(),
            });
            await this._grapes.load();
            this.editor = this._grapes.init();

            if (this.editor) {
                // ----- Everything that requires GrapesJS -----

                // 4.5. If template is used — watch iframe height and resize
                // .editor-slot so that the iframe fits its content.
                if (this.templateHtml) {
                    this._templateMgr.setupSlotResize();
                }

                // 5. Block library
                this._blocks = new BlocksRegistry(this.editor);
                await this._blocks.register();

                // 6. Media library (load existing assets)
                this._assets = new AssetsManager(this);
                await this._assets.load();

                // 7. LLM Chat (right)
                this._chat = new LLMChat(this);
                await this._chat.init();

                // 8. LLM Presets (left tab)
                this._presets = new LLMPresets(this);
                await this._presets.init();

                // 9. Initial data — JSON project or HTML fallback.
                //    DataLoader also re-applies scope class + body traits
                //    after GrapesJS replaces <body> and wrapper.
                this._dataLoader = new DataLoader(this);
                this._dataLoader.loadInitial();
            } else {
                console.log('[Editor] Preview mode — GrapesJS not initialized, panels disabled');
            }

            // 10. Toolbar + hotkeys — built in BOTH modes.
            //     In preview mode it renders only the "Close" button.
            this._toolbarMgr = new ToolbarManager(this);
            this._toolbarMgr.build();

            this._initialized = true;
            console.log('[Editor] _init() COMPLETE');
        } catch (error) {
            console.error('[Editor] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // TABS (Styles | Traits | Blocks | Presets)
    // ============================================

    _bindTabs() {
        if (!this.tabsEl) return;

        this.tabsEl.addEventListener('click', (e) => {
            const tab = e.target.closest('.core-engine-lib-word-editor-tab');
            if (!tab) return;

            const tabName = tab.dataset.tab;
            this._setTab(tabName);
        });
    }

    _setTab(name) {
        if (!this.tabsEl) return;

        this.tabsEl
            .querySelectorAll('.core-engine-lib-word-editor-tab')
            .forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.tab === name);
            });

        const leftTop = this.leftArea?.querySelector('.core-engine-lib-word-editor-left-top');
        if (!leftTop) return;

        leftTop.querySelectorAll('[data-tab-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.tabPanel !== name;
        });
    }

    // ============================================
    // MODALS (delegated to modals.js)
    // ============================================

    async _openHtmlModal() {
        if (!this.editor) return;
        if (!this._modals) {
            console.warn('[Editor] modals module not loaded');
            return;
        }
        await this._modals.openHtmlCssModal({
            editor: this.editor,
            createModal: this._createModal,
        });
    }

    async _openCssModal() {
        if (!this.editor) return;
        if (!this._modals) {
            console.warn('[Editor] modals module not loaded');
            return;
        }
        await this._modals.openElementCssModal({
            editor: this.editor,
            createModal: this._createModal,
        });
    }

    /**
     * Open the page history modal (list, preview, rollback).
     *
     * Loads history.js lazily (versioned), then delegates.
     * The module itself fetches data via /word/{page_id}/history endpoints.
     */
    async _openHistoryModal() {
        if (!this.editor) return;

        if (!this.pageId) {
            console.warn('[Editor] pageId not set — history unavailable');
            return;
        }

        try {
            const version = window.coreEngine?.static_version || Date.now();
            const mod = await import(`./history.js?v=${version}`);
            this._history = mod;

            await mod.openHistoryModal({
                editor: this.editor,
                createModal: this._createModal,
                pageId: this.pageId,
                qs: this._qsForHistory(),
                onRollback: (data) => this._applyRollback(data),
            });
        } catch (err) {
            console.error('[Editor] history modal error:', err);
        }
    }

    /**
     * Build ?module=<name> query string for history API.
     */
    _qsForHistory() {
        const moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        return moduleName
            ? `?module=${encodeURIComponent(moduleName)}`
            : '';
    }

    /**
     * Apply a rollback result to the editor.
     * Delegates to DataLoader.applyRollback().
     *
     * data = { id, title, content, content_json, updated_at }
     */
    _applyRollback(data) {
        this._dataLoader?.applyRollback(data);
    }

    // ============================================
    // SAVING / CLEAR / CANCEL
    // ============================================

    async _handleSave() {
        if (!this.editor) {
            console.warn('[Editor] save: GrapesJS not initialized');
            return;
        }

        if (!this.onSave) {
            console.warn('[Editor] onSave not bound');
            return;
        }

        console.log('[Editor] Saving...');

        const data = {
            html: this.editor.getHtml(),
            css: this.editor.getCss(),
            project: this.editor.getProjectData(),
        };

        try {
            await this.onSave(data);
            console.log('[Editor] Saved');
        } catch (error) {
            console.error('[Editor] Save error:', error);

            // 401 — session expired. Redirect to login, preserving return URL.
            if (error?.status === 401) {
                this._redirectToLogin();
                return;
            }

            // Other errors — show a message modal (best-effort).
            this._showSaveError(error);
        }
    }

    /**
     * Clear the whole edited page:
     *   - remove all components from the canvas;
     *   - clear generated CSS rules (kept by GrapesJS separately);
     *   - drop selection, so traits/styles panels don't show stale data.
     *
     * UndoManager is intentionally NOT cleared — Ctrl+Z must bring
     * the page back if the user clicked "Очистить" by mistake.
     *
     * Save is NOT triggered here: the user decides when to persist
     * (top toolbar "Сохранить" / Ctrl+S).
     */
    _handleClear() {
        console.log('[Editor] Clear page');

        if (!this.editor) return;

        try {
            // 1. Remove all components from the wrapper (body).
            //    Wrapper itself stays — this is what "clean page" means.
            this.editor.DomComponents.clear();

            // 2. Clear CSS rules generated by GrapesJS
            //    (not the ones inside canvas <head> from canvas.css etc.).
            this.editor.Css.clear();

            // 3. Drop selection so right panels reflect the empty state.
            this.editor.select(null);

            // 4. (Optional) notify the page is dirty.
            //    If you have a _markDirty() method — uncomment:
            // this._markDirty?.();

            console.log('[Editor] Page cleared');
        } catch (e) {
            console.warn('[Editor] clear failed:', e);
        }
    }

    /**
     * Redirect to login page with ?next=<current URL>.
     * Uses window.coreEngine.authRedirect if available, else '/login'.
     */
    _redirectToLogin() {
        console.log('[Editor] Session expired — redirecting to login');

        const authRedirect = window.coreEngine?.authRedirect || '/login';
        const returnUrl = encodeURIComponent(window.location.href);
        const sep = authRedirect.includes('?') ? '&' : '?';

        window.location.href = `${authRedirect}${sep}next=${returnUrl}`;
    }

    /**
     * Show a small message modal with the save error text.
     * Fire-and-forget: if createModal is unavailable, only logs.
     */
    async _showSaveError(error) {
        const message = error?.message || 'Не удалось сохранить';

        if (!this._createModal) {
            console.warn('[Editor] createModal not available — error not shown:', message);
            return;
        }

        try {
            const modal = await this._createModal('message');
            modal.open(message, 'Ошибка сохранения', 'Понятно');
            modal.setOnOk(() => modal.destroy());
        } catch (e) {
            console.warn('[Editor] failed to show save error modal:', e);
        }
    }

    _handleCancel() {
        console.log('[Editor] Cancel');
        if (this.onCancel) {
            this.onCancel();
        }
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
        console.log('[Editor] destroy()');

        // Toolbar manager — detach global keydown
        if (this._toolbarMgr) {
            try { this._toolbarMgr.destroy(); } catch (e) { console.warn(e); }
            this._toolbarMgr = null;
        }

        // Template manager — disconnect observer + detach frame:load
        if (this._templateMgr) {
            try { this._templateMgr.destroy(); } catch (e) { console.warn(e); }
            this._templateMgr = null;
        }

        // Chat + presets
        if (this._chat) {
            try { this._chat.destroy(); } catch (e) { console.warn(e); }
            this._chat = null;
        }
        if (this._presets) {
            try { this._presets.destroy(); } catch (e) { console.warn(e); }
            this._presets = null;
        }

        // Resizer
        if (this._resizer) {
            try {
                this._resizer.destroy();
            } catch (e) {
                console.warn('[Editor] resizer.destroy() error:', e);
            }
            this._resizer = null;
        }

        // Detach frame:load handler inside GrapesLoader (scope class re-attach)
        if (this._grapes) {
            try {
                this._grapes.destroy(this.editor);
            } catch (e) {
                console.warn('[Editor] grapes.destroy() error:', e);
            }
        }

        // Destroy GrapesJS instance
        if (this.editor) {
            try {
                this.editor.destroy();
            } catch (e) {
                console.warn('[Editor] editor.destroy() error:', e);
            }
            this.editor = null;
        }

        // Clear DOM areas (in case GrapesJS didn't clean up)
        if (this.leftArea) this.leftArea.innerHTML = '';
        if (this.rightArea) this.rightArea.innerHTML = '';
        if (this.container) this.container.innerHTML = '';

        this._widgets = null;
        this._stylesConfig = null;
        this._grapes = null;
        this._assets = null;
        this._blocks = null;
        this._dataLoader = null;
        this._createModal = null;
        this._modals = null;
        this._history = null;

        this._initialized = false;
        this._initPromise = null;
    }
}