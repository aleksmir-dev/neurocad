// neurocad/core/engine/lib/word/llm/presets.js

/**
 * LLMPresets — левая панель LLM-редактора: список пресетов.
 *
 * Задачи:
 *   - загрузить список пресетов с бэкенда (GET /presets);
 *   - отрисовать список с миниатюрами;
 *   - при клике — отдать HTML пресета в preview;
 *   - создать новый пресет (POST /presets);
 *   - удалить пресет (DELETE /presets/{id});
 *   - загрузить PNG-миниатюру (POST /presets/{id}/thumbnail).
 *
 * Контейнеры:
 *   editor.presetsEl   — .core-engine-lib-word-llm-presets-content
 *   тулбар с кнопкой «+» уже построен в widgets.js
 */
export class LLMPresets {
    constructor(editor) {
        console.log('[LLMPresets] Конструктор');
        this.editor = editor;

        // DOM
        this.rootEl = editor.presetsEl;      // .core-engine-lib-word-llm-presets-content
        this.listEl = null;

        // API
        this._apiBase = '/core/engine/lib/word/llm/presets';

        // Данные
        this.presets = [];           // список с бэкенда
        this.currentId = null;       // id выбранного пресета
    }

    async init() {
        console.log('[LLMPresets] init() START');

        if (!this.rootEl) {
            console.error('[LLMPresets] presetsEl не найден');
            return;
        }

        this._buildDOM();
        this._bindToolbarEvents();

        // Загружаем список с бэкенда
        await this._loadPresets();

        console.log('[LLMPresets] init() COMPLETE');
    }

    // ============================================
    // DOM
    // ============================================

    _buildDOM() {
        // Очищаем контейнер
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        // Список пресетов
        const list = document.createElement('div');
        list.className = 'core-engine-lib-word-llm-presets-list';
        list.setAttribute('data-js', 'llm-presets-list');
        this.listEl = list;
        this.rootEl.appendChild(list);
    }

