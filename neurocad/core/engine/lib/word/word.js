// app/core/engine/lib/word/word.js

/**
 * Word — page content display component.
 *
 * Tasks:
 *   1. Get page data:
 *      - from props.page_data (if provided);
 *      - or load by props.page_id;
 *      - or load by params from window.coreEngine.paramsList.
 *   2. Render widget:
 *        .core-engine-lib-base-widget.core-engine-lib-word-widget
 *          ├─ .core-engine-lib-base-widget-toolbar
 *          │    ├─ "Edit" button (pencil, GrapesJS)
 *          │    ├─ "LLM editor" button (⚡)
 *          │    └─ "Open public" button (link) — opens /page/<date>/<time> in new tab
 *          └─ .core-engine-lib-base-widget-content   ← article with content
 *   3. Pencil button — Editor (./editor/index.js) — GrapesJS.
 *   4. Lightning button — LLMEditor (./llm/index.js) — editor with presets and chat.
 *   5. Link button — opens public version of the page in a new tab.
 *   6. Save via lib/word API.
 *
 * API (all — lib/word, independent of lib/pages):
 *   GET  /core/engine/lib/word/bydatetime/{date}/{time}?module=<name>
 *   GET  /core/engine/lib/word/item/{id}?module=<name>
 *   PUT  /core/engine/lib/word/{id}?module=<name>
 *   GET  /core/engine/lib/word/assets?module=<name>
 *   POST /core/engine/lib/word/assets/upload?module=<name>
 *
 * module query param — for multi-site support. Resolved by route.py
 * via _module_name() (query -> Referer fallback).
 */
