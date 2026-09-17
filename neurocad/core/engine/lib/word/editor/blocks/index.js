// app/core/engine/lib/word/editor/blocks/index.js

/**
 * BlocksRegistry — регистратор библиотеки блоков GrapesJS.
 *
 * Задача:
 *   Собрать все категории блоков и зарегистрировать их в editor.BlockManager.
 *
 * Категории:
 *   elements.js  — элементарные: кнопки, заголовки, параграф, списки, цитата,
 *                  изображение, разделитель, поля ввода
 *   layout.js    — сетки и карточки: контейнер, 2/3/4 колонки, карточка
 *   ready.js     — готовые блоки: hero, преимущества, факты, CTA, галерея
 *
 * Каждый модуль экспортирует класс с методом register(),
 * который получает инстанс editor.BlockManager через конструктор.
 *
 * Пример:
 *   const reg = new BlocksRegistry(gjsInstance);
 *   await reg.register();
 */
export class BlocksRegistry {
    /**
     * @param {Object} editorInstance — инстанс GrapesJS (grapesjs.init(...))
     */
    constructor(editorInstance) {
        this.editor = editorInstance;
    }

    /**
     * Загрузить модули категорий и вызвать у каждого register().
     */
    async register() {
        console.log('[BlocksRegistry] Регистрация блоков');

        const version = window.coreEngine?.static_version || Date.now();

        const [
            { ElementBlocks },
            { LayoutBlocks },
            { ReadyBlocks },
        ] = await Promise.all([
            import(`./elements.js?v=${version}`),
            import(`./layout.js?v=${version}`),
            import(`./ready.js?v=${version}`),
        ]);

        const bm = this.editor.BlockManager;

        new ElementBlocks(bm).register();
        new LayoutBlocks(bm).register();
        new ReadyBlocks(bm).register();

        console.log('[BlocksRegistry] Все категории зарегистрированы');
    }
}