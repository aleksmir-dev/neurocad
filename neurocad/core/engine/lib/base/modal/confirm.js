// app/core/engine/lib/base/modal/confirm.js

/**
 * BaseModalConfirm — confirmation dialog.
 *
 * Namespace: .core-engine-lib-base-modal-confirm
 *
 * All child classes are LOCAL — no global .btn / .core-engine-lib-base-btn
 * are used here. Styles live in confirm.css under the modal namespace:
 *   .core-engine-lib-base-modal-confirm .ok-btn
 *   .core-engine-lib-base-modal-confirm .cancel-btn
 *   .core-engine-lib-base-modal-confirm .no-btn
 *
 * API:
 *   open(text, title, okText, cancelText, noText)
 *   setOnOk(callback)
 *   setOnCancel(callback)
 *   setOnNo(callback)
 *   setOnResult(callback)   — same callback for OK and Cancel
 *   close()
 *   destroy()
 */
export class BaseModalConfirm {
    constructor() {
        this.container = null;
        this.onOk = null;
        this.onCancel = null;
        this.onNo = null;
        this.threeButtonsMode = false;

        // Load CSS on construct
        this._loadCSS();

        this._createDOM();
        this._bindEvents();
    }

    /**
     * Load modal CSS.
     */
    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/confirm.css');
        }
    }

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-base-modal-confirm');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-confirm';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Подтверждение</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="confirm-body">
                        <div class="confirm-text"></div>
                    </div>
                    <div class="actions-bar">
                        <button class="cancel-btn">Отмена</button>
                        <button class="no-btn">Нет</button>
                        <button class="ok-btn">ОК</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
    }

    _cacheElements() {
        this.titleBarText = this.container.querySelector('.title-bar-text');
        this.confirmText = this.container.querySelector('.confirm-text');
        this.okBtn = this.container.querySelector('.ok-btn');
        this.cancelBtn = this.container.querySelector('.cancel-btn');
        this.noBtn = this.container.querySelector('.no-btn');
        this.closeBtn = this.container.querySelector('.close-btn');
    }

    _bindEvents() {
        // ===== OK =====
        this.okBtn.addEventListener('click', () => {
            if (this.onOk) {
                this.onOk(true);
            }
            this.close();
        });

        // ===== Cancel =====
        this.cancelBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel(false);
            }
            this.close();
        });

        // ===== No (3-button mode) =====
        this.noBtn.addEventListener('click', () => {
            if (this.onNo) {
                this.onNo();
            }
            this.close();
        });

        // ===== Close button =====
        this.closeBtn.addEventListener('click', () => {
            if (this.threeButtonsMode) {
                if (this.onNo) {
                    this.onNo();
                }
            } else {
                if (this.onCancel) {
                    this.onCancel(false);
                }
            }
            this.close();
        });

        // ===== Click on overlay =====
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                if (this.threeButtonsMode) {
                    if (this.onNo) {
                        this.onNo();
                    }
                } else {
                    if (this.onCancel) {
                        this.onCancel(false);
                    }
                }
                this.close();
            }
        });

        // ===== Escape =====
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                if (this.threeButtonsMode) {
                    if (this.onNo) {
                        this.onNo();
                    }
                } else {
                    if (this.onCancel) {
                        this.onCancel(false);
                    }
                }
                this.close();
            }
        });
    }

    // ============================================
    // PUBLIC METHODS
    // ============================================

    /**
     * Open the dialog.
     *
     * @param {string} text              — main message
     * @param {string} [title]           — dialog title
     * @param {string} [okButtonText]    — OK button label
     * @param {string} [cancelButtonText]— Cancel button label
     * @param {string} [noButtonText]    — No button label (enables 3-button mode)
     */
    open(text, title, okButtonText, cancelButtonText, noButtonText) {
        this.confirmText.textContent = text || '';
        this.titleBarText.textContent = title || 'Подтверждение';
        this.okBtn.textContent = okButtonText || 'ОК';
        this.cancelBtn.textContent = cancelButtonText || 'Отмена';

        if (noButtonText) {
            this.threeButtonsMode = true;
            this.noBtn.textContent = noButtonText;
            this.noBtn.classList.add('active');
        } else {
            this.threeButtonsMode = false;
            this.noBtn.classList.remove('active');
        }

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

    setOnNo(callback) {
        this.onNo = callback;
    }

    setOnResult(callback) {
        this.onOk = callback;
        this.onCancel = callback;
    }

    destroy() {
        if (this.container) {
            this.container.remove();
        }
    }
}