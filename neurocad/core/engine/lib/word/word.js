// app/core/engine/lib/word/word.js

/**
 * Word — компонент отображения контента страницы.
 *
 * Задачи:
 *   1. Получить данные страницы:
 *      - из props.page_data (если передан);
 *      - или загрузить по props.page_id;
 *      - или загрузить по параметрам из window.coreEngine.paramsList.
 *   2. Отрендерить виджет:
 *        .core-engine-lib-base-widget.core-engine-lib-word-widget
 *          ├─ .core-engine-lib-base-widget-toolbar   ← кнопка «Редактировать»
 *          └─ .core-engine-lib-base-widget-content   ← article с контентом
 *   3. По кнопке — создать Editor (./editor/index.js),
 *      передать ему контейнер word-widget-content.
 *   4. Сохранить результат через API lib/word.
 *
 * API (все — lib/word, независимо от lib/pages):
 *   GET  /core/engine/lib/word/bydatetime/{date}/{time}
 *   GET  /core/engine/lib/word/item/{id}
 *   PUT  /core/engine/lib/word/{id}
 *   GET  /core/engine/lib/word/assets
 *   POST /core/engine/lib/word/assets/upload
 */
export class Word {
    constructor(container, props = {}) {
        console.log('[Word] Конструктор', { container, props });

        this.container = container;      // .core-engine-component--word (от Renderer)
        this.props = props;

        // Данные страницы
        this.pageId = props.page_id || null;
        this.pageData = props.page_data || null;

        // Состояние
        this.editorInstance = null;
        this.isEditing = false;
        this._initialized = false;
        this._initPromise = null;

        // DOM-ссылки на части виджета
        this.widgetEl = null;
        this.toolbarEl = null;
        this.widgetContentEl = null;

        // Путь к иконкам Base
        this._iconsBase = '/static/core/engine/lib/base/images';

        this._loadCSS();

        this._initPromise = this._init();
    }

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/word/word.css');
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
                        throw new Error('Нет данных для загрузки: нет page_data, page_id и параметров в URL');
                    }
                }
            }

            this._render();

            this._initialized = true;
            console.log('[Word] _init() COMPLETE');
        } catch (error) {
            console.error('[Word] Ошибка инициализации:', error);
            this._renderError(error.message);
            this._initialized = false;
            throw error;
        }
    }

    // ============================================
    // ЗАГРУЗКА ДАННЫХ
    // ============================================

    async _loadByParams() {
        const engine = window.coreEngine;
        const params = engine?.paramsList || [];

        const date = params[0] || null;
        const time = params[1] || null;

        if (!date || !time) {
            console.log('[Word] Параметры в URL отсутствуют');
            return false;
        }

        console.log(`[Word] Загрузка по дате/времени: ${date} ${time}`);

        const url = `/core/engine/lib/word/bydatetime/${date}/${time}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (response.status === 404) {
            throw new Error('Страница не найдена');
        }

        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Ошибка загрузки страницы');
        }

        this.pageData = result.data;
        this.pageId = result.data.id;
        console.log('[Word] Страница загружена:', this.pageData.title);
        return true;
    }

    async _loadById() {
        console.log(`[Word] Загрузка по id: ${this.pageId}`);

        const url = `/core/engine/lib/word/item/${this.pageId}`;
        const response = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (response.status === 404) {
            throw new Error('Страница не найдена');
        }

        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Ошибка загрузки страницы');
        }

        this.pageData = result.data;
        console.log('[Word] Страница загружена:', this.pageData.title);
    }

    // ============================================
    // РЕНДЕР
    // ============================================

    _render() {
        console.log('[Word] _render()');

        // Очищаем контейнер
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }

        // ===== Корневой widget =====
        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget core-engine-lib-word-widget';
        this.widgetEl = widget;

        // ===== Toolbar виджета =====
        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-widget-toolbar core-engine-lib-word-toolbar';
        toolbar.setAttribute('data-js', 'word-toolbar');
        this.toolbarEl = toolbar;
        widget.appendChild(toolbar);

        // Кнопка «Редактировать» — только для админа, слева
        if (this._isAdmin()) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'core-engine-lib-word-toolbar-btn';
            btn.setAttribute('data-action', 'word-edit');
            btn.setAttribute('title', 'Редактировать');
            btn.setAttribute('aria-label', 'Редактировать');

            const icon = document.createElement('img');
            icon.className = 'core-engine-lib-word-toolbar-btn-icon';
            icon.src = `${this._iconsBase}/edit.svg`;
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);

            btn.addEventListener('click', () => this._openEditor());
            toolbar.appendChild(btn);
        }

        // ===== Content виджета =====
        const widgetContent = document.createElement('div');
        widgetContent.className = 'core-engine-lib-base-widget-content core-engine-lib-word-widget-content';
        widgetContent.setAttribute('data-js', 'word-widget-content');
        this.widgetContentEl = widgetContent;
        widget.appendChild(widgetContent);

        // ===== Article внутри content =====
        const article = this._buildArticle();
        widgetContent.appendChild(article);

        // Вставляем виджет в container
        this.container.appendChild(widget);
    }

    /**
     * Собрать article с заголовком и контентом.
     * Используется и в _render(), и в _closeEditor().
     */
    _buildArticle() {
        // content = HTML + <style>…</style> (склеено при сохранении)
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
    // РЕДАКТОР
    // ============================================

    async _openEditor() {
        console.log('[Word] Открытие редактора');
        this.isEditing = true;

        // Очищаем содержимое виджета (оставляем toolbar и сам widget)
        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
        } else {
            console.warn('[Word] widgetContentEl не найден — создаю заново');
            this._render();
        }

        // Editor строится в word-widget-content — там есть место под toolbar+canvas
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
        console.log('[Word] Сохранение контента для id:', this.pageId);

        if (!this.pageId) {
            throw new Error('Неизвестен id страницы');
        }

        // ===== Склеиваем HTML + CSS =====
        // GrapesJS генерирует CSS через StyleManager. Если сохранить только
        // getHtml(), все flex/grid/выравнивания потеряются при рендере.
        // Поэтому кладём CSS в <style> прямо перед HTML.
        const css = (data.css || '').trim();
        const html = data.html || '';

        const contentWithCss = css
            ? `<style>${css}</style>${html}`
            : html;

        const url = `/core/engine/lib/word/${this.pageId}`;
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
            throw new Error(errorData.detail || 'Ошибка сохранения');
        }

        // Обновляем локальные данные — чтобы сразу после закрытия редактора
        // отрендерился контент со стилями (без перезагрузки страницы).
        this.pageData.content = contentWithCss;
        this.pageData.content_json = JSON.stringify(data.project);

        console.log('[Word] Контент сохранён (HTML + CSS)');

        this._closeEditor();
    }

    _closeEditor() {
        console.log('[Word] Закрытие редактора');

        if (this.editorInstance?.destroy) {
            this.editorInstance.destroy();
        }
        this.editorInstance = null;
        this.isEditing = false;

        // Очищаем содержимое виджета и возвращаем туда article
        if (this.widgetContentEl) {
            while (this.widgetContentEl.firstChild) {
                this.widgetContentEl.removeChild(this.widgetContentEl.firstChild);
            }
            this.widgetContentEl.appendChild(this._buildArticle());
        } else {
            // fallback — перерисовать целиком
            this._render();
        }
    }

    // ============================================
    // УТИЛИТЫ
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

    _safeJsonParse(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn('[Word] Не удалось распарсить JSON:', e);
            return null;
        }
    }

    // ============================================
    // ПУБЛИЧНЫЕ МЕТОДЫ
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
        this._initialized = false;
        this._initPromise = null;
    }
}