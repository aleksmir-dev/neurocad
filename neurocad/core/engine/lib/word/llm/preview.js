// neurocad/core/engine/lib/word/llm/preview.js

/**
 * LLMPreview — центральная область LLM-редактора.
 *
 * Задачи:
 *   - построить toolbar (Back/Forward/Undo/Redo/Save/Close);
 *   - рендерить HTML страницы в iframe;
 *   - хранить текущий HTML;
 *   - навигация Back/Forward по истории переходов (localStorage);
 *   - перехват ссылок внутри iframe — переходы внутри превью;
 *   - отдавать HTML наружу (для сохранения).
 *
 * Контейнеры:
 *   editor.toolbarEl — .core-engine-lib-word-llm-toolbar (пустой, заполняем)
 *   editor.canvasEl  — .core-engine-lib-word-llm-preview-content
 */
export class LLMPreview {
    constructor(editor) {
        console.log('[LLMPreview] Конструктор');
        this.editor = editor;

        // DOM
        this.toolbarEl = editor.toolbarEl;   // .core-engine-lib-word-llm-toolbar
        this.rootEl = editor.canvasEl;       // .core-engine-lib-word-llm-preview-content
        this.iframeEl = null;

        // Текущий HTML
        this.currentHtml = '';

        // Иконки
        this._iconsBase = '/static/core/engine/lib/base/images';

        // История навигации (localStorage)
        this._historyKey = 'llm_nav_history';
        this._historyPosKey = 'llm_nav_pos';
    }

    async init() {
        console.log('[LLMPreview] init() START');

        if (!this.rootEl) {
            console.error('[LLMPreview] canvasEl не найден');
            return;
        }

        this._buildToolbar();
        this._buildDOM();
        this._bindToolbarEvents();
        this._bindMessages();

        // Загружаем HTML страницы
        const initialHtml = this.editor.pageData?.content || this._emptyHtml();
        this.setHtml(initialHtml);

        // Обновляем состояние кнопок Back/Forward
        this._updateNavButtons();

        console.log('[LLMPreview] init() COMPLETE');
    }

    // ============================================
    // TOOLBAR
    // ============================================

    _buildToolbar() {
        if (!this.toolbarEl) return;

        const iconsBase = this._iconsBase;
        const version = window.coreEngine?.static_version || Date.now();

        const makeBtn = (action, title, icon) => `
            <button type="button"
                    class="core-engine-lib-word-llm-btn"
                    data-action="${action}"
                    title="${title}"
                    aria-label="${title}">
                <img class="core-engine-lib-word-llm-btn-icon"
                     src="${iconsBase}/${icon}?v=${version}"
                     alt=""
                     aria-hidden="true">
            </button>
        `;

        this.toolbarEl.innerHTML = `
            ${makeBtn('llm-back', 'Назад', 'back.svg')}
            ${makeBtn('llm-forward', 'Вперёд', 'forward.svg')}
            <div class="core-engine-lib-word-llm-toolbar-separator"></div>
            ${makeBtn('llm-undo', 'Отменить изменение (Ctrl+Z)', 'undo.svg')}
            ${makeBtn('llm-redo', 'Повторить изменение (Ctrl+Y)', 'redo.svg')}
            <div class="core-engine-lib-word-llm-toolbar-separator"></div>
            ${makeBtn('llm-save', 'Сохранить (Ctrl+S)', 'save.svg')}
            <div class="core-engine-lib-word-llm-toolbar-spacer"></div>
            ${makeBtn('llm-close', 'Закрыть без сохранения (Esc)', 'cancel.svg')}
        `;

        // Стартовые состояния
        const backBtn = this.toolbarEl.querySelector('[data-action="llm-back"]');
        const forwardBtn = this.toolbarEl.querySelector('[data-action="llm-forward"]');
        const undoBtn = this.toolbarEl.querySelector('[data-action="llm-undo"]');
        const redoBtn = this.toolbarEl.querySelector('[data-action="llm-redo"]');

        if (backBtn) backBtn.disabled = true;
        if (forwardBtn) forwardBtn.disabled = true;
        if (undoBtn) undoBtn.disabled = true;
        if (redoBtn) redoBtn.disabled = true;
    }

