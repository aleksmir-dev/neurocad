// app/core/engine/lib/word/editor/widgets.js

/**
 * WidgetsBuilder — build editor DOM.
 *
 * Task:
 *   Lay out editor UI across three Base areas:
 *     .area-left   — GrapesJS inserts BlockManager here
 *     .area-center — GrapesJS inserts Canvas + custom toolbar on top
 *     .area-right  — GrapesJS inserts TraitManager (top) + StyleManager (bottom)
 *
 * After build(), refs to created DOM nodes are stored on editor:
 *     editor.leftArea       — left <aside>
 *     editor.rightArea      — right <aside>
 *     editor.blocksEl       — BlockManager container
 *     editor.canvasEl       — Canvas container
 *     editor.toolbarEl      — toolbar above Canvas
 *     editor.traitsEl       — TraitManager container
 *     editor.stylesEl       — StyleManager container
 *
 * All classes use prefix core-engine-lib-word-editor-.
 * Widget containers — standard from base (core-engine-lib-base-widget-*).
 */
export class WidgetsBuilder {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Find three Base areas and fill them.
     * Called before grapesjs.init().
     */
    build() {
        console.log('[WidgetsBuilder] build()');

        const e = this.editor;

        // ===== Find three Base areas =====
        e.leftArea = document.querySelector('.core-engine-lib-base-area-left');
        e.rightArea = document.querySelector('.core-engine-lib-base-area-right');

        if (!e.leftArea || !e.rightArea) {
            console.warn('[WidgetsBuilder] Areas .area-left / .area-right not found');
        }

        // ===== LEFT: blocks widget =====
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
        // this.editor.container — is .core-engine-component--word,
        // passed by Word via its _openEditor().
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

        // ===== RIGHT: traits (top) + styles (bottom) =====
        // Both content containers share the common marker class
        // `core-engine-lib-word-editor-panel-content` — used by styles.css
        // and theme.css to style TraitManager and StyleManager equally.
        if (e.rightArea) {
            e.rightArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-editor-traits">
                    <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-editor-traits-toolbar"
                         data-js="editor-traits-toolbar">
                        <span>Свойства</span>
                    </div>
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-panel-content core-engine-lib-word-editor-traits-content"
                         data-js="editor-traits"></div>
                </div>

                <div class="core-engine-lib-base-widget core-engine-lib-word-editor-styles">
                    <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-editor-styles-toolbar"
                         data-js="editor-styles-toolbar">
                        <span>Стили</span>
                    </div>
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-panel-content core-engine-lib-word-editor-styles-content"
                         data-js="editor-styles"></div>
                </div>
            `;
            e.traitsEl = e.rightArea.querySelector('[data-js="editor-traits"]');
            e.stylesEl = e.rightArea.querySelector('[data-js="editor-styles"]');
        }

        console.log('[WidgetsBuilder] DOM built', {
            blocksEl: !!e.blocksEl,
            canvasEl: !!e.canvasEl,
            toolbarEl: !!e.toolbarEl,
            traitsEl: !!e.traitsEl,
            stylesEl: !!e.stylesEl,
        });
    }
}