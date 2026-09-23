// app/core/engine/lib/word/editor/resizer.js

/**
 * Resizer — перетаскивание границ между тремя областями редактора.
 *
 * Что делает:
 *   1. Вставляет две «ручки» (col-resize) между:
 *        .area-left   ↔ .area-center
 *        .area-center ↔ .area-right
 *   2. По mousedown / mousemove / mouseup меняет ширину левой и правой
 *      панелей, ограничивая её min/max.
 *   3. Сохраняет ширины в localStorage.
 *   4. При следующем открытии редактора — восстанавливает.
 *
 * Где вставить ручки:
 *   Внутри .core-engine-lib-base-main-inner, между .area-left/.area-center
 *   и между .area-center/.area-right.
 *
 * Хранилище:
 *   localStorage, ключи:
 *     core-engine:word-editor:left-width
 *     core-engine:word-editor:right-width
 *
 * Заморозка iframe:
 *   Пока идёт drag — все <iframe> в документе получают
 *   pointer-events: none. Без этого mousemove уходит в iframe
 *   (canvas GrapesJS), как только мышь пересекает его границу —
 *   и drag «залипает» (работает только в сторону панели).
 *
 * Совместимо с layout из base/css/03_layout.css:
 *   .core-engine-lib-base-main-inner  — flex-row
 *   .core-engine-lib-base-area-left   — flex-shrink:0, width:12.5rem
 *   .core-engine-lib-base-area-center — flex:1
 *   .core-engine-lib-base-area-right  — flex-shrink:0, width:12.5rem
 */
export class Resizer {
    constructor(editor) {
        this.editor = editor;

        // DOM-элементы
        this.leftEl = null;
        this.centerEl = null;
        this.rightEl = null;
        this.mainInnerEl = null;

        // Ручки
        this.leftHandle = null;
        this.rightHandle = null;

        // Состояние drag
        this._dragging = null;   // 'left' | 'right' | null
        this._startX = 0;
        this._startWidth = 0;

        // Слушатели
        this._onMouseMove = null;
        this._onMouseUp = null;

        // Хранилище
        this._storageKeyLeft = 'core-engine:word-editor:left-width';
        this._storageKeyRight = 'core-engine:word-editor:right-width';

        // Ограничения ширины
        this._minWidth = 180;    // px
        this._maxWidth = 480;    // px
    }

    // ============================================
    // ПОСТРОЕНИЕ
    // ============================================

