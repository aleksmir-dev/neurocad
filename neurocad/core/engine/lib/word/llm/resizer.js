// neurocad/core/engine/lib/word/llm/resizer.js

/**
 * LLMResizer — drag handles between the three areas of the LLM editor.
 *
 * What it does:
 *   1. Inserts two "handles" (col-resize) between:
 *        .area-left   ↔ .area-center
 *        .area-center ↔ .area-right
 *   2. On mousedown / mousemove / mouseup changes the width of the
 *      left and right panels, clamped to min/max.
 *   3. Saves widths to localStorage (own keys — do not clash with GrapesJS).
 *   4. On next editor open — restores them.
 *
 * Differences from editor/resizer.js:
 *   - own localStorage keys (llm:*);
 *   - own CSS class (llm-resizer) — styles in llm.css;
 *   - does NOT call editor.refresh() (no GrapesJS).
 */
export class LLMResizer {
    constructor(editor) {
        this.editor = editor;

        // DOM elements
        this.leftEl = null;
        this.centerEl = null;
        this.rightEl = null;
        this.mainInnerEl = null;

        // Handles
        this.leftHandle = null;
        this.rightHandle = null;

        // Drag state
        this._dragging = null;   // 'left' | 'right' | null
        this._startX = 0;
        this._startWidth = 0;

        // Listeners
        this._onMouseMove = null;
        this._onMouseUp = null;

        // Storage (own keys, do not clash with GrapesJS)
        this._storageKeyLeft = 'llm:word-editor:left-width';
        this._storageKeyRight = 'llm:word-editor:right-width';

        // Width limits
        this._minWidth = 180;       // px — minimum for a single panel
        this._minCenterWidth = 400; // px — minimum space reserved for center
        this._absoluteMaxWidth = 800; // px — hard cap for a single panel
    }

    // ============================================
    // BUILD
    // ============================================

    build() {
        console.log('[LLMResizer] build()');

        this.leftEl = document.querySelector('.core-engine-lib-base-area-left');
        this.centerEl = document.querySelector('.core-engine-lib-base-area-center');
        this.rightEl = document.querySelector('.core-engine-lib-base-area-right');
        this.mainInnerEl = document.querySelector('.core-engine-lib-base-main-inner');

        if (!this.leftEl || !this.centerEl || !this.rightEl || !this.mainInnerEl) {
            console.warn('[LLMResizer] Areas for resize not found');
            return;
        }

        // Restore widths before inserting handles
        this.restore();

        // Left handle — between .area-left and .area-center
        this.leftHandle = this._createHandle('left');
        this.mainInnerEl.insertBefore(this.leftHandle, this.centerEl);

        // Right handle — between .area-center and .area-right
        this.rightHandle = this._createHandle('right');
        this.mainInnerEl.insertBefore(this.rightHandle, this.rightEl);

        // Bind mousedown
        this.leftHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'left'));
        this.rightHandle.addEventListener('mousedown', (e) => this._onHandleMouseDown(e, 'right'));

        console.log('[LLMResizer] Handles inserted');
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
        const maxWidth = this._getMaxWidth();

        if (this._dragging === 'left') {
            let newWidth = this._startWidth + delta;
            newWidth = this._clamp(newWidth, this._minWidth, maxWidth);
            this.leftEl.style.width = newWidth + 'px';
        } else {
            let newWidth = this._startWidth - delta;
            newWidth = this._clamp(newWidth, this._minWidth, maxWidth);
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
                console.warn('[LLMResizer] Failed to save left panel width:', e);
            }
        } else {
            this.rightHandle.classList.remove('active');
            const w = Math.round(this.rightEl.getBoundingClientRect().width);
            try {
                localStorage.setItem(this._storageKeyRight, String(w));
            } catch (e) {
                console.warn('[LLMResizer] Failed to save right panel width:', e);
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
    // RESTORE WIDTHS
    // ============================================

    restore() {
        const maxWidth = this._getMaxWidth();

        try {
            const leftW = parseInt(localStorage.getItem(this._storageKeyLeft) || '', 10);
            if (Number.isFinite(leftW)) {
                const w = this._clamp(leftW, this._minWidth, maxWidth);
                this.leftEl.style.width = w + 'px';
                console.log(`[LLMResizer] Left panel: ${w}px from localStorage`);
            }

            const rightW = parseInt(localStorage.getItem(this._storageKeyRight) || '', 10);
            if (Number.isFinite(rightW)) {
                const w = this._clamp(rightW, this._minWidth, maxWidth);
                this.rightEl.style.width = w + 'px';
                console.log(`[LLMResizer] Right panel: ${w}px from localStorage`);
            }
        } catch (e) {
            console.warn('[LLMResizer] Failed to read widths from localStorage:', e);
        }
    }

    // ============================================
    // UTILITIES
    // ============================================

    /**
     * Dynamic max width for a single panel.
     *
     * Reserves at least _minCenterWidth for the center area,
     * minus the width of the *other* panel (if present),
     * and never exceeds _absoluteMaxWidth.
     */
    _getMaxWidth() {
        const total = this.mainInnerEl
            ? this.mainInnerEl.getBoundingClientRect().width
            : window.innerWidth;

        // Width of the opposite panel (if any) — to respect both sides
        let oppositeWidth = 0;
        if (this._dragging === 'left') {
            oppositeWidth = this.rightEl
                ? this.rightEl.getBoundingClientRect().width
                : 0;
        } else if (this._dragging === 'right') {
            oppositeWidth = this.leftEl
                ? this.leftEl.getBoundingClientRect().width
                : 0;
        }

        const available = total - oppositeWidth - this._minCenterWidth;
        return Math.max(
            this._minWidth,
            Math.min(this._absoluteMaxWidth, available)
        );
    }

    _clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    // ============================================
    // DESTROY
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