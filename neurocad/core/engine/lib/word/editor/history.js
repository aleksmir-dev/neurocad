// app/core/engine/lib/word/editor/history.js

/**
 * History — page history modal (list, preview, rollback).
 *
 * Public API:
 *   openHistoryModal({ editor, createModal, pageId, qs, onRollback })
 *
 * Behavior:
 *   1. Fetch list of snapshots (metadata only) — GET /word/{id}/history
 *   2. Render list; first item selected by default.
 *   3. On click — fetch full snapshot — GET /word/{id}/history/{hist_id}
 *      Render preview in <iframe srcdoc="...">, wrapped in the scope class
 *      .core-engine-lib-word-blocks and with content.css + block CSS
 *      linked inside the iframe (isolation from editor styles).
 *      Snapshot CSS (data.css) is injected as <style> in the iframe head.
 *      For legacy snapshots without data.css, CSS is extracted from
 *      <style> tags inside data.html.
 *   4. On "Откатить" — confirm dialog, then POST /word/{id}/rollback/{hist_id}.
 *      On success — call onRollback(data) and close the modal.
 *
 * CSS is loaded from ./history.css on module load.
 *
 * The modal DOM follows Base Modal conventions:
 *   .core-engine-lib-word-editor-history
 *     └── .window
 *         ├── .title-bar     (title + close button)
 *         └── .content
 *             ├── .history-body
 *             │   ├── .history-list   (left)
 *             │   └── .history-preview (right, iframe)
 *             └── .actions-bar   (cancel + rollback)
 */

/* ============================================
   CSS LOAD (once per session)
   ============================================ */

let _cssLoaded = false;

function _loadCss() {
    if (_cssLoaded) return;
    _cssLoaded = true;

    const version = window.coreEngine?.static_version || Date.now();
    const href = `/static/core/engine/lib/word/editor/css/history.css?v=${version}`;

    if (document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

/* ============================================
   API HELPERS
   ============================================ */

/**
 * Build a path WITHOUT query string.
 *   _apiPath(3, '/history')       → '/core/engine/lib/word/3/history'
 *   _apiPath(3, '/history/42')    → '/core/engine/lib/word/3/history/42'
 *   _apiPath(3, '/rollback/42')   → '/core/engine/lib/word/3/rollback/42'
 */
function _apiPath(pageId, suffix = '') {
    return `/core/engine/lib/word/${pageId}${suffix}`;
}

/**
 * Append a query string (already starting with '?') to a URL.
 *   _withQs('/word/3/history', '?module=default')
 *     → '/word/3/history?module=default'
 *   _withQs('/word/3/history', '')
 *     → '/word/3/history'
 */
function _withQs(url, qs) {
    return qs ? `${url}${qs}` : url;
}

async function _fetchJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json', ...(options.headers || {}) },
        ...options,
    });

    if (!response.ok) {
        let detail = '';
        try {
            const data = await response.json();
            detail = data.detail || '';
        } catch (e) { /* not JSON */ }

        const err = new Error(detail || `HTTP ${response.status}`);
        err.status = response.status;
        throw err;
    }

    return response.json();
}

/* ============================================
   PUBLIC API
   ============================================ */

/**
 * Open the history modal.
 *
 * @param {Object} opts
 * @param {Object} opts.editor        — GrapesJS instance
 * @param {Function} opts.createModal — Base modal factory
 * @param {number} opts.pageId        — current page id
 * @param {string} [opts.qs]          — ?module=<name>
 * @param {Function} [opts.onRollback]— called after successful rollback with data
 */
export async function openHistoryModal({ editor, createModal, pageId, qs = '', onRollback }) {
    _loadCss();

    if (!pageId) {
        console.warn('[History] pageId is required');
        return;
    }

    const modal = new HistoryModal({ editor, createModal, pageId, qs, onRollback });
    await modal.open();
}

/* ============================================
   HISTORY MODAL CLASS
   ============================================ */

class HistoryModal {
    constructor({ editor, createModal, pageId, qs, onRollback }) {
        this.editor = editor;
        this.createModal = createModal;
        this.pageId = pageId;
        this.qs = qs;
        this.onRollback = onRollback;

        this.container = null;
        this.listEl = null;
        this.previewEl = null;
        this.rollbackBtn = null;
        this.statusEl = null;

        this.items = [];          // list of { id, action, note, created_at }
        this.selectedId = null;   // currently selected snapshot id
        this.previewData = null;  // full snapshot of selected item
        this._escHandler = null;
    }

    async open() {
        this._createDOM();
        this._bindEvents();
        this.container.classList.add('active');

        await this._loadList();
    }

    // ----------------------------------------
    // DOM
    // ----------------------------------------

