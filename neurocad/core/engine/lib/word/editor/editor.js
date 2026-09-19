// app/core/engine/lib/word/editor/editor.js

/**
 * Editor — GrapesJS visual editor (part of the Word component).
 *
 * Orchestrator class. Does nothing itself, assembles submodules:
 *
 *   widgets.js   -> builds DOM of three areas (left / center / right) + toolbar
 *   styles.js    -> provides StyleManager sections
 *   grapes.js    -> loads GrapesJS CSS/JS and calls grapesjs.init()
 *   assets.js    -> works with media library (GET /assets, POST /assets/upload)
 *   blocks/      -> registers block library
 *   resizer.js   -> handles for dragging borders between areas
 *   base/modal   -> Base modals (incl. textarea for custom CSS)
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

        // DOM elements (filled by widgets.build())
        this.leftArea = null;
        this.rightArea = null;
        this.blocksEl = null;
        this.canvasEl = null;
        this.toolbarEl = null;
        this.stylesEl = null;

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
                { createModal },
            ] = await Promise.all([
                import(`./grapes.js?v=${version}`),
                import(`./widgets.js?v=${version}`),
                import(`./styles.js?v=${version}`),
                import(`./assets.js?v=${version}`),
                import(`./blocks/index.js?v=${version}`),
                import(`./resizer.js?v=${version}`),
                import(`../../base/modal/index.js?v=${version}`),
            ]);

            this._createModal = createModal;

            // 2. Build DOM of three areas (left / center / right) + toolbar
            this._widgets = new WidgetsBuilder(this);
            this._widgets.build();

            // 2.5. Resizer handles — BEFORE grapesjs.init(),
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

            // 7. Initial data
            this._loadData();

            // 8. Toolbar + hotkeys
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
    // DATA LOADING
    // ============================================

    _loadData() {
        console.log('[Editor] Loading data');

        if (this.initialProject && this.initialProject.components) {
            this.editor.loadProjectData(this.initialProject);
            console.log('[Editor] JSON project loaded');
        } else if (this.initialHtml) {
            this.editor.setComponents(this.initialHtml);
            console.log('[Editor] HTML loaded');
        } else {
            console.log('[Editor] No data — setting empty paragraph');
            this.editor.setComponents('<p></p>');
        }
    }

    // ============================================
    // TOOLBAR + HOTKEYS
    // ============================================

    _buildToolbar() {
        console.log('[Editor] _buildToolbar()');

        if (!this.toolbarEl) return;

        this.toolbarEl.innerHTML = `
            <button type="button" data-action="save" title="Сохранить (Ctrl+S)" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">💾</span>
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
                    <span class="core-engine-lib-word-editor-btn-icon">🖥️</span>
                </button>
                <button type="button" data-action="tablet" title="Планшет" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <span class="core-engine-lib-word-editor-btn-icon">📱</span>
                </button>
                <button type="button" data-action="mobile" title="Мобильный" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <span class="core-engine-lib-word-editor-btn-icon">📲</span>
                </button>
            </div>
            <div class="core-engine-lib-word-editor-separator"></div>
            <button type="button" data-action="css" title="Кастомный CSS" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">{ }</span>
            </button>
            <div class="core-engine-lib-word-editor-separator"></div>
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
    // CUSTOM CSS MODAL (via Base Modal)
    // ============================================

    /**
     * Open custom CSS modal.
     * Uses BaseModalTextarea from base/modal.
     */
    _openCssModal() {
        if (!this._createModal) {
            console.warn('[Editor] createModal not loaded');
            return;
        }

        const comp = this.editor.getSelected();

        if (!comp) {
            // Nothing selected — nothing to open
            const modal = this._createModal('message');
            modal.open(
                'Сначала выберите элемент на холсте.',
                'Кастомный CSS',
                'Понятно'
            );
            modal.setOnOk(() => modal.destroy());
            return;
        }

        const tag = (comp.get('tagName') || 'DIV').toUpperCase();
        const classes = comp.getClasses().join('.');
        const targetLabel = classes
            ? `<${tag} class="${classes}">`
            : `<${tag}>`;

        // Current inline styles
        const style = comp.getStyle() || {};
        const initialCss = Object.entries(style)
            .map(([k, v]) => `${k}: ${v};`)
            .join('\n');

        const modal = this._createModal('textarea');

        modal.open(
            targetLabel,
            'Кастомный CSS',
            'Например:\nbackground: url("/media/uploads/photo.jpg") center/cover no-repeat;\nborder-radius: 12px;',
            initialCss
        );

        modal.setOnOk((value) => {
            this._applyCustomCss(value);
            modal.destroy();
        });

        modal.setOnCancel(() => {
            modal.destroy();
        });
    }

    /**
     * Apply CSS from string to the selected component.
     */
    _applyCustomCss(cssText) {
        const comp = this.editor.getSelected();
        if (!comp) return;

        const styleObj = this._parseCssText(cssText || '');

        if (Object.keys(styleObj).length === 0) {
            console.warn('[Editor] Custom CSS is empty or unrecognized');
            return;
        }

        comp.addStyle(styleObj);
        console.log('[Editor] Custom CSS applied:', styleObj);
    }

    /**
     * Simple CSS text parser into {property: value} object.
     * Understands multi-line and single-line format, ignores comments.
     */
    _parseCssText(text) {
        const result = {};

        // Remove /* ... */ comments
        const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');

        // Split by ';' or newlines
        const declarations = cleaned.split(/;|\n/);

        for (let decl of declarations) {
            decl = decl.trim();
            if (!decl) continue;

            const idx = decl.indexOf(':');
            if (idx === -1) continue;

            const prop = decl.slice(0, idx).trim();
            const value = decl.slice(idx + 1).trim();

            if (prop && value) {
                result[prop] = value;
            }
        }

        return result;
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

        this._initialized = false;
        this._initPromise = null;
    }
}