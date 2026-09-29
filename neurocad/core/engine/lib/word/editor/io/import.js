// app/core/engine/lib/word/editor/io/import.js

/**
 * Importer — import pages into the editor.
 *
 * Three sources:
 *   1. .grp archive (ZIP) — full GrapesJS project (index.json + media/).
 *   2. .html file — HTML + CSS, no project data.
 *   3. Remote URL — fetched by the backend, CSS inlined, images optionally
 *      inlined as data-URI.
 *
 * Visibility model — same as Base modals:
 *   - The modal DOM is created ONCE in the constructor.
 *   - openDialog() adds `.active` → CSS shows the overlay.
 *   - close() removes `.active`.
 *   - destroy() removes the DOM entirely.
 *
 * HTTP via window.coreEngine.fetchJson — same as the rest of the editor.
 *
 * Namespace: CoreEngineLibWordEditorIoImporter
 */

export class Importer {
    /**
     * @param {Object} editor — parent Editor instance (from editor.js)
     */
    constructor(editor) {
        this.editor = editor;

        // Modal DOM — created once, in the constructor.
        this.overlayEl = null;
        this.fileInputEl = null;
        this.nameEl = null;
        this.urlInputEl = null;
        this.imagesCheckboxEl = null;
        this.statusEl = null;

        // Bound handlers (for detach in destroy)
        this._escHandler = null;

        // Import state
        this.isImporting = false;

        // Build the DOM once (hidden by CSS until .active is added).
        this._createDOM();
        this._bindEvents();
    }

    // ============================================
    // DOM (once)
    // ============================================

    _createDOM() {
        // Singleton: reuse an existing instance if present.
        const existing = document.querySelector('.core-engine-lib-word-editor-io-import');
        if (existing) {
            this.overlayEl = existing;
            this._cacheElements();
            return;
        }

        const overlay = document.createElement('div');
        overlay.className =
            'core-engine-lib-word-editor-io core-engine-lib-word-editor-io-import';
        overlay.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Импорт страницы</div>
                    <div class="title-bar-controls">
                        <span class="close-btn" data-action="cancel">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="io-section">
                        <div class="io-section-title">Из файла</div>
                        <div class="io-section-hint">
                            Поддерживаются архивы <b>.grp</b> и HTML-файлы <b>.html</b>.
                        </div>
                        <label class="io-file-label">
                            <input type="file" accept=".grp,.zip,.html,.htm" data-role="file" hidden>
                            <span class="io-file-btn">Выбрать файл…</span>
                            <span class="io-file-name" data-role="file-name">файл не выбран</span>
                        </label>
                    </div>

                    <div class="io-sep"><span>или</span></div>

                    <div class="io-section">
                        <div class="io-section-title">Из интернета</div>
                        <div class="io-section-hint">
                            Backend скачает страницу и встроит CSS. Картинки — опционально.
                        </div>
                        <input type="text"
                               class="io-input"
                               data-role="url"
                               placeholder="https://example.com/page"
                               autocomplete="off"
                               spellcheck="false">
                        <label class="io-checkbox">
                            <input type="checkbox" data-role="include-images" checked>
                            <span>Скачивать картинки (встроить как data-URI)</span>
                        </label>
                        <button type="button" class="btn btn-primary" data-action="url">
                            Импортировать из URL
                        </button>
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
        this.fileInputEl       = this.overlayEl.querySelector('[data-role="file"]');
        this.nameEl            = this.overlayEl.querySelector('[data-role="file-name"]');
        this.urlInputEl        = this.overlayEl.querySelector('[data-role="url"]');
        this.imagesCheckboxEl  = this.overlayEl.querySelector('[data-role="include-images"]');
        this.statusEl          = this.overlayEl.querySelector('[data-role="status"]');
    }