    _createDOM() {
        // Reuse existing if present
        const existing = document.querySelector('.core-engine-lib-word-editor-history');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            this._clearState();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-word-editor-history';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">История изменений</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="history-body">
                        <aside class="history-list" data-role="list">
                            <div class="history-list-empty">Загрузка…</div>
                        </aside>
                        <section class="history-preview" data-role="preview">
                            <div class="history-preview-empty">Выберите версию слева</div>
                        </section>
                    </div>
                    <div class="history-status" data-role="status"></div>
                    <div class="actions-bar">
                        <button class="cancel-btn" type="button">Закрыть</button>
                        <button class="ok-btn" type="button" disabled>Откатить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
    }

    _cacheElements() {
        this.listEl = this.container.querySelector('[data-role="list"]');
        this.previewEl = this.container.querySelector('[data-role="preview"]');
        this.statusEl = this.container.querySelector('[data-role="status"]');
        this.cancelBtn = this.container.querySelector('.cancel-btn');
        this.rollbackBtn = this.container.querySelector('.ok-btn');
        this.closeBtn = this.container.querySelector('.close-btn');
    }

    _clearState() {
        this.items = [];
        this.selectedId = null;
        this.previewData = null;
        if (this.listEl) this.listEl.innerHTML = '<div class="history-list-empty">Загрузка…</div>';
        if (this.previewEl) this.previewEl.innerHTML = '<div class="history-preview-empty">Выберите версию слева</div>';
        if (this.statusEl) this.statusEl.textContent = '';
        if (this.rollbackBtn) this.rollbackBtn.disabled = true;
    }

