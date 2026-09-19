// app/core/engine/lib/word/editor/widgets.js

/**
 * WidgetsBuilder — build editor DOM.
 *
 * Task:
 *   Lay out editor UI across three Base areas:
 *     .area-left   — 4 tabs [Styles|Traits|Blocks|Presets] (icon buttons)
 *     .area-center — GrapesJS Canvas + custom toolbar on top
 *     .area-right  — LLM Chat (full height)
 *
 * After build(), refs to created DOM nodes are stored on editor:
 *     editor.leftArea       — left <aside>
 *     editor.rightArea      — right <aside>
 *     editor.blocksEl       — BlockManager container
 *     editor.presetsEl      — Presets list container
 *     editor.canvasEl       — Canvas container
 *     editor.toolbarEl      — toolbar above Canvas
 *     editor.stylesEl       — StyleManager container
 *     editor.traitsEl       — TraitManager container
 *     editor.chatEl         — LLM Chat container (right)
 *     editor.tabsEl         — tabs container
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

        // ===== LEFT: 4 tabs [Styles|Traits|Blocks|Presets] =====
        if (e.leftArea) {
            const iconsBase = '/static/core/engine/lib/base/images';

            e.leftArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-editor-left-top">
                    <div class="core-engine-lib-word-editor-tabs" data-js="editor-tabs">
                        <button type="button"
                                class="core-engine-lib-word-editor-tab active"
                                data-tab="styles"
                                data-js="editor-tab-styles"
                                title="Стили"
                                aria-label="Стили">
                            <img class="core-engine-lib-word-editor-tab-icon"
                                 src="${iconsBase}/styles.svg"
                                 alt=""
                                 aria-hidden="true">
                        </button>
                        <button type="button"
                                class="core-engine-lib-word-editor-tab"
                                data-tab="traits"
                                data-js="editor-tab-traits"
                                title="Свойства"
                                aria-label="Свойства">
                            <img class="core-engine-lib-word-editor-tab-icon"
                                 src="${iconsBase}/traits.svg"
                                 alt=""
                                 aria-hidden="true">
                        </button>
                        <button type="button"
                                class="core-engine-lib-word-editor-tab"
                                data-tab="blocks"
                                data-js="editor-tab-blocks"
                                title="Блоки"
                                aria-label="Блоки">
                            <img class="core-engine-lib-word-editor-tab-icon"
                                 src="${iconsBase}/blocks.svg"
                                 alt=""
                                 aria-hidden="true">
                        </button>
                        <button type="button"
                                class="core-engine-lib-word-editor-tab"
                                data-tab="presets"
                                data-js="editor-tab-presets"
                                title="Пресеты"
                                aria-label="Пресеты">
                            <img class="core-engine-lib-word-editor-tab-icon"
                                 src="${iconsBase}/presets.svg"
                                 alt=""
                                 aria-hidden="true">
                        </button>
                    </div>

                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-tab-panel"
                         data-tab-panel="styles">
                        <div class="core-engine-lib-word-editor-panel-content core-engine-lib-word-editor-styles-content"
                             data-js="editor-styles"></div>
                    </div>

                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-tab-panel"
                         data-tab-panel="traits"
                         hidden>
                        <div class="core-engine-lib-word-editor-panel-content core-engine-lib-word-editor-traits-content"
                             data-js="editor-traits"></div>
                    </div>

                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-tab-panel"
                         data-tab-panel="blocks"
                         hidden>
                        <div class="core-engine-lib-word-editor-blocks-content"
                             data-js="editor-blocks"></div>
                    </div>

                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-editor-tab-panel"
                         data-tab-panel="presets"
                         hidden>
                        <div class="core-engine-lib-word-editor-presets-toolbar"
                             data-js="editor-presets-toolbar">
                            <button type="button"
                                    class="core-engine-lib-word-llm-presets-add"
                                    data-action="preset-add"
                                    title="Создать пресет"
                                    aria-label="Создать пресет">+</button>
                        </div>
                        <div class="core-engine-lib-word-editor-presets-content"
                             data-js="editor-presets"></div>
                    </div>
                </div>
            `;
            e.blocksEl = e.leftArea.querySelector('[data-js="editor-blocks"]');
            e.presetsEl = e.leftArea.querySelector('[data-js="editor-presets"]');
            e.stylesEl = e.leftArea.querySelector('[data-js="editor-styles"]');
            e.traitsEl = e.leftArea.querySelector('[data-js="editor-traits"]');
            e.tabsEl = e.leftArea.querySelector('[data-js="editor-tabs"]');
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

        // ===== RIGHT: LLM Chat (full height) =====
        if (e.rightArea) {
            e.rightArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-llm-chat">
                    <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-llm-chat-toolbar"
                         data-js="editor-chat-toolbar">
                        <span>Чат</span>
                    </div>
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-llm-chat-content"
                         data-js="editor-chat"></div>
                </div>
            `;
            e.chatEl = e.rightArea.querySelector('[data-js="editor-chat"]');
        }

        console.log('[WidgetsBuilder] DOM built', {
            blocksEl: !!e.blocksEl,
            presetsEl: !!e.presetsEl,
            canvasEl: !!e.canvasEl,
            toolbarEl: !!e.toolbarEl,
            stylesEl: !!e.stylesEl,
            traitsEl: !!e.traitsEl,
            chatEl: !!e.chatEl,
        });
    }
}