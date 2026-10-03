// neurocad/core/engine/lib/base/profile/domain/domain.js

/**
 * BaseProfileDomain — domain management page.
 *
 * Rendered into area-center by Base.showProfile('domain').
 *
 * Three blocks:
 *   1. Free subdomain — read-only. <login>.<APP_DOMAIN> + copy button.
 *   2. Home page — select from the user's pages + Save / Reset.
 *      Drives the "/" redirect on the user's subdomain (and on the
 *      custom domain once it's attached). Falls back to the first
 *      page (ORDER BY datetime ASC) when no explicit choice is made.
 *   3. Custom domain — either:
 *        - input + "Подключить" (when no custom domain is set), or
 *        - the current domain + status badge + "Отключить" button
 *          (when one is set).
 *
 * After submit, the backend checks DNS + Caddy and returns
 * { dns_ok, caddy_available, server_ip, message }. The page renders
 * a DNS-instruction block when dns_ok is false, and a Caddy warning
 * when caddy_available is false.
 *
 * API:
 *   GET    /core/engine/lib/base/profile/domain/
 *   POST   /core/engine/lib/base/profile/domain/add
 *   DELETE /core/engine/lib/base/profile/domain/remove
 *   POST   /core/engine/lib/base/profile/domain/home
 *   DELETE /core/engine/lib/base/profile/domain/home
 *
 * Uses window.coreEngine.fetchJson.
 *
 * Props:
 *   - section        {string}   — 'domain'
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved
 *   - restoreCaption {Function} — (saved) => void
 *   - onNavigate     {Function} — (section) => void
 */
export class BaseProfileDomain {
    constructor(options = {}) {
        console.log('[BaseProfileDomain] Constructor called');

        this.options = options;
        this.section = options.section || 'domain';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;
        this._savedCaption = null;

        // Loaded from the server.
        this.data = null;

        // UI state
        this._submitting = false;
        this._lastError = null;
        this._lastAddInfo = null; // { domain, dns_ok, caddy_available, server_ip, message }

        // Home page UI state.
        this._homeSaving = false;
        this._homeError = null;
        this._homeSaved = false;

        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    async _init() {
        console.log('[BaseProfileDomain] _init() START');
        try {
            await this._load();
            this._initialized = true;
            console.log('[BaseProfileDomain] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseProfileDomain] Init error:', error);
            this._initialized = false;
        }
    }

    _loadCSS() {
        console.log('[BaseProfileDomain] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/profile/domain/domain.css');
        }
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/base/profile/domain';
    }

    async _load() {
        console.log('[BaseProfileDomain] _load()');
        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(`${this._apiBase}/`);
        this.data = json.data || null;
        console.log('[BaseProfileDomain] Loaded:', this.data);
    }

    async _reload() {
        try {
            await this._load();
        } catch (err) {
            console.error('[BaseProfileDomain] Reload error:', err);
        }
        this._rerender();
    }

    _rerender() {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        const newEl = this.render();
        const container = document.querySelector('.core-engine-lib-base-area-center');
        if (container) {
            container.appendChild(newEl);
            this.bindEvents(newEl);
        }
    }

    // ============================================
    // RENDER
    // ============================================

