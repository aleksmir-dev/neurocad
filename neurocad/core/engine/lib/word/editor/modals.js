// app/core/engine/lib/word/editor/modals.js

/**
 * Modals — modal helpers for the editor.
 *
 * Two modals:
 *   - openHtmlCssModal: page-level HTML + CSS viewer/editor (two fields).
 *   - openElementCssModal: element-level inline CSS editor.
 *
 * All external modules (formatter) are loaded dynamically with a version
 * query — to avoid browser cache issues on updates.
 */

/**
 * Open the page-level HTML + CSS modal.
 *
 * Uses BaseModalTextareaTwo ('textareatwo') with two fields (CSS + HTML)
 * and a draggable divider between them. Labels are hidden by default.
 *
 * On OK:
 *   - applies CSS via editor.Css.clear() + editor.Css.addRules(css)
 *   - applies HTML via editor.setComponents(html), but ONLY if HTML changed
 *
 * NOTE: editor.setStyle() is for INLINE styles on the selected component,
 * not for global CSS rules — do not use it for CssComposer.
 *
 * @param {Object} opts
 * @param {Object} opts.editor        — GrapesJS instance
 * @param {Function} opts.createModal — modal factory
 */
export async function openHtmlCssModal({ editor, createModal }) {
    if (!createModal) {
        console.warn('[Modals] createModal not provided');
        return;
    }

    // Load formatter module dynamically (with version)
    const version = window.coreEngine?.static_version || Date.now();
    let loadBeautify, formatCss, formatHtml;
    try {
        const mod = await import(`./formatter.js?v=${version}`);
        loadBeautify = mod.loadBeautify;
        formatCss = mod.formatCss;
        formatHtml = mod.formatHtml;
    } catch (e) {
        console.warn('[Modals] formatter module not loaded', e);
        return;
    }

    // Lazy-load js-beautify (once per session)
    try {
        await loadBeautify();
    } catch (e) {
        console.warn('[Modals] beautify not available, using raw output', e);
    }

    const rawHtml = editor.getHtml();
    const rawCss = editor.getCss();

    console.log('[Modals] === OPEN ===');
    console.log('[Modals] rawCss length:', rawCss.length);
    console.log('[Modals] rawCss has #i3eb:', rawCss.includes('#i3eb'));
    console.log('[Modals] rawHtml length:', rawHtml.length);

    const css = formatCss(rawCss);
    const html = formatHtml(rawHtml);

    console.log('[Modals] formatted css length:', css.length);
    console.log('[Modals] formatted css has #i3eb:', css.includes('#i3eb'));
    console.log('[Modals] formatted html length:', html.length);
    console.log('[Modals] formatted html has #i3eb:', html.includes('i3eb'));

    const modal = await createModal('textareatwo');

    modal.open({
        title: 'HTML + CSS страницы',
        css,
        html,
        showLabels: false,
    });

    // ===== DEBUG: inspect modal DOM after open =====
    setTimeout(() => {
        const rootEl = document.querySelector('.core-engine-lib-base-modal-textareatwo')
            || document.querySelector('[data-modal="textareatwo"]')
            || document.body;

        const textareas = rootEl.querySelectorAll('textarea');
        console.log('[Modals] === MODAL DOM AFTER OPEN ===');
        console.log('[Modals] textareas count:', textareas.length);
        textareas.forEach((ta, i) => {
            console.log(`[Modals] textarea[${i}] value length:`, ta.value.length);
            console.log(`[Modals] textarea[${i}] has #i3eb:`, ta.value.includes('#i3eb'));
            console.log(`[Modals] textarea[${i}] first 200 chars:`, ta.value.slice(0, 200));
        });
    }, 100);
    // ===== /DEBUG =====

    modal.setOnOk(({ css: newCss, html: newHtml }) => {
        console.log('[Modals] === ON OK ===');
        console.log('[Modals] newCss length:', newCss?.length);
        console.log('[Modals] newCss has #i3eb:', newCss?.includes('#i3eb'));
        console.log('[Modals] newHtml length:', newHtml?.length);
        console.log('[Modals] newHtml has i3eb:', newHtml?.includes('i3eb'));

        // Check editor state BEFORE applying
        console.log('[Modals] cssCount BEFORE:', editor.Css.getAll().length);
        console.log('[Modals] css has #i3eb BEFORE:', editor.getCss().includes('#i3eb'));

        try {
            // ===== CSS =====
            // NOTE: editor.setStyle() is for INLINE styles on the selected
            // component, NOT for global CSS rules. For CssComposer — use
            // clear() + addRules().
            if (newCss && newCss.trim()) {
                if (editor.Css?.clear) {
                    editor.Css.clear();
                }
                if (editor.Css?.addRules) {
                    editor.Css.addRules(newCss);
                    console.log('[Modals] CSS applied via Css.addRules');
                } else {
                    console.warn('[Modals] Css.addRules not available — CSS not applied');
                }
            }

            // ===== HTML =====
            // setComponents() recreates components from HTML, losing
            // attributes (like data-slot) and some inline styles.
            // Only apply if HTML actually changed — so opening the modal
            // and pressing OK without edits does NOT destroy anything.
            const currentHtml = editor.getHtml();
            const htmlChanged = newHtml && newHtml.trim() && newHtml.trim() !== currentHtml.trim();

            if (htmlChanged) {
                editor.setComponents(newHtml);
                console.log('[Modals] HTML applied (was changed)');
            } else {
                console.log('[Modals] HTML unchanged — skipped setComponents');
            }

            // Check editor state AFTER applying
            console.log('[Modals] cssCount AFTER:', editor.Css.getAll().length);
            console.log('[Modals] css has #i3eb AFTER:', editor.getCss().includes('#i3eb'));
            console.log('[Modals] html has i3eb AFTER:', editor.getHtml().includes('i3eb'));
        } catch (e) {
            console.error('[Modals] HTML+CSS apply error:', e);
        }
        modal.destroy();
    });

    modal.setOnCancel(() => {
        modal.destroy();
    });
}

