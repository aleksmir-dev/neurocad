// neurocad/core/engine/lib/base/profile/balance/tarif/tarif.js

/**
 * TarifChange — modal for switching the user's tariff.
 *
 * Rendered as a full-screen overlay (same style as balance/edit/paid):
 *   .core-engine-lib-balance-tarif          (overlay, .active → display:flex)
 *     └── .window
 *         ├── .title-bar   (title + close)
 *         └── .content
 *             ├── .tarif-status      (inline status / error)
 *             ├── .tarif-body        (list of tariff cards)
 *             └── .actions-bar       (Закрыть / Оплатить (if sbp_url))
 *
 * Data flow:
 *   1. _init() → GET /core/engine/lib/base/profile/balance/tarif/list
 *   2. render() → list of tariff cards; current tariff highlighted
 *   3. click "Выбрать" → POST .../tarif/change
 *   4. on success → onSaved(data), destroy()
 *   5. on insufficient_funds → open a separate image modal with the
 *      QR (createModal('image')), WITHOUT closing the tariff modal.
 *
 * Tariffs:
 *   The list comes pre-sorted from the server (trial, free, pro, llm).
 *   Trial (3) is NOT selectable by the user — its "Выбрать" button is
 *   always disabled. Trial is granted automatically on registration.
 *
 * QR-код:
 *   The admin uploads a PNG via the balance admin page; it lives at
 *   media/<admin_nav_id>/qr.png. The tarif service resolves the
 *   admin's nav (QR is a single project-wide resource) and returns
 *   the public URL in `sbp_qr`.
 *
 *   The QR is shown in a separate modal (BaseModalImage), together
 *   with the "укажите ваш логин в комментарии" hint.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Namespace: CoreEngineLibBaseProfileBalanceTarif*
 */