export class Word {
    constructor(container, props = {}) {
        console.log('[Word] Constructor', { container, props });

        this.container = container;      // .core-engine-component--word (from Renderer)
        this.props = props;

        // Page data
        this.pageId = props.page_id || null;
        this.pageData = props.page_data || null;

        // Module name for multi-site support (query param in URLs)
        this.moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        this._qs = this.moduleName
            ? `?module=${encodeURIComponent(this.moduleName)}`
            : '';

        // State
        this.editorInstance = null;      // GrapesJS editor
        this.llmInstance = null;         // LLM editor
        this.isEditing = false;
        this._initialized = false;
        this._initPromise = null;

        // DOM refs to widget parts
        this.widgetEl = null;
        this.toolbarEl = null;
        this.widgetContentEl = null;

        // Path to Base icons
        this._iconsBase = '/static/core/engine/lib/base/images';

        this._loadCSS();

        this._initPromise = this._init();
    }

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/word/word.css');
            window.coreEngine.loadCSS('core/engine/lib/word/llm/llm.css');
        }
    }

    async _init() {
        console.log('[Word] _init() START');
        try {
            if (!this.pageData) {
                if (this.pageId) {
                    await this._loadById();
                } else {
                    const loaded = await this._loadByParams();
                    if (!loaded) {
                        throw new Error('No data to load: no page_data, page_id, or URL params');
                    }
                }
            }

            this._render();

            this._initialized = true;
            console.log('[Word] _init() COMPLETE');
        } catch (error) {
            console.error('[Word] Init error:', error);
            this._renderError(error.message);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // DATA LOADING
    // ============================================

    async _loadByParams() {
        const engine = window.coreEngine;
        const params = engine?.paramsList || [];

        const date = params[0] || null;
        const time = params[1] || null;

        if (!date || !time) {
            console.log('[Word] URL params missing');
            return false;
        }

        console.log(`[Word] Loading by date/time: ${date} ${time}`);

        const url = `/core/engine/lib/word/bydatetime/${date}/${time}${this._qs}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (response.status === 404) {
            throw new Error('Page not found');
        }

        if (!response.ok) {
            throw new Error(`Load error: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Page load error');
        }

        this.pageData = result.data;
        this.pageId = result.data.id;
        console.log('[Word] Page loaded:', this.pageData.title);
        return true;
    }

    async _loadById() {
        console.log(`[Word] Loading by id: ${this.pageId}`);

        const url = `/core/engine/lib/word/item/${this.pageId}${this._qs}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (response.status === 404) {
            throw new Error('Page not found');
        }

        if (!response.ok) {
            throw new Error(`Load error: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Page load error');
        }

        this.pageData = result.data;
        console.log('[Word] Page loaded:', this.pageData.title);
    }

    // ============================================
    // RENDER
    // ============================================

    _render() {
        console.log('[Word] _render()');

        // Clear container
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        // ===== Root widget =====
        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget core-engine-lib-word-widget';
        this.widgetEl = widget;

        // ===== Widget toolbar =====
        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-widget-toolbar core-engine-lib-word-toolbar';
        toolbar.setAttribute('data-js', 'word-toolbar');
        this.toolbarEl = toolbar;
        widget.appendChild(toolbar);

        // Toolbar buttons — admin only
        if (this._isAdmin()) {
            // ===== "Edit" button (GrapesJS) =====
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'core-engine-lib-word-toolbar-btn';
            editBtn.setAttribute('data-action', 'word-edit');
            editBtn.setAttribute('title', 'Редактировать (визуальный редактор)');
            editBtn.setAttribute('aria-label', 'Редактировать');

            const editIcon = document.createElement('img');
            editIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
            editIcon.src = `${this._iconsBase}/edit.svg`;
            editIcon.alt = '';
            editIcon.setAttribute('aria-hidden', 'true');
            editBtn.appendChild(editIcon);

            editBtn.addEventListener('click', () => this._openEditor());
            toolbar.appendChild(editBtn);

            // ===== "LLM editor" button (⚡) =====
            const llmBtn = document.createElement('button');
            llmBtn.type = 'button';
            llmBtn.className = 'core-engine-lib-word-toolbar-btn';
            llmBtn.setAttribute('data-action', 'word-llm');
            llmBtn.setAttribute('title', 'LLM-редактор (пресеты + чат)');
            llmBtn.setAttribute('aria-label', 'LLM-редактор');

            const llmIcon = document.createElement('img');
            llmIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
            llmIcon.src = `${this._iconsBase}/zap.svg`;
            llmIcon.alt = '';
            llmIcon.setAttribute('aria-hidden', 'true');
            llmBtn.appendChild(llmIcon);

            llmBtn.addEventListener('click', () => this._openLLMEditor());
            toolbar.appendChild(llmBtn);

            // ===== "Open public" button (link) =====
            const publicBtn = document.createElement('button');
            publicBtn.type = 'button';
            publicBtn.className = 'core-engine-lib-word-toolbar-btn';
            publicBtn.setAttribute('data-action', 'word-public');
            publicBtn.setAttribute('title', 'Открыть публичную версию');
            publicBtn.setAttribute('aria-label', 'Открыть публичную версию');

            const publicIcon = document.createElement('img');
            publicIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
            publicIcon.src = `${this._iconsBase}/link.svg`;
            publicIcon.alt = '';
            publicIcon.setAttribute('aria-hidden', 'true');
            publicBtn.appendChild(publicIcon);

            publicBtn.addEventListener('click', () => this._openPublicPage());
            toolbar.appendChild(publicBtn);
        }

        // ===== Widget content =====
        const widgetContent = document.createElement('div');
        widgetContent.className = 'core-engine-lib-base-widget-content core-engine-lib-word-widget-content';
        widgetContent.setAttribute('data-js', 'word-widget-content');
        this.widgetContentEl = widgetContent;
        widget.appendChild(widgetContent);

        // ===== Article inside content =====
        const article = this._buildArticle();
        widgetContent.appendChild(article);

        // Insert widget into container
        this.container.appendChild(widget);
    }

    /**
     * Build article with title and content.
     * Used in _render(), _closeEditor(), _closeLLMEditor().
     */
    _buildArticle() {
        // content = HTML + <style>…</style> (merged on save)
        const html = this.pageData?.content
            || '<p class="core-engine-lib-word-empty">Контент пуст</p>';

        const article = document.createElement('article');
        article.className = 'core-engine-lib-word';

        // Header
        const header = document.createElement('header');
        header.className = 'core-engine-lib-word-header';

        const h1 = document.createElement('h1');
        h1.className = 'core-engine-lib-word-title';
        h1.textContent = this.pageData?.title || 'Без названия';
        header.appendChild(h1);

        if (this.pageData?.datetime) {
            const time = document.createElement('time');
            time.className = 'core-engine-lib-word-date';
            time.textContent = this._formatDate(this.pageData.datetime);
            header.appendChild(time);
        }

        article.appendChild(header);

        // Content
        const contentEl = document.createElement('div');
        contentEl.className = 'core-engine-lib-word-content';
        contentEl.setAttribute('data-js', 'word-content');
        contentEl.innerHTML = html;
        article.appendChild(contentEl);

        return article;
    }

    _renderError(message) {
        console.log('[Word] _renderError()', message);

        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'core-engine-lib-word-error';

        const icon = document.createElement('div');
        icon.className = 'core-engine-lib-word-error-icon';
        icon.textContent = '⚠️';
        errorDiv.appendChild(icon);

        const title = document.createElement('h2');
        title.className = 'core-engine-lib-word-error-title';
        title.textContent = 'Страница не найдена';
        errorDiv.appendChild(title);

        const text = document.createElement('p');
        text.className = 'core-engine-lib-word-error-text';
        text.textContent = message;
        errorDiv.appendChild(text);

        this.container.appendChild(errorDiv);
    }

    // ============================================
    // RESIZER HANDLES — CLEANUP ON MODE SWITCH
    // ============================================

    /**
     * Remove ALL resizer handles (both GrapesJS and LLM).
     * Used when switching modes, to avoid conflict
     * (two pairs of handles in one place).
     */
    _clearAllResizers() {
        document.querySelectorAll('.core-engine-lib-word-editor-resizer').forEach(h => h.remove());
        document.querySelectorAll('.core-engine-lib-word-llm-resizer').forEach(h => h.remove());
    }

    // ============================================
    // GRAPESJS EDITOR
    // ============================================

    async _openEditor() {
        console.log('[Word] Opening GrapesJS editor');
        this.isEditing = true;

        // Remove all handles from previous modes
        this._clearAllResizers();

        // Clear widget content (keep toolbar and widget itself)
        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
        } else {
            console.warn('[Word] widgetContentEl not found — re-creating');
            this._render();
        }

        // Editor is built in word-widget-content — there's room for toolbar+canvas
        const version = window.coreEngine?.static_version || Date.now();
        const { Editor } = await import(`./editor/index.js?v=${version}`);

        this.editorInstance = new Editor(this.widgetContentEl, {
            title: this.pageData?.title || 'Страница',
            html: this.pageData?.content || '',
            project: this.pageData?.content_json
                ? this._safeJsonParse(this.pageData.content_json)
                : null,

            onSave: async (data) => {
                await this._saveContent(data);
            },

            onCancel: () => {
                this._closeEditor();
            },
        });

        await this.editorInstance.waitForInit();
    }

    async _saveContent(data) {
        console.log('[Word] Saving content for id:', this.pageId);

        if (!this.pageId) {
            throw new Error('Unknown page id');
        }

        // ===== Merge HTML + CSS =====
        // GrapesJS generates CSS via StyleManager. If we save only
        // getHtml(), all flex/grid/alignments are lost on render.
        // So we put CSS in <style> right before HTML.
        const css = (data.css || '').trim();
        const html = data.html || '';

        const contentWithCss = css
            ? `<style>${css}</style>${html}`
            : html;

        const url = `/core/engine/lib/word/${this.pageId}${this._qs}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                content: contentWithCss,
                content_json: JSON.stringify(data.project),
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Save error');
        }

        // Update local data — so that after closing the editor,
        // content with styles renders immediately (no page reload).
        this.pageData.content = contentWithCss;
        this.pageData.content_json = JSON.stringify(data.project);

        console.log('[Word] Content saved (HTML + CSS)');

        this._closeEditor();
    }

    _closeEditor() {
        console.log('[Word] Closing GrapesJS editor');

        if (this.editorInstance?.destroy) {
            this.editorInstance.destroy();
        }
        this.editorInstance = null;
        this.isEditing = false;

        // Remove any remaining handles
        this._clearAllResizers();

        // Clear widget content and put article back
        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
            this.widgetContentEl.appendChild(this._buildArticle());
        } else {
            // fallback — full re-render
            this._render();
        }
    }

    // ============================================
    // LLM EDITOR
    // ============================================

    async _openLLMEditor() {
        console.log('[Word] Opening LLM editor');
        this.isEditing = true;

        // Remove all handles from previous modes
        this._clearAllResizers();

        // Clear widget content
        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
        } else {
            console.warn('[Word] widgetContentEl not found — re-creating');
            this._render();
        }

        const version = window.coreEngine?.static_version || Date.now();
        const { LLMEditor } = await import(`./llm/index.js?v=${version}`);

        this.llmInstance = new LLMEditor(this.widgetContentEl, {
            pageId: this.pageId,
            pageData: this.pageData,

            onSave: async (data) => {
                await this._saveLLMContent(data);
            },

            onCancel: () => {
                this._closeLLMEditor();
            },
        });

        await this.llmInstance.waitForInit();
    }

    async _saveLLMContent(data) {
        console.log('[Word] Saving content from LLM editor for id:', this.pageId);

        if (!this.pageId) {
            throw new Error('Unknown page id');
        }

        const url = `/core/engine/lib/word/${this.pageId}${this._qs}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                content: data.html,
                content_json: data.content_json || null,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Save error');
        }

        this.pageData.content = data.html;
        if (data.content_json) {
            this.pageData.content_json = data.content_json;
        }

        console.log('[Word] Content from LLM editor saved');
    }

    _closeLLMEditor() {
        console.log('[Word] Closing LLM editor');

        if (this.llmInstance?.destroy) {
            this.llmInstance.destroy();
        }
        this.llmInstance = null;
        this.isEditing = false;

        // Remove any remaining handles
        this._clearAllResizers();

        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
            this.widgetContentEl.appendChild(this._buildArticle());
        } else {
            this._render();
        }
    }

    // ============================================
    // PUBLIC PAGE
    // ============================================

    /**
     * Open public version of the page in a new tab.
     *
     * Builds URL: /page/<YYYYMMDD>/<HHMMSS>
     * Uses pageData.datetime.
     */
    _openPublicPage() {
        console.log('[Word] Opening public page');

        const datetime = this.pageData?.datetime;
        if (!datetime) {
            console.warn('[Word] No datetime — cannot open public page');
            return;
        }

        const date = this._formatDateShort(datetime);
        const time = this._formatTimeShort(datetime);

        if (!date || !time) {
            console.warn('[Word] Failed to format date/time');
            return;
        }

        const url = `/page/${date}/${time}`;
        console.log('[Word] Public URL:', url);

        window.open(url, '_blank', 'noopener,noreferrer');
    }

    // ============================================
    // UTILITIES
    // ============================================

    _isAdmin() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;
        if (typeof auth.isSuperadmin === 'function') {
            return auth.isSuperadmin();
        }
        if (typeof auth.getUser === 'function') {
            const user = auth.getUser();
            return user?.is_superadmin === true;
        }
        return false;
    }

    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (e) {
            return isoString;
        }
    }

    /**
     * Format ISO datetime to YYYYMMDD.
     */
    _formatDateShort(isoString) {
        try {
            const d = new Date(isoString);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}${mm}${dd}`;
        } catch (e) {
            console.warn('[Word] Date format error:', e);
            return '';
        }
    }

    /**
     * Format ISO datetime to HHMMSS.
     */
    _formatTimeShort(isoString) {
        try {
            const d = new Date(isoString);
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${hh}${mi}${ss}`;
        } catch (e) {
            console.warn('[Word] Time format error:', e);
            return '';
        }
    }

    _safeJsonParse(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn('[Word] Failed to parse JSON:', e);
            return null;
        }
    }

    // ============================================
    // PUBLIC METHODS
    // ============================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }

    destroy() {
        console.log('[Word] destroy()');

        if (this.editorInstance?.destroy) {
            this.editorInstance.destroy();
        }
        this.editorInstance = null;

        if (this.llmInstance?.destroy) {
            this.llmInstance.destroy();
        }
        this.llmInstance = null;

        // Remove all handles
        this._clearAllResizers();

        this._initialized = false;
        this._initPromise = null;
    }
}