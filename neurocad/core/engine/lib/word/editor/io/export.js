// app/core/engine/lib/word/editor/io/export.js

/**
 * Exporter — export the current page from the editor.
 *
 * Two formats:
 *   1. HTML — standalone document, all CSS inlined in a single <style>.
 *   2. .grp — ZIP archive (project + HTML + CSS + media).
 *
 * Visibility model — same as Base modals:
 *   - The modal DOM is created ONCE in the constructor.
 *   - openDialog() adds `.active` → CSS shows the overlay.
 *   - close() removes `.active`.
 *   - destroy() removes the DOM entirely.
 *
 * Data source: the backend reads the page from the database. Unsaved
 * changes are not pushed — the dialog shows a hint if the editor is
 * dirty.
 *
 * HTTP: raw fetch() for blobs (fetchJson parses JSON).
 *
 * Namespace: CoreEngineLibWordEditorIoExporter
 */

export class Exporter {
    /**
     * @param {Object} editor — parent Editor instance (from editor.js)
     */
    constructor(editor) {
        this.editor = editor;

        // Modal DOM — created once, in the constructor.
        this.overlayEl = null;
        this.dirtyHintEl = null;
        this.statusEl = null;

        // Bound handlers (for detach in destroy)
        this._escHandler = null;

        // Export state
        this.isExporting = false;

        // Build the DOM once.
        this._createDOM();
        this._bindEvents();
    }

    // ============================================
    // DOM (once)
    // ============================================

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-word-editor-io-export');
        if (existing) {
            this.overlayEl = existing;
            this._cacheElements();
            return;
        }

        const overlay = document.createElement('div');
        overlay.className =
            'core-engine-lib-word-editor-io core-engine-lib-word-editor-io-export';
        overlay.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Экспорт страницы</div>
                    <div class="title-bar-controls">
                        <span class="close-btn" data-action="cancel">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="io-section-hint" data-role="dirty-hint" style="display:none; margin-bottom: 0.75rem;">
                        Есть несохранённые изменения — они <b>не попадут</b> в экспорт.
                        Сохраните (Ctrl+S), чтобы обновить содержимое.
                    </div>

                    <div class="io-export-list">
                        <div class="io-export-item" data-action="html">
                            <div class="io-export-item-icon">&lt;/&gt;</div>
                            <div class="io-export-item-body">
                                <div class="io-export-item-title">Скачать HTML</div>
                                <div class="io-export-item-hint">
                                    Готовая страница одним файлом — CSS встроен в
                                    &lt;style&gt;. Можно открыть без сервера.
                                </div>
                            </div>
                        </div>

