// neurocad/core/engine/lib/base/profile/domain/cards.js

/**
 * Card renderers for the domain page.
 *
 * This is a FACTORY: makeCards(helpers) returns an object with five
 * render functions, each closed over the passed helpers. The factory
 * pattern exists because the whole project uses dynamic imports with
 * a cache-busting `?v=` — helpers.js cannot be imported statically
 * here without losing that cache-busting.
 *
 * Usage in domain.js:
 *
 *     const helpers = await import(`./helpers.js?v=${version}`);
 *     const cards   = await import(`./cards.js?v=${version}`);
 *     this._cards = cards.makeCards(helpers);
 *
 * Each render function takes the server `data` payload (this.data in
 * the BaseProfileDomain instance) plus whatever transient state it
 * needs (submitting flag, error text, saved flag, last add-result
 * info), and returns an HTML string.
 *
 * Pure functions — no access to the BaseProfileDomain instance, no
 * event binding. The orchestrator (domain.js) assembles the strings
 * into the page and binds events by data-action attributes.
 *
 * PROTECTED DOMAINS
 * -----------------
 * A few domains belong to the platform itself, not to any user:
 *
 *     neurocad.ru, neurocad-dev.ru, neurocad-demo.ru
 *
 * (and any subdomain of those.) They are listed here so the UI can
 * disable the "Отключить" button for them — a user (or an admin in
 * a hurry) must not be able to detach the platform's own root by
 * accident, because that would immediately send it into Caddy's
 * "delete certificate" queue.
 *
 * This is a UI-level guard only. The backend also refuses the
 * request (see PROTECTED_DOMAINS in service.py → is_protected_domain
 * and, if added, the guard in route.py → DELETE /remove). Keep the
 * two lists in sync — three names, one place each.
 *
 * The check covers suffixes as well: any `<something>.neurocad.ru`
 * is protected too, so a future subdomain of the platform cannot be
 * accidentally detached.
 */

