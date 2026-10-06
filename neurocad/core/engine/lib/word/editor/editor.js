// neurocad/core/engine/lib/word/editor/editor.js

/**
 * Editor — GrapesJS visual editor (part of the Word component).
 *
 * Orchestrator class. Does nothing itself, assembles submodules:
 *
 *   widgets.js    -> builds DOM of three areas (left / center / right) + toolbar
 *   styles.js     -> provides StyleManager sections
 *   grapes/       -> loads GrapesJS CSS/JS and calls grapesjs.init()
 *   assets.js     -> image picker (BaseAssets) + traits binding
 *   blocks/       -> registers block library
 *   brand.js      -> substitutes the real public host into
 *                    [data-footer-brand] on component:add
 *   autosave.js   -> interval-based, dirty-flag driven auto-save
 *   session.js    -> save / cancel / close / clear flow
 *   resizer.js    -> handles for dragging borders between areas
 *   template.js   -> base template rendering + slot height sync
 *   toolbar.js    -> editor toolbar + hotkeys + device switcher
 *   dataloader.js -> load project data + re-apply scope class / body traits
 *   modals.js     -> HTML+CSS page modal and element CSS modal
 *   history.js    -> page history modal (list, preview, rollback)
 *   io/import.js  -> import page from .grp / .html / URL
 *   io/export.js  -> export page to .html / .grp
 *   formatter.js  -> js-beautify wrapper (CSS / HTML pretty-print)
 *   base/modal    -> Base modals (incl. code modal for HTML + CSS)
 *   ../llm/chat.js    -> LLM chat panel (right)
 *   ../llm/presets.js -> Presets list (left tab)
 *
 * All internal modules are loaded dynamically, with version from coreEngine,
 * to avoid browser cache on updates.
 *
 * Image picking
 * -------------
 * The built-in GrapesJS Asset Manager is disabled in the config
 * (see grapes/config.js → assetManager.custom = true). Images are
 * picked through BaseAssets — the shared full-screen media library
 * picker with two tabs: «Медиатека» (media/<nav_id>/) and
 * «Логотипы» (word/editor/images/). AssetsManager in ./assets.js
 * exposes openPicker() and binds a "Выбрать из медиатеки" button
 * to the src trait of every <img> component in the canvas.
 *
 * Auto-save:
 *   The interval-based auto-save — dirty flag, timer, onAutoSave
 *   fallback — lives in autosave.js.
 *
 * Save / cancel / close:
 *   The three-way save-on-close dialog, manual save, cancel, clear
 *   page, redirect-to-login-on-401 — live in session.js.
 *
 *   Editor.confirmClose() is kept here as a thin public wrapper
 *   because Word calls it directly during external close.
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
 *   - waitForInit()      — wait for readiness
 *   - isInitialized()    — check readiness
 *   - confirmClose()     — ask before external close
 *   - destroy()          — destroy editor
 *   - editor             — GrapesJS instance (or null in preview mode)
 *
 * Save / cancel — via onSave / onAutoSave / onCancel callbacks from props.
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
        this.onAutoSave = props.onAutoSave || null;
        this.onCancel = props.onCancel || null;

        // State
        this.editor = null;
        this._initialized = false;
        this._initPromise = null;

        // Auto-save configuration — consumed by autosave.js at
        // construct time. Changing these on the Editor instance
        // BEFORE _init() takes effect.
        this.AUTO_SAVE_ENABLED = true;
        this.AUTO_SAVE_INTERVAL_MS = 30_000;

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
        this._autosave = null;      // autosave.js module
        this._session = null;       // session.js module
        this._createModal = null;
        this._modals = null;        // modals.js module
        this._history = null;       // history.js module
        this._chat = null;          // LLM chat
        this._presets = null;       // LLM presets
        this._importer = null;      // io/import.js module
        this._exporter = null;      // io/export.js module
        this._bindFooterBrand = null;
        this._AutosaveClass = null;
        this._SessionClass = null;

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

        // Public host of the owner's site (subdomain or custom domain),
        // e.g. "testuser3.neurocad-dev.ru" or "atou.ru". Resolved on the
        // backend and passed in pageData.public_host. Passed to
        // brand.js → bindFooterBrand(), which substitutes it into
        // [data-footer-brand] elements when the core-footer block is
        // dropped into the canvas.
        this.publicHost = (props.pageData && props.pageData.public_host) || null;

        // Media library API — with module_name for multi-site support.
        //
        // NOTE: with the built-in GrapesJS Asset Manager disabled
        // (grapes/config.js → assetManager.custom = true), these URLs
        // are informational only. The actual picker (BaseAssets) uses
        // its own endpoints under /core/engine/lib/base/assets and
        // /core/engine/lib/word/editor/images. Kept here so any
        // existing call sites do not break.
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

            // 1. Load all submodules in parallel.
            //    GrapesLoader now lives in grapes/index.js.
            const [
                { GrapesLoader },
                { WidgetsBuilder },
                { StylesConfig },
                { AssetsManager },
                { BlocksRegistry },
                { bindFooterBrand },
                { Autosave },
                { Session },
                { Resizer },
                { TemplateManager },
                { ToolbarManager },
                { DataLoader },
                modalsModule,
                { createModal },
                { LLMChat },
                { LLMPresets },
                { Importer },
                { Exporter },
            ] = await Promise.all([
                import(`./grapes/index.js?v=${version}`),
                import(`./widgets.js?v=${version}`),
                import(`./styles.js?v=${version}`),
                import(`./assets.js?v=${version}`),
                import(`./blocks/index.js?v=${version}`),
                import(`./brand.js?v=${version}`),
                import(`./autosave.js?v=${version}`),
                import(`./session.js?v=${version}`),
                import(`./resizer.js?v=${version}`),
                import(`./template.js?v=${version}`),
                import(`./toolbar.js?v=${version}`),
                import(`./dataloader.js?v=${version}`),
                import(`./modals.js?v=${version}`),
                import(`../../base/modal/index.js?v=${version}`),
                import(`../llm/chat.js?v=${version}`),
                import(`../llm/presets.js?v=${version}`),
                import(`./io/import.js?v=${version}`),
                import(`./io/export.js?v=${version}`),
            ]);

            this._createModal = createModal;
            this._modals = modalsModule;
            this._bindFooterBrand = bindFooterBrand;
            this._AutosaveClass = Autosave;
            this._SessionClass = Session;

            // 2. Build DOM of three areas (left / center / right) + toolbar
            this._widgets = new WidgetsBuilder(this);
            this._widgets.build();

            // 2.5. Template manager — render template HTML into .editor-template
            this._templateMgr = new TemplateManager(this);
            this._templateMgr.render();

            // 2.6. Bind tabs [Styles|Traits|Blocks|Presets]
            this._bindTabs();

            // 2.7. Resizer handles
            this._resizer = new Resizer(this);
            this._resizer.build();

            // 3. StyleManager config
            this._stylesConfig = new StylesConfig(this);

            // 4. GrapesJS init.
            this._grapes = new GrapesLoader(this, {
                styleManagerSectors: this._stylesConfig.sectors(),
            });
            await this._grapes.load();
            this.editor = this._grapes.init();

            if (this.editor) {
                // ----- Everything that requires GrapesJS -----

                if (this.templateHtml) {
                    this._templateMgr.setupSlotResize();
                }

                // 5. Block library
                this._blocks = new BlocksRegistry(this.editor);
                await this._blocks.register();

                // 5.1. Footer brand — subscribe to component:add and
                //      substitute the real public host into any
                //      [data-footer-brand] element that appears in
                //      the canvas (see brand.js).
                if (typeof this._bindFooterBrand === 'function') {
                    this._bindFooterBrand(this);
                }

                // 6. Image picker — bind the "Choose from library"
                //    button to the src trait of every <img> in the
                //    canvas. Images themselves are selected through
                //    BaseAssets (see ./assets.js → openPicker).
                this._assets = new AssetsManager(this);
                this._assets.bindTraits(this.editor);

                // 7. LLM Chat
                this._chat = new LLMChat(this);
                await this._chat.init();

                // 8. LLM Presets
                this._presets = new LLMPresets(this);
                await this._presets.init();

                // 8.5. Import / export modules.
                //      Created before the data loader so that any
                //      post-load state (scope class, body traits) can
                //      be re-applied from the importer as well.
                this._importer = new Importer(this);
                this._exporter = new Exporter(this);

                // 9. Initial data.
                this._dataLoader = new DataLoader(this);
                this._dataLoader.loadInitial();

                // 9.5. Auto-save — subscribe to `update` and start
                //      the timer. All auto-save state lives in the
                //      Autosave instance (see autosave.js).
                if (typeof this._AutosaveClass === 'function') {
                    this._autosave = new this._AutosaveClass(this);
                    this._autosave.bind();
                }
            } else {
                console.log('[Editor] Preview mode — GrapesJS not initialized, panels disabled');
            }

            // 9.6. Session — save / cancel / close / clear flow.
            //      Created even in preview mode (clear/cancel still
            //      make sense there — components list is empty).
            if (typeof this._SessionClass === 'function') {
                this._session = new this._SessionClass(this);
            }

            // 10. Toolbar + hotkeys.
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

    // ============================================
    // IMPORT / EXPORT (delegated to io/*)
    // ============================================

    /**
     * Open the import dialog (.grp / .html / URL).
     * Delegates to io/import.js — no editor logic here.
     */
    _openImportDialog() {
        if (!this._importer) {
            console.warn('[Editor] importer module not loaded');
            return;
        }
        this._importer.openDialog();
    }

    /**
     * Open the export dialog (HTML / .grp).
     * Delegates to io/export.js — no editor logic here.
     */
    _openExportDialog() {
        if (!this._exporter) {
            console.warn('[Editor] exporter module not loaded');
            return;
        }
        this._exporter.openDialog();
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
     */
    _applyRollback(data) {
        this._dataLoader?.applyRollback(data);
    }

    // ============================================
    // SAVING / CLEAR / CANCEL — delegated to session.js
    // ============================================

    /**
     * Manual save — triggered by the toolbar / Ctrl+S.
     * Delegates to session.js → save().
     */
    async _handleSave() {
        if (!this._session) {
            console.warn('[Editor] session module not loaded');
            return;
        }
        await this._session.save();
    }

    /**
     * Clear the whole edited page.
     * Delegates to session.js → clear().
     */
    _handleClear() {
        if (!this._session) {
            console.warn('[Editor] session module not loaded');
            return;
        }
        this._session.clear();
    }

    /**
     * Cancel — triggered by the toolbar "✕" / Escape.
     * Delegates to session.js → cancel().
     */
    async _handleCancel() {
        if (!this._session) {
            console.warn('[Editor] session module not loaded');
            return;
        }
        await this._session.cancel();
    }

    // ============================================
    // PUBLIC — EXTERNAL CLOSE
    // ============================================

    /**
     * Ask the user what to do with unsaved changes before the editor
     * is torn down externally (e.g. Base navigates to setup / profile).
     *
     * Kept on Editor as a thin wrapper because Word calls it directly.
     * Delegates to session.js → confirmClose().
     *
     * Returns:
     *   'save'    — user chose to save. Changes already persisted.
     *   'discard' — user chose to close without saving.
     *   'cancel'  — user cancelled — keep the editor open.
     *
     * If there are no unsaved changes — returns 'discard' immediately
     * (nothing to lose, no dialog).
     */
    async confirmClose() {
        if (!this._session) {
            console.warn('[Editor] session module not loaded');
            return 'discard';
        }
        return await this._session.confirmClose();
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

        // Stop auto-save.
        this._autosave?.stop();

        // Toolbar manager — detach global keydown
        if (this._toolbarMgr) {
            try { this._toolbarMgr.destroy(); } catch (e) { console.warn(e); }
            this._toolbarMgr = null;
        }

        // Template manager
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

        // Import / export modules — remove any open dialogs
        if (this._importer) {
            try { this._importer.destroy(); } catch (e) { console.warn(e); }
            this._importer = null;
        }
        if (this._exporter) {
            try { this._exporter.destroy(); } catch (e) { console.warn(e); }
            this._exporter = null;
        }

        // Media picker — disconnect MutationObserver on the traits
        // panel, if it was bound.
        if (this._assets) {
            try {
                if (typeof this._assets.destroy === 'function') {
                    this._assets.destroy();
                }
            } catch (e) {
                console.warn('[Editor] assets.destroy() error:', e);
            }
            this._assets = null;
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

        // Detach frame:load handler inside GrapesLoader
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
        this._autosave = null;
        this._session = null;
        this._AutosaveClass = null;
        this._SessionClass = null;
        this._createModal = null;
        this._modals = null;
        this._history = null;
        this._bindFooterBrand = null;

        this._initialized = false;
        this._initPromise = null;
    }
}