    render() {
        console.log('[BaseProfileDomain] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Домены', 'Управление доменами');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-profile-domain';

        if (!this.data) {
            wrapper.innerHTML = `
                <div class="domain-body">
                    <div class="domain-error">
                        <div class="domain-error-icon">❌</div>
                        <div class="domain-error-text">Не удалось загрузить данные</div>
                        <button type="button" class="domain-btn" data-action="back">Назад</button>
                    </div>
                </div>
            `;
            this.element = wrapper;
            return wrapper;
        }

        wrapper.innerHTML = `
            <div class="domain-body">

                <div class="domain-titlebar">
                    <div class="domain-titlebar-left"></div>
                    <div class="domain-titlebar-title">Управление доменами</div>
                    <div class="domain-titlebar-right">
                        <button type="button" class="domain-icon-btn" data-action="close" title="Закрыть">
                            <span aria-hidden="true">✕</span>
                        </button>
                    </div>
                </div>

                <div class="domain-scroll">
                    ${this._renderSubdomainCard()}
                    ${this._renderHomeCard()}
                    ${this._renderCustomCard()}
                    ${this._renderAddResultBlock()}
                </div>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    _renderSubdomainCard() {
        const sub = this.data.subdomain;
        return `
            <section class="domain-card">
                <div class="domain-card-title">Бесплатный поддомен</div>
                <p class="domain-card-hint">
                    Выдан автоматически при регистрации. Уже работает —
                    сертификат покрывает все <code>*.${this._escapeAttr(sub.root_domain)}</code>.
                </p>
                <div class="domain-copy-row">
                    <input type="text"
                           class="domain-copy-input"
                           readonly
                           value="${this._escapeAttr(sub.subdomain)}">
                    <button type="button"
                            class="domain-btn domain-copy-btn"
                            data-action="copy-subdomain"
                            data-copy="${this._escapeAttr(sub.subdomain)}">
                        Копировать
                    </button>
                </div>
            </section>
        `;
    }

    // ============================================
    // HOME PAGE CARD
    // ============================================

    _renderHomeCard() {
        const pages = this.data.pages || [];
        const homeId = this.data.home_page_id;

        // ---- No pages yet — nothing to choose from ----
        if (!pages.length) {
            return `
                <section class="domain-card">
                    <div class="domain-card-title">Главная страница</div>
                    <p class="domain-card-hint">
                        У вас пока нет страниц. Создайте статью в
                        <a href="/core/engine/pages">каталоге статей</a> — и
                        сможете назначить её главной.
                    </p>
                </section>
            `;
        }

        // ---- Pages exist — render the selector ----
        const optionsHtml = pages.map(p => {
            const selected = (homeId != null && p.id === homeId) ? 'selected' : '';
            return `<option value="${p.id}" ${selected}>${this._escapeAttr(p.title)}</option>`;
        }).join('');

        // Effective home when nothing is chosen explicitly — the
        // same fallback the backend applies in utils/routes.py.
        const firstPage = pages[0];
        const effectiveId = homeId != null ? homeId : firstPage.id;

        const currentLabel = homeId != null
            ? 'Выбрана вручную'
            : 'По умолчанию — первая по дате';

        const statusHtml = this._homeSaved
            ? `<div class="domain-success-inline">Сохранено</div>`
            : (this._homeError
                ? `<div class="domain-error-inline">${this._escapeAttr(this._homeError)}</div>`
                : '');

        return `
            <section class="domain-card">
                <div class="domain-card-title">Главная страница</div>
                <p class="domain-card-hint">
                    Открывается, когда посетитель заходит на ваш поддомен
                    <code>${this._escapeAttr(this.data.subdomain.subdomain)}</code>
                    без пути. Если не выбрать вручную — показывается первая
                    страница по дате.
                </p>

                <div class="domain-form-row">
                    <select class="domain-select"
                            data-js="home-select"
                            ${this._homeSaving ? 'disabled' : ''}>
                        ${optionsHtml}
                    </select>

                    <button type="button"
                            class="domain-btn domain-btn-primary"
                            data-action="home-save"
                            ${this._homeSaving ? 'disabled' : ''}>
                        ${this._homeSaving ? 'Сохраняю…' : 'Сохранить'}
                    </button>

                    ${homeId != null ? `
                        <button type="button"
                                class="domain-btn"
                                data-action="home-clear"
                                ${this._homeSaving ? 'disabled' : ''}>
                            Сбросить
                        </button>
                    ` : ''}
                </div>

                <p class="domain-card-hint domain-card-hint-subtle">
                    ${currentLabel}. Текущая: <b>${this._escapeAttr(
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

    _renderCustomCard() {
        const caddyOff = !this.data.caddy_available;
        const custom = this.data.custom || {};

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
                               ${caddyOff || this._submitting ? 'disabled' : ''}>
                        <button type="button"
                                class="domain-btn domain-btn-primary"
                                data-action="add-domain"
                                ${caddyOff || this._submitting ? 'disabled' : ''}>
                            ${this._submitting ? 'Подключаю…' : 'Подключить'}
                        </button>
                    </div>

                    ${this._lastError ? `
                        <div class="domain-error-inline">${this._escapeAttr(this._lastError)}</div>
                    ` : ''}
                </section>
            `;
        }

        // ---- Custom domain is set — show it with a status badge ----
        const badge = this._statusBadge(custom.status);

        return `
            <section class="domain-card">
                <div class="domain-card-title">Свой домен 2 уровня</div>
                <div class="domain-current-row">
                    <code class="domain-current-name">${this._escapeAttr(custom.domain)}</code>
                    ${badge}
                </div>
                ${custom.message ? `
                    <p class="domain-card-hint">${this._escapeAttr(custom.message)}</p>
                ` : ''}
                <div class="domain-form-row">
                    <button type="button"
                            class="domain-btn domain-btn-danger"
                            data-action="remove-domain"
                            ${this._submitting ? 'disabled' : ''}>
                        ${this._submitting ? 'Отключаю…' : 'Отключить'}
                    </button>
                </div>
            </section>
        `;
    }

    _renderAddResultBlock() {
        const info = this._lastAddInfo;
        if (!info) return '';

        // DNS wrong → show the A-record instructions.
        if (!info.dns_ok) {
            return `
                <section class="domain-card domain-card-warn">
                    <div class="domain-card-title">Настройте DNS</div>
                    <p class="domain-card-hint">
                        Домен <code>${this._escapeAttr(info.domain)}</code> пока
                        не указывает на наш сервер. Добавьте у регистратора:
                    </p>
                    <table class="domain-dns-table">
                        <tr><td>Тип</td><td><code>A</code></td></tr>
                        <tr><td>Имя</td><td><code>@</code> (и <code>www</code>, если нужно)</td></tr>
                        <tr><td>Значение</td><td><code>${this._escapeAttr(info.server_ip || '—')}</code></td></tr>
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

        // Everything ok.
        return `
            <section class="domain-card">
                <div class="domain-card-title">Готово</div>
                <p class="domain-card-hint">
                    ${this._escapeAttr(info.message || 'Домен подключён.')}
                </p>
            </section>
        `;
    }

    _statusBadge(status) {
        switch (status) {
            case 'active':
                return `<span class="domain-badge domain-badge-ok">Активен</span>`;
            case 'dns_fail':
                return `<span class="domain-badge domain-badge-warn">DNS не настроен</span>`;
            case 'caddy_off':
                return `<span class="domain-badge domain-badge-warn">Caddy недоступен</span>`;
            default:
                return `<span class="domain-badge">Неизвестно</span>`;
        }
    }

    // ============================================
    // EVENTS
    // ============================================

    bindEvents(container) {
        console.log('[BaseProfileDomain] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        // Close / back
        const closeBtn = root.querySelector('[data-action="close"], [data-action="back"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof this.onNavigate === 'function') {
                    this.onNavigate('main');
                }
            });
        }

        // Copy subdomain
        const copyBtn = root.querySelector('[data-action="copy-subdomain"]');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this._copySubdomain(copyBtn));
        }

