// neurocad/core/engine/lib/botinv/resizer.js

/**
 * BotInvResizer — drag handles for the three-panel inventory layout.
 *
 * The botinv module occupies three areas at once:
 *
 *     area-left   → BotInvList (sheets sidebar)
 *     area-center → BotInvTable
 *     area-right  → BaseChat
 *
 * The shell (base) lays them out as a flex row, but their widths
 * are fixed by CSS. This class inserts two drag handles:
 *
 *     [area-left] ‖ [area-center] ‖ [area-right]
 *                  ^               ^
 *             left handle      right handle
 *
 * Dragging a handle resizes the corresponding side panel. Widths
 * are clamped to [minWidth, maxWidth] and persisted to localStorage,
 * so the user's layout survives reloads and navigation.
 *
 * This is deliberately a standalone class — it does NOT reuse
 * word/editor/resizer.js because the editor version is tied to
 * GrapesJS (it calls editor.refresh() after every drag and freezes
 * iframes during the drag). The inventory module has neither.
 *
 * Key differences from the word-editor resizer:
 *   - no editor reference, no refresh() call;
 *   - no iframe freeze (there are no iframes in the inventory UI);
 *   - wider max (640px vs 480px) — chat replies and sheet names
 *     are long, the panels need room;
 *   - double-click on a handle resets the panel to its default width.
 *
 * Layout compatibility:
 *   The class expects the shell to provide
 *     .core-engine-lib-base-main-inner   (flex row)
 *     .core-engine-lib-base-area-left    (flex-shrink: 0)
 *     .core-engine-lib-base-area-center  (flex: 1)
 *     .core-engine-lib-base-area-right   (flex-shrink: 0)
 *   It inserts the two handles between them, inside main-inner.
 *
 * localStorage keys:
 *     botinv:left-width
 *     botinv:right-width
 *
 * Usage:
 *     const resizer = new BotInvResizer();
 *     resizer.build();          // insert handles + restore widths
 *     ...
 *     resizer.destroy();        // remove handles, detach listeners
 */
export class BotInvResizer {
    constructor(options = {}) {
        // DOM
        this.leftEl = null;
        this.centerEl = null;
        this.rightEl = null;
        this.mainInnerEl = null;

        this.leftHandle = null;
        this.rightHandle = null;

        // Drag state
        this._dragging = null;   // 'left' | 'right' | null
        this._startX = 0;
        this._startWidth = 0;

        // Document-level listeners during drag
        this._onMouseMove = null;
        this._onMouseUp = null;

        // localStorage keys
        this._storageKeyLeft = options.storageKeyLeft
            || 'botinv:left-width';
        this._storageKeyRight = options.storageKeyRight
            || 'botinv:right-width';

        // Default widths (used on first run and on double-click reset)
        this._defaultWidthLeft = options.defaultWidthLeft || 340;
        this._defaultWidthRight = options.defaultWidthRight || 360;

        // Limits
        this._minWidth = options.minWidth || 240;
        this._maxWidth = options.maxWidth || 640;
    }

    // ============================================
    // BUILD
    // ============================================

