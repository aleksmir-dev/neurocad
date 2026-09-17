// app/core/engine/lib/word/editor/styles.js

/**
 * StylesConfig — конфигурация StyleManager для GrapesJS.
 *
 * Возвращает массив секций, который GrapesLoader подставит в
 * grapesjs.init({ styleManager: { sectors: [...] } }).
 *
 * Секции:
 *   - Размеры          — width, height, max-width, padding, margin, overflow
 *   - Типографика      — шрифт, размер, цвет, выравнивание, decoration
 *   - Фон              — background-color/image/size/position/repeat/attachment
 *   - Оформление       — границы, скругление, тень, прозрачность
 *   - Flex             — направление, выравнивание, gap, grow/shrink/basis/order/align-self
 *   - Позиционирование — display, position, top/right/bottom/left, z-index
 *   - Дополнительно    — cursor, transform, transition, text-shadow
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
                    'padding',
                    'margin',
                    'overflow',
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
                    'letter-spacing',
                    'line-height',
                    'color',
                    'text-align',
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
                    'gap',
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