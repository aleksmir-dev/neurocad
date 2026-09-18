// neurocad/core/engine/lib/word/llm/history.js

/**
 * LLMHistory — история изменений HTML (undo/redo).
 *
 * Задачи:
 *   - запоминать снимки HTML перед каждым изменением;
 *   - откатывать (undo) и повторять (redo);
 *   - сохранять снимки в БД (таблица page_hist) — на следующем этапе.
 *
 * Сейчас — заглушка: работает с локальным стеком в памяти. При обновлении
 * страницы история теряется. Реальная интеграция с БД — на Этапе 8.
 */
export class LLMHistory {
    constructor(editor) {
        console.log('[LLMHistory] Конструктор');
        this.editor = editor;

        // Стек снимков в памяти
        this.stack = [];        // [{html, action, note, created_at}]
        this.pos = -1;          // текущая позиция в стеке

        // Максимум снимков в памяти (защита от переполнения)
        this._maxStack = 50;
    }

    async init() {
        console.log('[LLMHistory] init() START');

        // Кнопки в тулбаре должны быть disabled, пока стек пуст
        this._updateButtons();

        console.log('[LLMHistory] init() COMPLETE');
    }

    // ============================================
    // ПУБЛИЧНЫЙ API
    // ============================================

    /**
     * Добавить снимок в историю.
     * Вызывается перед каждым изменением HTML (из chat, из пресета, из user_edit).
     */
    push(html, action = 'user_edit', note = '') {
        console.log('[LLMHistory] push() action:', action, 'note:', note);

        if (!html) return;

        // Если мы не в конце стека — обрезаем «будущее»
        if (this.pos < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.pos + 1);
        }

        this.stack.push({
            html,
            action,
            note,
            created_at: new Date().toISOString(),
        });

        // Обрезаем с начала, если превысили лимит
        if (this.stack.length > this._maxStack) {
            this.stack = this.stack.slice(-this._maxStack);
        }

        this.pos = this.stack.length - 1;

        this._updateButtons();
    }

    /**
     * Откатить на предыдущий снимок.
     * Возвращает HTML, к которому откатились, или null.
     */
    undo() {
        console.log('[LLMHistory] undo() pos:', this.pos, 'stack:', this.stack.length);

        if (this.pos <= 0) {
            console.log('[LLMHistory] undo() — в начале истории');
            return null;
        }

        // Запоминаем текущий HTML (чтобы при redo вернуть)
        const currentHtml = this.editor._preview?.getHtml() || '';

        this.pos -= 1;
        const snapshot = this.stack[this.pos];

        // Применяем HTML к preview
        if (this.editor._preview) {
            this.editor._preview.setHtml(snapshot.html);
        }

        // Если есть возможность, сохраняем текущее состояние как «будущее»
        // (простой подход: при redo просто берём следующий снимок)
        if (this.stack[this.pos + 1]) {
            this.stack[this.pos + 1].html = currentHtml;
        }

        this._updateButtons();
        return snapshot.html;
    }

    /**
     * Повторить отменённое изменение.
     * Возвращает HTML, к которому вернулись, или null.
     */
    redo() {
        console.log('[LLMHistory] redo() pos:', this.pos, 'stack:', this.stack.length);

        if (this.pos >= this.stack.length - 1) {
            console.log('[LLMHistory] redo() — в конце истории');
            return null;
        }

        this.pos += 1;
        const snapshot = this.stack[this.pos];

        if (this.editor._preview) {
            this.editor._preview.setHtml(snapshot.html);
        }

        this._updateButtons();
        return snapshot.html;
    }

    /**
     * Очистить историю (например, при закрытии редактора).
     */
    clear() {
        console.log('[LLMHistory] clear()');
        this.stack = [];
        this.pos = -1;
        this._updateButtons();
    }

    /**
     * Получить текущую позицию и размер стека.
     */
    getState() {
        return {
            pos: this.pos,
            size: this.stack.length,
            canUndo: this.pos > 0,
            canRedo: this.pos < this.stack.length - 1,
        };
    }

    // ============================================
    // UI
    // ============================================

    /**
     * Обновить состояние кнопок Undo/Redo в тулбаре.
     */
    _updateButtons() {
        const toolbar = this.editor.toolbarEl;
        if (!toolbar) return;

        const undoBtn = toolbar.querySelector('[data-action="llm-undo"]');
        const redoBtn = toolbar.querySelector('[data-action="llm-redo"]');

        if (undoBtn) {
            undoBtn.disabled = this.pos <= 0;
        }
        if (redoBtn) {
            redoBtn.disabled = this.pos >= this.stack.length - 1;
        }
    }

    destroy() {
        console.log('[LLMHistory] destroy()');
        this.stack = [];
        this.pos = -1;
    }
}