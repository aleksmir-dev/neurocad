// app/core/engine/lib/word/editor/modals.js

/**
 * Modals — modal helpers for the editor.
 *
 * Two modals:
 *   - openHtmlCssModal: page-level HTML + CSS viewer/editor (two fields).
 *   - openElementCssModal: element-level inline CSS editor.
 */

import { loadBeautify, formatCss, formatHtml } from './formatter.js';

/**
 * Open the page-level HTML + CSS modal.
 *
 * Uses BaseModalTextareaTwo ('textareatwo') with two fields (CSS + HTML)
 * and a draggable divider between them. Labels are hidden by default.
 *
 * On OK:
 *   - applies CSS via editor.setStyle(css)
 *   - applies HTML via editor.setComponents(html)
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

    // Lazy-load js-beautify (once per session)
    try {
        await loadBeautify();
    } catch (e) {
        console.warn('[Modals] beautify not available, using raw output', e);
    }

    const rawHtml = editor.getHtml();
    const rawCss = editor.getCss();

    const css = formatCss(rawCss);
    const html = formatHtml(rawHtml);

    const modal = await createModal('textareatwo');

    modal.open({
        title: 'HTML + CSS страницы',
        css,
        html,
        showLabels: false,
    });

    modal.setOnOk(({ css: newCss, html: newHtml }) => {
        try {
            if (newCss && newCss.trim()) {
                editor.setStyle(newCss);
                console.log('[Modals] CSS applied');
            }
            editor.setComponents(newHtml || '');
            console.log('[Modals] HTML applied');
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