// app/core/engine/lib/word/editor/toolbar.js

/**
 * ToolbarManager — editor top toolbar + hotkeys + device switcher.
 *
 * Renders the toolbar HTML and wires up:
 *   - click handlers for toolbar buttons;
 *   - global hotkeys (Ctrl+S, Ctrl+Z, Ctrl+Y, Escape);
 *   - device switching (desktop / tablet / mobile) with template toggle;
 *   - auto-save status indicator ("Сохранение…", "Сохранено", "Не сохранено").
 *
 * Two modes:
 *   - Full toolbar (GrapesJS instance exists) — save, undo, redo,
 *     device switcher, html, css, history, clear, cancel,
 *     plus the auto-save status indicator.
 *   - Preview mode (GrapesJS instance is null — template without
 *     [data-slot="content"]): only the "Close" button is rendered.
 *     No hotkeys are bound, no status indicator.
 *
 * Usage from Editor._init():
 *   this._toolbarMgr = new ToolbarManager(this);
 *   this._toolbarMgr.build();      // in both modes
 *
 * The manager needs from Editor:
 *   - toolbarEl        {HTMLElement}       — container to inject into
 *   - editor           {Object|null}       — GrapesJS instance (or null)
 *   - _templateMgr     {TemplateManager}   — for setVisible on device change
 *   - _handleSave()    {Function}
 *   - _handleCancel()  {Function}
 *   - _handleClear()   {Function}          — clear the whole page
 *   - _openHtmlModal() {Function}
 *   - _openCssModal()  {Function}
 *   - _openHistoryModal() {Function}
 *
 * Auto-save status:
 *   Listens to editor:autosave-pending / editor:autosaved /
 *   editor:autosave-failed events (dispatched by Editor._autoSave).
 *   The status element lives in the toolbar right side, before the
 *   "Cancel" button.
 *
 * Permissions:
 *   The toolbar itself does not enforce permissions — it renders
 *   whenever the editor is opened. Access control lives on the
 *   backend (word/*, editor/* routes require an authenticated user).
 */
export class ToolbarManager {
    /**
     * @param {Object} editor — parent Editor instance
     */
    constructor(editor) {
        this.editor = editor;

        // Global keydown handler reference (for detach on destroy)
        this._onKeyDown = null;

        // Auto-save status element
        this._statusEl = null;

        // Bound event handlers (for detach on destroy)
        this._onAutoSavePending = null;
        this._onAutoSaved = null;
        this._onAutoSaveFailed = null;

        // Status reset timer — clears "Сохранено" after a while.
        this._statusResetTimer = null;
    }

    // ============================================
    // BUILD
    // ============================================

    /**
     * Render the toolbar HTML and bind click + hotkeys.
     *
     * If the parent Editor has no GrapesJS instance (preview mode),
     * the toolbar shows only the "Close" button and does NOT bind
     * global hotkeys or the auto-save status.
     */
    build() {
        console.log('[ToolbarManager] build()');

        const { toolbarEl, editor: gjs } = this.editor;
        if (!toolbarEl) {
            console.warn('[ToolbarManager] toolbarEl not found — skipping');
            return;
        }

        const iconsBase = '/static/core/engine/lib/base/images';
        const hasEditor = !!gjs;

        if (!hasEditor) {
            console.log('[ToolbarManager] preview mode — rendering only "Close" button');
            toolbarEl.innerHTML = `
                <div class="core-engine-lib-word-editor-toolbar-spacer"></div>

                <button type="button" data-action="cancel" title="Закрыть" class="core-engine-lib-word-editor-btn">
                    <span class="core-engine-lib-word-editor-btn-icon">✕</span>
                </button>
            `;

            // Click handler (only "cancel" is available in this mode)
            toolbarEl.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                this.handleAction(btn.dataset.action);
            });

