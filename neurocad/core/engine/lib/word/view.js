// app/core/engine/lib/word/view.js

/**
 * Word view — render widget, toolbar, article, error.
 * Pure functions. All dependencies via word instance.
 */

/**
 * Render the whole Word widget into word.container.
 */
export async function render(word) {
    console.log('[Word] _render()');

    // Clear container
    while (word.container.firstChild) {
        word.container.removeChild(word.container.firstChild);
    }

    // ===== Root widget =====
    const widget = document.createElement('div');
    widget.className = 'core-engine-lib-base-widget core-engine-lib-word-widget';
    word.widgetEl = widget;

    // ===== Toolbar =====
    const toolbar = document.createElement('div');
    toolbar.className = 'core-engine-lib-base-widget-toolbar core-engine-lib-word-toolbar';
    toolbar.setAttribute('data-js', 'word-toolbar');
    word.toolbarEl = toolbar;
    widget.appendChild(toolbar);

    if (word._isAdmin()) {
        buildToolbarButtons(word, toolbar);
    }

    // ===== Date — right side of toolbar =====
    if (word.pageData?.datetime) {
        const dateEl = document.createElement('time');
        dateEl.className = 'core-engine-lib-word-toolbar-date';
        dateEl.textContent = word._utils.formatDate(word.pageData.datetime);
        toolbar.appendChild(dateEl);
    }

    // ===== Widget content =====
    const widgetContent = document.createElement('div');
    widgetContent.className = 'core-engine-lib-base-widget-content core-engine-lib-word-widget-content';
    widgetContent.setAttribute('data-js', 'word-widget-content');
    word.widgetContentEl = widgetContent;
    widget.appendChild(widgetContent);

    // ===== Article =====
    const article = await buildArticle(word);
    widgetContent.appendChild(article);

    word.container.appendChild(widget);
}

/**
 * Build toolbar buttons: Back, Edit, Open public.
 */
export function buildToolbarButtons(word, toolbar) {
    // ===== "Back" button — return to admin =====
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'core-engine-lib-word-toolbar-btn';
    backBtn.setAttribute('data-action', 'word-back');
    backBtn.setAttribute('title', 'Вернуться в админку');
    backBtn.setAttribute('aria-label', 'Вернуться в админку');

    const backIcon = document.createElement('img');
    backIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
    backIcon.src = `${word._iconsBase}/back.svg`;
    backIcon.alt = '';
    backIcon.setAttribute('aria-hidden', 'true');
    backBtn.appendChild(backIcon);

    backBtn.addEventListener('click', () => word._goBack());
    toolbar.appendChild(backBtn);

    // ===== "Edit" button (GrapesJS) =====
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'core-engine-lib-word-toolbar-btn';
    editBtn.setAttribute('data-action', 'word-edit');
    editBtn.setAttribute('title', 'Редактировать (визуальный редактор)');
    editBtn.setAttribute('aria-label', 'Редактировать');

    const editIcon = document.createElement('img');
    editIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
    editIcon.src = `${word._iconsBase}/edit.svg`;
    editIcon.alt = '';
    editIcon.setAttribute('aria-hidden', 'true');
    editBtn.appendChild(editIcon);

    editBtn.addEventListener('click', () => word._openEditor());
    toolbar.appendChild(editBtn);

    // ===== "Open public" button (link) =====
    const publicBtn = document.createElement('button');
    publicBtn.type = 'button';
    publicBtn.className = 'core-engine-lib-word-toolbar-btn';
    publicBtn.setAttribute('data-action', 'word-public');
    publicBtn.setAttribute('title', 'Открыть публичную версию');
    publicBtn.setAttribute('aria-label', 'Открыть публичную версию');

    const publicIcon = document.createElement('img');
    publicIcon.className = 'core-engine-lib-word-toolbar-btn-icon';
    publicIcon.src = `${word._iconsBase}/link.svg`;
    publicIcon.alt = '';
    publicIcon.setAttribute('aria-hidden', 'true');
    publicBtn.appendChild(publicIcon);

    publicBtn.addEventListener('click', () => word._openPublicPage());
    toolbar.appendChild(publicBtn);
}

