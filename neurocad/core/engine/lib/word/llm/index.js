// neurocad/core/engine/lib/word/llm/index.js

/**
 * LLMEditor — редактор страницы через LLM (пресеты + превью + чат).
 *
 * Класс-оркестратор. Собирает подмодули:
 *
 *   widgets.js  → строит DOM трёх областей (left / center / right) + toolbar
 *   presets.js  → левая панель: список пресетов
 *   preview.js  → центральная область: iframe + toolbar (Back/Forward/Undo/Redo/Save/Close)
 *   chat.js     → правая панель: чат с LLM
 *   history.js  → логика Undo/Redo
 *   resizer.js  → свои ручки ресайза между областями
 *
 * Три области:
 *   .area-left   → пресеты
 *   .area-center → превью (заменяет word-widget)
 *   .area-right  → чат
 *
 * Все подмодули подгружаются динамически, с версией из coreEngine,
 * чтобы кэш браузера не мешал при обновлениях.
 *
 * Наружу (в Word) отдаёт:
 *   - waitForInit()   — дождаться готовности
 *   - isInitialized() — проверить готовность
 *   - destroy()       — уничтожить редактор
 *
 * Сохранение и отмена — через колбэки onSave / onCancel из props.
 */
export class LLMEditor {
    constructor(container, props = {}) {
        console.log('[LLMEditor] Конструктор', { container, props });

        this.container = container;      // .core-engine-lib-word-widget-content
        this.props = props;

        // Данные страницы
        this.pageId = props.pageId || null;
        this.pageData = props.pageData || null;

        // Колбэки
        this.onSave = props.onSave || null;
        this.onCancel = props.onCancel || null;

        // Состояние
        this._initialized = false;
        this._initPromise = null;

        // Подмодули (создаются в _init)
        this._widgets = null;
        this._presets = null;
        this._preview = null;
        this._chat = null;
        this._history = null;
        this._resizer = null;

        // DOM-элементы (заполняются widgets.build())
        this.leftArea = null;
        this.rightArea = null;
        this.presetsEl = null;
        this.canvasEl = null;
        this.toolbarEl = null;
        this.chatEl = null;

        // API
        this._apiBase = '/core/engine/lib/word/llm';

        this._initPromise = this._init();
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    async _init() {
        console.log('[LLMEditor] _init() START');
        try {
            const version = window.coreEngine?.static_version || Date.now();

            // 1. Параллельно грузим подмодули
            const [
                { LLMWidgets },
                { LLMPresets },
                { LLMPreview },
                { LLMChat },
                { LLMHistory },
                { LLMResizer },
            ] = await Promise.all([
                import(`./widgets.js?v=${version}`),
                import(`./presets.js?v=${version}`),
                import(`./preview.js?v=${version}`),
                import(`./chat.js?v=${version}`),
                import(`./history.js?v=${version}`),
                import(`./resizer.js?v=${version}`),
            ]);

            // 2. Строим DOM трёх областей (left / center / right) + toolbar
            this._widgets = new LLMWidgets(this);
            this._widgets.build();

            // 3. Ручки ресайза — до инициализации preview,
            //    чтобы ширина панелей из localStorage применилась
            //    до рендера iframe.
            this._resizer = new LLMResizer(this);
            this._resizer.build();

            // 4. Подмодули
            this._presets = new LLMPresets(this);
            this._preview = new LLMPreview(this);
            this._chat = new LLMChat(this);
            this._history = new LLMHistory(this);

            // 5. Инициализация подмодулей — параллельно
            await Promise.all([
                this._presets.init(),
                this._preview.init(),
                this._chat.init(),
                this._history.init(),
            ]);

            this._initialized = true;
            console.log('[LLMEditor] _init() COMPLETE');
        } catch (error) {
            console.error('[LLMEditor] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
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

    /**
     * Сохранить текущий HTML страницы.
     * Вызывается из toolbar или из chat при применении изменений.
     */
    async save() {
        if (!this.onSave) {
            console.warn('[LLMEditor] onSave не привязан');
            return;
        }

        const html = this._preview?.getHtml() || '';

        try {
            await this.onSave({ html });
            console.log('[LLMEditor] Сохранено');
        } catch (error) {
            console.error('[LLMEditor] Ошибка сохранения:', error);
        }
    }

    /**
     * Отменить редактирование.
     */
    cancel() {
        console.log('[LLMEditor] Отмена');
        if (this.onCancel) {
            this.onCancel();
        }
    }

    destroy() {
        console.log('[LLMEditor] destroy()');

        // Уничтожаем подмодули
        if (this._history) {
            try { this._history.destroy(); } catch (e) { console.warn(e); }
            this._history = null;
        }
        if (this._chat) {
            try { this._chat.destroy(); } catch (e) { console.warn(e); }
            this._chat = null;
        }
        if (this._preview) {
            try { this._preview.destroy(); } catch (e) { console.warn(e); }
            this._preview = null;
        }
        if (this._presets) {
            try { this._presets.destroy(); } catch (e) { console.warn(e); }
            this._presets = null;
        }

        // Убираем ручки ресайза
        if (this._resizer) {
            try { this._resizer.destroy(); } catch (e) { console.warn(e); }
            this._resizer = null;
        }

        // Очищаем три области Base.
        // container очистит Word._closeLLMEditor() — он вернёт туда article.
        if (this.leftArea) this.leftArea.innerHTML = '';
        if (this.rightArea) this.rightArea.innerHTML = '';

        // Сбрасываем ссылки на DOM
        this._widgets = null;
        this.leftArea = null;
        this.rightArea = null;
        this.presetsEl = null;
        this.canvasEl = null;
        this.toolbarEl = null;
        this.chatEl = null;

        this._initialized = false;
        this._initPromise = null;
    }
}