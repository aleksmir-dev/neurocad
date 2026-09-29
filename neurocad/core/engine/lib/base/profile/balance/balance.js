// neurocad/core/engine/lib/base/profile/balance/balance.js

/**
 * BaseProfileBalance — balance page.
 *
 * Rendered into area-center by Base.showProfile('balance').
 * Loads the current user's balance via
 * GET /core/engine/lib/base/profile/balance/me.
 *
 * Layout:
 *   - titlebar      — fixed at the top (close)
 *   - status / error — fixed, just below the titlebar
 *   - balance cards — scrollable: tariff + limits + remaining
 *
 * Tariff change:
 *   The "Сменить тариф" button inside the tariff card (right of the
 *   tariff name) opens tarif/tarif.js — a modal with the list of
 *   tariffs. On successful change, onSaved() reloads the balance
 *   (the modal itself handles the "insufficient funds" case with
 *   an SBP link).
 *
 * Uses window.coreEngine.fetchJson — loaded once by CoreEngine.loadApi().
 *
 * Props:
 *   - section        {string}   — 'balance'
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved; sets the caption
 *   - restoreCaption {Function} — (saved) => void; restores the caption
 *   - onNavigate     {Function} — (section) => void, switches back to 'main'
 *
 * Caption: BaseProfileBalance saves the current header/tab title on open
 * and restores it on destroy.
 */
export class BaseProfileBalance {
    constructor(options = {}) {
        console.log('[BaseProfileBalance] Constructor called');

        this.options = options;
        this.section = options.section || 'balance';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;
        this._savedCaption = null;

        // Loaded from the server.
        this.balance = null;

        // Active tariff modal (if open).
        this.tarifModal = null;

        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    async _init() {
        console.log('[BaseProfileBalance] _init() START');
        try {
            await this._loadBalance();
            this._initialized = true;
            console.log('[BaseProfileBalance] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseProfileBalance] Init error:', error);
            this._initialized = false;
            // Do not rethrow — render() will show the error state.
        }
    }

    _loadCSS() {
        console.log('[BaseProfileBalance] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/profile/balance/balance.css');
        }
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/base/profile/balance';
    }

    async _loadBalance() {
        console.log('[BaseProfileBalance] _loadBalance()');

        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(`${this._apiBase}/me`);

        this.balance = json.data || null;

        console.log('[BaseProfileBalance] Balance loaded:', this.balance);
    }

