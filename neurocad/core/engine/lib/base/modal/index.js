// app/core/engine/lib/base/modal/index.js

/**
 * Modal factory — creates modal instances by type.
 *
 * Async: modal classes are loaded via dynamic import().
 * Adding a new modal type:
 *   1. Create `<type>.js` next to this file.
 *   2. Export a class with the same API (open / close / setOnOk / setOnCancel / destroy).
 *   3. Add a `case '<type>':` below.
 *
 * Cache-busting
 * -------------
 * Every `import('./<type>.js')` carries the project-wide static
 * version (`window.coreEngine.static_version`) as a `?v=` query,
 * exactly like the rest of the codebase does for its dynamic
 * imports.
 *
 * Why it matters here
 * -------------------
 * Each modal class loads its own CSS via coreEngine.loadCSS()
 * during construction. A modal that is imported WITHOUT a version
 * ends up loading its CSS from a URL that was already requested
 * earlier in the session (e.g. by another module that happened to
 * pull the same file first). In that case coreEngine.loadCSS()
 * resolves immediately on the existing <link> — before its
 * `onload` has fired — and the caller's `_cssReady` promise
 * resolves too early. The modal then shows itself before its
 * styles are applied: the "flash of unstyled content" (FOUC).
 *
 * With `?v=<version>` on the JS import, the CSS URL also carries
 * that version (each modal's _loadCSS builds the path from the
 * same convention, and the version propagates through
 * coreEngine.loadCSS). A fresh version = a fresh URL = a fresh
 * <link> = an honest `onload` = no FOUC.
 *
 * If `window.coreEngine` is not available (e.g. a modal used in a
 * context outside the engine), the suffix is empty and imports
 * fall back to the plain URL — same behaviour as before this
 * change.
 */
export async function createModal(type, props = {}) {
    const v = window.coreEngine?.static_version;
    const suffix = v ? `?v=${v}` : '';

    switch (type) {
        case 'message': {
            const { BaseModalMessage } = await import(`./message.js${suffix}`);
            return new BaseModalMessage(props);
        }
        case 'confirm': {
            const { BaseModalConfirm } = await import(`./confirm.js${suffix}`);
            return new BaseModalConfirm(props);
        }
        case 'input': {
            const { BaseModalInput } = await import(`./input.js${suffix}`);
            return new BaseModalInput(props);
        }
        case 'form': {
            const { BaseModalForm } = await import(`./form.js${suffix}`);
            return new BaseModalForm(props);
        }
        case 'textarea': {
            const { BaseModalTextarea } = await import(`./textarea.js${suffix}`);
            return new BaseModalTextarea(props);
        }
        case 'textareatwo': {
            const { BaseModalTextareaTwo } = await import(`./textareatwo.js${suffix}`);
            return new BaseModalTextareaTwo(props);
        }
        case 'date': {
            const { BaseModalDate } = await import(`./date.js${suffix}`);
            return new BaseModalDate(props);
        }
        case 'interval': {
            const { BaseModalInterval } = await import(`./interval.js${suffix}`);
            return new BaseModalInterval(props);
        }
        case 'image': {
            const { BaseModalImage } = await import(`./image.js${suffix}`);
            return new BaseModalImage(props);
        }
        case 'list': {
            const { BaseModalList } = await import(`./list.js${suffix}`);
            return new BaseModalList(props);
        }
        default:
            console.warn(`[Modal] Unknown type: ${type}`);
            return null;
    }
}