export class TarifChange {
    constructor(options = {}) {
        console.log('[TarifChange] Constructor', options);

        this.options = options;
        this.userId = options.userId || null;
        this.onSaved = options.onSaved || null;
        this.onClose = options.onClose || null;

        // Current user's login — shown in the QR hint.
        this.userLogin = null;

        // Loaded data
        this.data = null;
        this.tarifs = [];
        this.currentTarif = 0;
        this.currentSum = 0;
        this.sbpUrl = null;
        this.sbpQr = null;

        // UI state
        this.isSaving = false;
        this.pendingTarif = null;

        // DOM
        this.container = null;
        this.bodyEl = null;
        this.statusEl = null;
        this.sbpBtn = null;

        this._escHandler = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/base/profile/balance/tarif/tarif.css');
        }
    }

    async _init() {
        console.log('[TarifChange] _init() START, user =', this.userId);

        // Current user's login — for the "укажите логин в комментарии" hint.
        try {
            const u = window.coreEngine?.auth?.getUser?.();
            if (u) this.userLogin = u.login || null;
        } catch (e) {
            console.warn('[TarifChange] getUser failed:', e);
        }

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(
                '/core/engine/lib/base/profile/balance/tarif/list'
            );

            this.data = json;
            this.tarifs = json.tarifs || [];
            this.currentTarif = json.current_tarif ?? 0;
            this.currentSum = json.sum ?? 0;
            this.sbpUrl = json.sbp_url || null;
            this.sbpQr = json.sbp_qr || null;

            console.log(
                '[TarifChange] Loaded tarifs:', this.tarifs.length,
                'current:', this.currentTarif,
                'qr:', !!this.sbpQr,
                'sbp_url:', !!this.sbpUrl,
                'login:', this.userLogin
            );
        } catch (err) {
            console.error('[TarifChange] Load error:', err);
            this.error = err?.data?.detail || err.message || 'load_failed';
            return;
        }

        this._createDOM();
        this._bindEvents();
        this._renderList();
        this.container.classList.add('active');
    }

    // ============================================
    // DOM
    // ============================================

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-balance-tarif');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'core-engine-lib-balance-tarif';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Смена тарифа</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="tarif-status" data-role="status" style="display:none;"></div>
                    <div class="tarif-body" data-role="body"></div>
                    <div class="actions-bar">
                        <button type="button" class="btn btn-white cancel-btn">Закрыть</button>
                        <button type="button" class="btn btn-primary pay-btn" style="display:none;">Оплатить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        this.container = container;
        this.bodyEl = container.querySelector('[data-role="body"]');
        this.statusEl = container.querySelector('[data-role="status"]');
        this.cancelBtn = container.querySelector('.cancel-btn');
        this.closeBtn = container.querySelector('.close-btn');
        this.sbpBtn = container.querySelector('.pay-btn');
    }

    _bindEvents() {
        this.closeBtn.addEventListener('click', () => this._handleClose());
        this.cancelBtn.addEventListener('click', () => this._handleClose());

        // SBP button (external link) — open in a new tab.
        this.sbpBtn.addEventListener('click', () => {
            if (this.sbpUrl) {
                window.open(this.sbpUrl, '_blank', 'noopener,noreferrer');
            }
        });

        // Click on overlay (outside .window) — close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) this._handleClose();
        });

        // Escape — close (but not while saving)
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this._handleClose();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        // Delegated click on tariff cards' "Выбрать" buttons
        this.bodyEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="choose"]');
            if (!btn) return;
            const tarif = parseInt(btn.dataset.tarif, 10);
            if (!Number.isFinite(tarif)) return;
            this._handleChoose(tarif);
        });
    }

    // ============================================
    // RENDER
    // ============================================

    _renderList() {
        if (!this.tarifs.length) {
            this.bodyEl.innerHTML = `
                <div class="tarif-empty">Не удалось загрузить тарифы</div>
            `;
            return;
        }

        this.bodyEl.innerHTML = this.tarifs.map((t) => this._renderCard(t)).join('');
    }

    _renderCard(t) {
        const isCurrent = t.tarif === this.currentTarif;
        const isTrial = t.tarif === 3;
        const canAfford = this.currentSum >= t.price;
        const priceLabel = t.price > 0 ? `${t.price} ₽` : 'Бесплатно';

        let btnClass = 'tarif-card-btn';
        let btnText = 'Выбрать';
        let btnDisabled = false;
        let btnAction = 'choose';

        if (isCurrent) {
            btnClass += ' tarif-card-btn-current';
            btnText = 'Текущий';
            btnDisabled = true;
            btnAction = 'none';
        } else if (isTrial) {
            // Trial is not selectable by the user — granted automatically.
            btnClass += ' tarif-card-btn-current';
            btnText = 'По регистрации';
            btnDisabled = true;
            btnAction = 'none';
        } else if (!canAfford) {
            btnClass += ' tarif-card-btn-pay';
            btnText = 'Оплатить';
        }

        return `
            <div class="tarif-card ${isCurrent ? 'tarif-card-active' : ''}"
                 data-tarif="${t.tarif}">
                <div class="tarif-card-header">
                    <div class="tarif-card-title">
                        ${this._escape(t.label)}
                        ${isCurrent ? '<span class="tarif-card-badge">текущий</span>' : ''}
                    </div>
                    <div class="tarif-card-price">${this._escape(priceLabel)}</div>
                </div>

                <div class="tarif-card-desc">${this._escape(t.description)}</div>

                <ul class="tarif-card-limits">
                    ${this._renderLimitRow('Статей', t.limit_pages)}
                    ${this._renderGenAccrualRow(t)}
                    ${this._renderLimitRow('Хранилище, МБ', t.limit_mb)}
                    ${this._renderLimitRow('LLM-токенов', t.limit_tokens)}
                </ul>

                <div class="tarif-card-actions">
                    <button type="button"
                            class="${btnClass}"
                            data-action="${btnAction}"
                            data-tarif="${t.tarif}"
                            ${btnDisabled ? 'disabled' : ''}>
                        ${btnText}
                    </button>
                </div>
            </div>
        `;
    }

    _renderLimitRow(label, value) {
        let display;
        if (label === 'LLM-токенов') {
            display = value > 0 ? this._formatNumber(value) : '—';
        } else {
            display = value > 0 ? this._formatNumber(value) : 'без ограничений';
        }
        return `
            <li class="tarif-card-limit">
                <span class="tarif-card-limit-label">${this._escape(label)}</span>
                <span class="tarif-card-limit-value">${display}</span>
            </li>
        `;
    }

    /**
     * One row for "Начисление генераций".
     *
     * At most one of limit_genday / limit_genmon is non-zero per tariff.
     *   limit_genday > 0 → "N / день"
     *   limit_genmon > 0 → "N / месяц"
     *   both 0           → "—" (LLM tariff — no generation accrual,
     *                        unlimited generations via tokens)
     */
    _renderGenAccrualRow(t) {
        let display = '—';
        if (t.limit_genday > 0) {
            display = `${this._formatNumber(t.limit_genday)} / день`;
        } else if (t.limit_genmon > 0) {
            display = `${this._formatNumber(t.limit_genmon)} / месяц`;
        }

        return `
            <li class="tarif-card-limit">
                <span class="tarif-card-limit-label">Начисление генераций</span>
                <span class="tarif-card-limit-value">${display}</span>
            </li>
        `;
    }

    // ============================================
    // CHANGE
    // ============================================

    async _handleChoose(tarif) {
        if (this.isSaving) return;
        if (tarif === this.currentTarif) return;

        // Trial is not selectable.
        if (tarif === 3) return;

        const target = this.tarifs.find((t) => t.tarif === tarif);
        if (!target) return;

        // Client-side affordability check — same rule as server.
        // Do NOT close the tariff modal — the QR modal opens on top.
        if (this.currentSum < target.price) {
            await this._showInsufficientFunds(target);
            return;
        }

        this.isSaving = true;
        this.pendingTarif = tarif;
        this._setButtonsDisabled(true);
        this._hideStatus();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(
                '/core/engine/lib/base/profile/balance/tarif/change',
                {
                    method: 'POST',
                    body: { tarif },
                }
            );

            console.log('[TarifChange] Changed:', json.data);

            if (typeof this.onSaved === 'function') {
                try { this.onSaved(json.data); } catch (e) { console.error(e); }
            }

            this.destroy();
        } catch (err) {
            console.error('[TarifChange] Change error:', err);

            const detail = err?.data?.detail || err.message || 'Ошибка';
            const sbpUrl = err?.data?.sbp_url || this.sbpUrl;
            const sbpQr = err?.data?.sbp_qr || this.sbpQr;

            if (detail === 'insufficient_funds' || err?.status === 400) {
                if (sbpUrl) this.sbpUrl = sbpUrl;
                if (sbpQr) this.sbpQr = sbpQr;
                await this._showInsufficientFunds(target);
            } else {
                this._showStatus(detail, 'error');
            }

            this.isSaving = false;
            this.pendingTarif = null;
            this._setButtonsDisabled(false);
        }
    }

    /**
     * Show "not enough funds" state.
     *
     * Opens a SEPARATE modal on top of the tariff modal:
     *   - createModal('image') — if a QR is uploaded;
     *   - createModal('message') + window.open — if only sbp_url is set;
     *   - createModal('message') — otherwise ("обратитесь к администратору").
     *
     * The tariff modal is NOT closed — the user can close the QR
     * modal and pick another tariff.
     */
    async _showInsufficientFunds(target) {
        const price = target.price;
        const missing = Math.max(0, price - this.currentSum);

        const line1 = `Недостаточно средств для тарифа «${target.label}».`;
        const line2 = `Нужно ещё ${this._formatNumber(missing)} ₽.`;
        const line3 = 'Оплата поступит в течение суток.';

        // Load createModal once
        const version = window.coreEngine?.static_version || Date.now();
        let createModal = null;
        try {
            const mod = await import(
                `/static/core/engine/lib/base/modal/index.js?v=${version}`
            );
            createModal = mod.createModal;
        } catch (err) {
            console.error('[TarifChange] createModal load error:', err);
        }

        // --- Case 1: QR uploaded — open the image modal ---
        if (this.sbpQr && createModal) {
            const modal = await createModal('image');
            if (modal) {
                const loginHint = this.userLogin
                    ? `При оплате укажите в комментарии ваш логин: ${this.userLogin}`
                    : '';

                const captionParts = [
                    line1,
                    line2,
                    'Отсканируйте QR в приложении банка.',
                    line3,
                ];
                if (loginHint) captionParts.push(loginHint);

                modal.open({
                    src: this.sbpQr,
                    title: 'Пополнение баланса',
                    caption: captionParts.join('\n'),
                    alt: 'QR-код для оплаты',
                });
                return;
            }
        }

        // --- Case 2: no QR, but external SBP URL — open it + message ---
        if (this.sbpUrl) {
            window.open(this.sbpUrl, '_blank', 'noopener,noreferrer');

            if (createModal) {
                const modal = await createModal('message');
                if (modal) {
                    modal.open(
                        [
                            line1,
                            line2,
                            'Открыта страница оплаты.',
                            line3,
                            this.userLogin
                                ? `При оплате укажите ваш логин: ${this.userLogin}`
                                : '',
                        ].filter(Boolean).join(' '),
                        'Пополнение баланса',
                        'Понятно'
                    );
                    modal.setOnOk(() => modal.destroy());
                    return;
                }
            }
        }

        // --- Case 3: neither QR nor URL ---
        if (createModal) {
            const modal = await createModal('message');
            if (modal) {
                modal.open(
                    [
                        line1,
                        line2,
                        'Обратитесь к администратору для пополнения баланса.',
                    ].filter(Boolean).join(' '),
                    'Пополнение баланса',
                    'Понятно'
                );
                modal.setOnOk(() => modal.destroy());
                return;
            }
        }

        // Fallback — createModal недоступна
        window.alert(`${line1} ${line2} Обратитесь к администратору.`);
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _setButtonsDisabled(disabled) {
        this.bodyEl.querySelectorAll('button').forEach((btn) => {
            if (btn.dataset.action === 'none') return;
            btn.disabled = disabled;
        });
        this.cancelBtn.disabled = disabled;
        this.closeBtn.style.pointerEvents = disabled ? 'none' : '';
        this.closeBtn.style.opacity = disabled ? '0.4' : '';
    }

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `tarif-status tarif-status-${type}`;
        this.statusEl.style.display = 'block';
    }

    _hideStatus() {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.innerHTML = '';
        this.statusEl.style.display = 'none';
        if (this.sbpBtn) this.sbpBtn.style.display = 'none';
    }

    _formatNumber(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    _escape(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _handleClose() {
        if (this.isSaving) return;
        this.destroy();
    }

    // ============================================
    // PUBLIC
    // ============================================

    destroy() {
        console.log('[TarifChange] destroy()');

        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        if (this.container) {
            this.container.classList.remove('active');
            this.container.remove();
            this.container = null;
        }

        this.bodyEl = null;
        this.statusEl = null;
        this.sbpBtn = null;

        if (typeof this.onClose === 'function') {
            try { this.onClose(); } catch (e) { console.error(e); }
        }
    }
}