    _bindToolbarEvents() {
        // Кнопка «+» в тулбаре пресетов
        const toolbar = this.editor.leftArea?.querySelector('.core-engine-lib-word-llm-presets-toolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="preset-add"]');
            if (!btn) return;
            this._onCreate();
        });
    }

    _renderList() {
        if (!this.listEl) return;

        // Очищаем список
        while (this.listEl.firstChild) {
            this.listEl.removeChild(this.listEl.firstChild);
        }

        if (!this.presets || this.presets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'core-engine-lib-word-llm-presets-empty';
            empty.textContent = 'Нет пресетов';
            this.listEl.appendChild(empty);
            return;
        }

        for (const preset of this.presets) {
            const item = this._buildItem(preset);
            this.listEl.appendChild(item);
        }
    }

    _buildItem(preset) {
        const item = document.createElement('div');
        item.className = 'core-engine-lib-word-llm-presets-item';
        item.setAttribute('data-id', preset.id);

        if (preset.id === this.currentId) {
            item.classList.add('active');
        }

        // ===== Миниатюра =====
        const thumb = document.createElement('div');
        thumb.className = 'core-engine-lib-word-llm-presets-thumb';

        if (preset.thumbnail_path) {
            const img = document.createElement('img');
            img.src = `/media/${preset.thumbnail_path}`;
            img.alt = preset.name || '';
            img.loading = 'lazy';
            thumb.appendChild(img);
        } else {
            // Заглушка, если миниатюры нет
            thumb.textContent = '🖼️';
        }
        item.appendChild(thumb);

        // ===== Название =====
        const name = document.createElement('div');
        name.className = 'core-engine-lib-word-llm-presets-name';
        name.textContent = preset.name || 'Без названия';
        item.appendChild(name);

        // ===== Кнопка удаления (появляется при hover) =====
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'core-engine-lib-word-llm-presets-del';
        delBtn.setAttribute('title', 'Удалить пресет');
        delBtn.setAttribute('aria-label', 'Удалить пресет');
        delBtn.textContent = '×';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._onDelete(preset.id);
        });
        item.appendChild(delBtn);

        // ===== Клик по элементу =====
        item.addEventListener('click', () => this._onSelect(preset.id));

        return item;
    }

    // ============================================
    // API
    // ============================================

    async _loadPresets() {
        console.log('[LLMPresets] _loadPresets()');

        try {
            const response = await fetch(this._apiBase, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.presets = result.data || [];
                console.log(`[LLMPresets] Загружено пресетов: ${this.presets.length}`);
            } else {
                console.warn('[LLMPresets] Ответ без success:', result);
                this.presets = [];
            }
        } catch (error) {
            console.error('[LLMPresets] Ошибка загрузки списка:', error);
            this.presets = [];
        }

        this._renderList();
    }

    async _createPreset(name, description = '', html = '') {
        const response = await fetch(this._apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ name, description, html }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Ошибка создания пресета');
        }

        const result = await response.json();
        return result.data;
    }

    async _deletePreset(id) {
        const response = await fetch(`${this._apiBase}/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Ошибка удаления пресета');
        }
    }

    async _updatePreset(id, data) {
        const response = await fetch(`${this._apiBase}/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Ошибка обновления пресета');
        }

        const result = await response.json();
        return result.data;
    }

    async _uploadThumbnail(id, blob) {
        const formData = new FormData();
        formData.append('file', blob, `preset-${id}.png`);

        const response = await fetch(`${this._apiBase}/${id}/thumbnail`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Ошибка загрузки миниатюры');
        }

        const result = await response.json();
        return result.data;
    }

    // ============================================
    // ДЕЙСТВИЯ
    // ============================================

    async _onSelect(id) {
        console.log('[LLMPresets] _onSelect() id:', id);

        const preset = this.presets.find(p => p.id === id);
        if (!preset) {
            console.warn('[LLMPresets] Пресет не найден:', id);
            return;
        }

        this.currentId = id;

        // Подсветка активного
        this._renderList();

        // Отдать HTML в preview
        if (this.editor._preview) {
            this.editor._preview.setHtml(preset.html || '');
        }
    }

    async _onCreate() {
        console.log('[LLMPresets] _onCreate()');

        // Простая форма через prompt (потом заменим на модалку)
        const name = prompt('Название пресета:', 'Новый пресет');
        if (!name || !name.trim()) return;

        try {
            const preset = await this._createPreset(name.trim(), '', '<div style="padding:40px;text-align:center;"><p>Новый пресет</p></div>');

            // Добавляем в локальный список
            this.presets.push(preset);
            this._renderList();

            console.log('[LLMPresets] Пресет создан:', preset.id);
        } catch (error) {
            console.error('[LLMPresets] Ошибка создания:', error);
            alert(`Ошибка: ${error.message}`);
        }
    }

    async _onDelete(id) {
        console.log('[LLMPresets] _onDelete() id:', id);

        const preset = this.presets.find(p => p.id === id);
        if (!preset) return;

        if (!confirm(`Удалить пресет «${preset.name}»?`)) return;

        try {
            await this._deletePreset(id);

            // Удаляем из локального списка
            this.presets = this.presets.filter(p => p.id !== id);

            if (this.currentId === id) {
                this.currentId = null;
            }

            this._renderList();

            console.log('[LLMPresets] Пресет удалён:', id);
        } catch (error) {
            console.error('[LLMPresets] Ошибка удаления:', error);
            alert(`Ошибка: ${error.message}`);
        }
    }

    /**
     * Сохранить текущий HTML превью в выбранный пресет.
     * Вызывается из toolbar (Save) или из chat.
     */
    async saveCurrentHtml() {
        if (!this.currentId) {
            console.log('[LLMPresets] Нет выбранного пресета — пропускаем сохранение');
            return;
        }

        const html = this.editor._preview?.getHtml() || '';

        try {
            await this._updatePreset(this.currentId, { html });

            // Обновляем локально
            const preset = this.presets.find(p => p.id === this.currentId);
            if (preset) preset.html = html;

            console.log('[LLMPresets] HTML сохранён в пресет:', this.currentId);
        } catch (error) {
            console.error('[LLMPresets] Ошибка сохранения HTML:', error);
        }
    }

    destroy() {
        console.log('[LLMPresets] destroy()');
        this.rootEl = null;
        this.listEl = null;
        this.presets = [];
        this.currentId = null;
    }
}