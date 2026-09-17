// app/core/engine/lib/word/editor/widgets.js

/**
 * WidgetsBuilder — построение DOM редактора.
 *
 * Задача:
 *   Разложить интерфейс редактора по трём областям Base:
 *     .area-left   — сюда GrapesJS вставит BlockManager
 *     .area-center — сюда GrapesJS вставит Canvas + кастомный toolbar сверху
 *     .area-right  — сюда GrapesJS вставит StyleManager
 *
 * После build() ссылки на созданные DOM-узлы кладутся прямо в editor:
 *     editor.leftArea       — <aside> слева
 *     editor.rightArea      — <aside> справа
 *     editor.blocksEl       — контейнер BlockManager
 *     editor.canvasEl       — контейнер Canvas
 *     editor.toolbarEl      — toolbar над Canvas
 *     editor.stylesEl       — контейнер StyleManager
 *
 * Все классы — с префиксом core-engine-lib-word-editor-.
 * Контейнеры виджетов — стандартные из base (core-engine-lib-base-widget-*).
 */
export class WidgetsBuilder {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Найти три области Base и наполнить их.
     * Вызывается до grapesjs.init().
     */
    build() {
        console.log('[WidgetsBuilder] build()');

        const e = this.editor;

        // ===== Находим три области Base =====
        e.leftArea = document.querySelector('.core-engine-lib-base-area-left');
        e.rightArea = document.querySelector('.core-engine-lib-base-area-right');

        if (!e.leftArea || !e.rightArea) {
            console.warn('[WidgetsBuilder] Области .area-left / .area-right не найдены');
        }

        // ===== LEFT: виджет блоков =====
        if (e.leftArea) {
            e.leftArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-editor-blocks">
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-blocks-content"
                         data-js="editor-blocks"></div>
                </div>
            `;
            e.blocksEl = e.leftArea.querySelector('[data-js="editor-blocks"]');
        }

        // ===== CENTER: toolbar + canvas =====
        // this.editor.container — это .core-engine-component--word,
        // который отдал Word через свой _openEditor().
        e.container.innerHTML = `
            <div class="core-engine-lib-base-widget core-engine-lib-word-editor-canvas">
                <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-editor-toolbar"
                     data-js="editor-toolbar"></div>
                <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-canvas-content"
                     data-js="editor-canvas"></div>
            </div>
        `;
        e.canvasEl = e.container.querySelector('[data-js="editor-canvas"]');
        e.toolbarEl = e.container.querySelector('[data-js="editor-toolbar"]');

        // ===== RIGHT: виджет стилей =====
        if (e.rightArea) {
            e.rightArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-editor-styles">
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-styles-content"
                         data-js="editor-styles"></div>
                </div>
            `;
            e.stylesEl = e.rightArea.querySelector('[data-js="editor-styles"]');
        }

        console.log('[WidgetsBuilder] DOM построен', {
            blocksEl: !!e.blocksEl,
            canvasEl: !!e.canvasEl,
            toolbarEl: !!e.toolbarEl,
            stylesEl: !!e.stylesEl,
        });
    }
}