// app/core/engine/lib/base/caption.js

/**
 * Caption — заголовок в шапке (header).
 *
 * Хелпер для страниц, которые рендерятся в area-center (Word,
 * Настройки, Настройки LLM, Профиль, Вход, Регистрация,
 * Восстановление пароля, Изменение пароля).
 *
 * Каждая такая страница при открытии вызывает setCaption() —
 * сохраняет текущий заголовок в шапке и подменяет его своим.
 * При закрытии — restoreCaption(saved) — возвращает прежний.
 *
 * Base сам заголовок не трогает после первичного рендера.
 *
 * Класс Title (title.js) рендерит начальный заголовок из конфига
 * один раз — это отдельная задача, его не трогаем.
 */

const HEADER_SELECTOR = '.core-engine-lib-base-title';

/**
 * Установить заголовок страницы, запомнив предыдущий.
 *
 * @param {string} title          — текст для document.title
 * @param {string} [headerText]   — текст для шапки. По умолчанию = title.
 * @returns {{docTitle: string, headerText: string|null}}
 *          Сохранить и передать в restoreCaption() при закрытии.
 */
export function setCaption(title, headerText) {
    const headerEl = document.querySelector(HEADER_SELECTOR);

    const saved = {
        docTitle: document.title,
        headerText: headerEl ? headerEl.textContent : null,
    };

    if (title) {
        document.title = title;
    }
    if (headerEl && headerText !== undefined) {
        headerEl.textContent = headerText || title || '';
    }

    return saved;
}

/**
 * Восстановить заголовок, сохранённый в setCaption().
 * Безопасно вызывать с null/undefined.
 *
 * @param {{docTitle: string, headerText: string|null}} saved
 */
export function restoreCaption(saved) {
    if (!saved) return;

    if (saved.docTitle !== undefined) {
        document.title = saved.docTitle;
    }

    const headerEl = document.querySelector(HEADER_SELECTOR);
    if (headerEl && saved.headerText !== null) {
        headerEl.textContent = saved.headerText;
    }
}