/**
 * Build article with content only.
 *
 * If page has template_id — loads the template page and applies its layout,
 * inserting page content into the [data-slot="content"] slot (if present).
 *
 * If template has no [data-slot="content"] — template is rendered as-is,
 * page content is not inserted anywhere.
 *
 * GrapesJS saves content wrapped in <body>...</body>. Browsers ignore
 * nested <body> and drop its id, so CSS selectors like #id4l break.
 * We replace <body> with <div> here to preserve the id and make CSS work.
 *
 * <style> blocks are inserted via document.createElement('style') to
 * avoid innerHTML parsing quirks.
 *
 * ★ All page content is wrapped in .core-engine-lib-word-blocks — this
 *   matches the same scope class used inside the editor canvas
 *   (see GrapesLoader._applyScopeClass). Block CSS rules
 *   (.core-engine-lib-word-blocks .btn, ...) only match when this
 *   wrapper is present — both in the editor and on the view page.
 */
export async function buildArticle(word) {
    const raw = word.pageData?.content
        || '<p class="core-engine-lib-word-empty">Контент пуст</p>';

    // ===== Apply template if set =====
    let rawWithTemplate = raw;
    const templateId = word.pageData?.template_id;
    if (templateId) {
        const template = await word._data.loadTemplateById(word, templateId);
        if (template && template.content) {
            rawWithTemplate = applyTemplate(template.content, raw);
            console.log('[Word] Template applied:', templateId);
        } else {
            console.warn('[Word] Template not loaded — rendering page content as-is');
        }
    }

    // Replace <body ...> with <div ...> — keep id, class, style attributes.
    const html = rawWithTemplate
        .replace(/<body(\s[^>]*)?>/i, '<div$1>')
        .replace(/<\/body>/i, '</div>');

    const article = document.createElement('article');
    article.className = 'core-engine-lib-word';

    const contentEl = document.createElement('div');
    contentEl.className = 'core-engine-lib-word-content';
    contentEl.setAttribute('data-js', 'word-content');

    // ★ Scope wrapper — same class the editor adds to iframe body.
    //   Block CSS (.core-engine-lib-word-blocks .btn, ...) matches here.
    const scopeEl = document.createElement('div');
    scopeEl.className = 'core-engine-lib-word-blocks';

    // Extract <style>...</style> blocks
    const styleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
    const styles = styleMatches.map(m => m[1]).join('\n');
    const htmlWithoutStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Insert <style> via createElement — safer than innerHTML
    if (styles.trim()) {
        const styleEl = document.createElement('style');
        styleEl.textContent = styles;
        contentEl.appendChild(styleEl);
    }

    // Insert HTML (without <style>) into the scope wrapper
    const temp = document.createElement('div');
    temp.innerHTML = htmlWithoutStyles;
    while (temp.firstChild) {
        scopeEl.appendChild(temp.firstChild);
    }

    contentEl.appendChild(scopeEl);
    article.appendChild(contentEl);
    return article;
}

/**
 * Apply template: replace [data-slot="content"] innerHTML with page content.
 *
 * If template has no slot — template is rendered as-is (page content skipped).
 * The slot is an optional insertion point; templates render regardless.
 */
export function applyTemplate(templateHtml, contentHtml) {
    const temp = document.createElement('div');
    temp.innerHTML = templateHtml;

    const slot = temp.querySelector('[data-slot="content"]');
    if (!slot) {
        console.warn('[Word] Template has no [data-slot="content"] — rendering template as-is');
        return templateHtml;
    }

    slot.innerHTML = contentHtml;
    return temp.innerHTML;
}

/**
 * Render error state.
 */
export function renderError(word, message) {
    console.log('[Word] _renderError()', message);

    while (word.container.firstChild) {
        word.container.removeChild(word.container.firstChild);
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'core-engine-lib-word-error';

    const icon = document.createElement('div');
    icon.className = 'core-engine-lib-word-error-icon';
    icon.textContent = '⚠️';
    errorDiv.appendChild(icon);

    const title = document.createElement('h2');
    title.className = 'core-engine-lib-word-error-title';
    title.textContent = 'Страница не найдена';
    errorDiv.appendChild(title);

    const text = document.createElement('p');
    text.className = 'core-engine-lib-word-error-text';
    text.textContent = message;
    errorDiv.appendChild(text);

    word.container.appendChild(errorDiv);
}