// neurocad/core/engine/lib/word/editor/autosave.js

/**
 * Autosave — interval-based, dirty-flag driven auto-save for Editor.
 *
 * Every AUTO_SAVE_INTERVAL_MS (30 s) the timer wakes up and checks
 * the dirty flag. The flag is set by GrapesJS `update` events and
 * cleared after a successful save. Nothing is saved if there were
 * no changes since the last save — an idle editor produces zero
 * traffic.
 *
 * Auto-save does NOT touch UndoManager — Undo/Redo stays usable for
 * the whole lifetime of the editor, even after an auto-save. Manual
 * save (toolbar / Ctrl+S) persists and closes the editor via onSave.
 *
 * Auto-save persists via onAutoSave (editor stays open). If
 * onAutoSave is not provided, falls back to onSave.
 *
 * If the session expires during auto-save, fetchJson emits
 * auth:unauthorized and the editor is torn down by Base.
 *
 * Owner: this module owns four pieces of state that used to live on
 * Editor:
 *   - AUTO_SAVE_INTERVAL_MS (interval length)
 *   - _dirty (something changed since the last save)
 *   - _inFlight (an auto-save request is currently running)
 *   - _failed (last auto-save failed; retry on the next tick)
 *
 * Editor still owns the user-facing side:
 *   - confirmClose() — called from Word on external close
 *   - _handleSave()  — manual save on Ctrl+S / toolbar
 *   - _handleCancel()— toolbar ✕ / Escape
 * All of those call into this module through the public API below.
 *
 * Public API:
 *   bind()                   — subscribe to `update`, start the timer
 *   stop()                   — stop the timer (called from destroy)
 *   hasChanges()             — true if there are unsaved changes
 *   saveForExternalClose()   — persist without closing (external close)
 *   markClean()              — clear the dirty flag (manual save)
 *   setDirty(value)          — set the dirty flag explicitly
 *   isEnabled()              — whether auto-save is on
 *
 * Loaded dynamically with the usual `?v=` cache-buster — see
 * editor.js → _init(). No static imports anywhere.
 */

export class Autosave {
    /**
     * @param {Object} editor — parent Editor instance
     */
    constructor(editor) {
        this.editor = editor;

        // Configuration — read by the parent at construct time, so
        // changing them on the Editor instance before _init() still
        // takes effect.
        this.enabled = editor.AUTO_SAVE_ENABLED !== false;
        this.intervalMs = editor.AUTO_SAVE_INTERVAL_MS || 30_000;

        // Timer handle.
        this._timer = null;

        // UI state.
        this._dirty = false;
        this._inFlight = false;
        this._failed = false;
    }

    // ============================================
    // PUBLIC
    // ============================================

    /**
     * Whether auto-save is enabled (AUTO_SAVE_ENABLED flag).
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Subscribe to GrapesJS `update` and start the auto-save timer.
     *
     * `update` fires on any user-driven change (component add/remove,
     * style, text). It also fires for internal things (selection,
     * panel tabs, layout) — but those don't matter: we only set a
     * flag, the actual save runs on the timer.
     *
     * Safe to call once, from Editor._init().
     */
    bind() {
        const gjs = this.editor?.editor;
        if (!gjs) return;

        if (!this.enabled) {
            console.log('[Autosave] disabled (AUTO_SAVE_ENABLED=false)');
            return;
        }

        // Any user-driven change sets the dirty flag. We do NOT save
        // here — just mark that there's something to save next tick.
        gjs.on('update', () => {
            this._dirty = true;
        });

        this._start();

        console.log(`[Autosave] enabled (interval ${this.intervalMs}ms)`);
    }

