// neurocad/core/engine/lib/word/llm/widgets.js

/**
 * LLMWidgets — построение DOM LLM-редактора.
 *
 * Задача — разложить интерфейс редактора по трём областям Base:
 *   .area-left   — сюда вставляем виджет пресетов
 *   .area-center — сюда (в container = word-widget-content) вставляем
 *                  виджет превью с кастомным toolbar
 *   .area-right  — сюда вставляем виджет чата
 *
 * После build() ссылки на созданные DOM-узлы кладутся прямо в LLMEditor:
 *     editor.leftArea    — <aside> слева
 *     editor.rightArea   — <aside> справа
 *     editor.presetsEl   — контейнер списка пресетов
 *     editor.canvasEl    — контейнер iframe превью
 *     editor.toolbarEl   — toolbar над превью
 *     editor.chatEl      — контейнер сообщений чата
 *
 * Все классы — с префиксом core-engine-lib-word-llm-.
 * Контейнеры виджетов — стандартные из base (core-engine-lib-base-widget-*).
 */
export class LLMWidgets {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Найти три области Base и наполнить их.
     * Вызывается до инициализации preview.
     */
    build() {
        console.log('[LLMWidgets] build()');

        const e = this.editor;

        // ===== Находим три области Base =====
        e.leftArea = document.querySelector('.core-engine-lib-base-area-left');
        e.rightArea = document.querySelector('.core-engine-lib-base-area-right');

        if (!e.leftArea || !e.rightArea) {
            console.warn('[LLMWidgets] Области .area-left / .area-right не найдены');
        }

        // ===== LEFT: виджет пресетов =====
        if (e.leftArea) {
            e.leftArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-llm-presets">
                    <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-llm-presets-toolbar"
                         data-js="llm-presets-toolbar">
                        <span class="core-engine-lib-word-llm-presets-title">Пресеты</span>
                        <button type="button"
                                class="core-engine-lib-word-llm-presets-add"
                                data-action="preset-add"
                                title="Создать пресет"
                                aria-label="Создать пресет">+</button>
                    </div>
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-llm-presets-content"
                         data-js="llm-presets-content"></div>
                </div>
            `;
            e.presetsEl = e.leftArea.querySelector('[data-js="llm-presets-content"]');
        }

        // ===== CENTER: toolbar + canvas =====
        // this.editor.container — это .core-engine-lib-word-widget-content,
        // который отдал Word через свой _openLLMEditor().
        e.container.innerHTML = `
            <div class="core-engine-lib-base-widget core-engine-lib-word-llm-preview">
                <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-llm-toolbar"
                     data-js="llm-toolbar"></div>
                <div class="core-engine-lib-base-widget-content core-engine-lib-word-llm-preview-content"
                     data-js="llm-preview-content"></div>
            </div>
        `;
        e.canvasEl = e.container.querySelector('[data-js="llm-preview-content"]');
        e.toolbarEl = e.container.querySelector('[data-js="llm-toolbar"]');

        // ===== RIGHT: виджет чата =====
        if (e.rightArea) {
            e.rightArea.innerHTML = `
                <div class="core-engine-lib-base-widget core-engine-lib-word-llm-chat">
                    <div class="core-engine-lib-base-widget-toolbar core-engine-lib-word-llm-chat-toolbar"
                         data-js="llm-chat-toolbar">
                        <span class="core-engine-lib-word-llm-chat-title">Чат</span>
                    </div>
                    <div class="core-engine-lib-base-widget-content core-engine-lib-word-llm-chat-content"
                         data-js="llm-chat-content"></div>
                </div>
            `;
            e.chatEl = e.rightArea.querySelector('[data-js="llm-chat-content"]');
        }

        console.log('[LLMWidgets] DOM построен', {
            presetsEl: !!e.presetsEl,
            canvasEl: !!e.canvasEl,
            toolbarEl: !!e.toolbarEl,
            chatEl: !!e.chatEl,
        });
    }
}