// app/core/engine/lib/pages/card.js

/**
 * Card renderers for the Pages catalog.
 *
 * Loaded dynamically from pages.js with ?v=<version>:
 *
 *     const cardMod = await import(`./card.js?v=${version}`);
 *     this._card = cardMod;
 *
 *     // then, from the BaseCards props:
 *     renderCard: (item) => this._card.renderArticleCard(item),
 *     renderUpCard: () => this._card.renderUpCard(),
 *
 * These are PURE functions — no `this`, no state, no side effects.
 * They only convert an item (or nothing, for the ".." pseudo-card)
 * into an HTML string. That is why they were moved out of pages.js:
 * the orchestrator grew too big, and the render layer is the most
 * self-contained part of it.
 *
 * Two exports:
 *
 *   renderArticleCard(item) — HTML for a regular card.
 *     Branches on `item.card_type`:
 *       - "folder" → folder icon, title, description, children counter;
 *       - "page"   → logo, title, description, date, badges
 *                    (template / external link).
 *
 *   renderUpCard() — HTML for the ".." pseudo-card
 *     (navigate one level up). Rendered only in folder mode when
 *     `parentId !== null`.
 *
 * The HTML structure and class names are consumed by pages.css.
 * Do not rename classes here without updating pages.css — the
 * styling is by class name.
 *
 * User-facing strings are in Russian. Code comments, docstrings
 * and identifiers are in English.
 */


// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Escape a value for safe interpolation into HTML.
 *
 * Replaces the five characters that can break out of text or an
 * attribute value: & < > " '.
 *
 * Used for every user-provided string (title, description, logo
 * URL). Does NOT sanitize HTML — content is HTML by design and is
 * inserted as-is elsewhere (in word/view, not here). Here we only
 * build the card chrome around that content.
 *
 * @param {*} s
 * @returns {string}
 */
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]));
}


// ============================================
// PUBLIC API
// ============================================

/**
 * Render a card — either a page or a folder.
 *
 * Folders and pages look different:
 *   - a page   — title / description / date / badges;
 *   - a folder — icon, name, "(N)" children counter, no date,
 *                no badges.
 *
 * The ".." pseudo-card is rendered by renderUpCard().
 *
 * @param {Object} item — item from the current list
 * @returns {string}    — HTML string
 */
export function renderArticleCard(item) {
    // ---- Folder ----
    if (item.card_type === 'folder') {
        const childrenCount = Number.isFinite(item.children_count)
            ? item.children_count
            : null;

        const countLabel = childrenCount === null
            ? ''
            : `<span class="pages-folder-count">${childrenCount}</span>`;

        return `
            <div class="pages-folder">
                <div class="pages-folder-icon" aria-hidden="true">📁</div>
                <div class="pages-folder-body">
                    <h3 class="pages-folder-title">${esc(item.title)}</h3>
                    ${item.description ? `<p class="pages-folder-desc">${esc(item.description)}</p>` : ''}
                </div>
                ${countLabel}
            </div>
        `;
    }

    // ---- Regular page ----
    const date = item.datetime
        ? new Date(item.datetime).toLocaleDateString('ru-RU', {
              year: 'numeric', month: 'long', day: 'numeric',
          })
        : '';

    const templateBadge = item.is_template
        ? `<span class="pages-card-badge">Шаблон</span>`
        : '';

    const externalBadge = item.url
        ? `<span class="pages-card-badge pages-card-badge-external" title="Ведёт на внешний сайт">↗</span>`
        : '';

    return `
        <div class="pages-card">
            <div class="pages-card-glow"></div>
            ${item.logo ? `
                <div class="pages-card-logo">
                    <img src="${esc(item.logo)}" alt="${esc(item.title)}">
                </div>
            ` : ''}
            <div class="pages-card-body">
                <h3 class="pages-card-title">${esc(item.title)}</h3>
                ${item.description ? `<p class="pages-card-desc">${esc(item.description)}</p>` : ''}
                ${date ? `<time class="pages-card-date">${esc(date)}</time>` : ''}
                ${templateBadge}
                ${externalBadge}
            </div>
        </div>
    `;
}

/**
 * Render the ".." pseudo-card (go one level up).
 *
 * Styling lives in pages.css → .pages-up.
 *
 * @returns {string} — HTML string
 */
export function renderUpCard() {
    return `
        <div class="pages-up">
            <div class="pages-up-icon" aria-hidden="true">⤴</div>
            <div class="pages-up-body">
                <h3 class="pages-up-title">Вернуться</h3>
                <p class="pages-up-desc">На уровень выше</p>
            </div>
        </div>
    `;
}