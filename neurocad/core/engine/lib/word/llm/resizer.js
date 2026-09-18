// neurocad/core/engine/lib/word/llm/resizer.js

/**
 * LLMResizer — перетаскивание границ между тремя областями LLM-редактора.
 *
 * Что делает:
 *   1. Вставляет две «ручки» (col-resize) между:
 *        .area-left   ↔ .area-center
 *        .area-center ↔ .area-right
 *   2. По mousedown / mousemove / mouseup меняет ширину левой и правой
 *      панелей, ограничивая её min/max.
 *   3. Сохраняет ширины в localStorage (свои ключи — не конфликтуют с GrapesJS).
 *   4. При следующем открытии редактора — восстанавливает.
 *
 * Отличается от editor/resizer.js:
 *   - свои ключи localStorage (llm:*);
 *   - свой CSS-класс (llm-resizer) — стили в llm.css;
 *   - НЕ вызывает editor.refresh() (нет GrapesJS).
 */
export class LLMResizer {
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

        // Хранилище (свои ключи, не конфликтуют с GrapesJS)
        this._storageKeyLeft = 'llm:word-editor:left-width';
        this._storageKeyRight = 'llm:word-editor:right-width';

        // Ограничения ширины
        this._minWidth = 180;    // px
        this._maxWidth = 480;    // px
    }

    // ============================================
    // ПОСТРОЕНИЕ
    // ============================================

    build() {
        console.log('[LLMResizer] build()');

        this.leftEl = document.querySelector('.core-engine-lib-base-area-left');
        this.centerEl = document.querySelector('.core-engine-lib-base-area-center');
        this.rightEl = document.querySelector('.core-engine-lib-base-area-right');
        this.mainInnerEl = document.querySelector('.core-engine-lib-base-main-inner');

        if (!this.leftEl || !this.centerEl || !this.rightEl || !this.mainInnerEl) {
            console.warn('[LLMResizer] Не найдены области для ресайза');
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

        console.log('[LLMResizer] Ручки вставлены');
    }

    _createHandle(side) {
        const handle = document.createElement('div');
        handle.className = 'core-engine-lib-word-llm-resizer';
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

        this._onMouseMove = (ev) => this._onMouseMoveHandler(ev);
        this._onMouseUp = () => this._onMouseUpHandler();

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _onMouseMoveHandler(e) {
        if (!this._dragging) return;

        const delta = e.clientX - this._startX;

        if (this._dragging === 'left') {
            let newWidth = this._startWidth + delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.leftEl.style.width = newWidth + 'px';
        } else {
            let newWidth = this._startWidth - delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.rightEl.style.width = newWidth + 'px';
        }
    }

    _onMouseUpHandler() {
        if (!this._dragging) return;

        if (this._dragging === 'left') {
            this.leftHandle.classList.remove('active');
            const w = Math.round(this.leftEl.getBoundingClientRect().width);
            try {
                localStorage.setItem(this._storageKeyLeft, String(w));
            } catch (e) {
                console.warn('[LLMResizer] Не удалось сохранить ширину левой панели:', e);
            }
        } else {
            this.rightHandle.classList.remove('active');
            const w = Math.round(this.rightEl.getBoundingClientRect().width);
            try {
                localStorage.setItem(this._storageKeyRight, String(w));
            } catch (e) {
                console.warn('[LLMResizer] Не удалось сохранить ширину правой панели:', e);
            }
        }

        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this._onMouseMove = null;
        this._onMouseUp = null;

        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        this._dragging = null;
    }

    // ============================================
    // ВОССТАНОВЛЕНИЕ ШИРИН
    // ============================================

    restore() {
        try {
            const leftW = parseInt(localStorage.getItem(this._storageKeyLeft) || '', 10);
            if (Number.isFinite(leftW)) {
                const w = this._clamp(leftW, this._minWidth, this._maxWidth);
                this.leftEl.style.width = w + 'px';
                console.log(`[LLMResizer] Левая панель: ${w}px из localStorage`);
            }

            const rightW = parseInt(localStorage.getItem(this._storageKeyRight) || '', 10);
            if (Number.isFinite(rightW)) {
                const w = this._clamp(rightW, this._minWidth, this._maxWidth);
                this.rightEl.style.width = w + 'px';
                console.log(`[LLMResizer] Правая панель: ${w}px из localStorage`);
            }
        } catch (e) {
            console.warn('[LLMResizer] Не удалось прочитать ширины из localStorage:', e);
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
        console.log('[LLMResizer] destroy()');

        if (this._onMouseMove) {
            document.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        if (this._onMouseUp) {
            document.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }

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