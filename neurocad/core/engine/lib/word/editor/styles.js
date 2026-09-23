// app/core/engine/lib/word/editor/styles.js

/**
 * StylesConfig — конфигурация StyleManager для GrapesJS.
 *
 * Возвращает массив секций, который GrapesLoader подставит в
 * grapesjs.init({ styleManager: { sectors: [...] } }).
 *
 * Секции:
 *   - Размеры          — width/height (все варианты), aspect-ratio, overflow
 *   - Отступы          — padding, margin, gap
 *   - Типографика      — шрифт, размер, вес, line-height, letter-spacing,
 *                        color, text-align, decoration, white-space
 *   - Фон              — background-color/image/size/position/repeat/attachment
 *   - Оформление       — границы, скругление, тень, прозрачность
 *   - Flex             — направление, выравнивание, grow/shrink/basis/order
 *   - Grid             — шаблоны, выравнивание, gap
 *   - Позиционирование — display, position, top/right/bottom/left, z-index
 *   - Дополнительно    — cursor, transform, transition, text-shadow
 *
 * Свойства <body> (wrapper) вынесены во вкладку «Свойства» (Traits),
 * см. GrapesLoader._registerBodyStyleTraits.
 *
 * Названия и порядок секций — на русском, для контент-менеджеров.
 */
export class StylesConfig {
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Вернуть массив секций для styleManager.sectors.
     */
    sectors() {
        return [
            // ============================================
            // РАЗМЕРЫ
            // ============================================
            {
                name: 'Размеры',
                open: false,
                buildProps: [
                    'width',
                    'min-width',
                    'max-width',
                    'height',
                    'min-height',
                    'max-height',
                    'aspect-ratio',
                    'overflow',
                ],
            },

            // ============================================
            // ОТСТУПЫ
            // ============================================
            {
                name: 'Отступы',
                open: false,
                buildProps: [
                    'padding',
                    'margin',
                    'gap',
                ],
            },

            // ============================================
            // ТИПОГРАФИКА
            // ============================================
            {
                name: 'Типографика',
                open: false,
                buildProps: [
                    'font-family',
                    'font-size',
                    'font-weight',
                    'line-height',
                    'letter-spacing',
                    'color',
                    'text-align',
                    'text-transform',
                    'text-decoration',
                    'text-shadow',
                    'white-space',
                ],
            },

            // ============================================
            // ФОН
            // ============================================
            {
                name: 'Фон',
                open: false,
                buildProps: [
                    'background-color',
                    'background-image',
                    'background-size',
                    'background-position',
                    'background-repeat',
                    'background-attachment',
                ],
            },

            // ============================================
            // ОФОРМЛЕНИЕ
            // ============================================
            {
                name: 'Оформление',
                open: false,
                buildProps: [
                    'border',
                    'border-radius',
                    'box-shadow',
                    'opacity',
                ],
            },

            // ============================================
            // FLEX
            // ============================================
            {
                name: 'Flex',
                open: false,
                buildProps: [
                    'flex-direction',
                    'flex-wrap',
                    'justify-content',
                    'align-items',
                    'align-content',
                    'align-self',
                    'flex-grow',
                    'flex-shrink',
                    'flex-basis',
                    'order',
                ],
            },

            // ============================================
            // GRID
            // ============================================
            {
                name: 'Grid',
                open: false,
                buildProps: [
                    'grid-template-columns',
                    'grid-template-rows',
                    'grid-auto-flow',
                    'justify-items',
                    'align-items',
                    'place-content',
                ],
            },

            // ============================================
            // ПОЗИЦИОНИРОВАНИЕ
            // ============================================
            {
                name: 'Позиционирование',
                open: false,
                buildProps: [
                    'display',
                    'position',
                    'top',
                    'right',
                    'bottom',
                    'left',
                    'z-index',
                ],
            },

            // ============================================
            // ДОПОЛНИТЕЛЬНО
            // ============================================
            {
                name: 'Дополнительно',
                open: false,
                buildProps: [
                    'cursor',
                    'transform',
                    'transition',
                ],
            },
        ];
    }
}