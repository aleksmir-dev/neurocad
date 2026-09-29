// neurocad/core/engine/lib/balance/paid/paid.js

/**
 * BalancePaid — "Оплата" modal for a single Balance row.
 *
 * Rendered as a full-screen overlay (same style as base/modal/message.css):
 *   .core-engine-lib-balance-paid          (overlay, .active → display:flex)
 *     └── .window
 *         ├── .title-bar   (title + close)
 *         └── .content
 *             ├── .balance-paid-body    (user info + amount input)
 *             └── .actions-bar          (Зачислить / Отмена)
 *
 * Data flow:
 *   1. _init() → GET /core/engine/lib/balance/edit/{user_id}
 *      (reuses the edit endpoint — it returns the full current row,
 *       including login / name / sum for context)
 *   2. render() → user info + amount input (min=1)
 *   3. "Зачислить" → POST /core/engine/lib/balance/paid/{user_id}
 *      body: { amount: <int> }
 *   4. on success → onSaved(data), then destroy()
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Public API:
 *   new BalancePaid({ userId, onSaved, onClose })
 *   await instance._initPromise    // when data is loaded
 *   instance.destroy()             // manual close (rare; usually self-closes)
 *
 * Namespace: CoreEngineLibBalancePaid*
 */

export class BalancePaid {
    constructor(options = {}) {
        console.log('[BalancePaid] Constructor', options);

        this.options = options;
        this.userId = options.userId || null;
        this.onSaved = options.onSaved || null;
        this.onClose = options.onClose || null;

        // Loaded data
        this.data = null;
        this.error = null;

        // DOM
        this.container = null;
        this.statusEl = null;
        this.amountInput = null;

        // State
        this.isSaving = false;
        this._escHandler = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/balance/paid/paid.css');
        }
    }

    async _init() {
        console.log('[BalancePaid] _init() START, user =', this.userId);

        if (!this.userId) {
            this.error = 'no_user_id';
            return;
        }

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(
                `/core/engine/lib/balance/edit/${this.userId}`
            );
            this.data = json.data || null;
            console.log('[BalancePaid] Data loaded:', this.data);
        } catch (err) {
            console.error('[BalancePaid] Load error:', err);
            this.error = err?.data?.detail || err.message || 'load_failed';
            return;
        }

        this._createDOM();
        this._bindEvents();
        this._renderForm();
        this.container.classList.add('active');

        // Autofocus on the amount field
        setTimeout(() => {
            if (this.amountInput) this.amountInput.focus();
        }, 50);
    }

    // ============================================
    // DOM
    // ============================================

    _createDOM() {
        // Reuse existing if present (single instance per page)
        const existing = document.querySelector('.core-engine-lib-balance-paid');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'core-engine-lib-balance-paid';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Оплата</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="balance-paid-status" data-role="status" style="display:none;"></div>
                    <form class="balance-paid-form" data-role="form">
                        <div class="balance-paid-body" data-role="body"></div>
                    </form>
                    <div class="actions-bar">
                        <button type="button" class="btn btn-white cancel-btn">Отмена</button>
                        <button type="button" class="btn btn-primary save-btn">Зачислить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        this.container = container;
        this.form = container.querySelector('[data-role="form"]');
        this.bodyEl = container.querySelector('[data-role="body"]');
        this.statusEl = container.querySelector('[data-role="status"]');
        this.saveBtn = container.querySelector('.save-btn');
        this.cancelBtn = container.querySelector('.cancel-btn');
        this.closeBtn = container.querySelector('.close-btn');
    }

    _bindEvents() {
        this.closeBtn.addEventListener('click', () => this._handleClose());
        this.cancelBtn.addEventListener('click', () => this._handleClose());
        this.saveBtn.addEventListener('click', () => this._handleSave());

        // Submit on Enter
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleSave();
        });

        // Click on overlay (outside .window) — close
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) this._handleClose();
        });

        // Escape — close
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this._handleClose();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    // ============================================
    // FORM RENDER
    // ============================================

    _renderForm() {
        if (!this.data) return;

        const d = this.data;

        const userInfo = `
            <div class="balance-paid-user">
                <div class="balance-paid-user-row">
                    <span class="balance-paid-user-label">Пользователь:</span>
                    <span class="balance-paid-user-value">
                        ${this._escape(d.login || '—')}
                        ${d.name ? `<span class="balance-paid-user-name">(${this._escape(d.name)})</span>` : ''}
                    </span>
                </div>
                <div class="balance-paid-user-row">
                    <span class="balance-paid-user-label">ID:</span>
                    <span class="balance-paid-user-value">${d.user_id}</span>
                </div>
                <div class="balance-paid-user-row balance-paid-user-sum">
                    <span class="balance-paid-user-label">Текущая сумма:</span>
                    <span class="balance-paid-user-value">${d.sum ?? 0}</span>
                </div>
            </div>
        `;

        const amountField = `
            <div class="balance-paid-field">
                <label class="balance-paid-label" for="balance-paid-amount">Сумма пополнения</label>
                <input
                    type="number"
                    id="balance-paid-amount"
                    class="balance-paid-input"
                    data-role="amount"
                    min="1"
                    step="1"
                    value=""
                    placeholder="Например: 500"
                    autofocus>
                <div class="balance-paid-hint">
                    Средства будут зачислены мгновенно. Не забудьте сформировать чек в «Мой налог».
                </div>
            </div>
        `;

        this.bodyEl.innerHTML = userInfo + amountField;
        this.amountInput = this.bodyEl.querySelector('[data-role="amount"]');
    }

    // ============================================
    // SAVE
    // ============================================

    async _handleSave() {
        if (this.isSaving) return;

        const raw = this.amountInput ? this.amountInput.value.trim() : '';
        const amount = parseInt(raw, 10);

        if (!Number.isFinite(amount) || amount < 1) {
            this._showStatus('Введите положительную сумму (≥ 1)', 'error');
            if (this.amountInput) this.amountInput.focus();
            return;
        }

        this._setSaving(true);
        this._hideStatus();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(
                `/core/engine/lib/balance/paid/${this.userId}`,
                {
                    method: 'POST',
                    body: { amount },
                }
            );

            console.log('[BalancePaid] Paid:', json.data);

            if (typeof this.onSaved === 'function') {
                try { this.onSaved(json.data); } catch (e) { console.error(e); }
            }

            this.destroy();
        } catch (err) {
            console.error('[BalancePaid] Save error:', err);
            const msg = err?.data?.detail || err.message || 'Ошибка зачисления';
            this._showStatus(msg, 'error');
            this._setSaving(false);
        }
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _setSaving(saving) {
        this.isSaving = saving;
        if (this.saveBtn) {
            this.saveBtn.disabled = saving;
            this.saveBtn.textContent = saving ? 'Зачисление…' : 'Зачислить';
        }
        if (this.cancelBtn) this.cancelBtn.disabled = saving;
        if (this.amountInput) this.amountInput.disabled = saving;
    }

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `balance-paid-status balance-paid-status-${type}`;
        this.statusEl.style.display = 'block';
    }

    _hideStatus() {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.style.display = 'none';
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
        console.log('[BalancePaid] destroy()');

        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        if (this.container) {
            this.container.classList.remove('active');
            this.container.remove();
            this.container = null;
        }

        this.form = null;
        this.bodyEl = null;
        this.statusEl = null;
        this.amountInput = null;

        if (typeof this.onClose === 'function') {
            try { this.onClose(); } catch (e) { console.error(e); }
        }
    }
}