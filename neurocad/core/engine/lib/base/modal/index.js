// app/core/engine/lib/base/modal/index.js

export { BaseModalMessage } from './message.js';
export { BaseModalConfirm } from './confirm.js';
export { BaseModalInput } from './input.js';
export { BaseModalTextarea } from './textarea.js';
export { BaseModalDate } from './date.js';
export { BaseModalInterval } from './interval.js';

/**
 * Фабрика для создания модалок по типу
 */
export function createModal(type, props = {}) {
    switch (type) {
        case 'message':
            return new BaseModalMessage(props);
        case 'confirm':
            return new BaseModalConfirm(props);
        case 'input':
            return new BaseModalInput(props);
        case 'textarea':
            return new BaseModalTextarea(props);
        case 'date':
            return new BaseModalDate(props);
        case 'interval':
            return new BaseModalInterval(props);
        default:
            console.warn(`[Modal] Неизвестный тип: ${type}`);
            return null;
    }
}