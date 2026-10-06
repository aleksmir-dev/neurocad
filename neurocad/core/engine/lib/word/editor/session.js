// neurocad/core/engine/lib/word/editor/session.js

/**
 * Session — save / cancel / close flow for Editor.
 *
 * Owns everything that happens when the user (or the platform)
 * tries to leave the editor:
 *
 *   - manual save (toolbar / Ctrl+S)          → save()
 *   - cancel / close (toolbar ✕ / Escape)     → cancel()
 *   - external close (Base navigates away)    → confirmClose()
 *   - "clear the whole page"                  → clear()
 *   - redirect to login on 401                → _redirectToLogin()
 *
 * The three-way dialog ("Сохранить / Не сохранять / Отмена") is
 * shown whenever there are unsaved changes — see _askSaveOnClose().
 * If there is nothing to lose, no dialog is shown.
 *
 * What lives here:
 *   - save()            — manual save, persists and lets the caller
 *                         close the editor (onSave callback).
 *   - cancel()          — toolbar ✕ / Escape. If there are unsaved
 *                         changes, asks; otherwise closes via onCancel.
 *   - confirmClose()    — public entry point for external closes.
 *                         Returns 'save' | 'discard' | 'cancel'.
 *   - clear()           — wipe the whole page (DomComponents + Css).
 *   - _askSaveOnClose() — the three-way dialog itself.
 *   - _showSaveError()  — small message modal for a failed save.
 *   - _redirectToLogin()— 401 handler: redirect with ?next=.
 *
 * What stays on Editor:
 *   - confirmClose() — kept on Editor as a thin wrapper that
 *                      delegates to this module, because Word calls
 *                      it directly during external close.
 *
 * Auto-save state (dirty flag, hasChanges) lives in autosave.js.
 * This module reads it through editor._autosave.
 *
 * Loaded dynamically with the usual `?v=` cache-buster — see
 * editor.js → _init(). No static imports anywhere.
 */

export class Session {
    /**
     * @param {Object} editor — parent Editor instance
     */
    constructor(editor) {
        this.editor = editor;
    }

    // ============================================
    // SAVE
    // ============================================

    /**
     * Manual save — triggered by the toolbar / Ctrl+S.
     *
     * Stops the auto-save timer, collects the current editor state,
     * and persists via onSave. onSave is expected to close the
     * editor — the toolbar ✕ is "save and close".
     *
     * On 401 — session expired — redirects to login, preserving the
     * current URL as ?next=.
     *
     * On other errors — shows a small message modal (best-effort).
     */
    async save() {
        const ed = this.editor;

        if (!ed.editor) {
            console.warn('[Session] save: GrapesJS not initialized');
            return;
        }

        if (!ed.onSave) {
            console.warn('[Session] save: onSave not bound');
            return;
        }

        // Stop auto-save — the editor is about to close.
        ed._autosave?.stop();
        ed._autosave?.markClean();

        console.log('[Session] Saving...');

        const data = {
            html: ed.editor.getHtml(),
            css: ed.editor.getCss(),
            project: ed.editor.getProjectData(),
        };

        try {
            await ed.onSave(data);
            console.log('[Session] Saved');
        } catch (error) {
            console.error('[Session] Save error:', error);

            // 401 — session expired. Redirect to login, preserving return URL.
            if (error?.status === 401) {
                this._redirectToLogin();
                return;
            }

            // Other errors — show a message modal (best-effort).
            this._showSaveError(error);
        }
    }

    // ============================================
    // CANCEL / CLOSE
    // ============================================

    /**
     * Cancel — triggered by the toolbar "✕" / Escape.
     *
     * If there are unsaved changes, ask the user:
     *   - "Сохранить"      → run the manual save flow (persists + closes).
     *   - "Не сохранять"   → close via onCancel (dropping changes).
     *   - "Отмена"         → keep the editor open.
     *
     * If there are no unsaved changes — just close.
     */
    async cancel() {
        const ed = this.editor;

        console.log('[Session] Cancel');

        // No unsaved changes — close straight away.
        if (!ed._autosave?.hasChanges()) {
            ed._autosave?.stop();
            if (ed.onCancel) ed.onCancel();
            return;
        }

        // Ask the user what to do.
        const choice = await this._askSaveOnClose();

        if (choice === 'save') {
            // Save, then close (the toolbar ✕ is "save and close").
            await this.save();
            return;
        }

        if (choice === 'cancel') {
            // User cancelled — keep the editor open.
            return;
        }

        // choice === 'discard' — close without saving.
        ed._autosave?.stop();
        if (ed.onCancel) ed.onCancel();
    }

