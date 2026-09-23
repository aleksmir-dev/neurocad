// app/core/engine/lib/base/assets/assets.js

/**
 * BaseAssets — media library picker.
 *
 * Opens a modal with a grid of images from media/<mod_id>/.
 * Allows:
 *   - select an existing image (returns its URL via onSelect)
 *   - upload new files (drag & drop or file input)
 *   - delete existing files (× on hover)
 *
 * API:
 *   BaseAssets.open({ onSelect })  → opens modal
 *   onSelect(src) — callback called with the URL of the selected image
 *
 * Endpoints (all take ?module=<name> from the current module):
 *   GET    /core/engine/lib/base/assets
 *   POST   /core/engine/lib/base/assets/upload
 *   DELETE /core/engine/lib/base/assets/{filename}
 *
 * The module name is resolved from window.coreEngine.moduleName
 * (or document.body.dataset.module) — same pattern as elsewhere.
 */
export class BaseAssets {
    /**
     * Open the media picker modal.
     *
     * @param {Object} opts
     * @param {Function} opts.onSelect  — (src) => void, called on pick
     * @param {Function} [opts.onCancel] — called on cancel/close
     */
    static async open(opts = {}) {
        const picker = new BaseAssets(opts);
        await picker._open();
    }

    constructor(opts = {}) {
        this.onSelect = opts.onSelect || null;
        this.onCancel = opts.onCancel || null;

        // Module name for API queries
        this.moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        this._qs = this.moduleName
            ? `?module=${encodeURIComponent(this.moduleName)}`
            : '';

        // API base URLs
        this._apiBase = '/core/engine/lib/base/assets';

        // DOM refs (filled in _createDOM)
        this.overlay = null;
        this.gridEl = null;
        this.fileInput = null;

        // State
        this.items = [];
        this._isUploading = false;
    }

    // ============================================
    // OPEN / CLOSE
    // ============================================

    async _open() {
        this._loadCSS();
        this._createDOM();
        this._bindEvents();
        this._show();

        await this._loadAssets();
    }

