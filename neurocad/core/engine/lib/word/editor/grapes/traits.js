// app/core/engine/lib/word/editor/grapes/traits.js

/**
 * Body layout traits for the wrapper (Свойства panel).
 *
 * Registers two custom trait types and assigns layout traits to the
 * wrapper (body):
 *
 *   body-style-select  — <select> that writes to component inline style
 *   body-style-integer — text input + unit <select> that writes to
 *                        component inline style
 *
 * These traits live in the Traits panel and write directly to the
 * component style (component.addStyle / removeStyle). Selecting the
 * body shows layout controls (height, display, flex-direction,
 * padding, margin, overflow) — like StyleManager, but scoped to the
 * wrapper only.
 *
 * Idempotent:
 *   - trait types are registered only once (getType check);
 *   - traits are always (re-)assigned on the current wrapper —
 *     GrapesJS replaces the wrapper on loadProjectData / setComponents,
 *     so re-assignment is required after each data load.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks.
 */

/**
 * Register custom trait types and assign body traits.
 *
 * @param {Object} instance — GrapesJS instance
 */
export function registerBodyTraits(instance) {
    try {
        const tm = instance.TraitManager;

        // --- Custom trait type: <select> that writes to style ---
        if (!tm.getType('body-style-select')) {
            tm.addType('body-style-select', {
                createInput({ trait }) {
                    const options = trait.get('options') || [];
                    const el = document.createElement('select');
                    el.className = 'body-style-select';

                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = '';
                    emptyOpt.textContent = '—';
                    el.appendChild(emptyOpt);

                    options.forEach((opt) => {
                        const o = document.createElement('option');
                        o.value = opt.id;
                        o.textContent = opt.name;
                        el.appendChild(o);
                    });

                    return el;
                },
                onEvent({ elInput, component }) {
                    const prop = this.target.get('bodyProp');
                    const value = elInput.value;
                    if (value) {
                        component.addStyle({ [prop]: value });
                    } else {
                        component.removeStyle(prop);
                    }
                },
                onUpdate({ elInput, component }) {
                    const prop = this.target.get('bodyProp');
                    const value = component.getStyle()[prop] || '';
                    elInput.value = value;
                },
            });
        }

        // --- Custom trait type: integer input + unit select ---
        if (!tm.getType('body-style-integer')) {
            tm.addType('body-style-integer', {
                createInput({ trait }) {
                    const units = trait.get('units') || ['px'];
                    const wrap = document.createElement('div');
                    wrap.className = 'body-style-integer';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.placeholder = 'auto';
                    input.className = 'body-style-integer__input';

                    const unitSel = document.createElement('select');
                    unitSel.className = 'body-style-integer__unit';
                    units.forEach((u) => {
                        const o = document.createElement('option');
                        o.value = u;
                        o.textContent = u;
                        unitSel.appendChild(o);
                    });

                    wrap.appendChild(input);
                    wrap.appendChild(unitSel);
                    return wrap;
                },
                onEvent({ elInput, component }) {
                    const prop = this.target.get('bodyProp');
                    const input = elInput.querySelector('.body-style-integer__input');
                    const unitSel = elInput.querySelector('.body-style-integer__unit');
                    const raw = input.value.trim();
                    if (!raw) {
                        component.removeStyle(prop);
                        return;
                    }
                    const unit = unitSel.value || 'px';
                    const hasUnit = /[a-z%]+$/i.test(raw);
                    const value = hasUnit ? raw : `${raw}${unit}`;
                    component.addStyle({ [prop]: value });
                },
                onUpdate({ elInput, component }) {
                    const prop = this.target.get('bodyProp');
                    const input = elInput.querySelector('.body-style-integer__input');
                    const unitSel = elInput.querySelector('.body-style-integer__unit');
                    const value = component.getStyle()[prop] || '';

                    const m = value.match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
                    if (m) {
                        input.value = m[1];
                        if (m[2] && [...unitSel.options].some(o => o.value === m[2])) {
                            unitSel.value = m[2];
                        }
                    } else {
                        input.value = value;
                    }
                },
            });
        }

        // --- Assign traits to wrapper (body) ---
        const wrapper = instance.getWrapper();
        if (!wrapper) {
            console.warn('[GrapesLoader] wrapper not available — body traits not assigned');
            return;
        }

        const bodyTraits = [
            {
                type: 'body-style-integer',
                name: 'height',
                label: 'Высота',
                bodyProp: 'height',
                units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
            },
            {
                type: 'body-style-integer',
                name: 'min-height',
                label: 'Мин. высота',
                bodyProp: 'min-height',
                units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
            },
            {
                type: 'body-style-integer',
                name: 'max-height',
                label: 'Макс. высота',
                bodyProp: 'max-height',
                units: ['px', '%', 'vh', 'vw', 'em', 'rem'],
            },
            {
                type: 'body-style-select',
                name: 'display',
                label: 'Display',
                bodyProp: 'display',
                options: [
                    { id: 'block', name: 'block' },
                    { id: 'flex', name: 'flex' },
                    { id: 'grid', name: 'grid' },
                    { id: 'inline', name: 'inline' },
                    { id: 'inline-block', name: 'inline-block' },
                    { id: 'none', name: 'none' },
                ],
            },
            {
                type: 'body-style-select',
                name: 'flex-direction',
                label: 'Flex direction',
                bodyProp: 'flex-direction',
                options: [
                    { id: 'row', name: 'row' },
                    { id: 'row-reverse', name: 'row-reverse' },
                    { id: 'column', name: 'column' },
                    { id: 'column-reverse', name: 'column-reverse' },
                ],
            },
            {
                type: 'body-style-select',
                name: 'justify-content',
                label: 'Justify content',
                bodyProp: 'justify-content',
                options: [
                    { id: 'flex-start', name: 'flex-start' },
                    { id: 'flex-end', name: 'flex-end' },
                    { id: 'center', name: 'center' },
                    { id: 'space-between', name: 'space-between' },
                    { id: 'space-around', name: 'space-around' },
                    { id: 'space-evenly', name: 'space-evenly' },
                ],
            },
            {
                type: 'body-style-select',
                name: 'align-items',
                label: 'Align items',
                bodyProp: 'align-items',
                options: [
                    { id: 'stretch', name: 'stretch' },
                    { id: 'flex-start', name: 'flex-start' },
                    { id: 'flex-end', name: 'flex-end' },
                    { id: 'center', name: 'center' },
                    { id: 'baseline', name: 'baseline' },
                ],
            },
            {
                type: 'body-style-integer',
                name: 'padding',
                label: 'Внутренний отступ',
                bodyProp: 'padding',
                units: ['px', '%', 'em', 'rem'],
            },
            {
                type: 'body-style-integer',
                name: 'margin',
                label: 'Внешний отступ',
                bodyProp: 'margin',
                units: ['px', '%', 'em', 'rem'],
            },
            {
                type: 'body-style-select',
                name: 'overflow',
                label: 'Overflow',
                bodyProp: 'overflow',
                options: [
                    { id: 'visible', name: 'visible' },
                    { id: 'hidden', name: 'hidden' },
                    { id: 'scroll', name: 'scroll' },
                    { id: 'auto', name: 'auto' },
                ],
            },
        ];

        wrapper.set('traits', bodyTraits);
        console.log('[GrapesLoader] body traits assigned:', bodyTraits.length);

    } catch (err) {
        console.warn('[GrapesLoader] failed to register body style traits:', err);
    }
}