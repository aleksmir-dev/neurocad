// app/core/engine/lib/base/modal/index.js

/**
 * Фабрика для создания модалок по типу.
 * Асинхронная: классы подгружаются динамическим import().
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
        case 'date': {
            const { BaseModalDate } = await import('./date.js');
            return new BaseModalDate(props);
        }
        case 'interval': {
            const { BaseModalInterval } = await import('./interval.js');
            return new BaseModalInterval(props);
        }
        default:
            console.warn(`[Modal] Неизвестный тип: ${type}`);
            return null;
    }
}