    close() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            setTimeout(() => {
                if (this.overlay) {
                    this.overlay.remove();
                    this.overlay = null;
                    this.gridEl = null;
                    this.fileInput = null;
                }
                // Remove escape handler
                if (this._escapeHandler) {
                    document.removeEventListener('keydown', this._escapeHandler);
                    this._escapeHandler = null;
                }
            }, 200);
        }
    }

    _cancel() {
        if (this.onCancel) this.onCancel();
        this.close();
    }

    // ============================================
    // CSS
    // ============================================

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/assets/assets.css');
        }
    }

    // ============================================
    // DOM
    // ============================================

    _createDOM() {
        // Remove any existing modal
        const existing = document.querySelector('.core-engine-lib-base-assets');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'core-engine-lib-base-assets';
        overlay.innerHTML = `
            <div class="assets-content">
                <div class="assets-header">
                    <span class="assets-title">Медиатека</span>
                    <button class="assets-close" data-js="assets-close">✕</button>
                </div>
                <div class="assets-toolbar">
                    <button class="assets-upload-btn" data-js="assets-upload-btn">
                        Загрузить
                    </button>
                    <input type="file" data-js="assets-file-input"
                           accept="image/*" multiple hidden>
                </div>
                <div class="assets-body">
                    <div class="assets-grid" data-js="assets-grid"></div>
                    <div class="assets-dropzone" data-js="assets-dropzone">
                        Перетащите файлы сюда или нажмите «Загрузить»
                    </div>
                </div>
                <div class="assets-footer">
                    <button class="assets-btn assets-btn-cancel" data-js="assets-cancel">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.gridEl = overlay.querySelector('[data-js="assets-grid"]');
        this.fileInput = overlay.querySelector('[data-js="assets-file-input"]');
        this.dropzoneEl = overlay.querySelector('[data-js="assets-dropzone"]');
        this.uploadBtn = overlay.querySelector('[data-js="assets-upload-btn"]');
    }

    _show() {
        if (this.overlay) {
            this.overlay.classList.add('active');
        }
    }

    // ============================================
    // EVENTS
    // ============================================

    _bindEvents() {
        // Close
        const closeBtn = this.overlay.querySelector('[data-js="assets-close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this._cancel());
        }

        // Cancel
        const cancelBtn = this.overlay.querySelector('[data-js="assets-cancel"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this._cancel());
        }

        // Click on overlay closes
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this._cancel();
            }
        });

        // Escape closes
        this._escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this._cancel();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);

        // Upload button → file input
        if (this.uploadBtn && this.fileInput) {
            this.uploadBtn.addEventListener('click', () => {
                this.fileInput.click();
            });
        }

        // File input change
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) {
                    this._uploadFiles(files);
                }
                this.fileInput.value = '';
            });
        }

        // Drag & drop
        if (this.dropzoneEl) {
            ['dragenter', 'dragover'].forEach(evt => {
                this.dropzoneEl.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dropzoneEl.classList.add('active');
                });
            });
            ['dragleave', 'drop'].forEach(evt => {
                this.dropzoneEl.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dropzoneEl.classList.remove('active');
                });
            });
            this.dropzoneEl.addEventListener('drop', (e) => {
                const files = Array.from(e.dataTransfer?.files || []);
                if (files.length) {
                    this._uploadFiles(files);
                }
            });
        }
    }

    // ============================================
    // API — LIST
    // ============================================

    async _loadAssets() {
        try {
            const res = await fetch(`${this._apiBase}${this._qs}`, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!res.ok) {
                console.warn('[BaseAssets] list error:', res.status);
                this.items = [];
            } else {
                const json = await res.json();
                this.items = json?.data || [];
            }
        } catch (e) {
            console.warn('[BaseAssets] list failed:', e);
            this.items = [];
        }

        this._renderGrid();
    }

    _renderGrid() {
        if (!this.gridEl) return;

        this.gridEl.innerHTML = '';

        if (!this.items.length) {
            const empty = document.createElement('div');
            empty.className = 'assets-empty';
            empty.textContent = 'Медиатека пуста';
            this.gridEl.appendChild(empty);
            return;
        }

        this.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'assets-item';

            const img = document.createElement('img');
            img.src = item.src;
            img.alt = item.name || '';
            img.loading = 'lazy';
            card.appendChild(img);

            // Delete button
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'assets-item-delete';
            del.title = 'Удалить';
            del.textContent = '×';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                this._deleteAsset(item.name);
            });
            card.appendChild(del);

            // Click → select
            card.addEventListener('click', () => {
                if (this.onSelect) {
                    this.onSelect(item.src);
                }
                this.close();
            });

            this.gridEl.appendChild(card);
        });
    }

    // ============================================
    // API — UPLOAD
    // ============================================

    async _uploadFiles(files) {
        if (this._isUploading) return;
        this._isUploading = true;

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));

        try {
            const res = await fetch(`${this._apiBase}/upload${this._qs}`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!res.ok) {
                console.warn('[BaseAssets] upload error:', res.status);
                this._showError('Не удалось загрузить файлы');
                return;
            }

            const json = await res.json();
            const uploaded = json?.data || [];

            // Append uploaded to items
            this.items = [...uploaded, ...this.items];
            this._renderGrid();
        } catch (e) {
            console.warn('[BaseAssets] upload failed:', e);
            this._showError('Не удалось загрузить файлы');
        } finally {
            this._isUploading = false;
        }
    }

    // ============================================
    // API — DELETE
    // ============================================

    async _deleteAsset(filename) {
        if (!filename) return;

        if (!confirm(`Удалить «${filename}»?`)) return;

        try {
            const url = `${this._apiBase}/${encodeURIComponent(filename)}${this._qs}`;
            const res = await fetch(url, {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!res.ok) {
                console.warn('[BaseAssets] delete error:', res.status);
                this._showError('Не удалось удалить файл');
                return;
            }

            this.items = this.items.filter(i => i.name !== filename);
            this._renderGrid();
        } catch (e) {
            console.warn('[BaseAssets] delete failed:', e);
            this._showError('Не удалось удалить файл');
        }
    }

    // ============================================
    // UTILS
    // ============================================

    _showError(message) {
        console.warn('[BaseAssets]', message);
        // Simple toast-like alert (can be replaced by BaseModal later)
        alert(message);
    }
}