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
 *   modals.js     -> HTML+CSS page modal and element CSS modal
 *   formatter.js  -> js-beautify wrapper (CSS / HTML pretty-print)
 *   base/modal    -> Base modals (incl. code modal for HTML + CSS)
 *   ../llm/chat.js    -> LLM chat panel (right)
 *   ../llm/presets.js -> Presets list (left tab)
 *
 * All internal modules are loaded dynamically, with version from coreEngine,
 * to avoid browser cache on updates.
 *
 * Exposes (to Word):
 *   - waitForInit()   — wait for readiness
 *   - isInitialized() — check readiness
 *   - destroy()       — destroy editor
 *   - editor          — GrapesJS instance (if needed externally)
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

        // Callbacks
        this.onSave = props.onSave || null;
        this.onCancel = props.onCancel || null;

        // State
        this.editor = null;
        this._initialized = false;
        this._initPromise = null;
        this._onKeyDown = null;

        // Submodules (created in _init)
        this._widgets = null;
        this._stylesConfig = null;
        this._grapes = null;
        this._assets = null;
        this._blocks = null;
        this._resizer = null;
        this._createModal = null;
        this._modals = null;    // modals.js module
        this._chat = null;      // LLM chat
        this._presets = null;   // LLM presets

        // DOM elements (filled by widgets.build())
        this.leftArea = null;
        this.rightArea = null;
        this.blocksEl = null;
        this.presetsEl = null;
        this.canvasEl = null;
        this.toolbarEl = null;
        this.stylesEl = null;
        this.traitsEl = null;
        this.chatEl = null;
        this.tabsEl = null;

        // Page data for LLM chat / presets
        this.pageId = props.pageId || null;
        this.pageData = props.pageData || null;

        // Media library API — with module_name for multi-site support.
        // module_name is passed via ?module= (see route.py / _module_name()).
        const moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        const qs = moduleName
            ? `?module=${encodeURIComponent(moduleName)}`
            : '';

        this._assetsApi = `/core/engine/lib/word/assets${qs}`;
        this._assetsUploadApi = `/core/engine/lib/word/assets/upload${qs}`;

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

            // 2.5. Bind tabs [Styles|Traits|Blocks|Presets]
            this._bindTabs();

            // 2.6. Resizer handles — BEFORE grapesjs.init(),
            // so panel widths from localStorage are applied,
            // and GrapesJS calculates canvas at the right size.
            this._resizer = new Resizer(this);
            this._resizer.build();

            // 3. StyleManager config
            this._stylesConfig = new StylesConfig(this);

            // 4. GrapesJS init
            this._grapes = new GrapesLoader(this, {
                styleManagerSectors: this._stylesConfig.sectors(),
            });
            await this._grapes.load();
            this.editor = this._grapes.init();

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

            // 9. Initial data
            this._loadData();

            // 10. Toolbar + hotkeys
            this._buildToolbar();

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
    // DATA LOADING
    // ============================================

    /**
     * Load initial data into GrapesJS.
     *
     * Priority:
     *   1. Full project JSON (getProjectData()) — preferred, keeps wrapper
     *      attributes (e.g. id) and CSS rules tied to them.
     *   2. HTML fallback — used for new pages or when the project JSON is
     *      missing. <style>...</style> blocks are extracted and applied to
     *      the CssComposer manually, because GrapesJS ignores them in
     *      setComponents(html).
     *
     * GrapesJS getProjectData() returns:
     *   { pages, styles, assets, ... }  — NO top-level `components`!
     * So we check `pages` / `styles` / `components`.
     */
    _loadData() {
        console.log('[Editor] Loading data');

        const proj = this.initialProject;
        const hasProject = !!(proj && (
            (proj.pages && proj.pages.length) ||
            (proj.styles && proj.styles.length) ||
            proj.components
        ));

        if (hasProject) {
            try {
                this.editor.loadProjectData(proj);
                console.log('[Editor] JSON project loaded');
                return;
            } catch (e) {
                console.warn('[Editor] loadProjectData failed, falling back to HTML:', e);
            }
        }

        if (this.initialHtml) {
            this.editor.setComponents(this.initialHtml);
            this._applyStylesFromHtml(this.initialHtml);
            console.log('[Editor] HTML loaded (+styles extracted)');
        } else {
            console.log('[Editor] No data — setting empty paragraph');
            this.editor.setComponents('<p></p>');
        }
    }

    /**
     * Extract <style>...</style> blocks from an HTML string and apply the
     * combined CSS to GrapesJS CssComposer.
     *
     * Why: setComponents(html) only parses components — <style> is ignored
     * by GrapesJS. So when loading a page as HTML (not as project JSON),
     * we must explicitly push its CSS into StyleManager.
     */
    _applyStylesFromHtml(html) {
        const matches = [...(html || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
        const css = matches.map(m => m[1]).join('\n').trim();

        if (!css) return;

        try {
            this.editor.setStyle(css);
            console.log('[Editor] Inline <style> applied to CssComposer');
        } catch (e) {
            console.warn('[Editor] setStyle failed:', e);
        }
    }

    // ============================================
    // TOOLBAR + HOTKEYS
    // ============================================

    _buildToolbar() {
        console.log('[Editor] _buildToolbar()');

        if (!this.toolbarEl) return;

        const iconsBase = '/static/core/engine/lib/base/images';

        this.toolbarEl.innerHTML = `
            <button type="button" data-action="save" title="Сохранить (Ctrl+S)" class="core-engine-lib-word-editor-btn">
                <img class="core-engine-lib-word-editor-btn-icon"
                     src="${iconsBase}/save.svg"
                     alt="" aria-hidden="true">
            </button>
            <div class="core-engine-lib-word-editor-separator"></div>
            <button type="button" data-action="undo" title="Отменить (Ctrl+Z)" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">↶</span>
            </button>
            <button type="button" data-action="redo" title="Повторить (Ctrl+Y)" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">↷</span>
            </button>
            <div class="core-engine-lib-word-editor-separator"></div>
            <div class="core-engine-lib-word-editor-devices">
                <button type="button" data-action="desktop" title="Десктоп" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device active">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/desktop.svg"
                         alt="" aria-hidden="true">
                </button>
                <button type="button" data-action="tablet" title="Планшет" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/tablet.svg"
                         alt="" aria-hidden="true">
                </button>
                <button type="button" data-action="mobile" title="Мобильный" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/mobile.svg"
                         alt="" aria-hidden="true">
                </button>
            </div>
            <div class="core-engine-lib-word-editor-separator"></div>
            <button type="button" data-action="html" title="Просмотр/редактирование HTML + CSS" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">&lt;&gt;</span>
            </button>
            <button type="button" data-action="css" title="Кастомный CSS элемента" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">{ }</span>
            </button>

            <div class="core-engine-lib-word-editor-toolbar-spacer"></div>

            <button type="button" data-action="cancel" title="Выход без сохранения" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">✕</span>
            </button>
        `;

        // Delegated click handler for toolbar buttons
        this.toolbarEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            this._handleToolbarAction(btn.dataset.action);
        });

        // Hotkeys
        this._onKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this._handleSave();
            } else if (e.key === 'Escape') {
                this._handleCancel();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.editor.UndoManager.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                this.editor.UndoManager.redo();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    _handleToolbarAction(action) {
        switch (action) {
            case 'save':
                this._handleSave();
                break;
            case 'undo':
                this.editor.UndoManager.undo();
                break;
            case 'redo':
                this.editor.UndoManager.redo();
                break;
            case 'desktop':
            case 'tablet':
            case 'mobile':
                this._setDevice(action);
                break;
            case 'html':
                this._openHtmlModal();
                break;
            case 'css':
                this._openCssModal();
                break;
            case 'cancel':
                this._handleCancel();
                break;
        }
    }

    _setDevice(device) {
        this.editor.setDevice(device);
        this.toolbarEl
            .querySelectorAll('.core-engine-lib-word-editor-btn-device')
            .forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.action === device);
            });
    }

    // ============================================
    // MODALS (delegated to modals.js)
    // ============================================

    /**
     * Open the page-level HTML + CSS modal.
     * Delegates to modals.js — openHtmlCssModal().
     */
    async _openHtmlModal() {
        if (!this._modals) {
            console.warn('[Editor] modals module not loaded');
            return;
        }
        await this._modals.openHtmlCssModal({
            editor: this.editor,
            createModal: this._createModal,
        });
    }

    /**
     * Open the element-level custom CSS modal.
     * Delegates to modals.js — openElementCssModal().
     */
    async _openCssModal() {
        if (!this._modals) {
            console.warn('[Editor] modals module not loaded');
            return;
        }
        await this._modals.openElementCssModal({
            editor: this.editor,
            createModal: this._createModal,
        });
    }

    // ============================================
    // SAVING
    // ============================================

    async _handleSave() {
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

        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }

        // Destroy LLM submodules
        if (this._chat) {
            try { this._chat.destroy(); } catch (e) { console.warn(e); }
            this._chat = null;
        }
        if (this._presets) {
            try { this._presets.destroy(); } catch (e) { console.warn(e); }
            this._presets = null;
        }

        // Remove resizer handles and listeners
        if (this._resizer) {
            try {
                this._resizer.destroy();
            } catch (e) {
                console.warn('[Editor] resizer.destroy() error:', e);
            }
            this._resizer = null;
        }

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

        // Reset submodules
        this._widgets = null;
        this._stylesConfig = null;
        this._grapes = null;
        this._assets = null;
        this._blocks = null;
        this._createModal = null;
        this._modals = null;

        this._initialized = false;
        this._initPromise = null;
    }
}