// app/core/engine/lib/word/editor/editor.js

/**
 * Editor — визуальный редактор GrapesJS (часть компонента Word).
 *
 * Класс-оркестратор. Сам ничего не делает, а собирает подмодули:
 *
 *   widgets.js   → строит DOM трёх областей (left / center / right) и toolbar
 *   styles.js    → отдаёт секции StyleManager
 *   grapes.js    → грузит CSS/JS GrapesJS и вызывает grapesjs.init()
 *   assets.js    → работает с медиатекой (GET /assets, POST /assets/upload)
 *   blocks/      → регистрирует библиотеку блоков
 *   resizer.js   → ручки для перетаскивания границ между областями
 *   base/modal   → модалки Base (в т.ч. textarea для кастомного CSS)
 *
 * Все внутренние модули подгружаются динамически, с версией из coreEngine,
 * чтобы кэш браузера не мешал при обновлениях.
 *
 * Наружу (в Word) отдаёт:
 *   - waitForInit()   — дождаться готовности
 *   - isInitialized() — проверить готовность
 *   - destroy()       — уничтожить редактор
 *   - editor          — сам инстанс GrapesJS (если нужно извне)
 *
 * Сохранение и отмена — через колбэки onSave / onCancel из props.
 */
export class Editor {
    constructor(container, props = {}) {
        console.log('[Editor] Конструктор', { container, props });

        this.container = container;
        this.props = props;

        // Данные для загрузки
        this.initialHtml = props.html || '';
        this.initialProject = props.project || null;

        // Колбэки
        this.onSave = props.onSave || null;
        this.onCancel = props.onCancel || null;

        // Состояние
        this.editor = null;
        this._initialized = false;
        this._initPromise = null;
        this._onKeyDown = null;

        // Подмодули (создаются в _init)
        this._widgets = null;
        this._stylesConfig = null;
        this._grapes = null;
        this._assets = null;
        this._blocks = null;
        this._resizer = null;
        this._createModal = null;

        // DOM-элементы (заполняются widgets.build())
        this.leftArea = null;
        this.rightArea = null;
        this.blocksEl = null;
        this.canvasEl = null;
        this.toolbarEl = null;
        this.stylesEl = null;

        // API медиатеки
        this._assetsApi = '/core/engine/lib/word/assets';
        this._assetsUploadApi = '/core/engine/lib/word/assets/upload';

        this._initPromise = this._init();
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    async _init() {
        console.log('[Editor] _init() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();

            // 1. Параллельно грузим все подмодули
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

            // 2. Строим DOM трёх областей (left / center / right) + toolbar
            this._widgets = new WidgetsBuilder(this);
            this._widgets.build();

            // 2.5. Ручки ресайза — ДО grapesjs.init(),
            // чтобы ширина панелей из localStorage уже применилась,
            // и GrapesJS сразу посчитал canvas под правильный размер.
            this._resizer = new Resizer(this);
            this._resizer.build();

            // 3. Конфиг StyleManager
            this._stylesConfig = new StylesConfig(this);

            // 4. Инициализация GrapesJS
            this._grapes = new GrapesLoader(this, {
                styleManagerSectors: this._stylesConfig.sectors(),
            });
            await this._grapes.load();
            this.editor = this._grapes.init();

            // 5. Библиотека блоков
            this._blocks = new BlocksRegistry(this.editor);
            await this._blocks.register();

            // 6. Медиатека (подгрузка существующих ассетов)
            this._assets = new AssetsManager(this);
            await this._assets.load();

            // 7. Начальные данные
            this._loadData();

            // 8. Toolbar + горячие клавиши
            this._buildToolbar();

            this._initialized = true;
            console.log('[Editor] _init() COMPLETE');
        } catch (error) {
            console.error('[Editor] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // ЗАГРУЗКА ДАННЫХ
    // ============================================

    _loadData() {
        console.log('[Editor] Загрузка данных');

        if (this.initialProject && this.initialProject.components) {
            this.editor.loadProjectData(this.initialProject);
            console.log('[Editor] Загружен JSON-проект');
        } else if (this.initialHtml) {
            this.editor.setComponents(this.initialHtml);
            console.log('[Editor] Загружен HTML');
        } else {
            console.log('[Editor] Нет данных — ставим пустой параграф');
            this.editor.setComponents('<p></p>');
        }
    }

    // ============================================
    // TOOLBAR + ГОРЯЧИЕ КЛАВИШИ
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

        // Делегированный обработчик клика по кнопкам toolbar
        this.toolbarEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            this._handleToolbarAction(btn.dataset.action);
        });

        // Горячие клавиши
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
    // МОДАЛКА КАСТОМНОГО CSS (через Base Modal)
    // ============================================

    /**
     * Открыть модалку кастомного CSS.
     * Использует BaseModalTextarea из base/modal.
     */
    _openCssModal() {
        if (!this._createModal) {
            console.warn('[Editor] createModal не загружен');
            return;
        }

        const comp = this.editor.getSelected();

        if (!comp) {
            // Ничего не выбрано — открывать нечего
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

        // Текущие inline-стили
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
     * Применить CSS из строки к выбранному компоненту.
     */
    _applyCustomCss(cssText) {
        const comp = this.editor.getSelected();
        if (!comp) return;

        const styleObj = this._parseCssText(cssText || '');

        if (Object.keys(styleObj).length === 0) {
            console.warn('[Editor] Кастомный CSS пуст или не распознан');
            return;
        }

        comp.addStyle(styleObj);
        console.log('[Editor] Применён кастомный CSS:', styleObj);
    }

    /**
     * Простой парсер CSS-текста в объект {property: value}.
     * Понимает многострочный и однострочный формат, игнорирует комментарии.
     */
    _parseCssText(text) {
        const result = {};

        // Убираем комментарии /* ... */
        const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');

        // Разбиваем по ';' или переносам строк
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
    // СОХРАНЕНИЕ
    // ============================================

    async _handleSave() {
        if (!this.onSave) {
            console.warn('[Editor] onSave не привязан');
            return;
        }

        console.log('[Editor] Сохранение...');

        const data = {
            html: this.editor.getHtml(),
            css: this.editor.getCss(),
            project: this.editor.getProjectData(),
        };

        try {
            await this.onSave(data);
            console.log('[Editor] Сохранено');
        } catch (error) {
            console.error('[Editor] Ошибка сохранения:', error);
        }
    }

    _handleCancel() {
        console.log('[Editor] Отмена');
        if (this.onCancel) {
            this.onCancel();
        }
    }

    // ============================================
    // ПУБЛИЧНЫЕ МЕТОДЫ
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

        // Убираем ручки ресайза и снимаем слушатели
        if (this._resizer) {
            try {
                this._resizer.destroy();
            } catch (e) {
                console.warn('[Editor] Ошибка при resizer.destroy():', e);
            }
            this._resizer = null;
        }

        if (this.editor) {
            try {
                this.editor.destroy();
            } catch (e) {
                console.warn('[Editor] Ошибка при editor.destroy():', e);
            }
            this.editor = null;
        }

        // Очищаем DOM-области (на случай, если GrapesJS не успел за собой убрать)
        if (this.leftArea) this.leftArea.innerHTML = '';
        if (this.rightArea) this.rightArea.innerHTML = '';
        if (this.container) this.container.innerHTML = '';

        // Сбрасываем подмодули
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