// app/core/engine/lib/base/modal/image.js

/**
 * BaseModalImage — universal modal that shows a single image.
 *
 * API:
 *   const modal = await createModal('image');
 *   modal.open({ src, title, caption });
 *   modal.setOnOk(() => ...);       // optional
 *   modal.setOnCancel(() => ...);   // optional
 *   modal.destroy();
 *
 * Layout (same conventions as other base modals — .window / .title-bar /
 * .content / .actions-bar):
 *
 *   .core-engine-lib-base-modal-image          (overlay, .active → display:flex)
 *     └── .window
 *         ├── .title-bar   (title + close)
 *         └── .content
 *             ├── .image-body    (the image itself, centered)
 *             └── .actions-bar   (Закрыть)
 *
 * The image is scaled to fit the modal (max-width / max-height),
 * preserving aspect ratio. Clicking the overlay or pressing Escape
 * closes the modal (same as other base modals).
 *
 * Namespace: .core-engine-lib-base-modal-image
 */

export class BaseModalImage {
    constructor(props = {}) {
        this.props = props;
        this.onOk = null;
        this.onCancel = null;

        this.container = null;
        this.imgEl = null;
        this.titleEl = null;
        this.captionEl = null;

        this._escHandler = null;

        this._loadCSS();
        this._createDOM();
        this._bindEvents();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/image.css');
        }
    }

    // ============================================
    // DOM
    // ============================================

    _createDOM() {
        // Reuse existing if present (single instance per page)
        const existing = document.querySelector('.core-engine-lib-base-modal-image');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-image';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Изображение</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="image-body">
                        <img class="image-img" alt="">
                        <div class="image-caption" style="display:none;"></div>
                    </div>
                    <div class="actions-bar">
                        <button type="button" class="btn btn-white ok-btn">Закрыть</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        this.container = container;
        this.titleEl = container.querySelector('.title-bar-text');
        this.imgEl = container.querySelector('.image-img');
        this.captionEl = container.querySelector('.image-caption');
        this.closeBtn = container.querySelector('.close-btn');
        this.okBtn = container.querySelector('.ok-btn');
    }

    _bindEvents() {
        this.closeBtn.addEventListener('click', () => this._handleClose());
        this.okBtn.addEventListener('click', () => this._handleOk());

        // Click outside .window → close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) this._handleClose();
        });

        // Escape → close
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this._handleClose();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    // ============================================
    // PUBLIC API
    // ============================================

    /**
     * Open the modal.
     *
     * @param {Object} opts
     * @param {string} opts.src      — image URL (required)
     * @param {string} [opts.title]  — modal title (default: "Изображение")
     * @param {string} [opts.caption]— optional caption below the image
     * @param {string} [opts.alt]    — alt text for the image
     */
    open(opts = {}) {
        const src = opts.src || '';
        const title = opts.title || 'Изображение';
        const caption = opts.caption || '';
        const alt = opts.alt || '';

        this.titleEl.textContent = title;
        this.imgEl.src = src;
        this.imgEl.alt = alt;

        if (caption) {
            this.captionEl.textContent = caption;
            this.captionEl.style.display = 'block';
        } else {
            this.captionEl.textContent = '';
            this.captionEl.style.display = 'none';
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

    destroy() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.imgEl = null;
        this.titleEl = null;
        this.captionEl = null;
    }

    // ============================================
    // INTERNAL
    // ============================================

    _handleClose() {
        if (typeof this.onCancel === 'function') {
            try { this.onCancel(); } catch (e) { console.error(e); }
        }
        this.destroy();
    }

    _handleOk() {
        if (typeof this.onOk === 'function') {
            try { this.onOk(); } catch (e) { console.error(e); }
        }
        this.destroy();
    }
}