    _bindToolbarEvents() {
        if (!this.toolbarEl) return;

        this.toolbarEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || btn.disabled) return;
            this._handleAction(btn.dataset.action);
        });

        // Горячие клавиши
        this._onKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.editor.save();
            } else if (e.key === 'Escape') {
                this.editor.cancel();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (this.editor._history) this.editor._history.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                if (this.editor._history) this.editor._history.redo();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    _handleAction(action) {
        const editor = this.editor;

        switch (action) {
            case 'llm-back':
                this.goBack();
                break;
            case 'llm-forward':
                this.goForward();
                break;
            case 'llm-undo':
                if (editor._history) editor._history.undo();
                break;
            case 'llm-redo':
                if (editor._history) editor._history.redo();
                break;
            case 'llm-save':
                editor.save();
                break;
            case 'llm-close':
                editor.cancel();
                break;
        }
    }

    // ============================================
    // DOM
    // ============================================

    _buildDOM() {
        // Очищаем
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        const iframe = document.createElement('iframe');
        iframe.className = 'core-engine-lib-word-llm-preview-iframe';
        iframe.setAttribute('data-js', 'llm-preview-iframe');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        this.rootEl.appendChild(iframe);

        this.iframeEl = iframe;
    }

    _bindMessages() {
        this._onMessage = (e) => {
            console.log('[LLMPreview] message из iframe:', e.data);
        };
        window.addEventListener('message', this._onMessage);
    }

    // ============================================
    // HTML
    // ============================================

    setHtml(html) {
        console.log('[LLMPreview] setHtml() длина:', html?.length);

        this.currentHtml = html || '';

        if (this.iframeEl) {
            const doc = this.iframeEl.contentDocument || this.iframeEl.contentWindow.document;
            doc.open();
            doc.write(this._wrapHtml(this.currentHtml));
            doc.close();

            this._bindLinksInIframe();
        }
    }

    getHtml() {
        return this.currentHtml;
    }

    _wrapHtml(fragment) {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>
</head>
<body>
${fragment}
</body>
</html>`;
    }

    _emptyHtml() {
        return '<div style="padding:40px;text-align:center;color:#94a3b8;"><p>Выберите пресет слева или введите запрос в чат</p></div>';
    }

    // ============================================
    // ПЕРЕХВАТ ССЫЛОК В IFRAME
    // ============================================

    _bindLinksInIframe() {
        if (!this.iframeEl) return;

        const doc = this.iframeEl.contentDocument;
        if (!doc) return;

        const links = doc.querySelectorAll('a[href]');
        links.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.getAttribute('href');
                if (!href || href.startsWith('#')) return;

                console.log('[LLMPreview] переход по ссылке в превью:', href);
                this._navigate(href);
            });
        });
    }

    // ============================================
    // НАВИГАЦИЯ BACK/FORWARD
    // ============================================

    async _navigate(url) {
        console.log('[LLMPreview] _navigate() url:', url);

        this._pushHistory({
            url,
            title: '',
            ts: Date.now(),
        });

        // Заглушка — переход на страницу будет на следующем этапе
        this.setHtml(`<div style="padding:40px;text-align:center;color:#94a3b8;">
            <p>Переход на <code>${url}</code></p>
            <p style="font-size:12px;">(загрузка страницы будет на следующем этапе)</p>
        </div>`);

        this._updateNavButtons();
    }

    goBack() {
        const pos = this._getHistoryPos();
        if (pos <= 0) {
            console.log('[LLMPreview] goBack() — в начале истории');
            return;
        }

        const newPos = pos - 1;
        this._setHistoryPos(newPos);

        const history = this._getHistory();
        const entry = history[newPos];
        if (entry) {
            console.log('[LLMPreview] goBack() →', entry.url);
            this.setHtml(`<div style="padding:40px;text-align:center;color:#94a3b8;">
                <p>Назад: <code>${entry.url}</code></p>
            </div>`);
        }

        this._updateNavButtons();
    }

    goForward() {
        const pos = this._getHistoryPos();
        const history = this._getHistory();

        if (pos >= history.length - 1) {
            console.log('[LLMPreview] goForward() — в конце истории');
            return;
        }

        const newPos = pos + 1;
        this._setHistoryPos(newPos);

        const entry = history[newPos];
        if (entry) {
            console.log('[LLMPreview] goForward() →', entry.url);
            this.setHtml(`<div style="padding:40px;text-align:center;color:#94a3b8;">
                <p>Вперёд: <code>${entry.url}</code></p>
            </div>`);
        }

        this._updateNavButtons();
    }

    _updateNavButtons() {
        if (!this.toolbarEl) return;

        const backBtn = this.toolbarEl.querySelector('[data-action="llm-back"]');
        const forwardBtn = this.toolbarEl.querySelector('[data-action="llm-forward"]');

        const pos = this._getHistoryPos();
        const history = this._getHistory();

        if (backBtn) {
            backBtn.disabled = pos <= 0;
        }
        if (forwardBtn) {
            forwardBtn.disabled = pos >= history.length - 1;
        }
    }

    // ============================================
    // ИСТОРИЯ (localStorage)
    // ============================================

    _getHistory() {
        try {
            const raw = localStorage.getItem(this._historyKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[LLMPreview] Ошибка чтения истории:', e);
            return [];
        }
    }

    _setHistory(history) {
        try {
            localStorage.setItem(this._historyKey, JSON.stringify(history));
        } catch (e) {
            console.warn('[LLMPreview] Ошибка записи истории:', e);
        }
    }

    _getHistoryPos() {
        const raw = localStorage.getItem(this._historyPosKey);
        const pos = parseInt(raw, 10);
        return isNaN(pos) ? 0 : pos;
    }

    _setHistoryPos(pos) {
        localStorage.setItem(this._historyPosKey, String(pos));
    }

    _pushHistory(entry) {
        let history = this._getHistory();
        let pos = this._getHistoryPos();

        // Обрезаем всё после текущей позиции
        if (pos < history.length - 1) {
            history = history.slice(0, pos + 1);
        }

        history.push(entry);
        this._setHistory(history);
        this._setHistoryPos(history.length - 1);
    }

    destroy() {
        console.log('[LLMPreview] destroy()');

        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }

        if (this._onMessage) {
            window.removeEventListener('message', this._onMessage);
            this._onMessage = null;
        }

        if (this.iframeEl) {
            this.iframeEl.remove();
            this.iframeEl = null;
        }

        if (this.toolbarEl) {
            this.toolbarEl.innerHTML = '';
        }

        this.rootEl = null;
        this.toolbarEl = null;
        this.currentHtml = '';
    }
}