// app/core/engine/lib/word/editor/grapes/config.js

/**
 * buildConfig — assemble the config object for grapesjs.init().
 *
 * Accepts:
 *   loader       — GrapesLoader instance (we take editor and options)
 *   container    — DOM element to mount into
 *   canvasStyles — array of CSS paths for the iframe (already with ?v=)
 *   plugins      — array of GrapesJS plugins
 *
 * Returns the ready config.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks. buildContextMenu lives
 * in this file, locally.
 *
 * StyleManager / SelectorManager
 * ------------------------------
 * `selectorManager.componentFirst: true` tells GrapesJS to open the
 * StyleManager on the SELECTED COMPONENT'S OWN selector when one is
 * available. Combined with the auto-id for sections (see index.js →
 * _bindAutoId), this means:
 *
 *   - section has `id="i-a1b2c3"` → StyleManager opens `#i-a1b2c3`
 *     and any background / color / padding change applies to THAT
 *     ONE section only;
 *   - section has no id (should not happen with the auto-id hook,
 *     but defensively) → StyleManager falls back to its default
 *     behaviour (first class of the component).
 *
 * Without `componentFirst`, GrapesJS picks the first class of the
 * component — usually `.section` — and every section on the page
 * gets painted. That is the bug this option fixes.
 */

/**
 * Context menu filter (right-click / double-click).
 *
 * Keep only working items, drop the broken built-in "Link",
 * and append our own tlb-custom-link command that wraps the
 * component in <a> and selects it — so the traits panel
 * opens with href/target.
 */
function buildContextMenu(items) {
    const KEEP = [
        'tlb-move',
        'tlb-clone',
        'tlb-delete',
        'tlb-select-parent',
    ];

    const filtered = items.filter((i) => KEEP.includes(i.id));

    filtered.push({
        id: 'tlb-custom-link',
        label: 'Ссылка',
        command: 'tlb-custom-link',
    });

    return filtered;
}

/**
 * Build config.
 */
export function buildConfig(loader, container, canvasStyles, plugins) {
    const e = loader.editor;
    const options = loader.options || {};

    const config = {
        container: container,
        height: '100%',
        width: '100%',          // fills the whole container width
        fromElement: false,
        storageManager: false,

        plugins: plugins,
        pluginsOpts: {
            'grapesjs-blocks-basic': {
                flexGrid: true,
                // Separate category so the plugin does not create
                // "Разметка" before our LayoutBlocks.
                category: 'Basic',
            },
        },

        // Disable built-in panels — we have our own toolbar
        panels: { defaults: [] },

        // Devices
        deviceManager: {
            devices: [
                { name: 'desktop', width: '' },
                { name: 'tablet', width: '768px', widthMedia: '992px' },
                { name: 'mobile', width: '375px', widthMedia: '480px' },
            ],
        },

        // Asset manager — bound to our API
        assetManager: {
            assets: [],
            upload: e._assetsUploadApi,
            uploadName: 'files',
            autoAdd: 1,
            dropzone: 1,
            openAssetsOnDrop: 1,
            headers: {},
            uploadText: 'Перетащите файлы сюда или нажмите для выбора',
            addBtnText: 'Добавить по ссылке',
            modalTitle: 'Медиатека',
        },

        // CSS inside the iframe.
        // Attached to the iframe <head> where blocks are rendered.
        // Everything is scoped under .core-engine-lib-word-blocks.
        canvas: {
            styles: canvasStyles,
        },

        // Context menu filter
        components: {
            contextMenu: buildContextMenu,
        },

        // ===== SelectorManager =====
        //
        // componentFirst: true — при выделении компонента StyleManager
        // открывает САМ СЕЛЕКТОР ЭТОГО КОМПОНЕНТА, а не первый класс.
        //
        // Для секций это критично: у всех них есть класс `.section`,
        // и по умолчанию GrapesJS редактирует именно его — то есть
        // ВСЕ секции страницы сразу. А с componentFirst он открывает
        // `#i-XXXXXX` (уникальный id, который мы ставим в index.js →
        // _bindAutoId) — и правка применяется ТОЛЬКО к одной секции.
        selectorManager: {
            componentFirst: true,
        },
    };

    // ===== BlockManager =====
    if (e.blocksEl) {
        config.blockManager = {
            appendTo: e.blocksEl,
        };
    }

    // ===== TraitManager (right panel, above styles) =====
    if (e.traitsEl) {
        config.traitManager = {
            appendTo: e.traitsEl,
        };
    }

    // ===== StyleManager (right panel, below styles) =====
    if (e.stylesEl) {
        config.styleManager = {
            appendTo: e.stylesEl,
            sectors: options.styleManagerSectors || [],
        };
    }

    return config;
}