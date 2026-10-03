// app/core/engine/lib/base/logo.js

/**
 * Header logo.
 *
 * Renders an <a> that points at the root of the module the header
 * belongs to: /core/engine/<module>/.
 *
 * The module name is NOT hardcoded and NOT parsed from the URL.
 * It comes from the page JSON (see base.js → new Header({ module })
 * → header.js → new Logo(text, module)) and is passed into the
 * constructor. This keeps the logo correct on every deployment,
 * including custom-domain and subdomain ones where "/" would
 * otherwise trigger the owner's home-page redirect.
 *
 * Fallback: if `module` is missing or empty, "admin" is used, so
 * the logo never becomes a dead link.
 *
 * The href is computed in render() (not stored as a field), so a
 * single Logo instance stays correct if `module` is updated later
 * via setModule().
 *
 * Props:
 *   - text   {string} — label, default "⚡ Ассистент"
 *   - module {string} — module name from JSON, e.g. "admin"
 */
export class Logo {
    constructor(text, module) {
        this.text = text || '⚡ Ассистент';
        this.module = (module || '').trim() || 'admin';
    }

    /**
     * Allow the caller to update the module after construction.
     * Useful if the header is reused across client-side navigation.
     */
    setModule(module) {
        this.module = (module || '').trim() || 'admin';
    }

    render() {
        const href = `/core/engine/${this.module}/`;
        return `<a class="core-engine-lib-base-logo" href="${href}">${this.text}</a>`;
    }
}