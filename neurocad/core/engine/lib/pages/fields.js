// app/core/engine/lib/pages/fields.js

/**
 * Field definitions for the Pages create/edit form.
 *
 * Split out of pages.js to keep that file focused on orchestration.
 * The field list is pure data — only two fields carry closures
 * (template_id and creative_id), and those closures only read the
 * arrays passed in. Everything else is a plain object literal.
 *
 * Consumed by Pages._init():
 *
 *     const { buildFields } = await import(`./fields.js?v=${version}`);
 *     ...
 *     fields: buildFields({
 *         templates: this._templates,
 *         creatives: this._creatives,
 *         makeLogoGeneratorButton,
 *     }),
 *
 * Field order in the form is exactly the order of this array:
 *
 *   1. title          — main heading, required
 *   2. card_type      — page vs folder (hidden, default 'page')
 *   3. description    — short summary
 *   4. url            — external link (link cards)
 *   5. logo           — logo picker (+ generator button)
 *   6. is_template    — mark as base template
 *   7. template_id    — inherit layout from another page
 *   8. parent_id      — current folder id (hidden)
 *   9. creative_id    — attach a creative
 *  10. is_active      — publish checkbox (last, on by default)
 *
 * Two fields are hidden via pages.css:
 *   - card_type (chosen by the toolbar button, not by the user)
 *   - parent_id (injected via initialData from BaseCards)
 *
 * See pages.css → HIDDEN FORM FIELDS for the selectors that hide
 * them, and edit.js → _renderForm for the edit-body--page /
 * edit-body--folder marker that controls the folder-only hiding.
 *
 * User-facing strings (labels, placeholders, hints) are in Russian.
 * Code comments, docstrings and identifiers are in English.
 */
export function buildFields({ templates, creatives, makeLogoGeneratorButton }) {
    return [
        {
            key: 'title',
            label: 'Заголовок',
            type: 'text',
            required: true,
            minLength: 1,
            maxLength: 255,
            placeholder: 'Введите заголовок статьи',
        },
        {
            key: 'card_type',
            // Not user-editable — hidden via pages.css.
            // Declared so its value is submitted.
            label: 'Тип',
            type: 'text',
            className: 'pages-field-hidden',
            default: 'page',
        },
        {
            key: 'description',
            label: 'Краткое описание',
            type: 'textarea',
            maxLength: 500,
            rows: 3,
            placeholder: 'Описание (необязательно)',
        },
        {
            key: 'url',
            label: 'Внешняя ссылка',
            type: 'text',
            maxLength: 2048,
            placeholder: 'https://example.com (необязательно)',
            hint: 'Если заполнено — карточка в каталоге ведёт на этот адрес вместо статьи.',
        },
        {
            key: 'logo',
            label: 'Логотип',
            type: 'media',
            placeholder: 'Не выбрано',
            mediaSources: ['media', 'logos'],
            mediaSource: 'logos',
            extraButtons: [ makeLogoGeneratorButton() ],
        },

        // ===== Template system =====
        {
            key: 'is_template',
            label: 'сделать базовым шаблоном',
            type: 'checkbox',
            default: 0,
        },
        {
            key: 'template_id',
            label: 'Наследовать от',
            type: 'select',
            valueType: 'number',
            options: () => templates.map(t => ({
                value: t.id,
                label: t.title,
            })),
            placeholder: '— Без шаблона —',
        },

        // ===== Folder mode — parent folder id =====
        {
            key: 'parent_id',
            // Not user-editable — hidden via pages.css.
            // Declared so BaseCardsEdit.getData() submits it.
            label: 'Родитель',
            type: 'text',
        },

        // ===== Creative attachment =====
        // Optional. When set, saving the page creates (or keeps) an
        // active placement row on the backend; clearing it (or
        // unchecking "Публиковать" below) closes the active
        // placement.
        //
        // The select is populated from the `creatives` array passed
        // in by Pages — loaded from /core/engine/lib/creatives/list
        // in _init() / _reload(). Inactive creatives are shown with
        // a "(неактивен)" suffix so the user understands why a
        // creative they archived is still selectable.
        {
            key: 'creative_id',
            label: 'Креатив',
            type: 'select',
            valueType: 'number',
            options: () => creatives.map(c => ({
                value: c.id,
                label: c.is_active
                    ? c.name
                    : `${c.name} (неактивен)`,
            })),
            placeholder: '— Без креатива —',
        },

        // ===== Publication =====
        // Last field, by design: "Публиковать" is the final decision
        // the user makes before saving. On by default for every new
        // page.
        {
            key: 'is_active',
            label: 'Публиковать',
            type: 'checkbox',
            default: 1,
        },
    ];
}