/**
 * Open the element-level custom CSS modal.
 *
 * Uses BaseModalTextarea ('textarea') with a single field.
 * Applies CSS to the selected component as inline styles.
 *
 * @param {Object} opts
 * @param {Object} opts.editor        — GrapesJS instance
 * @param {Function} opts.createModal — modal factory
 */
export async function openElementCssModal({ editor, createModal }) {
    if (!createModal) {
        console.warn('[Modals] createModal not provided');
        return;
    }

    const comp = editor.getSelected();

    if (!comp) {
        const modal = await createModal('message');
        modal.open(
            'Сначала выберите элемент на холсте.',
            'Кастомный CSS',
            'Понятно'
        );
        modal.setOnOk(() => modal.destroy());
        return;
    }

    const tag = (comp.get('tagName') || 'DIV').toUpperCase();
    const classes = comp.getClasses().join('.');
    const targetLabel = classes
        ? `<${tag} class="${classes}">`
        : `<${tag}>`;

    const style = comp.getStyle() || {};
    const initialCss = Object.entries(style)
        .map(([k, v]) => `${k}: ${v};`)
        .join('\n');

    const modal = await createModal('textarea');

    modal.open(
        targetLabel,
        'Кастомный CSS',
        'Например:\nbackground: url("/media/uploads/photo.jpg") center/cover no-repeat;\nborder-radius: 12px;',
        initialCss
    );

    modal.setOnOk((value) => {
        applyElementCss(editor, value);
        modal.destroy();
    });

    modal.setOnCancel(() => {
        modal.destroy();
    });
}

/**
 * Apply a CSS string to the currently selected component.
 * Parses "prop: value;" lines into an object and passes to addStyle().
 *
 * This function is synchronous — no async imports inside.
 */
export function applyElementCss(editor, cssText) {
    const comp = editor.getSelected();
    if (!comp) return;

    const styleObj = parseCssText(cssText || '');

    if (Object.keys(styleObj).length === 0) {
        console.warn('[Modals] Custom CSS is empty or unrecognized');
        return;
    }

    comp.addStyle(styleObj);
    console.log('[Modals] Custom CSS applied:', styleObj);
}

/**
 * Parse "prop: value;" text into a {property: value} object.
 * Ignores comments, extra whitespace, malformed lines.
 *
 * This function is synchronous — no async imports inside.
 */
export function parseCssText(text) {
    const result = {};

    const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const declarations = cleaned.split(/;|\n/);

    for (let decl of declarations) {
        decl = decl.trim();
        if (!decl) continue;

        const idx = decl.indexOf(':');
        if (idx === -1) continue;

        const prop = decl.slice(0, idx).trim();
        const value = decl.slice(idx + 1).trim();

        if (prop && value) {
            result[prop] = value;
        }
    }

    return result;
}