    /**
     * Stop the auto-save timer.
     *
     * Called from Editor.destroy() and from Editor._handleSave()
     * before the editor closes.
     */
    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * True if there are user-driven changes since the last save.
     *
     * Prefer UndoManager.hasUndo() when available — it reflects real
     * history, while `_dirty` is just "something happened since the
     * last save". Either one is enough to trigger the save-on-close
     * dialog.
     */
    hasChanges() {
        const um = this.editor?.editor?.UndoManager;
        if (!um || typeof um.hasUndo !== 'function') {
            return this._dirty;
        }
        return um.hasUndo() || this._dirty;
    }

    /**
     * Clear the dirty flag.
     *
     * Called by Editor._handleSave() after a successful manual save.
     */
    markClean() {
        this._dirty = false;
    }

    /**
     * Set the dirty flag explicitly.
     *
     * Kept for symmetry / future use — Editor currently only reads
     * and clears the flag, never sets it directly.
     */
    setDirty(value) {
        this._dirty = !!value;
    }

    /**
     * Persist the current editor state WITHOUT closing.
     *
     * Used by Editor.confirmClose() when the user picks "Сохранить"
     * on an external close (Base navigates away). The editor will be
     * torn down by Base right after — we just need the data on the
     * server.
     *
     * Uses onAutoSave if set, otherwise onSave. Always resolves — a
     * failure is logged, but navigation still proceeds (Base cannot
     * wait forever).
     */
    async saveForExternalClose() {
        const ed = this.editor;
        if (!ed || !ed.editor) return;

        const saveFn = ed.onAutoSave || ed.onSave;
        if (!saveFn) return;

        // Flush any pending auto-save state.
        this.stop();

        const data = {
            html: ed.editor.getHtml(),
            css: ed.editor.getCss(),
            project: ed.editor.getProjectData(),
        };

        try {
            await saveFn(data);
            this._dirty = false;
            this._failed = false;
            console.log('[Autosave] saved (before external close)');
        } catch (e) {
            console.error('[Autosave] save before external close failed:', e);
            // Do not throw — Base still needs to tear down.
        }
    }

    // ============================================
    // INTERNAL — TIMER
    // ============================================

    /**
     * Start (or restart) the auto-save interval.
     */
    _start() {
        this.stop();
        this._timer = setInterval(() => {
            if (!this._dirty) return;         // nothing changed — skip
            if (this._inFlight) return;
            this._run();
        }, this.intervalMs);
    }

    /**
     * Perform one auto-save pass.
     *
     * Uses onAutoSave if provided; otherwise falls back to onSave.
     * The editor stays open either way (onAutoSave must not close it).
     *
     * Does NOT clear UndoManager — Undo/Redo must stay usable while
     * the editor is open, even after an auto-save.
     */
    async _run() {
        const ed = this.editor;
        if (!ed || !ed.editor) return;

        const saveFn = ed.onAutoSave || ed.onSave;
        if (!saveFn) return;
        if (this._inFlight) return;
        if (!this._dirty) return;

        this._inFlight = true;

        // Notify UI — "Сохранение…"
        document.dispatchEvent(new CustomEvent('editor:autosave-pending'));

        try {
            const data = {
                html: ed.editor.getHtml(),
                css: ed.editor.getCss(),
                project: ed.editor.getProjectData(),
            };

            await saveFn(data);
            console.log('[Autosave] saved');

            // Clear dirty flag only after a successful save.
            this._dirty = false;

            // Reset failure flag on success.
            this._failed = false;

            // Notify UI — "Сохранено".
            document.dispatchEvent(new CustomEvent('editor:autosaved', {
                detail: { at: Date.now() }
            }));
        } catch (error) {
            console.error('[Autosave] error:', error);

            // On 401 — fetchJson already emitted auth:unauthorized.
            // Do not retry; the editor will be replaced by login form.
            if (error?.status === 401) {
                console.warn('[Autosave] stopped (session expired)');
                return;
            }

            // On other errors — keep the dirty flag, mark as failed.
            // Next interval tick will retry.
            this._failed = true;
            document.dispatchEvent(new CustomEvent('editor:autosave-failed', {
                detail: { error }
            }));
        } finally {
            this._inFlight = false;
        }
    }
}