    _bindEvents() {
        this.closeBtn.addEventListener('click', () => this.destroy());
        this.cancelBtn.addEventListener('click', () => this.destroy());

        this.rollbackBtn.addEventListener('click', () => this._handleRollback());

        // Click on overlay (outside .window) — close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) this.destroy();
        });

        // Escape — close
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this.destroy();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        // Delegated click on list items
        this.listEl.addEventListener('click', (e) => {
            const item = e.target.closest('[data-hist-id]');
            if (!item) return;
            const id = parseInt(item.dataset.histId, 10);
            if (!Number.isFinite(id)) return;
            this._selectItem(id);
        });
    }

    // ----------------------------------------
    // DATA — LIST
    // ----------------------------------------

    async _loadList() {
        try {
            const url = _withQs(_apiPath(this.pageId, '/history'), this.qs);
            const json = await _fetchJson(url);
            this.items = json.data || [];

            this._renderList();

            // Auto-select first (newest) item
            if (this.items.length > 0) {
                this._selectItem(this.items[0].id);
            } else {
                this._setStatus('История пуста. Сохраните страницу — появится снимок.');
            }
        } catch (err) {
            console.error('[History] list error:', err);
            this._setStatus(`Не удалось загрузить историю: ${err.message}`);
            this.listEl.innerHTML = '<div class="history-list-empty">Ошибка загрузки</div>';
        }
    }

    _renderList() {
        if (this.items.length === 0) {
            this.listEl.innerHTML = '<div class="history-list-empty">Снимков нет</div>';
            return;
        }

        this.listEl.innerHTML = '';

        this.items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'history-list-item';
            row.dataset.histId = String(item.id);

            const actionLabel = this._actionLabel(item.action);
            const dateText = this._formatDate(item.created_at);

            row.innerHTML = `
                <div class="history-item-action">${actionLabel}</div>
                <div class="history-item-date">${dateText}</div>
                ${item.note ? `<div class="history-item-note">${this._escape(item.note)}</div>` : ''}
            `;

            this.listEl.appendChild(row);
        });
    }

    _actionLabel(action) {
        switch (action) {
            case 'user_edit':    return 'Изменение';
            case 'ai_edit':      return 'AI-редактирование';
            case 'preset_apply': return 'Применён пресет';
            case 'rollback':     return 'Откат';
            default:             return action || '—';
        }
    }

    _formatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;

            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} `
                + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        } catch (e) {
            return iso;
        }
    }

    _escape(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ----------------------------------------
    // DATA — PREVIEW
    // ----------------------------------------

    async _selectItem(histId) {
        if (this.selectedId === histId && this.previewData) {
            return;
        }

        this.selectedId = histId;
        this.previewData = null;
        this.rollbackBtn.disabled = true;

        // Highlight active row
        this.listEl.querySelectorAll('[data-hist-id]').forEach((el) => {
            el.classList.toggle('active', parseInt(el.dataset.histId, 10) === histId);
        });

        this.previewEl.innerHTML = '<div class="history-preview-empty">Загрузка превью…</div>';
        this._setStatus('');

        try {
            const url = _withQs(_apiPath(this.pageId, `/history/${histId}`), this.qs);
            const json = await _fetchJson(url);
            this.previewData = json.data;

            this._renderPreview(this.previewData);
            this.rollbackBtn.disabled = false;
        } catch (err) {
            console.error('[History] preview error:', err);
            this.previewEl.innerHTML = `<div class="history-preview-empty">Ошибка: ${this._escape(err.message)}</div>`;
            this._setStatus(`Не удалось загрузить превью: ${err.message}`);
        }
    }

    /**
     * Render preview inside an isolated <iframe srcdoc="...">.
     *
     * The iframe document contains:
     *   - <base href="/"> so relative asset URLs work.
     *   - content.css  (shared classes: .btn, .card, .grid, ...)
     *   - block CSS    (elements.css, layout.css, ready.css, aleksmir.ru.css)
     *   - snapshot CSS — either data.css (new) or <style> extracted
     *                    from data.html (legacy)
     *   - the snapshot HTML wrapped in .core-engine-lib-word-blocks
     *
     * Result: styles in the preview match the public page and do NOT
     * collide with the editor UI styles.
     *
     * sandbox="allow-same-origin allow-scripts":
     *   - allow-same-origin — so <link rel="stylesheet"> can load from /static/.
     *   - allow-scripts     — so inline <script> in snapshots can run
     *                         (e.g. GrapesJS may have saved some).
     *                         The history modal is admin-only, so this is
     *                         safe enough for preview purposes.
     */
    _renderPreview(data) {
        const rawHtml = data.html || '<p style="color:#94a3b8;">Пустой снимок</p>';
        const snapshotCss = (data.css || '').trim();

        let htmlWithoutStyles = rawHtml;
        let css = snapshotCss;

        // Legacy path: CSS embedded in html as <style> tags
        if (!css) {
            const styleMatches = [...rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
            css = styleMatches.map(m => m[1]).join('\n').trim();
            htmlWithoutStyles = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        }

        const version = window.coreEngine?.static_version || Date.now();
        const cssBase = '/static/core/engine/lib/word/editor/css';
        const blocksBase = '/static/core/engine/lib/word/editor/blocks';

        // Same CSS set the canvas iframe uses
        const cssLinks = [
            `${cssBase}/content.css?v=${version}`,
            `${blocksBase}/elements.css?v=${version}`,
            `${blocksBase}/layout.css?v=${version}`,
            `${blocksBase}/ready.css?v=${version}`,
            `${blocksBase}/aleksmir.ru.css?v=${version}`,
        ].map((href) => `<link rel="stylesheet" href="${href}">`).join('\n');

        // Snapshot CSS as inline <style> in iframe head — it must come
        // AFTER block CSS so page rules override block defaults.
        const snapshotStyle = css
            ? `<style data-source="snapshot">${css}</style>`
            : '';

        const srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<base href="/">
${cssLinks}
${snapshotStyle}
<style>
  html, body { margin: 0; padding: 0; }
  body { padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
</style>
</head>
<body>
<div class="core-engine-lib-word-blocks">${htmlWithoutStyles}</div>
</body>
</html>`;

        this.previewEl.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.className = 'history-preview-frame';
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.srcdoc = srcdoc;

        this.previewEl.appendChild(iframe);
    }

    // ----------------------------------------
    // ROLLBACK
    // ----------------------------------------

    async _handleRollback() {
        if (!this.selectedId || !this.previewData) return;

        const item = this.items.find((i) => i.id === this.selectedId);
        const dateText = item ? this._formatDate(item.created_at) : '';

        // Confirm dialog
        const confirmed = await this._confirmRollback(dateText);
        if (!confirmed) return;

        this._setStatus('Откат…');
        this.rollbackBtn.disabled = true;

        try {
            const url = _withQs(_apiPath(this.pageId, `/rollback/${this.selectedId}`), this.qs);
            const json = await _fetchJson(url, { method: 'POST' });
            const data = json.data;

            this._setStatus('Откат выполнен');

            if (typeof this.onRollback === 'function') {
                try {
                    this.onRollback(data);
                } catch (e) {
                    console.error('[History] onRollback callback error:', e);
                }
            }

            // Close modal shortly after — let user see the "done" status
            setTimeout(() => this.destroy(), 400);
        } catch (err) {
            console.error('[History] rollback error:', err);
            this._setStatus(`Ошибка отката: ${err.message}`);
            this.rollbackBtn.disabled = false;
        }
    }

    /**
     * Show a confirm dialog via Base Modal Confirm.
     * Returns a Promise<boolean>.
     */
    _confirmRollback(dateText) {
        return new Promise(async (resolve) => {
            if (!this.createModal) {
                resolve(true);
                return;
            }

            try {
                const modal = await this.createModal('confirm');

                modal.open(
                    `Откатить страницу к версии от ${dateText}? Текущее состояние будет сохранено в истории.`,
                    'Подтверждение отката',
                    'Откатить',
                    'Отмена'
                );

                let resolved = false;
                const done = (result) => {
                    if (resolved) return;
                    resolved = true;
                    modal.destroy();
                    resolve(result);
                };

                modal.setOnOk(() => done(true));
                modal.setOnCancel(() => done(false));
            } catch (e) {
                console.warn('[History] confirm modal error:', e);
                resolve(true);
            }
        });
    }

    // ----------------------------------------
    // MISC
    // ----------------------------------------

    _setStatus(text) {
        if (this.statusEl) this.statusEl.textContent = text || '';
    }

    destroy() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this.container) {
            this.container.classList.remove('active');
            this.container.remove();
            this.container = null;
        }
        this.previewData = null;
        this.items = [];
        this.selectedId = null;
    }
}