    /**
     * Locate the three areas, restore saved widths, insert the two
     * drag handles between them.
     *
     * Must be called AFTER the shell has rendered its layout
     * (area-left / area-center / area-right exist in the DOM) and
     * BEFORE the user sees the page — otherwise the panels will
     * visibly jump from the CSS default to the stored width.
     *
     * Returns true on success, false if the expected areas are
     * missing (in which case nothing is inserted).
     */
    build() {
        console.log('[BotInvResizer] build()');

        this.leftEl = document.querySelector('.core-engine-lib-base-area-left');
        this.centerEl = document.querySelector('.core-engine-lib-base-area-center');
        this.rightEl = document.querySelector('.core-engine-lib-base-area-right');
        this.mainInnerEl = document.querySelector('.core-engine-lib-base-main-inner');

        if (!this.leftEl || !this.centerEl || !this.rightEl || !this.mainInnerEl) {
            console.warn('[BotInvResizer] Не найдены области для ресайза');
            return false;
        }

        // Apply saved widths (or defaults) before the handles exist,
        // so the initial paint already has the right sizes.
        this._applyInitialWidths();

        // Left handle — between area-left and area-center.
        this.leftHandle = this._createHandle('left');
        this.mainInnerEl.insertBefore(this.leftHandle, this.centerEl);

        // Right handle — between area-center and area-right.
        this.rightHandle = this._createHandle('right');
        this.mainInnerEl.insertBefore(this.rightHandle, this.rightEl);

        // Wire mousedown + dblclick.
        this.leftHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'left'));
        this.rightHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'right'));

        this.leftHandle.addEventListener('dblclick', () => this._resetToDefault('left'));
        this.rightHandle.addEventListener('dblclick', () => this._resetToDefault('right'));

        console.log('[BotInvResizer] Ручки вставлены');
        return true;
    }

    _createHandle(side) {
        const handle = document.createElement('div');
        handle.className = 'core-engine-lib-botinv-resizer';
        handle.setAttribute('data-side', side);
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute(
            'title',
            side === 'left'
                ? 'Перетащите, чтобы изменить ширину левой панели. Двойной клик — сбросить.'
                : 'Перетащите, чтобы изменить ширину правой панели. Двойной клик — сбросить.'
        );
        return handle;
    }

    // ============================================
    // INITIAL WIDTHS
    // ============================================

    /**
     * Apply widths on first paint:
     *   - if a value is stored in localStorage → use it (clamped);
     *   - otherwise → use the default for that side.
     *
     * Setting the default explicitly (rather than relying on the CSS)
     * makes the first paint match what the user will get after a
     * drag, and keeps both sides consistent.
     */
    _applyInitialWidths() {
        const leftW = this._readWidth(this._storageKeyLeft, this._defaultWidthLeft);
        const rightW = this._readWidth(this._storageKeyRight, this._defaultWidthRight);

        this.leftEl.style.width = leftW + 'px';
        this.rightEl.style.width = rightW + 'px';

        console.log(`[BotInvResizer] Начальные ширины: left=${leftW}px, right=${rightW}px`);
    }

    _readWidth(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            const n = parseInt(raw || '', 10);
            if (Number.isFinite(n)) {
                return this._clamp(n, this._minWidth, this._maxWidth);
            }
        } catch (e) {
            console.warn(`[BotInvResizer] Не удалось прочитать ${key}:`, e);
        }
        return fallback;
    }

    _saveWidth(key, value) {
        try {
            localStorage.setItem(key, String(Math.round(value)));
        } catch (e) {
            console.warn(`[BotInvResizer] Не удалось сохранить ${key}:`, e);
        }
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

        // Document-level listeners so the drag continues even when
        // the pointer leaves the handle.
        this._onMouseMove = (ev) => this._onMouseMoveHandler(ev);
        this._onMouseUp = () => this._onMouseUpHandler();

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _onMouseMoveHandler(e) {
        if (!this._dragging) return;

        const delta = e.clientX - this._startX;

        if (this._dragging === 'left') {
            // Left panel: drag right → wider; drag left → narrower.
            let newWidth = this._startWidth + delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.leftEl.style.width = newWidth + 'px';
        } else {
            // Right panel: drag left → wider; drag right → narrower.
            let newWidth = this._startWidth - delta;
            newWidth = this._clamp(newWidth, this._minWidth, this._maxWidth);
            this.rightEl.style.width = newWidth + 'px';
        }
    }

    _onMouseUpHandler() {
        if (!this._dragging) return;

        if (this._dragging === 'left') {
            this.leftHandle.classList.remove('active');
            const w = this.leftEl.getBoundingClientRect().width;
            this._saveWidth(this._storageKeyLeft, w);
        } else {
            this.rightHandle.classList.remove('active');
            const w = this.rightEl.getBoundingClientRect().width;
            this._saveWidth(this._storageKeyRight, w);
        }

        // Detach document listeners.
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this._onMouseMove = null;
        this._onMouseUp = null;

        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        this._dragging = null;
    }

    // ============================================
    // RESET
    // ============================================

    /**
     * Reset one panel to its default width (double-click on a handle).
     * Also clears the localStorage entry, so the reset persists.
     */
    _resetToDefault(side) {
        if (side === 'left') {
            const w = this._clamp(this._defaultWidthLeft, this._minWidth, this._maxWidth);
            this.leftEl.style.width = w + 'px';
            try { localStorage.removeItem(this._storageKeyLeft); } catch (e) {}
            console.log(`[BotInvResizer] Левая панель сброшена к ${w}px`);
        } else {
            const w = this._clamp(this._defaultWidthRight, this._minWidth, this._maxWidth);
            this.rightEl.style.width = w + 'px';
            try { localStorage.removeItem(this._storageKeyRight); } catch (e) {}
            console.log(`[BotInvResizer] Правая панель сброшена к ${w}px`);
        }
    }

    // ============================================
    // UTILS
    // ============================================

    _clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    // ============================================
    // DESTROY
    // ============================================

    destroy() {
        console.log('[BotInvResizer] destroy()');

        // Remove drag listeners if a drag is still active.
        if (this._onMouseMove) {
            document.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        if (this._onMouseUp) {
            document.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }

        // Remove handles from the DOM.
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