                        <div class="io-export-item" data-action="grp">
                            <div class="io-export-item-icon">📦</div>
                            <div class="io-export-item-body">
                                <div class="io-export-item-title">Скачать .grp</div>
                                <div class="io-export-item-hint">
                                    Архив с проектом, HTML, CSS и картинками.
                                    Открывается через «Импорт → .grp».
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="io-status" data-role="status" style="display:none;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.overlayEl = overlay;
        this._cacheElements();
    }

    _cacheElements() {
        this.dirtyHintEl = this.overlayEl.querySelector('[data-role="dirty-hint"]');
        this.statusEl    = this.overlayEl.querySelector('[data-role="status"]');
    }

    _bindEvents() {
        const overlay = this.overlayEl;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && !this.isExporting) this.close();
        });

        overlay.querySelectorAll('[data-action="cancel"]').forEach((el) => {
            el.addEventListener('click', () => {
                if (!this.isExporting) this.close();
            });
        });

        this._escHandler = (e) => {
            if (e.key === 'Escape'
                && this.overlayEl.classList.contains('active')
                && !this.isExporting) {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        overlay.querySelectorAll('[data-action="html"], [data-action="grp"]')
            .forEach((item) => {
                item.addEventListener('click', () => {
                    if (this.isExporting) return;
                    const action = item.dataset.action;
                    if (action === 'html') this.exportHtml();
                    else if (action === 'grp') this.exportGrp();
                });
            });
    }

    // ============================================
    // PUBLIC — OPEN / CLOSE
    // ============================================

    openDialog() {
        if (this.isExporting) {
            console.log('[Exporter] already exporting — ignoring openDialog');
            return;
        }

        const pageId = this.editor?.pageId;
        if (!pageId) {
            console.warn('[Exporter] pageId not set — export unavailable');
            this._showToast('Страница ещё не сохранена — экспорт недоступен.');
            return;
        }

        // Toggle the dirty hint.
        const dirty = this._isDirty();
        if (this.dirtyHintEl) {
            this.dirtyHintEl.style.display = dirty ? 'block' : 'none';
        }

        // Reset status.
        if (this.statusEl) {
            this.statusEl.textContent = '';
            this.statusEl.className = 'io-status';
            this.statusEl.style.display = 'none';
        }

        this.overlayEl.classList.add('active');
    }

    close() {
        this.overlayEl.classList.remove('active');
    }

    // ============================================
    // PUBLIC — EXPORT ACTIONS
    // ============================================

    async exportHtml() {
        if (this.isExporting) return;
        await this._downloadFile('html');
    }

    async exportGrp() {
        if (this.isExporting) return;
        await this._downloadFile('grp');
    }

    // ============================================
    // INTERNAL — DOWNLOAD
    // ============================================

    async _downloadFile(kind) {
        this.isExporting = true;

        const pageId = this.editor?.pageId;
        const navId = this._resolveNavId();

        const qs = navId != null ? `?nav_id=${navId}` : '';
        const url =
            `/core/engine/lib/word/editor/io/export/${kind}/${pageId}${qs}`;

        this._setStatus('Готовим файл…', 'info');

        try {
            const resp = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': kind === 'html'
                        ? 'text/html'
                        : 'application/zip, application/octet-stream',
                },
            });

            if (!resp.ok) {
                let detail = `HTTP ${resp.status}`;
                try {
                    const j = await resp.json();
                    if (j?.detail) detail = j.detail;
                } catch (_) {
                    try {
                        const t = await resp.text();
                        if (t) detail = t.slice(0, 200);
                    } catch (__) { /* ignore */ }
                }
                throw new Error(detail);
            }

            const filename = this._filenameFromHeaders(
                resp.headers.get('Content-Disposition'),
                kind,
            );

            const blob = await resp.blob();
            this._triggerDownload(blob, filename);

            this._setStatus('Файл скачан', 'ok');
            setTimeout(() => this.close(), 600);
        } catch (err) {
            console.error(`[Exporter] ${kind} export failed:`, err);
            const detail = err?.message || 'Ошибка экспорта';
            this._setStatus(detail, 'error');
        } finally {
            this.isExporting = false;
        }
    }

    _triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 0);
    }

    _filenameFromHeaders(headerValue, kind) {
        const ext = kind === 'html' ? '.html' : '.grp';
        const fallbackBase = this._fallbackBaseName();

        if (!headerValue) return `${fallbackBase}${ext}`;

        const utf8 = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8 && utf8[1]) {
            try {
                const decoded = decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
                if (decoded) return decoded;
            } catch (_) { /* ignore */ }
        }

        const plain = headerValue.match(/filename="?([^";]+)"?/i);
        if (plain && plain[1]) {
            const name = plain[1].trim();
            if (name) return name;
        }

        return `${fallbackBase}${ext}`;
    }

    _fallbackBaseName() {
        const title =
            this.editor?.pageData?.title ||
            this.editor?.props?.pageData?.title ||
            '';
        const cleaned = String(title).replace(/[\\/:*?"<>|]+/g, '_').trim();
        return cleaned || 'page';
    }

    _resolveNavId() {
        const v = window.coreEngine?.navId ?? document.body?.dataset?.navId;
        return v != null && v !== '' ? Number(v) : null;
    }

    // ============================================
    // INTERNAL — UI HELPERS
    // ============================================

    _isDirty() {
        const ed = this.editor;
        if (!ed) return false;
        const um = ed.editor?.UndoManager;
        if (um && typeof um.hasUndo === 'function') {
            return um.hasUndo() || !!ed._dirty;
        }
        return !!ed._dirty;
    }

    _setStatus(text, kind) {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `io-status io-status-${kind || 'info'}`;
        this.statusEl.style.display = text ? 'block' : 'none';
    }

    _showToast(text) {
        console.warn('[Exporter]', text);
        try { window.alert(text); } catch (_) { /* ignore */ }
    }

    // ============================================
    // DESTROY
    // ============================================

    destroy() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this.overlayEl) {
            this.overlayEl.remove();
            this.overlayEl = null;
        }
        this.dirtyHintEl = null;
        this.statusEl = null;
    }
}