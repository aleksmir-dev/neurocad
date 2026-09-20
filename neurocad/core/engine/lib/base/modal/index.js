// app/core/engine/lib/base/modal/index.js

/**
 * Modal factory — creates modal instances by type.
 *
 * Async: modal classes are loaded via dynamic import().
 * Adding a new modal type:
 *   1. Create `<type>.js` next to this file.
 *   2. Export a class with the same API (open / close / setOnOk / setOnCancel / destroy).
 *   3. Add a `case '<type>':` below.
 */
export async function createModal(type, props = {}) {
    switch (type) {
        case 'message': {
            const { BaseModalMessage } = await import('./message.js');
            return new BaseModalMessage(props);
        }
        case 'confirm': {
            const { BaseModalConfirm } = await import('./confirm.js');
            return new BaseModalConfirm(props);
        }
        case 'input': {
            const { BaseModalInput } = await import('./input.js');
            return new BaseModalInput(props);
        }
        case 'textarea': {
            const { BaseModalTextarea } = await import('./textarea.js');
            return new BaseModalTextarea(props);
        }
        case 'textareatwo': {
            const { BaseModalTextareaTwo } = await import('./textareatwo.js');
            return new BaseModalTextareaTwo(props);
        }
        case 'date': {
            const { BaseModalDate } = await import('./date.js');
            return new BaseModalDate(props);
        }
        case 'interval': {
            const { BaseModalInterval } = await import('./interval.js');
            return new BaseModalInterval(props);
        }
        default:
            console.warn(`[Modal] Unknown type: ${type}`);
            return null;
    }
}