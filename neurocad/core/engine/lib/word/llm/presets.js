// neurocad/core/engine/lib/word/llm/presets.js

/**
 * LLMPresets — presets list (left panel, "Presets" tab).
 *
 * Tasks:
 *   - load presets from backend (GET /presets);
 *   - render list with thumbnails;
 *   - on click — apply preset HTML+CSS to GrapesJS canvas;
 *   - create new preset from current canvas (POST /presets);
 *   - delete preset (DELETE /presets/{id});
 *   - upload PNG thumbnail (POST /presets/{id}/thumbnail).
 *
 * Container:
 *   editor.presetsEl — [data-js="editor-presets"]
 *   Toolbar with "+" button is built by editor/widgets.js
 */
export class LLMPresets {
    constructor(editor) {
        console.log('[LLMPresets] Constructor');
        this.editor = editor;

        // DOM
        this.rootEl = editor.presetsEl;      // [data-js="editor-presets"]
        this.listEl = null;

        // API
        this._apiBase = '/core/engine/lib/word/llm/presets';

        // Data
        this.presets = [];           // list from backend
        this.currentId = null;       // selected preset id
    }

    async init() {
        console.log('[LLMPresets] init() START');

        if (!this.rootEl) {
            console.error('[LLMPresets] presetsEl not found');
            return;
        }

        this._buildDOM();
        this._bindToolbarEvents();

        // Load list from backend
        await this._loadPresets();

        console.log('[LLMPresets] init() COMPLETE');
    }

    // ============================================
    // DOM
    // ============================================

    _buildDOM() {
        // Clear container
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        // Presets list
        const list = document.createElement('div');
        list.className = 'core-engine-lib-word-llm-presets-list';
        list.setAttribute('data-js', 'llm-presets-list');
        this.listEl = list;
        this.rootEl.appendChild(list);
    }

    _bindToolbarEvents() {
        // "+" button in presets toolbar
        const toolbar = this.editor.leftArea?.querySelector('[data-js="editor-presets-toolbar"]');
        if (!toolbar) return;

        toolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="preset-add"]');
            if (!btn) return;
            this._onCreate();
        });
    }

    _renderList() {
        if (!this.listEl) return;

        // Clear list
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

        // ===== Thumbnail =====
        const thumb = document.createElement('div');
        thumb.className = 'core-engine-lib-word-llm-presets-thumb';

        if (preset.thumbnail_path) {
            const img = document.createElement('img');
            img.src = `/media/${preset.thumbnail_path}`;
            img.alt = preset.name || '';
            img.loading = 'lazy';
            thumb.appendChild(img);
        } else {
            // Placeholder if no thumbnail
            thumb.textContent = '🖼️';
        }
        item.appendChild(thumb);

        // ===== Name =====
        const name = document.createElement('div');
        name.className = 'core-engine-lib-word-llm-presets-name';
        name.textContent = preset.name || 'Без названия';
        item.appendChild(name);

        // ===== Delete button (appears on hover) =====
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

        // ===== Click on item =====
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
                throw new Error(`Load error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                this.presets = result.data || [];
                console.log(`[LLMPresets] Loaded presets: ${this.presets.length}`);
            } else {
                console.warn('[LLMPresets] Response without success:', result);
                this.presets = [];
            }
        } catch (error) {
            console.error('[LLMPresets] List load error:', error);
            this.presets = [];
        }

        this._renderList();
    }

    async _createPreset(name, description = '', html = '', css = '') {
        const response = await fetch(this._apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ name, description, html, css }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Preset create error');
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
            throw new Error(errorData.detail || 'Preset delete error');
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
            throw new Error(errorData.detail || 'Preset update error');
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
            throw new Error(errorData.detail || 'Thumbnail upload error');
        }

        const result = await response.json();
        return result.data;
    }

    // ============================================
    // ACTIONS
    // ============================================

    async _onSelect(id) {
        console.log('[LLMPresets] _onSelect() id:', id);

        const preset = this.presets.find(p => p.id === id);
        if (!preset) {
            console.warn('[LLMPresets] Preset not found:', id);
            return;
        }

        this.currentId = id;

        // Highlight active
        this._renderList();

        // Apply preset to GrapesJS canvas
        if (this.editor.editor) {
            console.log('[LLMPresets] Applying preset to canvas:', id);
            this.editor.editor.setComponents(preset.html || '');
            if (preset.css) {
                this.editor.editor.setStyle(preset.css);
            }
        }
    }

    async _onCreate() {
        console.log('[LLMPresets] _onCreate()');

        // Simple prompt form (later replace with modal)
        const name = prompt('Название пресета:', 'Новый пресет');
        if (!name || !name.trim()) return;

        // Take current canvas HTML + CSS
        const html = this.editor.editor?.getHtml() || '';
        const css = this.editor.editor?.getCss() || '';

        try {
            const preset = await this._createPreset(name.trim(), '', html, css);

            // Add to local list
            this.presets.push(preset);
            this._renderList();

            console.log('[LLMPresets] Preset created:', preset.id);
        } catch (error) {
            console.error('[LLMPresets] Create error:', error);
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

            // Remove from local list
            this.presets = this.presets.filter(p => p.id !== id);

            if (this.currentId === id) {
                this.currentId = null;
            }

            this._renderList();

            console.log('[LLMPresets] Preset deleted:', id);
        } catch (error) {
            console.error('[LLMPresets] Delete error:', error);
            alert(`Ошибка: ${error.message}`);
        }
    }

    /**
     * Save current canvas HTML + CSS to the selected preset.
     * Called from toolbar (Save) or from chat.
     */
    async saveCurrentHtml() {
        if (!this.currentId) {
            console.log('[LLMPresets] No preset selected — skip saving');
            return;
        }

        const html = this.editor.editor?.getHtml() || '';
        const css = this.editor.editor?.getCss() || '';

        try {
            await this._updatePreset(this.currentId, { html, css });

            // Update locally
            const preset = this.presets.find(p => p.id === this.currentId);
            if (preset) {
                preset.html = html;
                preset.css = css;
            }

            console.log('[LLMPresets] HTML+CSS saved to preset:', this.currentId);
        } catch (error) {
            console.error('[LLMPresets] Save HTML+CSS error:', error);
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