// app/core/engine/lib/word/editor/grapes.js

/**
 * GrapesLoader — загрузка и инициализация GrapesJS.
 *
 * Задачи:
 *   1. Подключить CSS/JS GrapesJS из /static/libs/grapesjs-0.21.13/.
 *   2. Подключить НАШИ CSS-файлы (интерфейс редактора) — по одному <link>.
 *      Все они идут ПОСЛЕ grapes.min.css, чтобы перебивать его правила.
 *   3. Подключить плагин grapesjs-blocks-basic.
 *   4. В canvas (iframe GrapesJS) подключить canvas.css — стили блоков,
 *      чтобы кнопки/карточки/сетки внутри редактора выглядели одинаково
 *      с сайтом. Без этого в iframe нет наших классов, и кнопки «голые».
 *   5. Собрать конфиг и вызвать grapesjs.init().
 *   6. После init — сбросить inline-стили у блоков, которые ставит GrapesJS.
 *
 * Никакой логики редактора здесь нет — только «поднять и запустить».
 * Всё, что касается DOM — уже сделал WidgetsBuilder.
 */
export class GrapesLoader {
    /**
     * @param {Editor} editor — родительский Editor (берём у него DOM-ссылки и API)
     * @param {Object} options — { styleManagerSectors: Array }
     */
    constructor(editor, options = {}) {
        this.editor = editor;
        this.options = options;

        this.baseUrl = '/static/libs/grapesjs-0.21.13';

        // Наши CSS для интерфейса редактора (основной документ)
        this.cssBase = '/static/core/engine/lib/word/editor/css';
        this.cssFiles = [
            'layout.css',
            'toolbar.css',
            'blocks.css',
            'styles.css',
            'assets.css',
            'resizer.css',
            'theme.css',
            'responsive.css',
        ];

        // Наш CSS для iframe canvas (только стили блоков)
        this.canvasCss = '/static/core/engine/lib/word/editor/css/canvas.css';
    }

    // ============================================
    // ЗАГРУЗКА РЕСУРСОВ
    // ============================================

    /**
     * Загрузить все внешние ресурсы.
     *
     * ПОРЯДОК:
     *   1. grapes.min.css  — базовые стили GrapesJS.
     *   2. Наши CSS (по одному <link>) — ПОСЛЕ, чтобы перебивать.
     *   3. grapes.min.js
     *   4. grapesjs-blocks-basic.min.js
     */
    async load() {
        console.log('[GrapesLoader] Загрузка ресурсов');

        const version = window.coreEngine?.static_version || Date.now();

        // 1. CSS GrapesJS — базовый
        this._loadStylesheet(`${this.baseUrl}/grapes.min.css`);

        // 2. Наши CSS — каждый файл отдельным <link>.
        //    Идут после grapes.min.css, значит выигрывают по каскаду
        //    при равной специфичности (без !important).
        this.cssFiles.forEach((file) => {
            const href = `${this.cssBase}/${file}?v=${version}`;
            this._loadStylesheet(href);
        });

        // 3. JS GrapesJS
        await this._loadScript(`${this.baseUrl}/grapes.min.js`);

        // 4. JS grapesjs-blocks-basic
        await this._loadScript(`${this.baseUrl}/grapesjs-blocks-basic.min.js`);
    }

    _loadStylesheet(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Не загрузился скрипт: ${src}`));
            document.head.appendChild(script);
        });
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ GRAPESJS
    // ============================================

    /**
     * Собрать конфиг и вызвать grapesjs.init().
     * Возвращает инстанс GrapesJS.
     */
    init() {
        console.log('[GrapesLoader] init()');

        if (typeof grapesjs === 'undefined') {
            throw new Error('[GrapesLoader] grapesjs не загружен');
        }

        const e = this.editor;

        if (!e.canvasEl) {
            throw new Error('[GrapesLoader] e.canvasEl не найден — WidgetsBuilder.build() не вызывался?');
        }

        const version = window.coreEngine?.static_version || Date.now();

        // ===== Плагины =====
        const plugins = [];
        if (typeof grapesjsBlocksBasic !== 'undefined') {
            plugins.push(grapesjsBlocksBasic);
        }

        // ===== Конфиг =====
        const config = {
            container: e.canvasEl,
            height: '100%',
            width: 'auto',
            fromElement: false,
            storageManager: false,

            plugins: plugins,
            pluginsOpts: {
                'grapesjs-blocks-basic': {
                    flexGrid: true,
                    category: 'Сетки',
                },
            },

            // Отключаем встроенные панели — у нас своя toolbar
            panels: { defaults: [] },

            // Устройства
            deviceManager: {
                devices: [
                    { name: 'desktop', width: '' },
                    { name: 'tablet', width: '768px', widthMedia: '992px' },
                    { name: 'mobile', width: '375px', widthMedia: '480px' },
                ],
            },

            // Медиатека — привязана к нашему API
            assetManager: {
                assets: [],
                upload: e._assetsUploadApi,
                uploadName: 'files',
                autoAdd: 1,
                dropzone: 1,
                openAssetsOnDrop: 1,
                headers: {},
                uploadText: 'Перетащите файлы сюда или нажмите для выбора',
                addBtnText: 'Добавить по ссылке',
                modalTitle: 'Медиатека',
            },

            // ===== CSS внутри iframe canvas =====
            // Эти файлы подключаются к <head> того iframe, в котором
            // рендерятся блоки. Без них .core-btn, .core-card и прочие
            // классы внутри редактора не работают — кнопки «голые».
            canvas: {
                styles: [
                    `${this.canvasCss}?v=${version}`,
                ],
            },
        };

        // ===== BlockManager =====
        if (e.blocksEl) {
            config.blockManager = {
                appendTo: e.blocksEl,
            };
        }

        // ===== StyleManager =====
        if (e.stylesEl) {
            config.styleManager = {
                appendTo: e.stylesEl,
                sectors: this.options.styleManagerSectors || [],
            };
        }

        // ===== Запуск =====
        const instance = grapesjs.init(config);
        console.log('[GrapesLoader] GrapesJS инициализирован');

        // ===== Сброс inline-стилей у блоков =====
        // GrapesJS на некоторых версиях ставит inline width: 50%; float: left;
        // на .gjs-block при рендере. Inline-стиль перебивает CSS из editor.css,
        // поэтому убираем его через JS — тогда наши grid-правила сработают.
        this._resetBlockInlineStyles(instance);

        return instance;
    }

    /**
     * Убираем inline width/float/margin у карточек блоков,
     * которые GrapesJS ставит при рендере.
     */
    _resetBlockInlineStyles(instance) {
        try {
            const blocks = instance.BlockManager.getAll();
            blocks.forEach((block) => {
                const el = block.get('el');
                if (el && el.style) {
                    el.style.width = '';
                    el.style.maxWidth = '';
                    el.style.minWidth = '';
                    el.style.float = '';
                    el.style.margin = '';
                    el.style.flexBasis = '';
                }
            });
            console.log('[GrapesLoader] Inline-стили блоков сброшены');
        } catch (e) {
            console.warn('[GrapesLoader] Не удалось сбросить inline-стили блоков:', e);
        }
    }
}