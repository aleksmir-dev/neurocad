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

                // Detailed log for debugging CSS/html presence
                this.presets.forEach(p => {
                    const htmlLen = (p.html || '').length;
                    const cssLen = (p.css || '').length;
                    console.log(`[LLMPresets]   [${p.id}] "${p.name}" — html:${htmlLen} css:${cssLen}`);
                });
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
        console.log('[LLMPresets] _createPreset()', {
            name,
            description,
            htmlLen: (html || '').length,
            cssLen: (css || '').length,
        });

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
        console.log('[LLMPresets] _createPreset() result:', {
            id: result.data?.id,
            htmlLen: (result.data?.html || '').length,
            cssLen: (result.data?.css || '').length,
        });

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
        console.log('[LLMPresets] _updatePreset()', {
            id,
            htmlLen: (data.html || '').length,
            cssLen: (data.css || '').length,
        });

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
    // HELPERS — extract CSS from HTML
    // ============================================

    /**
     * Extract CSS from <style>...</style> blocks inside HTML.
     * Returns { html: string, css: string }.
     *
     * Used as a fallback when GrapesJS CssComposer is empty
     * (e.g. when the page was loaded via setComponents(html) and
     * the <style> block was never pushed to the CssComposer).
     */
    _extractCssFromHtml(html) {
        if (!html) return { html: '', css: '' };

        const matches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
        const css = matches.map(m => m[1]).join('\n').trim();
        const htmlClean = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

        return { html: htmlClean, css };
    }

    /**
     * Get current canvas HTML + CSS.
     *
     * Priority:
     *   1. CssComposer (editor.getCss()) — if it has rules.
     *   2. <style> inside HTML — fallback.
     *
     * Returns { html, css }.
     */
    _getCurrentHtmlCss() {
        const ed = this.editor.editor;
        if (!ed) return { html: '', css: '' };

        const rawHtml = ed.getHtml() || '';
        const rawCss = ed.getCss() || '';
        const cssRulesCount = ed.Css?.getAll?.()?.length || 0;

        console.log('[LLMPresets] _getCurrentHtmlCss()', {
            htmlLen: rawHtml.length,
            cssLen: rawCss.length,
            cssRulesCount,
        });

        // If CssComposer has rules — use it as primary source
        if (rawCss.trim() && cssRulesCount > 0) {
            return { html: rawHtml, css: rawCss };
        }

        // Fallback: extract <style> from HTML
        const extracted = this._extractCssFromHtml(rawHtml);
        console.log('[LLMPresets] fallback: extracted from HTML', {
            htmlLen: extracted.html.length,
            cssLen: extracted.css.length,
        });
        return extracted;
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

        console.log('[LLMPresets] preset data:', {
            name: preset.name,
            htmlLen: (preset.html || '').length,
            cssLen: (preset.css || '').length,
        });

        this.currentId = id;

        // Highlight active
        this._renderList();

        const ed = this.editor.editor;
        if (!ed) {
            console.warn('[LLMPresets] editor not available');
            return;
        }

        // Prepare html + css (with fallback)
        let html = preset.html || '';
        let css = preset.css || '';

        // If CSS empty but HTML has <style> — extract
        if (!css.trim() && html.includes('<style')) {
            const extracted = this._extractCssFromHtml(html);
            html = extracted.html;
            css = extracted.css;
            console.log('[LLMPresets] CSS extracted from HTML (preset has no separate css)');
        }

        console.log('[LLMPresets] applying:', {
            htmlLen: html.length,
            cssLen: css.length,
        });

        try {
            // 1. Clear ALL existing CSS rules (otherwise they accumulate on switch)
            if (ed.Css?.clear) {
                ed.Css.clear();
                console.log('[LLMPresets] CssComposer cleared');
            }

            // 2. Set HTML components
            ed.setComponents(html || '');
            console.log('[LLMPresets] components set');

            // 3. Apply CSS via CssComposer
            if (css && css.trim()) {
                if (ed.Css?.addRules) {
                    ed.Css.addRules(css);
                    console.log('[LLMPresets] CSS rules added via Css.addRules');
                } else {
                    // Legacy fallback
                    ed.setStyle(css);
                    console.log('[LLMPresets] CSS applied via setStyle (legacy)');
                }
            }

            // 4. Verify
            const verifyCss = ed.getCss();
            console.log('[LLMPresets] verify — new getCss():', verifyCss.slice(0, 300));
        } catch (e) {
            console.error('[LLMPresets] apply preset error:', e);
        }
    }

    async _onCreate() {
        console.log('[LLMPresets] _onCreate()');

        const name = prompt('Название пресета:', 'Новый пресет');
        if (!name || !name.trim()) return;

        // Get current canvas HTML + CSS (with fallback)
        const { html, css } = this._getCurrentHtmlCss();

        console.log('[LLMPresets] _onCreate() — will save:', {
            name: name.trim(),
            htmlLen: html.length,
            cssLen: css.length,
            cssPreview: css.slice(0, 200),
        });

        try {
            const preset = await this._createPreset(name.trim(), '', html, css);

            console.log('[LLMPresets] _onCreate() — response:', {
                id: preset.id,
                htmlLen: (preset.html || '').length,
                cssLen: (preset.css || '').length,
            });

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

        const { html, css } = this._getCurrentHtmlCss();

        console.log('[LLMPresets] saveCurrentHtml() — will save:', {
            currentId: this.currentId,
            htmlLen: html.length,
            cssLen: css.length,
        });

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