// app/core/engine/lib/word/editor/grapes/link.js

/**
 * Link type and link command.
 *
 * registerLinkType(instance)    — register the 'link' component type
 *                                 with traits (href, title, target) so
 *                                 links can be set on buttons and other
 *                                 elements.
 * registerLinkCommand(instance) — register the 'tlb-custom-link' command
 *                                 used by the context menu. It wraps the
 *                                 selected component in <a> and selects
 *                                 it, so the traits panel opens with
 *                                 href/target.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks.
 */

/**
 * Register the 'link' component type with traits.
 */
export function registerLinkType(instance) {
    try {
        instance.DomComponents.addType('link', {
            isComponent: (el) => el.tagName === 'A',
            model: {
                defaults: {
                    traits: [
                        'id',
                        'title',
                        {
                            type: 'text',
                            name: 'href',
                            label: 'Ссылка (href)',
                            placeholder: '/page/... или https://...',
                        },
                        {
                            type: 'select',
                            name: 'target',
                            label: 'Открывать',
                            options: [
                                { id: '', name: 'В текущем окне' },
                                { id: '_blank', name: 'В новой вкладке' },
                            ],
                        },
                    ],
                },
            },
        });
        console.log('[GrapesLoader] Link type registered');
    } catch (err) {
        console.warn('[GrapesLoader] Failed to register link type:', err);
    }
}

/**
 * Register the 'tlb-custom-link' command.
 *
 * Behaviour:
 *   1. If the selected component is already an <a> — just select it
 *      (the traits panel opens with href/target).
 *   2. Otherwise wrap its HTML in <a href="#">, replace the component,
 *      then select the newly created <a>.
 */
export function registerLinkCommand(instance) {
    try {
        instance.Commands.add('tlb-custom-link', {
            run(editor) {
                const selected = editor.getSelected();
                if (!selected) return;

                // Already a link — just select it.
                if (selected.get('tagName') === 'a') {
                    editor.select(selected);
                    return;
                }

                // Wrap in <a>.
                const html = selected.getEl()?.outerHTML || selected.toHTML();
                if (!html) return;

                // Replace the component's HTML with <a>…</a>.
                selected.replaceWith(`<a href="#">${html}</a>`);

                // Select the new <a>.
                const parent = selected.parent();
                if (parent) {
                    const links = parent.find('a');
                    if (links && links.length) {
                        editor.select(links[links.length - 1]);
                    }
                }
            },
        });
        console.log('[GrapesLoader] Link command registered');
    } catch (err) {
        console.warn('[GrapesLoader] Failed to register link command:', err);
    }
}