            return;
        }

        // ===== Full mode =====
        toolbarEl.innerHTML = `
            <button type="button" data-action="save" title="Сохранить (Ctrl+S)" class="core-engine-lib-word-editor-btn">
                <img class="core-engine-lib-word-editor-btn-icon"
                     src="${iconsBase}/save.svg"
                     alt="" aria-hidden="true">
            </button>
            <div class="core-engine-lib-word-editor-separator"></div>
            <button type="button" data-action="undo" title="Отменить (Ctrl+Z)" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">↶</span>
            </button>
            <button type="button" data-action="redo" title="Повторить (Ctrl+Y)" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">↷</span>
            </button>
            <div class="core-engine-lib-word-editor-separator"></div>
            <div class="core-engine-lib-word-editor-devices">
                <button type="button" data-action="desktop" title="Десктоп" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device active">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/desktop.svg"
                         alt="" aria-hidden="true">
                </button>
                <button type="button" data-action="tablet" title="Планшет" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/tablet.svg"
                         alt="" aria-hidden="true">
                </button>
                <button type="button" data-action="mobile" title="Мобильный" class="core-engine-lib-word-editor-btn core-engine-lib-word-editor-btn-device">
                    <img class="core-engine-lib-word-editor-btn-icon"
                         src="${iconsBase}/mobile.svg"
                         alt="" aria-hidden="true">
                </button>
            </div>
            <div class="core-engine-lib-word-editor-separator"></div>
            <button type="button" data-action="html" title="Просмотр/редактирование HTML + CSS" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">&lt;&gt;</span>
            </button>
            <button type="button" data-action="css" title="Кастомный CSS элемента" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">{ }</span>
            </button>
            <button type="button" data-action="history" title="История изменений" class="core-engine-lib-word-editor-btn">
                <img class="core-engine-lib-word-editor-btn-icon"
                     src="${iconsBase}/history.svg"
                     alt="" aria-hidden="true">
            </button>
            <button type="button" data-action="clear" title="Очистить страницу" class="core-engine-lib-word-editor-btn">
                <img class="core-engine-lib-word-editor-btn-icon"
                     src="${iconsBase}/reset.svg"
                     alt="" aria-hidden="true">
            </button>

            <div class="core-engine-lib-word-editor-toolbar-spacer"></div>

            <span class="core-engine-lib-word-editor-autosave-status"
                  data-js="autosave-status"
                  aria-live="polite"></span>

            <button type="button" data-action="cancel" title="Выход без сохранения" class="core-engine-lib-word-editor-btn">
                <span class="core-engine-lib-word-editor-btn-icon">✕</span>
            </button>
        `;

        // Cache status element
        this._statusEl = toolbarEl.querySelector('[data-js="autosave-status"]');

        // Click handlers on toolbar buttons
        toolbarEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            this.handleAction(btn.dataset.action);
        });

        // Global hotkeys — only in full mode
        this._onKeyDown = (e) => this._handleKeyDown(e);
        document.addEventListener('keydown', this._onKeyDown);

        // Auto-save status events
        this._bindAutoSaveStatus();
    }

    // ============================================
    // AUTO-SAVE STATUS
    // ============================================

    /**
     * Subscribe to editor:autosave-* events and update the status text.
     */
    _bindAutoSaveStatus() {
        this._onAutoSavePending = () => this._setStatus('pending', 'Сохранение…');
        this._onAutoSaved = () => this._setStatus('saved', 'Сохранено');
        this._onAutoSaveFailed = () => this._setStatus('failed', 'Не сохранено');

        document.addEventListener('editor:autosave-pending', this._onAutoSavePending);
        document.addEventListener('editor:autosaved', this._onAutoSaved);
        document.addEventListener('editor:autosave-failed', this._onAutoSaveFailed);

        // Cancel any previous reset timer
        if (this._statusResetTimer) {
            clearTimeout(this._statusResetTimer);
            this._statusResetTimer = null;
        }

        // Initial state — empty (nothing saved yet).
        if (this._statusEl) {
            this._statusEl.textContent = '';
            this._statusEl.className = 'core-engine-lib-word-editor-autosave-status';
        }
    }

    /**
     * Set the status text and style.
     *
     * @param {string} kind — 'pending' | 'saved' | 'failed'
     * @param {string} text — display text
     */
    _setStatus(kind, text) {
        if (!this._statusEl) return;

        this._statusEl.textContent = text || '';
        this._statusEl.className =
            `core-engine-lib-word-editor-autosave-status core-engine-lib-word-editor-autosave-status-${kind}`;

        // Auto-clear "Сохранено" after a few seconds.
        if (this._statusResetTimer) {
            clearTimeout(this._statusResetTimer);
            this._statusResetTimer = null;
        }

        if (kind === 'saved') {
            this._statusResetTimer = setTimeout(() => {
                if (this._statusEl) {
                    this._statusEl.textContent = '';
                    this._statusEl.className =
                        'core-engine-lib-word-editor-autosave-status';
                }
                this._statusResetTimer = null;
            }, 3000);
        }
    }

    // ============================================
    // ACTIONS
    // ============================================

    /**
     * Dispatch a toolbar action.
     *
     * @param {string} action — value of the button's data-action attribute
     */
    handleAction(action) {
        const ed = this.editor;

        switch (action) {
            case 'save':
                ed._handleSave();
                break;
            case 'undo':
                ed.editor?.UndoManager?.undo();
                break;
            case 'redo':
                ed.editor?.UndoManager?.redo();
                break;
            case 'desktop':
            case 'tablet':
            case 'mobile':
                this.setDevice(action);
                break;
            case 'html':
                ed._openHtmlModal();
                break;
            case 'css':
                ed._openCssModal();
                break;
            case 'history':
                ed._openHistoryModal();
                break;
            case 'clear':
                this._handleClear();
                break;
            case 'cancel':
                ed._handleCancel();
                break;
        }
    }

    /**
     * Ask for confirmation and clear the whole page.
     *
     * Flow:
     *   1. Show BaseModalConfirm (fallback — native confirm()).
     *   2. On OK — call Editor._handleClear(), which clears
     *      DomComponents / Css and deselects.
     *
     * UndoManager is NOT cleared on purpose: Ctrl+Z must be able
     * to bring the page back if the user clicked "Очистить" by mistake.
     */
    async _handleClear() {
        const ed = this.editor;

        const ok = await this._confirmClear();
        if (!ok) return;

        if (typeof ed._handleClear === 'function') {
            ed._handleClear();
        } else {
            // Fallback: do it here if Editor has no _handleClear().
            try {
                ed.editor?.DomComponents?.clear();
                ed.editor?.Css?.clear();
                ed.editor?.select?.(null);
            } catch (e) {
                console.warn('[ToolbarManager] clear failed:', e);
            }
        }
    }

    /**
     * Show a confirm dialog using BaseModalConfirm.
     * Falls back to native confirm() if the modal is unavailable.
     *
     * @returns {Promise<boolean>}
     */
    async _confirmClear() {
        const version = window.coreEngine?.static_version || Date.now();

        try {
            const { createModal } = await import(
                `/static/core/engine/lib/base/modal/index.js?v=${version}`
            );
            const modal = await createModal('confirm');
            if (!modal) {
                return confirm('Очистить страницу? Все элементы будут удалены.');
            }

            return new Promise((resolve) => {
                modal.open(
                    'Очистить страницу? Все элементы будут удалены.',
                    'Очистка',
                    'Очистить',
                    'Отмена'
                );
                modal.setOnOk(() => { modal.destroy(); resolve(true); });
                modal.setOnCancel(() => { modal.destroy(); resolve(false); });
            });
        } catch (e) {
            console.warn('[ToolbarManager] BaseModalConfirm unavailable:', e);
            return confirm('Очистить страницу? Все элементы будут удалены.');
        }
    }

    /**
     * Switch the device mode.
     *
     * desktop:
     *   - GrapesJS device = desktop (full width)
     *   - template visible, slot inside template
     *
     * tablet / mobile:
     *   - GrapesJS device = tablet / mobile (narrow width)
     *   - template hidden, slot moved into canvas
     *   This lets the user see how the slot content fits narrow viewports,
     *   without the surrounding template layout interfering.
     */
    setDevice(device) {
        const ed = this.editor;

        ed.editor?.setDevice(device);

        // Show template only on desktop (delegated to TemplateManager)
        ed._templateMgr?.setVisible(device === 'desktop');

        // Toggle 'active' class on device buttons
        ed.toolbarEl
            ?.querySelectorAll('.core-engine-lib-word-editor-btn-device')
            .forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.action === device);
            });
    }

    // ============================================
    // HOTKEYS
    // ============================================

    /**
     * Global keydown handler.
     *
     *   Ctrl/Cmd + S    → save
     *   Escape          → cancel (close without saving)
     *   Ctrl/Cmd + Z    → undo
     *   Ctrl/Cmd + Y    → redo
     *   Ctrl/Cmd + Shift + Z → redo (alternative)
     *
     * Only bound when GrapesJS is active (full toolbar mode).
     */
    _handleKeyDown(e) {
        const ed = this.editor;
        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && e.key === 's') {
            e.preventDefault();
            ed._handleSave();
        } else if (e.key === 'Escape') {
            ed._handleCancel();
        } else if (ctrl && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            ed.editor?.UndoManager?.undo();
        } else if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
            e.preventDefault();
            ed.editor?.UndoManager?.redo();
        }
    }

    // ============================================
    // DESTROY
    // ============================================

    /**
     * Detach global keydown handler and auto-save status listeners.
     * Called from Editor.destroy().
     */
    destroy() {
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }

        if (this._onAutoSavePending) {
            document.removeEventListener('editor:autosave-pending', this._onAutoSavePending);
            this._onAutoSavePending = null;
        }
        if (this._onAutoSaved) {
            document.removeEventListener('editor:autosaved', this._onAutoSaved);
            this._onAutoSaved = null;
        }
        if (this._onAutoSaveFailed) {
            document.removeEventListener('editor:autosave-failed', this._onAutoSaveFailed);
            this._onAutoSaveFailed = null;
        }

        if (this._statusResetTimer) {
            clearTimeout(this._statusResetTimer);
            this._statusResetTimer = null;
        }

        this._statusEl = null;
    }
}