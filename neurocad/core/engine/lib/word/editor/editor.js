// neurocad/core/engine/lib/word/editor/editor.js

/**
 * Editor — GrapesJS visual editor (part of the Word component).
 *
 * Orchestrator class. Does nothing itself, assembles submodules:
 *
 *   widgets.js    -> builds DOM of three areas (left / center / right) + toolbar
 *   styles.js     -> provides StyleManager sections
 *   grapes/       -> loads GrapesJS CSS/JS and calls grapesjs.init()
 *   assets.js     -> works with media library (GET /assets, POST /assets/upload)
 *   blocks/       -> registers block library
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
 * Auto-save (interval-based):
 *   Every AUTO_SAVE_INTERVAL_MS (30 s) we check a "dirty" flag that is
 *   set by GrapesJS `update` events and cleared after a successful save.
 *   Nothing is saved if there were no changes since the last save, so
 *   an idle editor produces zero traffic.
 *
 *   Auto-save does NOT touch UndoManager — Undo/Redo stays usable for
 *   the whole lifetime of the editor. Manual save (toolbar / Ctrl+S)
 *   persists and closes the editor via onSave.
 *
 *   Auto-save persists via onAutoSave (editor stays open). If onAutoSave
 *   is not provided, falls back to onSave.
 *
 *   If the session expires during auto-save, fetchJson emits
 *   auth:unauthorized and the editor is torn down by Base.
 *
 * Save-on-close (three-way):
 *   When the editor is closed with unsaved changes — either by the
 *   toolbar "✕" / Escape, or externally (Base navigates to setup /
 *   profile) — a three-way confirm modal asks:
 *
 *     Сохранить      → persist, then close (or proceed with navigation).
 *     Не сохранять   → close / proceed, dropping changes.
 *     Отмена         → do nothing, keep the editor open.
 *
 *   Editor.confirmClose() is the entry point for external closes.
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

        // Auto-save — interval-based, dirty-flag driven.
        //
        // The interval just wakes up every AUTO_SAVE_INTERVAL_MS and
        // checks `_dirty`. `_dirty` is set by GrapesJS `update` events
        // (user-driven changes only — filtered below) and cleared after
        // a successful save. No changes → no traffic.
        this.AUTO_SAVE_ENABLED = true;
        this.AUTO_SAVE_INTERVAL_MS = 30_000;
        this._autoSaveTimer = null;
        this._autoSaveInFlight = false;
        this._autoSaveFailed = false;
        this._dirty = false;

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
        this._importer = null;      // io/import.js module
        this._exporter = null;      // io/export.js module

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

            // 1. Load all submodules in parallel.
            //    GrapesLoader now lives in grapes/index.js.
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
                { Importer },
                { Exporter },
            ] = await Promise.all([
                import(`./grapes/index.js?v=${version}`),
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
                import(`./io/import.js?v=${version}`),
                import(`./io/export.js?v=${version}`),
            ]);

            this._createModal = createModal;
            this._modals = modalsModule;

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

                // 6. Media library
                this._assets = new AssetsManager(this);
                await this._assets.load();

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

                // 9.5. Start tracking changes and auto-saving.
                this._bindAutoSave();
            } else {
                console.log('[Editor] Preview mode — GrapesJS not initialized, panels disabled');
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
    // AUTO-SAVE (interval + dirty flag)
    // ============================================

    /**
     * Subscribe to GrapesJS change events and start the auto-save timer.
     *
     * `update` fires on any user-driven change (component add/remove,
     * style, text). It also fires for internal things (selection, panel
     * tabs, layout) — but those don't matter here: we only set a flag,
     * and the actual save runs on the timer.
     */
    _bindAutoSave() {
        if (!this.editor) return;

        if (!this.AUTO_SAVE_ENABLED) {
            console.log('[Editor] Auto-save disabled (AUTO_SAVE_ENABLED=false)');
            return;
        }

        // Any user-driven change sets the dirty flag. We do NOT save here —
        // just mark that there's something to save on the next tick.
        this.editor.on('update', () => {
            this._dirty = true;
        });

        this._startAutoSaveInterval();

        console.log(`[Editor] Auto-save enabled (interval ${this.AUTO_SAVE_INTERVAL_MS}ms)`);
    }

    /**
     * Start (or restart) the auto-save interval.
     */
    _startAutoSaveInterval() {
        this._stopAutoSaveInterval();
        this._autoSaveTimer = setInterval(() => {
            if (!this._dirty) return;         // nothing changed — skip
            if (this._autoSaveInFlight) return;
            this._autoSave();
        }, this.AUTO_SAVE_INTERVAL_MS);
    }

    /**
     * Stop the auto-save interval.
     */
    _stopAutoSaveInterval() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }

    /**
     * True if there are user-driven changes since the last save.
     *
     * Used by the save-on-close dialog. Note: this is stricter than
     * `_dirty` — UndoManager.hasUndo() reflects real history, while
     * `_dirty` is just "something happened since the last save".
     */
    _hasUnsavedChanges() {
        const um = this.editor?.UndoManager;
        if (!um || typeof um.hasUndo !== 'function') {
            // No UndoManager — fall back to the dirty flag.
            return this._dirty;
        }
        return um.hasUndo() || this._dirty;
    }

    /**
     * Perform the auto-save.
     *
     * Uses onAutoSave if provided; otherwise falls back to onSave.
     * The editor stays open either way (onAutoSave must not close it).
     *
     * Does NOT clear UndoManager — Undo/Redo must stay usable while
     * the editor is open, even after an auto-save.
     */
    async _autoSave() {
        if (!this.editor) return;

        const saveFn = this.onAutoSave || this.onSave;
        if (!saveFn) return;
        if (this._autoSaveInFlight) return;
        if (!this._dirty) return;

        this._autoSaveInFlight = true;

        // Notify UI — "Сохранение…"
        document.dispatchEvent(new CustomEvent('editor:autosave-pending'));

        try {
            const data = {
                html: this.editor.getHtml(),
                css: this.editor.getCss(),
                project: this.editor.getProjectData(),
            };

            await saveFn(data);
            console.log('[Editor] Auto-saved');

            // Clear dirty flag only after a successful save.
            this._dirty = false;

            // Reset failure flag on success.
            this._autoSaveFailed = false;

            // Notify UI — "Сохранено".
            document.dispatchEvent(new CustomEvent('editor:autosaved', {
                detail: { at: Date.now() }
            }));
        } catch (error) {
            console.error('[Editor] Auto-save error:', error);

            // On 401 — fetchJson already emitted auth:unauthorized.
            // Do not retry; the editor will be replaced by the login form.
            if (error?.status === 401) {
                console.warn('[Editor] Auto-save stopped (session expired)');
                return;
            }

            // On other errors — keep the dirty flag, mark as failed.
            // Next interval tick will retry.
            this._autoSaveFailed = true;
            document.dispatchEvent(new CustomEvent('editor:autosave-failed', {
                detail: { error }
            }));
        } finally {
            this._autoSaveInFlight = false;
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
    // SAVING / CLEAR / CANCEL
    // ============================================

    /**
     * Manual save — triggered by the toolbar / Ctrl+S.
     *
     * Stops the auto-save interval, persists via onSave (which also
     * closes the editor), and resets auto-save state.
     */
    async _handleSave() {
        if (!this.editor) {
            console.warn('[Editor] save: GrapesJS not initialized');
            return;
        }

        if (!this.onSave) {
            console.warn('[Editor] onSave not bound');
            return;
        }

        // Stop auto-save — the editor is about to close.
        this._stopAutoSaveInterval();
        this._dirty = false;

        console.log('[Editor] Saving...');

        const data = {
            html: this.editor.getHtml(),
            css: this.editor.getCss(),
            project: this.editor.getProjectData(),
        };

        try {
            await this.onSave(data);
            console.log('[Editor] Saved');

            // Reset auto-save state on manual save.
            this._autoSaveFailed = false;
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
     * Clear the whole edited page.
     */
    _handleClear() {
        console.log('[Editor] Clear page');

        if (!this.editor) return;

        try {
            this.editor.DomComponents.clear();
            this.editor.Css.clear();
            this.editor.select(null);

            console.log('[Editor] Page cleared');
        } catch (e) {
            console.warn('[Editor] clear failed:', e);
        }
    }

    /**
     * Redirect to login page with ?next=<current URL>.
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

    /**
     * Cancel — triggered by the toolbar "✕" / Escape.
     *
     * If there are unsaved changes, ask the user:
     *   - "Сохранить"      → run the manual save flow (persists + closes).
     *   - "Не сохранять"   → close via onCancel (dropping changes).
     *   - "Отмена"         → keep the editor open.
     *
     * If there are no unsaved changes — just close.
     */
    async _handleCancel() {
        console.log('[Editor] Cancel');

        // No unsaved changes — close straight away.
        if (!this._hasUnsavedChanges()) {
            this._stopAutoSaveInterval();
            if (this.onCancel) this.onCancel();
            return;
        }

        // Ask the user what to do.
        const choice = await this._askSaveOnClose();

        if (choice === 'save') {
            // Save, then close (the toolbar ✕ is "save and close").
            await this._handleSave();
            return;
        }

        if (choice === 'cancel') {
            // User cancelled — keep the editor open.
            return;
        }

        // choice === 'discard' — close without saving.
        this._stopAutoSaveInterval();
        if (this.onCancel) this.onCancel();
    }

    /**
     * Persist current editor state WITHOUT closing.
     *
     * Used by confirmClose() when the user picks "Сохранить" on an
     * external close (Base navigates away). The editor will be torn
     * down by Base right after — we just need the data on the server.
     *
     * Uses onAutoSave if set, otherwise onSave. Always resolves — a
     * failure is logged, but the navigation still proceeds (Base
     * cannot wait forever).
     */
    async saveForExternalClose() {
        if (!this.editor) return;

        const saveFn = this.onAutoSave || this.onSave;
        if (!saveFn) return;

        // Flush any pending auto-save state.
        this._stopAutoSaveInterval();

        const data = {
            html: this.editor.getHtml(),
            css: this.editor.getCss(),
            project: this.editor.getProjectData(),
        };

        try {
            await saveFn(data);
            this._dirty = false;
            this._autoSaveFailed = false;
            console.log('[Editor] Saved (before external close)');
        } catch (e) {
            console.error('[Editor] Save before external close failed:', e);
            // Do not throw — Base still needs to tear down.
        }
    }

    // ============================================
    // PUBLIC — EXTERNAL CLOSE
    // ============================================

    /**
     * Ask the user what to do with unsaved changes before the editor
     * is torn down externally (e.g. Base navigates to setup / profile).
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
        if (!this._hasUnsavedChanges()) {
            return 'discard';
        }

        const choice = await this._askSaveOnClose();

        if (choice === 'save') {
            await this.saveForExternalClose();
        }

        return choice;
    }

    /**
     * Show a three-way dialog on close with unsaved changes.
     *
     * Returns: 'save' | 'discard' | 'cancel'.
     *
     *   Сохранить      → 'save'    (persists, editor stays open)
     *   Не сохранять   → 'discard' (close, drop changes)
     *   Отмена         → 'cancel'  (do nothing, keep editor open)
     *
     * Uses the shared createModal('confirm') with three buttons.
     * Falls back to window.confirm() — 2-way (save / discard) — if
     * createModal is unavailable.
     */
    async _askSaveOnClose() {
        if (!this._createModal) {
            const ok = window.confirm(
                'Есть несохранённые изменения. Сохранить перед закрытием?'
            );
            return ok ? 'save' : 'discard';
        }

        try {
            const modal = await this._createModal('confirm');

            return await new Promise((resolve) => {
                let settled = false;
                const settle = (v) => {
                    if (settled) return;
                    settled = true;
                    resolve(v);
                };

                modal.open(
                    'Есть несохранённые изменения. Сохранить перед закрытием?',
                    'Закрытие редактора',
                    'Сохранить',      // ok-btn
                    'Отмена',         // cancel-btn
                    'Не сохранять'    // no-btn (enables 3-button mode)
                );

                modal.setOnOk(() => { modal.destroy(); settle('save'); });
                modal.setOnCancel(() => { modal.destroy(); settle('cancel'); });
                modal.setOnNo(() => { modal.destroy(); settle('discard'); });
            });
        } catch (e) {
            console.warn('[Editor] _askSaveOnClose modal failed:', e);
            const ok = window.confirm(
                'Есть несохранённые изменения. Сохранить перед закрытием?'
            );
            return ok ? 'save' : 'discard';
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

        // Stop auto-save.
        this._stopAutoSaveInterval();

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
        this._createModal = null;
        this._modals = null;
        this._history = null;

        this._initialized = false;
        this._initPromise = null;
    }
}