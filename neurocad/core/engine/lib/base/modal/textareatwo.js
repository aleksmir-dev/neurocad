// app/core/engine/lib/base/modal/textareatwo.js

/**
 * BaseModalTextareaTwo — modal with two textareas and a draggable divider.
 *
 * Layout (default):
 *   [ CSS  ]
 *   ───────  ← draggable resizer (vertical)
 *   [ HTML ]
 *
 * Features:
 *   - Vertical drag handle between the two fields.
 *   - Position stored in localStorage (per modal instance).
 *   - Optional labels (hidden by default).
 *
 * Usage:
 *   const modal = await createModal('textareatwo');
 *   modal.open({
 *       title: 'HTML + CSS страницы',
 *       css: '...',
 *       html: '...',
 *       showLabels: false,   // optional
 *   });
 *   modal.setOnOk(({ css, html }) => { ... });
 *   modal.setOnCancel(() => { ... });
 */
export class BaseModalTextareaTwo {
    constructor() {
        this.container = null;
        this.onOk = null;
        this.onCancel = null;

        // localStorage key for split position (per instance)
        this._storageKey = 'neurocad:textareatwo:splitPercent';
        this._defaultSplit = 35;   // CSS gets 35% by default

        this._loadCSS();
        this._createDOM();
        this._bindEvents();
    }

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/textareatwo.css');
        }
    }

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-base-modal-textareatwo');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-textareatwo';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Код</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <label class="field-label field-label-css">CSS</label>
                    <textarea class="field-css" spellcheck="false"></textarea>

                    <div class="resizer" data-js="resizer"></div>

                    <label class="field-label field-label-html">HTML</label>
                    <textarea class="field-html" spellcheck="false"></textarea>

                    <div class="actions-bar">
                        <button class="btn btn-white cancel-btn">Отмена</button>
                        <button class="btn btn-white ok-btn">ОК</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
    }

    _cacheElements() {
        this.titleBarText    = this.container.querySelector('.title-bar-text');
        this.cssField        = this.container.querySelector('.field-css');
        this.htmlField       = this.container.querySelector('.field-html');
        this.cssLabel        = this.container.querySelector('.field-label-css');
        this.htmlLabel       = this.container.querySelector('.field-label-html');
        this.resizer         = this.container.querySelector('[data-js="resizer"]');
        this.okBtn           = this.container.querySelector('.ok-btn');
        this.cancelBtn       = this.container.querySelector('.cancel-btn');
        this.closeBtn        = this.container.querySelector('.close-btn');
        this.content         = this.container.querySelector('.content');
    }

    _bindEvents() {
        // OK
        this.okBtn.addEventListener('click', () => {
            const values = {
                css: this.cssField.value,
                html: this.htmlField.value,
            };
            if (this.onOk) this.onOk(values);
            this.close();
        });

        // Cancel
        this.cancelBtn.addEventListener('click', () => {
            if (this.onCancel) this.onCancel(null);
            this.close();
        });

        // Close (X)
        this.closeBtn.addEventListener('click', () => {
            if (this.onCancel) this.onCancel(null);
            this.close();
        });

        // Ctrl+Enter — apply
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                const values = {
                    css: this.cssField.value,
                    html: this.htmlField.value,
                };
                if (this.onOk) this.onOk(values);
                this.close();
            }
        };
        this.cssField.addEventListener('keydown', onKey);
        this.htmlField.addEventListener('keydown', onKey);

        // Click on overlay — cancel
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                if (this.onCancel) this.onCancel(null);
                this.close();
            }
        });

        // Escape — cancel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                if (this.onCancel) this.onCancel(null);
                this.close();
            }
        });

        // ===== Resizer: drag to change CSS/HTML split =====
        this._bindResizer();
    }

    _bindResizer() {
        if (!this.resizer) return;

        let startY = 0;
        let startCssHeight = 0;
        let contentHeight = 0;

        const onMouseDown = (e) => {
            e.preventDefault();

            const cssRect = this.cssField.getBoundingClientRect();
            const contentRect = this.content.getBoundingClientRect();

            startY = e.clientY;
            startCssHeight = cssRect.height;
            contentHeight = contentRect.height;

            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            const deltaY = e.clientY - startY;
            const newCssHeight = startCssHeight + deltaY;

            // Clamp: CSS between 15% and 85% of content
            const minH = contentHeight * 0.15;
            const maxH = contentHeight * 0.85;
            const clampedH = Math.max(minH, Math.min(maxH, newCssHeight));

            const percent = (clampedH / contentHeight) * 100;
            this._applySplit(percent);
        };

        const onMouseUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Save split percent
            const percent = parseFloat(this.cssField.style.flexBasis) || this._defaultSplit;
            this._saveSplit(percent);
        };

        this.resizer.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Apply split percent: CSS gets `percent` of the available height,
     * HTML gets the rest.
     */
    _applySplit(percent) {
        this.cssField.style.flex = `0 0 ${percent}%`;
        this.htmlField.style.flex = `1 1 auto`;
    }

    _loadSplit() {
        try {
            const saved = localStorage.getItem(this._storageKey);
            if (saved) {
                const percent = parseFloat(saved);
                if (!isNaN(percent) && percent >= 15 && percent <= 85) {
                    return percent;
                }
            }
        } catch (e) {
            console.warn('[TextareaTwo] localStorage read error:', e);
        }
        return this._defaultSplit;
    }

    _saveSplit(percent) {
        try {
            localStorage.setItem(this._storageKey, String(percent));
        } catch (e) {
            console.warn('[TextareaTwo] localStorage write error:', e);
        }
    }

    // ========== Public methods ==========

    open({ title, css, html, showLabels = false } = {}) {
        this.titleBarText.textContent = title || 'Код';
        this.cssField.value = css || '';
        this.htmlField.value = html || '';

        // Labels visibility
        const labelsDisplay = showLabels ? '' : 'none';
        if (this.cssLabel) this.cssLabel.style.display = labelsDisplay;
        if (this.htmlLabel) this.htmlLabel.style.display = labelsDisplay;

        // Restore split position
        const percent = this._loadSplit();
        this._applySplit(percent);

        setTimeout(() => {
            this.cssField.focus();
        }, 100);

        this.container.classList.add('active');
    }

    close() {
        this.container.classList.remove('active');
    }

    setOnOk(callback) {
        this.onOk = callback;
    }

    setOnCancel(callback) {
        this.onCancel = callback;
    }

    destroy() {
        if (this.container) {
            this.container.remove();
        }
    }
}