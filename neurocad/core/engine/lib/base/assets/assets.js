// app/core/engine/lib/base/assets/assets.js

/**
 * BaseAssets — media library picker.
 *
 * Supports two sources:
 *   - 'media'  → media/<nav_id>/  (upload / delete allowed)
 *   - 'logos'  → /core/engine/lib/word/editor/images
 *
 * Permissions:
 *   - Media library (media/*):       any authenticated user may
 *                                    upload and delete.
 *   - Logos (word/editor/images/*):  only superadmins may delete.
 *                                    Regular users can browse and
 *                                    pick, but see no delete button.
 *                                    The backend enforces this too.
 *
 * The set of available sources is passed via opts.sources:
 *   sources: ['media']              — default, media only
 *   sources: ['logos']              — logos only
 *   sources: ['media', 'logos']     — both, with tab switcher
 *
 * opts.initialSource — which tab to open first (default: sources[0])
 *
 * API:
 *   BaseAssets.open({
 *       sources: ['media', 'logos'],
 *       initialSource: 'logos',
 *       onSelect: (src) => { ... },
 *       onCancel: () => { ... },
 *   })
 *
 * Delete confirmation and error messages go through the shared modal
 * factory (createModal) — no native alert()/confirm().
 *
 * Endpoints (all take ?nav_id=<id> from the current nav):
 *   GET    /core/engine/lib/base/assets
 *   POST   /core/engine/lib/base/assets/upload
 *   DELETE /core/engine/lib/base/assets/{filename}
 *
 * Logos endpoints (all take ?module=<name>):
 *   GET    /core/engine/lib/word/editor/images
 *   DELETE /core/engine/lib/word/editor/images/{id}   (superadmin only)
 */

export class BaseAssets {
    /**
     * Open the media picker modal.
     *
     * @param {Object} opts
     * @param {string[]} [opts.sources]      — ['media'] | ['logos'] | ['media','logos']
     * @param {string}   [opts.initialSource]— which tab opens first
     * @param {Function} [opts.onSelect]     — (src) => void, called on pick
     * @param {Function} [opts.onCancel]     — called on cancel/close
     */
    static async open(opts = {}) {
        const picker = new BaseAssets(opts);
        await picker._open();
    }