    async _reload() {
        console.log('[BaseProfileBalance] _reload()');

        try {
            await this._loadBalance();
        } catch (err) {
            console.error('[BaseProfileBalance] Reload error:', err);
        }

        // Rebuild the whole view.
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
        console.log('[BaseProfileBalance] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Баланс', 'Баланс');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-profile-balance';

        if (!this.balance) {
            wrapper.innerHTML = `
                <div class="balance-body">
                    <div class="balance-error">
                        <div class="balance-error-icon">❌</div>
                        <div class="balance-error-text">Не удалось загрузить баланс</div>
                        <button type="button" class="balance-btn" data-action="back">Назад</button>
                    </div>
                </div>
            `;
            this.element = wrapper;
            return wrapper;
        }

        wrapper.innerHTML = `
            <div class="balance-body">

                <div class="balance-titlebar">
                    <div class="balance-titlebar-left"></div>
                    <div class="balance-titlebar-title">Баланс</div>
                    <div class="balance-titlebar-right">
                        <button type="button" class="balance-icon-btn" data-action="close" title="Закрыть">
                            <span aria-hidden="true">✕</span>
                        </button>
                    </div>
                </div>

                <div class="balance-scroll">
                    ${this._renderTariffCard()}
                    ${this._renderBalanceCards()}
                    ${this._renderLimitCards()}
                </div>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    _renderTariffCard() {
        const b = this.balance;
        const label = b.tarif_label || 'Free';

        // Price is in rubles. Hide if 0 (free).
        const priceHtml = (b.price > 0)
            ? `<div class="balance-card-hint">Стоимость: ${b.price} ₽</div>`
            : '';
        const dayHtml = b.day
            ? `<div class="balance-card-hint">Расчётный день месяца: ${b.day}</div>`
            : '';

        return `
            <section class="balance-card balance-card-tariff">
                <div class="balance-card-title">Тариф</div>

                <div class="balance-tariff-row">
                    <div class="balance-tariff-name">${this._escapeAttr(label)}</div>
                    <button type="button"
                            class="balance-tariff-change-btn"
                            data-action="tarif">
                        Сменить тариф
                    </button>
                </div>

                ${dayHtml}
                ${priceHtml}
            </section>
        `;
    }

    _renderBalanceCards() {
        const b = this.balance;
        const rows = [
            ['Генерации',   b.gen,     null],
            ['Токены LLM',  b.tokens,  b.limit_tokens],
            ['Страницы',    b.pages,   b.limit_pages],
            ['Хранилище',   b.mb,      b.limit_mb, 'mb'],
            ['Средства',    b.sum,     null,       'rub'],
        ];

        const items = rows.map(([label, value, limit, unit]) => {
            // 0 in limit means "no limit" for everything
            // except limit_tokens, where 0 means "no LLM".
            let limitHtml = '';
            if (limit != null) {
                if (label === 'Токены LLM') {
                    limitHtml = limit > 0
                        ? `<span class="balance-item-limit">из ${this._formatNumber(limit)}</span>`
                        : '';
                } else {
                    limitHtml = limit > 0
                        ? `<span class="balance-item-limit">из ${this._formatNumber(limit)}</span>`
                        : `<span class="balance-item-limit">без ограничений</span>`;
                }
            }

            const displayValue = unit === 'mb'
                ? this._formatStorage(value)
                : (unit === 'rub'
                    ? `${this._formatNumber(value)} ₽`
                    : this._formatNumber(value));

            return `
                <div class="balance-item">
                    <span class="balance-item-label">${this._escapeAttr(label)}</span>
                    <span class="balance-item-value">
                        <span class="balance-item-current">${displayValue}</span>
                        ${limitHtml}
                    </span>
                </div>
            `;
        }).join('');

        return `
            <section class="balance-card">
                <div class="balance-card-title">Остатки</div>
                <div class="balance-list">${items}</div>
            </section>
        `;
    }

    _renderLimitCards() {
        const b = this.balance;

        // Generation accrual: at most one of limit_genday / limit_genmon
        // is non-zero for a given tariff (see TARIF_PRESETS).
        // Show the active one as "X / день" or "X / месяц".
        let genAccrual = '—';
        if (b.limit_genday > 0) {
            genAccrual = `${this._formatNumber(b.limit_genday)} / день`;
        } else if (b.limit_genmon > 0) {
            genAccrual = `${this._formatNumber(b.limit_genmon)} / месяц`;
        }

        const rows = [
            ['Начисление генераций', genAccrual],
            ['Токены LLM',           b.limit_tokens, 'llm'],
            ['Страницы',             b.limit_pages],
            ['Хранилище',            b.limit_mb,    'mb'],
        ];

        const items = rows.map(([label, value, kind]) => {
            let display;
            if (label === 'Начисление генераций') {
                // Already formatted above (string).
                display = value;
            } else if (kind === 'llm') {
                display = value > 0 ? this._formatNumber(value) : '—';
            } else if (kind === 'mb') {
                display = value > 0 ? this._formatStorage(value) : 'без ограничений';
            } else {
                display = value > 0 ? this._formatNumber(value) : 'без ограничений';
            }

            return `
                <div class="balance-item">
                    <span class="balance-item-label">${this._escapeAttr(label)}</span>
                    <span class="balance-item-value">
                        <span class="balance-item-current">${display}</span>
                    </span>
                </div>
            `;
        }).join('');

        return `
            <section class="balance-card">
                <div class="balance-card-title">Лимиты</div>
                <div class="balance-list">${items}</div>
            </section>
        `;
    }

    // ============================================
    // EVENTS
    // ============================================

    bindEvents(container) {
        console.log('[BaseProfileBalance] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        root.querySelectorAll('[data-action="close"], [data-action="back"]').forEach(btn => {
            btn.addEventListener('click', () => this._handleBack());
        });

        const tarifBtn = root.querySelector('[data-action="tarif"]');
        if (tarifBtn) {
            tarifBtn.addEventListener('click', () => this._openTarif());
        }
    }

    _handleBack() {
        console.log('[BaseProfileBalance] _handleBack()');
        if (typeof this.onNavigate === 'function') {
            this.onNavigate('main');
        }
    }

    // ============================================
    // TARIFF MODAL
    // ============================================

    async _openTarif() {
        console.log('[BaseProfileBalance] _openTarif()');

        if (this.tarifModal) {
            // Already open — do not open a second copy.
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();
        let TarifChange;
        try {
            const mod = await import(`./tarif/tarif.js?v=${version}`);
            TarifChange = mod.TarifChange;
        } catch (err) {
            console.error('[BaseProfileBalance] tarif.js load error:', err);
            return;
        }

        this.tarifModal = new TarifChange({
            userId: this.user?.id || null,
            onSaved: async (data) => {
                console.log('[BaseProfileBalance] Tariff changed:', data);
                await this._reload();
            },
            onClose: () => { this.tarifModal = null; },
        });

        if (this.tarifModal._initPromise) {
            await this.tarifModal._initPromise;
        }
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _formatNumber(n) {
        return String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    /**
     * Human-readable storage: 100 → "100 МБ", 1024 → "1 ГБ".
     * Stored in megabytes (see Balance model).
     */
    _formatStorage(mb) {
        const v = Number(mb) || 0;
        if (v >= 1024) {
            const gb = v / 1024;
            return `${gb.toFixed(1).replace(/\.0$/, '')} ГБ`;
        }
        return `${v} МБ`;
    }

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
        console.log('[BaseProfileBalance] destroy()');

        if (this.tarifModal?.destroy) {
            this.tarifModal.destroy();
        }
        this.tarifModal = null;

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
    }
}