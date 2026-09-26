// app/core/engine/lib/word/editor/grapes/scope.js

/**
 * Scope class handler for the iframe body.
 *
 * GrapesJS creates the iframe eagerly, but its <body> is filled
 * asynchronously. We subscribe to readiness events in index.js:
 *   canvas:frame:load:body — body ready (main)
 *   canvas:frame:load      — iframe loaded (fallback, body may be missing)
 *   load                   — editor fully ready (final fallback)
 *
 * On device change GrapesJS re-creates the iframe, so the same
 * handler runs again — no extra code needed.
 *
 * The scope class is a single wrapper for the whole page content:
 * every canvas CSS rule is scoped under it.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks.
 */

/**
 * Build a handler that adds the scope class to the iframe body.
 *
 * @param {string} scopeClass — class name to add (e.g. 'core-engine-lib-word-blocks')
 * @returns {Function} handler(instance) — safe to call repeatedly
 */
export function makeScopeClassHandler(scopeClass) {
    return function applyScopeClass(instance) {
        try {
            const doc = instance.Canvas?.getDocument?.();
            if (!doc || !doc.body) {
                // Body not ready yet — the next event will call us again.
                // Not an error, so no warning.
                return;
            }
            if (doc.body.classList.contains(scopeClass)) {
                return; // already applied — nothing to do
            }
            doc.body.classList.add(scopeClass);
            console.log('[GrapesLoader] scope class added to iframe body:', scopeClass);
        } catch (e) {
            console.warn('[GrapesLoader] failed to add scope class:', e);
        }
    };
}