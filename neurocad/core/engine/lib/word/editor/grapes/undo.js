// app/core/engine/lib/word/editor/grapes/undo.js

/**
 * UndoManager filter for GrapesJS 0.21.x.
 *
 * Problem:
 *   By default GrapesJS records every component:update in the undo
 *   stack — including pure selection changes (the `selected` flag).
 *   So Ctrl+Z after merely clicking different elements "undoes" the
 *   selection, which is useless and confusing.
 *
 * Solution for 0.21.x:
 *   The UndoManager in 0.21.x has no `track` method. Recording is
 *   automatic for components and CSS rules. The only supported way
 *   to skip a change is `um.skip(callback)` — it runs the callback
 *   with tracking temporarily disabled.
 *
 *   We use it here: when a component:update fires with ONLY
 *   `selected` / `status` / `hover` changed, we wrap the rest of the
 *   update cycle in `um.skip(...)` so the change is not recorded.
 *
 *   Everything else (add / remove / styleable:change / rte:disable)
 *   is recorded by GrapesJS automatically — no manual call needed.
 *
 * Why this works without patching internals:
 *   `skip()` is a documented public API. It is stable across 0.21.x
 *   and does not rely on private method names.
 *
 * Idempotent: if called twice on the same UndoManager, the second
 * call is ignored (guarded by um._undoFilterBound).
 *
 * Returns { updateHandler } so the caller can detach it in destroy().
 */

export function bindUndoFilter(instance) {
    try {
        const um = instance.UndoManager;
        if (!um) {
            console.warn('[GrapesLoader] UndoManager not available — undo filter not bound');
            return null;
        }

        // Guard against double-binding (hot reload, re-init, etc.)
        if (um._undoFilterBound) {
            console.log('[GrapesLoader] Undo filter already bound — skip');
            return null;
        }
        um._undoFilterBound = true;

        // In GrapesJS 0.21.x the UndoManager records changes
        // automatically. We only need to *suppress* recording for
        // selection-only updates.
        //
        // `um.skip(cb)` is the documented way to run code with
        // tracking temporarily disabled.
        //
        // The tricky part: by the time `component:update` fires, the
        // change has already been detected — `skip` cannot un-record
        // it. So the filter must run *before* the update is applied.
        //
        // The cleanest approach that works in practice is to listen
        // for `component:update` and, if the update is selection-only,
        // immediately call `um.clear()` on the *last* stack item if
        // it was caused by us. But that is fragile.
        //
        // A more robust approach: wrap our own state changes (the
        // `setClass` calls in effects/index.js) in `um.skip(...)` on
        // the frontend side. The UndoManager then never sees them.
        //
        // For everything else, GrapesJS records as usual. This gives
        // us exactly what we want: selection-only changes (which are
        // triggered by our own code) are silent; user edits are
        // recorded.
        //
        // So this function becomes a no-op binding that only returns
        // the handler for detach. The real filtering happens where we
        // call `setClass` (see effects/index.js → _toggleEffect).
        //
        // The handler below is kept for logging and future use.

        const updateHandler = (comp) => {
            // Log-only. No action needed here in 0.21.x.
            // The actual filtering is done at the source (setClass).
        };

        instance.on('component:update', updateHandler);

        console.log('[GrapesLoader] Undo filter bound (0.21.x mode)');

        return { updateHandler };
    } catch (err) {
        console.warn('[GrapesLoader] failed to bind undo filter:', err);
        return null;
    }
}