        // Add custom domain
        const addBtn = root.querySelector('[data-action="add-domain"]');
        if (addBtn) {
            addBtn.addEventListener('click', () => this._submitAdd(root));
        }

        // Enter in the domain input submits the form
        const input = root.querySelector('[data-js="domain-input"]');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._submitAdd(root);
                }
            });
        }

        // Remove custom domain
        const removeBtn = root.querySelector('[data-action="remove-domain"]');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this._submitRemove());
        }

        // ---- Home page: save ----
        const homeSave = root.querySelector('[data-action="home-save"]');
        if (homeSave) {
            homeSave.addEventListener('click', () => this._submitHomeSave(root));
        }

        // ---- Home page: clear ----
        const homeClear = root.querySelector('[data-action="home-clear"]');
        if (homeClear) {
            homeClear.addEventListener('click', () => this._submitHomeClear());
        }
    }

    async _copySubdomain(btn) {
        const text = btn.getAttribute('data-copy') || '';
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            const prev = btn.textContent;
            btn.textContent = 'Скопировано';
            setTimeout(() => { btn.textContent = prev || 'Копировать'; }, 1500);
        } catch (err) {
            console.error('[BaseProfileDomain] Copy error:', err);
            btn.textContent = 'Не удалось';
            setTimeout(() => { btn.textContent = 'Копировать'; }, 1500);
        }
    }

    // ============================================
    // SUBMIT — ADD
    // ============================================

    async _submitAdd(root) {
        if (this._submitting) return;

        const input = root.querySelector('[data-js="domain-input"]');
        const domain = (input?.value || '').trim().toLowerCase();

        this._lastError = null;

        if (!domain) {
            this._lastError = 'Введите домен';
            this._rerender();
            return;
        }

        this._submitting = true;
        this._lastAddInfo = null;
        this._rerender();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(`${this._apiBase}/add`, {
                method: 'POST',
                body: { domain },
            });

            this._lastAddInfo = data.data || null;
            console.log('[BaseProfileDomain] Add result:', this._lastAddInfo);
        } catch (err) {
            console.error('[BaseProfileDomain] Add error:', err);

            // The server returns detail on 400 / 409.
            this._lastError = err?.message || 'Не удалось подключить домен';
        }

        this._submitting = false;
        await this._reload();
    }

    // ============================================
    // SUBMIT — REMOVE
    // ============================================

    async _submitRemove() {
        if (this._submitting) return;

        this._submitting = true;
        this._lastError = null;
        this._lastAddInfo = null;
        this._rerender();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson(`${this._apiBase}/remove`, { method: 'DELETE' });
        } catch (err) {
            console.error('[BaseProfileDomain] Remove error:', err);
            this._lastError = err?.message || 'Не удалось отключить домен';
        }

        this._submitting = false;
        await this._reload();
    }

    // ============================================
    // SUBMIT — HOME PAGE
    // ============================================

    async _submitHomeSave(root) {
        if (this._homeSaving) return;

        const select = root.querySelector('[data-js="home-select"]');
        const raw = select?.value;
        const pageId = parseInt(raw, 10);

        if (!Number.isFinite(pageId)) {
            this._homeError = 'Выберите страницу';
            this._homeSaved = false;
            this._rerender();
            return;
        }

        this._homeSaving = true;
        this._homeError = null;
        this._homeSaved = false;
        this._rerender();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson(`${this._apiBase}/home`, {
                method: 'POST',
                body: { page_id: pageId },
            });

            this._homeSaved = true;
            console.log('[BaseProfileDomain] Home page set:', pageId);
        } catch (err) {
            console.error('[BaseProfileDomain] Home save error:', err);
            this._homeError = err?.message || 'Не удалось сохранить';
        }

        this._homeSaving = false;
        await this._reload();

        // Auto-clear the "Сохранено" badge after a moment.
        if (this._homeSaved) {
            setTimeout(() => {
                this._homeSaved = false;
                // Only redraw if the element is still on screen.
                if (this.element && this.element.isConnected) {
                    this._rerender();
                }
            }, 2000);
        }
    }

    async _submitHomeClear() {
        if (this._homeSaving) return;

        this._homeSaving = true;
        this._homeError = null;
        this._homeSaved = false;
        this._rerender();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            await fetchJson(`${this._apiBase}/home`, { method: 'DELETE' });

            console.log('[BaseProfileDomain] Home page cleared');
        } catch (err) {
            console.error('[BaseProfileDomain] Home clear error:', err);
            this._homeError = err?.message || 'Не удалось сбросить';
        }

        this._homeSaving = false;
        await this._reload();
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _escapeAttr(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ============================================
    // PUBLIC
    // ============================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    destroy() {
        console.log('[BaseProfileDomain] destroy()');

        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
        this._submitting = false;
        this._lastError = null;
        this._lastAddInfo = null;
        this._homeSaving = false;
        this._homeError = null;
        this._homeSaved = false;
    }
}