    constructor(opts = {}) {
        this.onSelect = opts.onSelect || null;
        this.onCancel = opts.onCancel || null;

        // Which sources are available and which to open first.
        const sources = Array.isArray(opts.sources) && opts.sources.length
            ? opts.sources.filter(s => s === 'media' || s === 'logos')
            : ['media'];

        this.sources = sources.length ? sources : ['media'];

        const initial = opts.initialSource && this.sources.includes(opts.initialSource)
            ? opts.initialSource
            : this.sources[0];

        this.mode = initial;   // 'media' | 'logos'

        // Nav instance for API queries.
        // Priority:
        //   1. window.coreEngine.navId  (set by CoreEngine)
        //   2. document.body dataset    (raw data-nav-id attribute)
        this.navId = window.coreEngine?.navId
            || document.body.dataset.navId
            || null;

        // Query string appended to media-library requests.
        this._qs = this.navId != null
            ? `?nav_id=${encodeURIComponent(this.navId)}`
            : '';

        // API bases
        this._apiBase = '/core/engine/lib/base/assets';
        this._imagesApiBase = '/core/engine/lib/word/editor/images';

        // DOM refs (filled in _createDOM)
        this.overlay = null;
        this.gridEl = null;
        this.fileInput = null;
        this.toolbarEl = null;
        this.dropzoneEl = null;
        this.uploadBtn = null;

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
                    this.toolbarEl = null;
                    this.dropzoneEl = null;
                    this.uploadBtn = null;
                }
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
                    <span class="assets-title">${this.mode === 'logos' ? 'Логотипы' : 'Медиатека'}</span>
                    <button class="assets-close" data-js="assets-close">✕</button>
                </div>
                <div class="assets-toolbar" data-js="assets-toolbar">
                    ${this._renderToolbar()}
                </div>
                <div class="assets-body">
                    <div class="assets-grid" data-js="assets-grid"></div>
                    ${this.mode === 'media' ? `
                        <div class="assets-dropzone" data-js="assets-dropzone">
                            Перетащите файлы сюда или нажмите «Загрузить»
                        </div>
                    ` : ''}
                </div>
                <div class="assets-footer">
                    <button class="assets-btn assets-btn-cancel" data-js="assets-cancel">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.gridEl = overlay.querySelector('[data-js="assets-grid"]');
        this.toolbarEl = overlay.querySelector('[data-js="assets-toolbar"]');
        this.fileInput = overlay.querySelector('[data-js="assets-file-input"]');
        this.dropzoneEl = overlay.querySelector('[data-js="assets-dropzone"]');
        this.uploadBtn = overlay.querySelector('[data-js="assets-upload-btn"]');
    }

    _renderToolbar() {
        const tabs = this.sources.length > 1
            ? `
                <div class="assets-tabs">
                    ${this.sources.includes('media') ? `
                        <button class="assets-tab ${this.mode === 'media' ? 'assets-tab-active' : ''}"
                                data-js="assets-tab-media" data-source="media">Медиатека</button>
                    ` : ''}
                    ${this.sources.includes('logos') ? `
                        <button class="assets-tab ${this.mode === 'logos' ? 'assets-tab-active' : ''}"
                                data-js="assets-tab-logos" data-source="logos">Логотипы</button>
                    ` : ''}
                </div>
            `
            : '';

        const upload = this.mode === 'media'
            ? `
                <button class="assets-upload-btn" data-js="assets-upload-btn">Загрузить</button>
                <input type="file" data-js="assets-file-input" accept="image/*" multiple hidden>
            `
            : '';

        return tabs + upload;
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

        // Tab switching
        const tabMedia = this.overlay.querySelector('[data-js="assets-tab-media"]');
        const tabLogos = this.overlay.querySelector('[data-js="assets-tab-logos"]');
        if (tabMedia) tabMedia.addEventListener('click', () => this._switchSource('media'));
        if (tabLogos) tabLogos.addEventListener('click', () => this._switchSource('logos'));

        // Upload button → file input (only in media mode)
        if (this.uploadBtn && this.fileInput) {
            this.uploadBtn.addEventListener('click', () => {
                this.fileInput.click();
            });

            this.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) {
                    this._uploadFiles(files);
                }
                this.fileInput.value = '';
            });
        }

        // Drag & drop (only in media mode)
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

    async _switchSource(source) {
        if (source === this.mode) return;
        if (!this.sources.includes(source)) return;

        this.mode = source;

        // Re-render the whole modal (few DOM nodes — simplest).
        const wasActive = this.overlay.classList.contains('active');
        this.overlay.remove();

        this._createDOM();
        if (wasActive) this._show();
        this._bindEvents();

        // Update title
        const titleEl = this.overlay.querySelector('.assets-title');
        if (titleEl) {
            titleEl.textContent = this.mode === 'logos' ? 'Логотипы' : 'Медиатека';
        }

        await this._loadAssets();
    }

    // ============================================
    // API — LIST
    // ============================================

    async _loadAssets() {
        try {
            const fetchJson = window.coreEngine?.fetchJson;

            if (this.mode === 'logos') {
                this.items = await this._loadLogos(fetchJson);
            } else {
                const json = await fetchJson(`${this._apiBase}${this._qs}`);
                this.items = json?.data || [];
            }
        } catch (e) {
            console.warn('[BaseAssets] list failed:', e);
            this.items = [];
        }

        this._renderGrid();
    }

    async _loadLogos(fetchJson) {
        const moduleName = this._resolveModuleName();
        const url = `${this._imagesApiBase}?module=${encodeURIComponent(moduleName)}`;
        const json = await fetchJson(url);
        const rows = json?.data || [];

        // Newest first. Backend already sorts by `order` desc, but we
        // sort here too as a belt-and-braces guard.
        const sorted = [...rows].sort((a, b) => {
            const oa = Number(a.order ?? 0);
            const ob = Number(b.order ?? 0);
            if (oa !== ob) return ob - oa;
            return String(b.id).localeCompare(String(a.id));
        });

        // Map registry entries to the same shape the grid expects.
        return sorted.map(row => ({
            src: `/static/core/engine/lib/word/editor/images/${row.file}`,
            name: row.alt || row.id,
            type: 'image',
            _id: row.id,
            _builtin: !!row.builtin,
        }));
    }

    _renderGrid() {
        if (!this.gridEl) return;

        this.gridEl.innerHTML = '';

        if (!this.items.length) {
            const empty = document.createElement('div');
            empty.className = 'assets-empty';
            empty.textContent = this.mode === 'logos' ? 'Логотипов пока нет' : 'Медиатека пуста';
            this.gridEl.appendChild(empty);
            return;
        }

        const isSuperadmin = this._isSuperadmin();

        this.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'assets-item';

            const img = document.createElement('img');
            img.src = item.src;
            img.alt = item.name || '';
            img.loading = 'lazy';
            card.appendChild(img);

            // Delete button:
            //   - media mode:  any authenticated user
            //   - logos mode:  superadmin only, and only for non-builtin
            const canDelete =
                this.mode === 'media' ||
                (this.mode === 'logos' && item._builtin === false && isSuperadmin);

            if (canDelete) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'assets-item-delete';
                del.title = 'Удалить';
                del.textContent = '×';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.mode === 'logos') {
                        this._deleteLogo(item._id).catch(err =>
                            console.warn('[BaseAssets] deleteLogo error:', err)
                        );
                    } else {
                        this._deleteAsset(item.name).catch(err =>
                            console.warn('[BaseAssets] deleteAsset error:', err)
                        );
                    }
                });
                card.appendChild(del);
            }

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
    // API — UPLOAD (media only)
    // ============================================

    async _uploadFiles(files) {
        if (this._isUploading) return;
        if (this.mode !== 'media') return;

        this._isUploading = true;

        const formData = new FormData();
        files.forEach(f => formData.append('files', f));

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(`${this._apiBase}/upload${this._qs}`, {
                method: 'POST',
                body: formData,
            });

            const uploaded = json?.data || [];
            this.items = [...uploaded, ...this.items];
            this._renderGrid();
        } catch (e) {
            console.warn('[BaseAssets] upload failed:', e);
            await this._showError('Не удалось загрузить файлы');
        } finally {
            this._isUploading = false;
        }
    }

    // ============================================
    // API — DELETE
    // ============================================

    async _deleteAsset(filename) {
        if (!filename) return;
        if (this.mode !== 'media') return;

        const ok = await this._confirm(`Удалить «${filename}»?`);
        if (!ok) return;

        try {
            const url = `${this._apiBase}/${encodeURIComponent(filename)}${this._qs}`;
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson(url, { method: 'DELETE' });

            this.items = this.items.filter(i => i.name !== filename);
            this._renderGrid();
        } catch (e) {
            console.warn('[BaseAssets] delete failed:', e);
            await this._showError('Не удалось удалить файл');
        }
    }

    async _deleteLogo(imageId) {
        if (!imageId) return;
        if (this.mode !== 'logos') return;

        // Defensive: even if the button somehow appears for a
        // non-superadmin, do not let them issue the request.
        // The backend enforces this as well.
        if (!this._isSuperadmin()) {
            await this._showError('Удалять логотипы может только супер-администратор');
            return;
        }

        const ok = await this._confirm('Удалить логотип?');
        if (!ok) return;

        const moduleName = this._resolveModuleName();

        try {
            const url = `${this._imagesApiBase}/${encodeURIComponent(imageId)}?module=${encodeURIComponent(moduleName)}`;
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson(url, { method: 'DELETE' });

            this.items = this.items.filter(i => i._id !== imageId);
            this._renderGrid();
        } catch (e) {
            console.warn('[BaseAssets] delete logo failed:', e);
            await this._showError('Не удалось удалить логотип');
        }
    }

    // ============================================
    // MODALS
    // ============================================

    /**
     * Show a message modal (replaces alert()).
     * Resolves when the user closes it.
     */
    async _showError(message) {
        console.warn('[BaseAssets]', message);

        try {
            // Defensive: remove any stale message modal so the new
            // instance attaches to a fresh DOM node.
            const stale = document.querySelector('.core-engine-lib-base-modal-message');
            if (stale) stale.remove();

            const { createModal } = await import(
                `/static/core/engine/lib/base/modal/index.js?v=${window.coreEngine?.static_version || Date.now()}`
            );
            const modal = await createModal('message');
            if (!modal) {
                window.alert(message);
                return;
            }

            modal.setOnOk(() => modal.destroy());
            modal.open(message, 'Медиатека');
        } catch (e) {
            console.warn('[BaseAssets] modal unavailable, falling back to alert:', e);
            window.alert(message);
        }
    }

    /**
     * Show a confirm modal (replaces confirm()).
     * Resolves true if the user confirmed, false otherwise.
     */
    _confirm(message) {
        return new Promise(async (resolve) => {
            try {
                // Defensive: remove any stale confirm modal so the
                // new instance attaches to a fresh DOM node and its
                // callbacks are wired to the current instance.
                const stale = document.querySelector('.core-engine-lib-base-modal-confirm');
                if (stale) stale.remove();

                const { createModal } = await import(
                    `/static/core/engine/lib/base/modal/index.js?v=${window.coreEngine?.static_version || Date.now()}`
                );
                const modal = await createModal('confirm');
                if (!modal) {
                    resolve(window.confirm(message));
                    return;
                }

                let settled = false;
                const settle = (value) => {
                    if (settled) return;
                    settled = true;
                    modal.destroy();
                    resolve(value);
                };

                // BaseModalConfirm API:
                //   open(text, title, okText, cancelText, noText)
                //   setOnOk(cb)     — cb(true)
                //   setOnCancel(cb) — cb(false)
                modal.setOnOk(() => settle(true));
                modal.setOnCancel(() => settle(false));
                modal.open(message, 'Подтверждение');
            } catch (e) {
                console.warn('[BaseAssets] confirm modal unavailable, falling back:', e);
                resolve(window.confirm(message));
            }
        });
    }

    // ============================================
    // UTILS
    // ============================================

    /**
     * Resolve the current module name for ?module=.
     *
     * Priority:
     *   1. window.coreEngine.baseUrl  → "/core/engine/<module>"
     *   2. <body data-module="...">
     *   3. 'default'
     */
    _resolveModuleName() {
        const fromBaseUrl = window.coreEngine?.baseUrl
            ?.split('/core/engine/')[1]
            ?.split('/')[0];

        return (
            fromBaseUrl
            || document.body.dataset.module
            || 'default'
        );
    }

    /**
     * Whether the current user is a superadmin.
     *
     * Used to gate destructive actions on logos (only superadmins
     * may delete them — regular users can browse and pick).
     *
     * `is_superadmin` may come from the backend as bool, int (0/1),
     * or string ("0"/"1"), so all three are accepted.
     */
    _isSuperadmin() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;

        if (typeof auth.isSuperadmin === 'function') {
            return !!auth.isSuperadmin();
        }
        if (typeof auth.getUser === 'function') {
            const user = auth.getUser();
            if (!user) return false;
            const v = user.is_superadmin;
            return v === true || v === 1 || v === "1";
        }
        return false;
    }
}