    _bindEvents() {
        const overlay = this.overlayEl;

        // Click on the overlay (outside .window) — close.
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && !this.isImporting) this.close();
        });

        // Close / cancel button.
        overlay.querySelectorAll('[data-action="cancel"]').forEach((el) => {
            el.addEventListener('click', () => {
                if (!this.isImporting) this.close();
            });
        });

        // Escape.
        this._escHandler = (e) => {
            if (e.key === 'Escape'
                && this.overlayEl.classList.contains('active')
                && !this.isImporting) {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        // File picker.
        this.fileInputEl.addEventListener('change', async () => {
            const file = this.fileInputEl.files?.[0];
            if (!file) return;
            if (this.nameEl) this.nameEl.textContent = file.name;
            await this.importFile(file);
        });

        // URL import.
        overlay.querySelector('[data-action="url"]')
            .addEventListener('click', async () => {
                const url = this.urlInputEl.value.trim();
                if (!url) {
                    this._setStatus('Введите URL', 'error');
                    this.urlInputEl.focus();
                    return;
                }
                await this.importUrl(url, !!this.imagesCheckboxEl.checked);
            });
    }

    // ============================================
    // PUBLIC — OPEN / CLOSE
    // ============================================

    openDialog() {
        if (this.isImporting) {
            console.log('[Importer] already importing — ignoring openDialog');
            return;
        }
        this._resetDialog();
        this.overlayEl.classList.add('active');
    }

    close() {
        this.overlayEl.classList.remove('active');
    }

    _resetDialog() {
        if (this.nameEl) this.nameEl.textContent = 'файл не выбран';
        if (this.urlInputEl) this.urlInputEl.value = '';
        if (this.statusEl) {
            this.statusEl.textContent = '';
            this.statusEl.className = 'io-status';
            this.statusEl.style.display = 'none';
        }
        if (this.fileInputEl) this.fileInputEl.value = '';
    }

    // ============================================
    // PUBLIC — IMPORT FILE
    // ============================================

    async importFile(file) {
        if (this.isImporting) return;

        const name = (file.name || '').toLowerCase();
        const isGrp = name.endsWith('.grp') || name.endsWith('.zip');
        const isHtml = name.endsWith('.html') || name.endsWith('.htm');

        if (!isGrp && !isHtml) {
            this._setStatus('Поддерживаются только .grp и .html', 'error');
            return;
        }

        this.isImporting = true;
        this._setStatus('Загрузка…', 'info');

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) throw new Error('fetchJson недоступен');

            const form = new FormData();
            form.append('file', file);

            const json = await fetchJson(
                '/core/engine/lib/word/editor/io/import/file',
                { method: 'POST', body: form }
            );

            if (!json?.success || !json?.data) {
                throw new Error('Некорректный ответ сервера');
            }

            this._applyImport(json.data);
            this._setStatus('Импорт завершён', 'ok');

            setTimeout(() => this.close(), 400);
        } catch (err) {
            console.error('[Importer] file import failed:', err);
            const detail = err?.data?.detail || err.message || 'Ошибка импорта';
            this._setStatus(detail, 'error');
        } finally {
            this.isImporting = false;
        }
    }

    // ============================================
    // PUBLIC — IMPORT URL
    // ============================================

    async importUrl(url, includeImages = true) {
        if (this.isImporting) return;

        this.isImporting = true;
        this._setStatus('Загрузка страницы…', 'info');

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (!fetchJson) throw new Error('fetchJson недоступен');

            const json = await fetchJson(
                '/core/engine/lib/word/editor/io/import/url',
                {
                    method: 'POST',
                    body: { url, include_images: !!includeImages },
                }
            );

            if (!json?.success || !json?.data) {
                throw new Error('Некорректный ответ сервера');
            }

            this._applyImport(json.data);
            this._setStatus('Импорт завершён', 'ok');

            setTimeout(() => this.close(), 400);
        } catch (err) {
            console.error('[Importer] url import failed:', err);
            const detail = err?.data?.detail || err.message || 'Ошибка импорта';
            this._setStatus(detail, 'error');
        } finally {
            this.isImporting = false;
        }
    }

    // ============================================
    // INTERNAL — APPLY
    // ============================================

    _applyImport(data) {
        const gjs = this.editor?.editor;
        if (!gjs) {
            console.warn('[Importer] GrapesJS instance not available');
            return;
        }

        let applied = false;

        // Preferred: full project JSON.
        if (data.project_json) {
            try {
                const proj = JSON.parse(data.project_json);
                gjs.loadProjectData(proj);
                applied = true;
                console.log('[Importer] applied via loadProjectData');
            } catch (e) {
                console.warn('[Importer] loadProjectData failed, falling back to HTML:', e);
            }
        }

        // Fallback: HTML + CSS.
        if (!applied) {
            const html = (data.html || '').trim();
            const css = (data.css || '').trim();

            if (!html && !css) {
                console.warn('[Importer] nothing to import');
                return;
            }

            try {
                if (html) gjs.setComponents(html);
                if (css) gjs.setStyle(css);
                console.log('[Importer] applied via setComponents + setStyle');
            } catch (e) {
                console.error('[Importer] setComponents/setStyle failed:', e);
                return;
            }
        }

        if (data.assets && Object.keys(data.assets).length) {
            console.log(
                `[Importer] ${Object.keys(data.assets).length} asset(s) inlined as data-URI`
            );
        }

        if (Array.isArray(data.warnings) && data.warnings.length) {
            console.warn('[Importer] warnings:', data.warnings);
        }

        const dl = this.editor?._dataLoader;
        if (dl) {
            try { dl._reapplyPostLoad?.(); } catch (e) { console.warn(e); }
            try { dl._scheduleRemoveEmptyPlaceholder?.(); } catch (e) { console.warn(e); }
            try { dl._clearUndoHistory?.(); } catch (e) { console.warn(e); }
        }

        try { this.editor._dirty = true; } catch (e) { /* ignore */ }
    }

    // ============================================
    // INTERNAL — UI HELPERS
    // ============================================

    _setStatus(text, kind) {
        if (!this.statusEl) return;
        this.statusEl.textContent = text || '';
        this.statusEl.className = `io-status io-status-${kind || 'info'}`;
        this.statusEl.style.display = text ? 'block' : 'none';
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
        this.fileInputEl = null;
        this.nameEl = null;
        this.urlInputEl = null;
        this.imagesCheckboxEl = null;
        this.statusEl = null;
    }
}