    /**
     * Найти области и вставить ручки.
     * Вызывается после WidgetsBuilder.build() (уже есть DOM Base),
     * но ДО grapesjs.init() — чтобы GrapesJS сразу видел правильные ширины.
     */
    build() {
        console.log('[Resizer] build()');

        this.leftEl = document.querySelector('.core-engine-lib-base-area-left');
        this.centerEl = document.querySelector('.core-engine-lib-base-area-center');
        this.rightEl = document.querySelector('.core-engine-lib-base-area-right');
        this.mainInnerEl = document.querySelector('.core-engine-lib-base-main-inner');

        if (!this.leftEl || !this.centerEl || !this.rightEl || !this.mainInnerEl) {
            console.warn('[Resizer] Не найдены области для ресайза');
            return;
        }

        // Восстанавливаем ширины до вставки ручек
        this.restore();

        // Левая ручка — между .area-left и .area-center
        this.leftHandle = this._createHandle('left');
        this.mainInnerEl.insertBefore(this.leftHandle, this.centerEl);

        // Правая ручка — между .area-center и .area-right
        this.rightHandle = this._createHandle('right');
        this.mainInnerEl.insertBefore(this.rightHandle, this.rightEl);

        // Привязываем mousedown
        this.leftHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'left'));
        this.rightHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'right'));

        console.log('[Resizer] Ручки вставлены');
    }

    _createHandle(side) {
        const handle = document.createElement('div');
        handle.className = 'core-engine-lib-word-editor-resizer';
        handle.setAttribute('data-side', side);
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('title', side === 'left'
            ? 'Перетащите, чтобы изменить ширину левой панели'
            : 'Перетащите, чтобы изменить ширину правой панели');
        return handle;
    }

    // ============================================
    // DRAG
    // ============================================

    _onHandleMouseDown(e, side) {
        e.preventDefault();

        this._dragging = side;
        this._startX = e.clientX;

        if (side === 'left') {
            this._startWidth = this.leftEl.getBoundingClientRect().width;
            this.leftHandle.classList.add('active');
        } else {
            this._startWidth = this.rightEl.getBoundingClientRect().width;
            this.rightHandle.classList.add('active');
        }

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Замораживаем iframe — иначе mousemove уходит в него,
        // как только мышь пересекает границу canvas.
        this._freezeIframes(true);

        // Слушатели на весь документ — чтобы drag не терялся
        this._onMouseMove = (ev) => this._onMouseMoveHandler(ev);
        this._onMouseUp = () => this._onMouseUpHandler();

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _onMouseMoveHandler(e) {
        if (!this._dragging) return;

        const delta = e.clientX - this._startX;

        if (this._dragging === 'left') {
            // Левая панель: вправо — шире, влево — уже
            let newWidth = this._startWidth + delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.leftEl.style.width = newWidth + 'px';
        } else {
            // Правая панель: влево — шире, вправо — уже
            let newWidth = this._startWidth - delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.rightEl.style.width = newWidth + 'px';
        }
    }

    _onMouseUpHandler() {
        if (!this._dragging) return;

        // Сохраняем ширину
        if (this._dragging === 'left') {
            this.leftHandle.classList.remove('active');
            const w = Math.round(this.leftEl.getBoundingClientRect().width);
            try {
                localStorage.setItem(this._storageKeyLeft, String(w));
            } catch (e) {
                console.warn('[Resizer] Не удалось сохранить ширину левой панели:', e);
            }
        } else {
            this.rightHandle.classList.remove('active');
            const w = Math.round(this.rightEl.getBoundingClientRect().width);
            try {
                localStorage.setItem(this._storageKeyRight, String(w));
            } catch (e) {
                console.warn('[Resizer] Не удалось сохранить ширину правой панели:', e);
            }
        }

        // Размораживаем iframe
        this._freezeIframes(false);

        // Снимаем слушатели
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this._onMouseMove = null;
        this._onMouseUp = null;

        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        this._dragging = null;

        // Сообщаем GrapesJS пересчитать размеры canvas
        if (this.editor.editor && typeof this.editor.editor.refresh === 'function') {
            try {
                this.editor.editor.refresh();
            } catch (err) {
                console.warn('[Resizer] refresh() не сработал:', err);
            }
        }
    }

    // ============================================
    // ЗАМОРОЗКА IFRAME
    // ============================================

    /**
     * Заморозить/разморозить все iframe на время drag.
     *
     * Ставим pointer-events: none — тогда мышь «проходит сквозь»
     * iframe, и mousemove продолжает приходить в родительский
     * документ. Без этого drag работает только в сторону панели
     * (влево для левой, вправо для правой), а при движении в сторону
     * canvas — «залипает».
     *
     * Сохраняем предыдущее значение pointer-events, чтобы
     * восстановить его после drag (если было непустым).
     */
    _freezeIframes(freeze) {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
            if (freeze) {
                if (iframe.dataset._prevPointerEvents === undefined) {
                    iframe.dataset._prevPointerEvents = iframe.style.pointerEvents || '';
                }
                iframe.style.pointerEvents = 'none';
            } else {
                const prev = iframe.dataset._prevPointerEvents || '';
                iframe.style.pointerEvents = prev;
                delete iframe.dataset._prevPointerEvents;
            }
        });
    }

    // ============================================
    // ВОССТАНОВЛЕНИЕ ШИРИН
    // ============================================

    /**
     * Прочитать сохранённые ширины из localStorage и применить.
     */
    restore() {
        try {
            const leftW = parseInt(localStorage.getItem(this._storageKeyLeft) || '', 10);
            if (Number.isFinite(leftW)) {
                const w = this._clamp(leftW, this._minWidth, this._maxWidth);
                this.leftEl.style.width = w + 'px';
                console.log(`[Resizer] Левая панель: ${w}px из localStorage`);
            }

            const rightW = parseInt(localStorage.getItem(this._storageKeyRight) || '', 10);
            if (Number.isFinite(rightW)) {
                const w = this._clamp(rightW, this._minWidth, this._maxWidth);
                this.rightEl.style.width = w + 'px';
                console.log(`[Resizer] Правая панель: ${w}px из localStorage`);
            }
        } catch (e) {
            console.warn('[Resizer] Не удалось прочитать ширины из localStorage:', e);
        }
    }

    // ============================================
    // УТИЛИТЫ
    // ============================================

    _clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    // ============================================
    // УНИЧТОЖЕНИЕ
    // ============================================

    destroy() {
        console.log('[Resizer] destroy()');

        // Снимаем активные слушатели, если drag ещё идёт
        if (this._onMouseMove) {
            document.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        if (this._onMouseUp) {
            document.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }

        // Размораживаем iframe — на случай, если destroy() во время drag
        this._freezeIframes(false);

        // Удаляем ручки из DOM
        if (this.leftHandle && this.leftHandle.parentNode) {
            this.leftHandle.parentNode.removeChild(this.leftHandle);
        }
        if (this.rightHandle && this.rightHandle.parentNode) {
            this.rightHandle.parentNode.removeChild(this.rightHandle);
        }

        this.leftHandle = null;
        this.rightHandle = null;

        this._dragging = null;
    }
}