    /**
     * Public entry point for external closes.
     *
     * Called by Editor.confirmClose() when Base navigates away
     * (to setup / profile / etc). Returns:
     *
     *   'save'    — user chose to save. Changes already persisted.
     *   'discard' — user chose to close without saving.
     *   'cancel'  — user cancelled — keep the editor open.
     *
     * If there are no unsaved changes — returns 'discard' immediately
     * (nothing to lose, no dialog).
     */
    async confirmClose() {
        const ed = this.editor;

        if (!ed._autosave?.hasChanges()) {
            return 'discard';
        }

        const choice = await this._askSaveOnClose();

        if (choice === 'save') {
            await ed._autosave.saveForExternalClose();
        }

        return choice;
    }

    // ============================================
    // CLEAR
    // ============================================

    /**
     * Clear the whole edited page — wipe components and CSS.
     *
     * Not undoable through UndoManager; the caller is expected to
     * have asked the user for confirmation first (or the user
     * clicked the toolbar "Clear" button, which does).
     */
    clear() {
        const ed = this.editor;

        console.log('[Session] Clear page');

        if (!ed.editor) return;

        try {
            ed.editor.DomComponents.clear();
            ed.editor.Css.clear();
            ed.editor.select(null);

            console.log('[Session] Page cleared');
        } catch (e) {
            console.warn('[Session] clear failed:', e);
        }
    }

    // ============================================
    // INTERNAL — THREE-WAY DIALOG
    // ============================================

    /**
     * Show a three-way dialog on close with unsaved changes.
     *
     * Returns: 'save' | 'discard' | 'cancel'.
     *
     *   Сохранить      → 'save'    (persists, editor stays open)
     *   Не сохранять   → 'discard' (close, drop changes)
     *   Отмена         → 'cancel'  (do nothing, keep editor open)
     *
     * Uses the shared createModal('confirm') with three buttons.
     * Falls back to window.confirm() — 2-way (save / discard) — if
     * createModal is unavailable.
     */
    async _askSaveOnClose() {
        const ed = this.editor;

        if (!ed._createModal) {
            const ok = window.confirm(
                'Есть несохранённые изменения. Сохранить перед закрытием?'
            );
            return ok ? 'save' : 'discard';
        }

        try {
            const modal = await ed._createModal('confirm');

            return await new Promise((resolve) => {
                let settled = false;
                const settle = (v) => {
                    if (settled) return;
                    settled = true;
                    resolve(v);
                };

                modal.open(
                    'Есть несохранённые изменения. Сохранить перед закрытием?',
                    'Закрытие редактора',
                    'Сохранить',      // ok-btn
                    'Отмена',         // cancel-btn
                    'Не сохранять'    // no-btn (enables 3-button mode)
                );

                modal.setOnOk(() => { modal.destroy(); settle('save'); });
                modal.setOnCancel(() => { modal.destroy(); settle('cancel'); });
                modal.setOnNo(() => { modal.destroy(); settle('discard'); });
            });
        } catch (e) {
            console.warn('[Session] _askSaveOnClose modal failed:', e);
            const ok = window.confirm(
                'Есть несохранённые изменения. Сохранить перед закрытием?'
            );
            return ok ? 'save' : 'discard';
        }
    }

    // ============================================
    // INTERNAL — ERROR / REDIRECT
    // ============================================

    /**
     * Show a small message modal with the save error text.
     *
     * Best-effort — if createModal is not available, only logs.
     */
    async _showSaveError(error) {
        const ed = this.editor;
        const message = error?.message || 'Не удалось сохранить';

        if (!ed._createModal) {
            console.warn('[Session] createModal not available — error not shown:', message);
            return;
        }

        try {
            const modal = await ed._createModal('message');
            modal.open(message, 'Ошибка сохранения', 'Понятно');
            modal.setOnOk(() => modal.destroy());
        } catch (e) {
            console.warn('[Session] failed to show save error modal:', e);
        }
    }

    /**
     * Redirect to login page with ?next=<current URL>.
     *
     * Called when a request returns 401 — the session expired while
     * the user was editing. After login, Base will return the user
     * to the same page.
     */
    _redirectToLogin() {
        console.log('[Session] Session expired — redirecting to login');

        const authRedirect = window.coreEngine?.authRedirect || '/login';
        const returnUrl = encodeURIComponent(window.location.href);
        const sep = authRedirect.includes('?') ? '&' : '?';

        window.location.href = `${authRedirect}${sep}next=${returnUrl}`;
    }
}