export function makeCards(helpers) {
    const { fullUrl, escapeAttr, statusBadge } = helpers;

    // ============================================
    // PROTECTED DOMAINS — must match service.py
    // ============================================
    //
    // Three apex names that belong to the platform. The "Отключить"
    // button is disabled for any of them (and for any of their
    // subdomains). See the module docstring for why.
    const PROTECTED_DOMAINS = new Set([
        'neurocad.ru',
        'neurocad-dev.ru',
        'neurocad-demo.ru',
    ]);

    /**
     * True if `host` is one of the platform's own domains, or a
     * subdomain of one.
     *
     * Normalizes the input: lowercases, strips one trailing dot
     * ("example.com." → "example.com"). Returns false for empty
     * input — the caller then renders the button normally.
     */
    function isProtectedDomain(host) {
        const h = String(host ?? '').toLowerCase().replace(/\.$/, '');
        if (!h) return false;
        if (PROTECTED_DOMAINS.has(h)) return true;
        // Any subdomain of a protected apex is protected too.
        return [...PROTECTED_DOMAINS].some(d => h.endsWith('.' + d));
    }

    // ============================================
    // SUBDOMAIN CARD
    // ============================================

    function renderSubdomainCard(data) {
        const sub = data.subdomain;
        const url = fullUrl(sub.subdomain);

        return `
            <section class="domain-card">
                <div class="domain-card-title">Бесплатный поддомен</div>
                <p class="domain-card-hint">
                    Выдан автоматически при регистрации:
                </p>
                <div class="domain-link-row">
                    <a class="domain-link"
                       href="${escapeAttr(url)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       title="${escapeAttr(url)}">${escapeAttr(url)}</a>
                    <button type="button"
                            class="domain-btn domain-copy-btn"
                            data-action="copy-link"
                            data-copy="${escapeAttr(url)}"
                            title="Копировать ссылку">
                        Копировать
                    </button>
                </div>
                <div class="domain-form-row">
                    <button type="button"
                            class="domain-btn"
                            data-action="edit-robots"
                            data-which="3">
                        Редактировать robots.txt
                    </button>
                </div>
            </section>
        `;
    }

    // ============================================
    // HOME PAGE CARD
    // ============================================

    function renderHomeCard(data, state) {
        const pages = data.pages || [];
        const homeId = data.home_page_id;
        const { homeSaving, homeError, homeSaved } = state;

        // ---- No pages yet — nothing to choose from ----
        if (!pages.length) {
            // Build the link to the article catalog from the current
            // module's base URL — window.coreEngine.baseUrl already
            // carries the module prefix (e.g. /core/engine/admin).
            const baseUrl = window.coreEngine?.baseUrl || '/core/engine/admin';
            const catalogUrl = `${baseUrl}/pages`;

            return `
                <section class="domain-card">
                    <div class="domain-card-title">Главная страница</div>
                    <p class="domain-card-hint">
                        У вас пока нет страниц. Создайте статью в
                        <a href="${escapeAttr(catalogUrl)}">каталоге статей</a> — и
                        сможете назначить её главной.
                    </p>
                </section>
            `;
        }

        // ---- Pages exist — render the selector ----
        const optionsHtml = pages.map(p => {
            const selected = (homeId != null && p.id === homeId) ? 'selected' : '';
            return `<option value="${p.id}" ${selected}>${escapeAttr(p.title)}</option>`;
        }).join('');

        // Effective home when nothing is chosen explicitly — the same
        // fallback the backend applies in utils/routes.py.
        const firstPage = pages[0];
        const effectiveId = homeId != null ? homeId : firstPage.id;

        const currentLabel = homeId != null
            ? 'Выбрана вручную'
            : 'По умолчанию — первая по дате';

        const statusHtml = homeSaved
            ? `<div class="domain-success-inline">Сохранено</div>`
            : (homeError
                ? `<div class="domain-error-inline">${escapeAttr(homeError)}</div>`
                : '');

        return `
            <section class="domain-card">
                <div class="domain-card-title">Главная страница</div>
                <p class="domain-card-hint">
                    Открывается, когда посетитель заходит на ваш поддомен
                    <code>${escapeAttr(data.subdomain.subdomain)}</code>
                    без пути. Если не выбрать вручную — показывается первая
                    страница по дате.
                </p>

                <div class="domain-form-row">
                    <select class="domain-select"
                            data-js="home-select"
                            ${homeSaving ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>

                    <button type="button"
                            class="domain-btn domain-btn-primary"
                            data-action="home-save"
                            ${homeSaving ? 'disabled' : ''}>
                        ${homeSaving ? 'Сохраняю…' : 'Сохранить'}
                    </button>

                    ${homeId != null ? `
                        <button type="button"
                                class="domain-btn"
                                data-action="home-clear"
                                ${homeSaving ? 'disabled' : ''}>
                            Сбросить
                        </button>
                    ` : ''}
                </div>

                <p class="domain-card-hint domain-card-hint-subtle">
                    ${currentLabel}. Текущая: <b>${escapeAttr(
                        (pages.find(p => p.id === effectiveId) || firstPage).title
                    )}</b>
                </p>

                ${statusHtml}
            </section>
        `;
    }

    // ============================================
    // CUSTOM DOMAIN CARD
    // ============================================

    function renderCustomCard(data, state) {
        const caddyOff = !data.caddy_available;
        const custom = data.custom || {};
        const { submitting, lastError } = state;

        // ---- No custom domain yet — show the input form ----
        if (!custom.domain) {
            return `
                <section class="domain-card">
                    <div class="domain-card-title">Свой домен 2 уровня</div>
                    <p class="domain-card-hint">
                        Введите домен, который вы уже купили у регистратора
                        (например, <code>mystite.com</code>). Мы проверим,
                        что он смотрит на наш сервер, и выпустим сертификат.
                    </p>

                    ${caddyOff ? `
                        <div class="domain-warning">
                            ⚠️ Сервер Caddy не найден. Подключение доменов временно
                            недоступно.
                        </div>
                    ` : ''}

                    <div class="domain-form-row">
                        <input type="text"
                               class="domain-input"
                               data-js="domain-input"
                               placeholder="mystite.com"
                               ${caddyOff || submitting ? 'disabled' : ''}>
                        <button type="button"
                                class="domain-btn domain-btn-primary"
                                data-action="add-domain"
                                ${caddyOff || submitting ? 'disabled' : ''}>
                            ${submitting ? 'Подключаю…' : 'Подключить'}
                        </button>
                    </div>

                    ${lastError ? `
                        <div class="domain-error-inline">${escapeAttr(lastError)}</div>
                    ` : ''}
                </section>
            `;
        }

        // ---- Custom domain is set — show it as a clickable link ----
        //
        // If the domain belongs to the platform itself (neurocad.ru
        // or a sibling), the "Отключить" button is disabled: an
        // accidental click would detach the platform's root domain
        // and put its certificate into Caddy's deletion queue. The
        // backend guards this too — see the module docstring.
        const customProtected = isProtectedDomain(custom.domain);

        const badge = statusBadge(custom.status);
        const url = fullUrl(custom.domain);

        const removeTitle = customProtected
            ? 'Системный домен — отключение запрещено'
            : 'Отключить домен';

        return `
            <section class="domain-card">
                <div class="domain-card-title">Свой домен 2 уровня</div>
                <div class="domain-link-row">
                    <a class="domain-link"
                       href="${escapeAttr(url)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       title="${escapeAttr(url)}">${escapeAttr(url)}</a>
                    <button type="button"
                            class="domain-btn domain-copy-btn"
                            data-action="copy-link"
                            data-copy="${escapeAttr(url)}"
                            title="Копировать ссылку">
                        Копировать
                    </button>
                    ${badge}
                </div>
                ${custom.message ? `
                    <p class="domain-card-hint">${escapeAttr(custom.message)}</p>
                ` : ''}
                <div class="domain-form-row">
                    <button type="button"
                            class="domain-btn"
                            data-action="edit-robots"
                            data-which="2"
                            ${submitting ? 'disabled' : ''}>
                        Редактировать robots.txt
                    </button>
                    <button type="button"
                            class="domain-btn domain-btn-danger"
                            data-action="remove-domain"
                            ${submitting || customProtected ? 'disabled' : ''}
                            title="${escapeAttr(removeTitle)}">
                        ${submitting ? 'Отключаю…' : 'Отключить'}
                    </button>
                </div>
            </section>
        `;
    }

    // ============================================
    // ADD-RESULT BLOCK
    // ============================================

    function renderAddResultBlock(info) {
        if (!info) return '';

        // DNS wrong → show the A-record instructions.
        if (!info.dns_ok) {
            return `
                <section class="domain-card domain-card-warn">
                    <div class="domain-card-title">Настройте DNS</div>
                    <p class="domain-card-hint">
                        Домен <code>${escapeAttr(info.domain)}</code> пока
                        не указывает на наш сервер. Добавьте у регистратора:
                    </p>
                    <table class="domain-dns-table">
                        <tr><td>Тип</td><td><code>A</code></td></tr>
                        <tr><td>Имя</td><td><code>@</code> (и <code>www</code>, если нужно)</td></tr>
                        <tr><td>Значение</td><td><code>${escapeAttr(info.server_ip || '—')}</code></td></tr>
                        <tr><td>TTL</td><td>по умолчанию (обычно 3600)</td></tr>
                    </table>
                    <p class="domain-card-hint">
                        После сохранения записи подождите 5–30 минут и обновите
                        страницу — статус обновится автоматически.
                    </p>
                </section>
            `;
        }

        // DNS ok, Caddy off.
        if (!info.caddy_available) {
            return `
                <section class="domain-card domain-card-warn">
                    <div class="domain-card-title">Сервер Caddy недоступен</div>
                    <p class="domain-card-hint">
                        DNS настроен верно, но сервер выпуска сертификатов
                        не отвечает. Обратитесь к администратору.
                    </p>
                </section>
            `;
        }

        // Everything ok — final block with the clickable URL.
        const url = fullUrl(info.domain);

        return `
            <section class="domain-card">
                <div class="domain-card-title">Готово</div>
                <p class="domain-card-hint">
                    ${escapeAttr(info.message || 'Домен подключён.')}
                </p>
                <div class="domain-link-row">
                    <a class="domain-link"
                       href="${escapeAttr(url)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       title="${escapeAttr(url)}">${escapeAttr(url)}</a>
                    <button type="button"
                            class="domain-btn domain-copy-btn"
                            data-action="copy-link"
                            data-copy="${escapeAttr(url)}"
                            title="Копировать ссылку">
                        Копировать
                    </button>
                </div>
            </section>
        `;
    }

    // ============================================
    // SITEMAP CARD
    // ============================================

    /**
     * Sitemap section — sits at the very bottom of the domain page.
     *
     * Not a "card" in the sense of the three main blocks: no inputs,
     * no save, no state. Just an explanation and one button that opens
     * the read-only viewer (./sitemap.js).
     */
    function renderSitemapCard(data) {
        // Hint line — show the real public URL when we know it.
        // Prefer the custom domain, fall back to the subdomain, then
        // to a bare relative path.
        const publicHost = (() => {
            const custom = data?.custom?.domain;
            if (custom) return `https://${custom}`;
            const sub = data?.subdomain?.subdomain;
            if (sub) return `https://${sub}`;
            return '';
        })();
        const publicUrl = publicHost ? `${publicHost}/sitemap.xml` : '/sitemap.xml';

        return `
            <section class="domain-card">
                <div class="domain-card-title">Карта сайта</div>
                <p class="domain-card-hint">
                    Файл <code>sitemap.xml</code> генерируется на лету из ваших
                    страниц и доступен по адресу
                    <code>${escapeAttr(publicUrl)}</code>.
                    Ничего не нужно обновлять вручную — поисковые системы
                    всегда видят актуальную версию.
                </p>
                <div class="domain-form-row">
                    <button type="button"
                            class="domain-btn"
                            data-action="view-sitemap">
                        Просмотреть sitemap.xml
                    </button>
                </div>
            </section>
        `;
    }

    // ============================================
    // PUBLIC
    // ============================================

    return {
        renderSubdomainCard,
        renderHomeCard,
        renderCustomCard,
        renderAddResultBlock,
        renderSitemapCard,
    };
}