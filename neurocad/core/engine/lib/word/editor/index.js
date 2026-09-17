// app/core/engine/lib/word/editor/index.js

/**
 * Точка входа редактора GrapesJS.
 *
 * Реэкспортирует класс Editor из editor.js.
 * Компонент Word импортирует отсюда:
 *
 *   const { Editor } = await import(`./editor/index.js?v=${version}`);
 *
 * Внутренние модули (grapes, widgets, styles, assets, resizer, blocks/*)
 * Editor подгружает сам — динамически, с версией.
 */

export { Editor } from './editor.js';