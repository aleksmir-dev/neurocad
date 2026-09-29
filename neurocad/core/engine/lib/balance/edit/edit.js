// neurocad/core/engine/lib/balance/edit/edit.js

/**
 * BalanceEdit — edit modal for a single Balance row.
 *
 * Rendered as a full-screen overlay (same style as base/modal/message.css):
 *   .core-engine-lib-balance-edit          (overlay, .active → display:flex)
 *     └── .window
 *         ├── .title-bar   (title + close)
 *         └── .content
 *             ├── .balance-edit-body    (form, scrollable)
 *             └── .actions-bar          (Сохранить / Отмена)
 *
 * Data flow:
 *   1. _init() → GET /core/engine/lib/balance/edit/{user_id}
 *   2. render() → form with all Balance fields
 *   3. "Сохранить" → PUT /core/engine/lib/balance/edit/{user_id}
 *   4. on success → onSaved(), then destroy()
 *
 * Storage (`mb`, `limit_mb`) is in MEGABYTES.
 * `acc_at` is a date (YYYY-MM-DD) — nullable.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Public API:
 *   new BalanceEdit({ userId, onSaved, onClose })
 *   await instance._initPromise    // when data is loaded
 *   instance.destroy()             // manual close (rare; usually self-closes)
 *
 * Namespace: CoreEngineLibBalanceEdit*
 */

export class BalanceEdit {
    constructor(options = {}) {
        console.log('[BalanceEdit] Constructor', options);

        this.options = options;
        this.userId = options.userId || null;
        this.onSaved = options.onSaved || null;
        this.onClose = options.onClose || null;

        // Loaded data
        this.data = null;
        this.error = null;

        // DOM
        this.container = null;
        this.form = null;
        this.statusEl = null;

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
            window.coreEngine.loadCSS('core/engine/lib/balance/edit/edit.css');
        }
    }

    async _init() {
        console.log('[BalanceEdit] _init() START, user =', this.userId);

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
            console.log('[BalanceEdit] Data loaded:', this.data);
        } catch (err) {
            console.error('[BalanceEdit] Load error:', err);
            this.error = err?.data?.detail || err.message || 'load_failed';
            return;
        }

        this._createDOM();
        this._bindEvents();
        this._renderForm();
        this.container.classList.add('active');
    }

    // ============================================
    // DOM
    // ============================================

    _createDOM() {
        // Reuse existing if present (single instance per page)
        const existing = document.querySelector('.core-engine-lib-balance-edit');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'core-engine-lib-balance-edit';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Редактирование баланса</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="balance-edit-status" data-role="status" style="display:none;"></div>
                    <form class="balance-edit-form" data-role="form">
                        <div class="balance-edit-body" data-role="body"></div>
                    </form>
                    <div class="actions-bar">
                        <button type="button" class="btn btn-white cancel-btn">Отмена</button>
                        <button type="button" class="btn btn-primary save-btn">Сохранить</button>
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

        // Submit on Enter inside form
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

        // Header block: user info
        const userInfo = `
            <div class="balance-edit-user">
                <div class="balance-edit-user-row">
                    <span class="balance-edit-user-label">Пользователь:</span>
                    <span class="balance-edit-user-value">
                        ${this._escape(d.login || '—')}
                        ${d.name ? `<span class="balance-edit-user-name">(${this._escape(d.name)})</span>` : ''}
                    </span>
                </div>
                <div class="balance-edit-user-row">
                    <span class="balance-edit-user-label">ID:</span>
                    <span class="balance-edit-user-value">${d.user_id}</span>
                </div>
                <div class="balance-edit-user-row">
                    <span class="balance-edit-user-label">Строка Balance:</span>
                    <span class="balance-edit-user-value">
                        ${d.has_balance ? 'есть' : '<span class="balance-edit-warn">нет — будет создана при сохранении</span>'}
                    </span>
                </div>
            </div>
        `;

        // Field groups
        const formHtml = `
            ${userInfo}

            <div class="balance-edit-section">
                <div class="balance-edit-section-title">Тариф</div>
                ${this._fieldSelect('tarif', 'Тариф', d.tarif, [
                    { value: 0, label: 'Free' },
                    { value: 1, label: 'Pro' },
                    { value: 2, label: 'LLM' },
                ])}
                ${this._fieldNumber('day', 'Расчётный день месяца', d.day, { min: 1, max: 31 })}
                ${this._fieldNumber('price', 'Стоимость тарифа', d.price)}
                ${this._fieldNumber('refer_id', 'Refer ID', d.refer_id)}
            </div>

            <div class="balance-edit-section">
                <div class="balance-edit-section-title">Остатки</div>
                ${this._fieldNumber('gen', 'Генерации', d.gen)}
                ${this._fieldNumber('tokens', 'Токены LLM', d.tokens)}
                ${this._fieldNumber('sum', 'Сумма', d.sum)}
                ${this._fieldNumber('mb', 'Хранилище (МБ)', d.mb)}
                ${this._fieldNumber('pages', 'Страницы', d.pages)}
            </div>

            <div class="balance-edit-section">
                <div class="balance-edit-section-title">Лимиты</div>
                ${this._fieldNumber('limit_genday', 'Начисление генераций (день)', d.limit_genday)}
                ${this._fieldNumber('limit_genmon', 'Начисление генераций (месяц)', d.limit_genmon)}
                ${this._fieldNumber('limit_tokens', 'Лимит токенов', d.limit_tokens)}
                ${this._fieldNumber('limit_mb', 'Лимит хранилища (МБ)', d.limit_mb)}
                ${this._fieldNumber('limit_pages', 'Лимит страниц', d.limit_pages)}
            </div>

            <div class="balance-edit-section">
                <div class="balance-edit-section-title">Прочее</div>
                ${this._fieldDate('acc_at', 'Дата последнего начисления', d.acc_at)}
                ${this._fieldCheckbox('is_delete', 'Помечен как удалённый', d.is_delete)}
            </div>
        `;

        this.bodyEl.innerHTML = formHtml;
    }

    _fieldNumber(name, label, value, opts = {}) {
        const id = `balance-edit-${name}`;
        const v = value == null ? '' : String(value);
        const min = opts.min != null ? `min="${opts.min}"` : '';
        const max = opts.max != null ? `max="${opts.max}"` : '';

        return `
            <div class="balance-edit-field">
                <label class="balance-edit-label" for="${id}">${this._escape(label)}</label>
                <input
                    type="number"
                    id="${id}"
                    class="balance-edit-input"
                    data-field="${name}"
                    value="${this._escapeAttr(v)}"
                    ${min}
                    ${max}>
            </div>
        `;
    }

    _fieldDate(name, label, value) {
        const id = `balance-edit-${name}`;

        // value may come as "2026-09-28" (ISO date) or null.
        // Keep only the date part if a full ISO datetime somehow arrived.
        let v = '';
        if (value) {
            const s = String(value);
            v = s.length > 10 ? s.slice(0, 10) : s;
        }

        return `
            <div class="balance-edit-field">
                <label class="balance-edit-label" for="${id}">${this._escape(label)}</label>
                <input
                    type="date"
                    id="${id}"
                    class="balance-edit-input"
                    data-field="${name}"
                    value="${this._escapeAttr(v)}">
            </div>
        `;
    }

    _fieldSelect(name, label, value, options) {
        const id = `balance-edit-${name}`;
        const v = value == null ? '' : String(value);

        const optsHtml = options.map((o) => {
            const ov = String(o.value);
            const selected = ov === v ? 'selected' : '';
            return `<option value="${ov}" ${selected}>${this._escape(o.label)}</option>`;
        }).join('');

        return `
            <div class="balance-edit-field">
                <label class="balance-edit-label" for="${id}">${this._escape(label)}</label>
                <select id="${id}" class="balance-edit-select" data-field="${name}">
                    ${optsHtml}
                </select>
            </div>
        `;
    }

    _fieldCheckbox(name, label, value) {
        const id = `balance-edit-${name}`;
        const checked = value ? 'checked' : '';

        return `
            <div class="balance-edit-field balance-edit-field-checkbox">
                <label class="balance-edit-checkbox-label" for="${id}">
                    <input type="checkbox" id="${id}" data-field="${name}" ${checked}>
                    <span>${this._escape(label)}</span>
                </label>
            </div>
        `;
    }

    // ============================================
    // COLLECT + SAVE
    // ============================================

    _collectForm() {
        const root = this.bodyEl;
        if (!root) return {};

        const payload = {};

        // Numeric fields.
        //
        // day и refer_id — nullable: пустое поле = null (очистить).
        // Остальные (gen, tokens, sum, mb, pages, price, limit_*) —
        // обязательные: пустое поле = 0.
        const NULLABLE = new Set(['day', 'refer_id']);

        root.querySelectorAll('input[type="number"][data-field]').forEach((el) => {
            const name = el.dataset.field;
            const raw = el.value.trim();

            if (raw === '') {
                payload[name] = NULLABLE.has(name) ? null : 0;
                return;
            }

            const n = parseInt(raw, 10);
            payload[name] = Number.isNaN(n) ? null : n;
        });

        // Date fields (acc_at) — nullable: пустое поле = null.
        root.querySelectorAll('input[type="date"][data-field]').forEach((el) => {
            const name = el.dataset.field;
            const raw = el.value.trim();
            payload[name] = raw === '' ? null : raw;
        });

        // Select fields (tarif) — always an int.
        root.querySelectorAll('select[data-field]').forEach((el) => {
            const name = el.dataset.field;
            const n = parseInt(el.value, 10);
            payload[name] = Number.isNaN(n) ? 0 : n;
        });

        // Checkbox fields (is_delete) — always bool.
        root.querySelectorAll('input[type="checkbox"][data-field]').forEach((el) => {
            const name = el.dataset.field;
            payload[name] = el.checked;
        });

        return payload;
    }

    async _handleSave() {
        if (this.isSaving) return;

        const payload = this._collectForm();
        console.log('[BalanceEdit] Save payload:', payload);

        this._setSaving(true);
        this._hideStatus();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(
                `/core/engine/lib/balance/edit/${this.userId}`,
                {
                    method: 'PUT',
                    body: payload,
                }
            );

            console.log('[BalanceEdit] Saved:', json.data);

            if (typeof this.onSaved === 'function') {
                try { this.onSaved(json.data); } catch (e) { console.error(e); }
            }

            this.destroy();
        } catch (err) {
            console.error('[BalanceEdit] Save error:', err);
            const msg = err?.data?.detail || err.message || 'Ошибка сохранения';
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
            this.saveBtn.textContent = saving ? 'Сохранение…' : 'Сохранить';
        }
        if (this.cancelBtn) this.cancelBtn.disabled = saving;
    }

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `balance-edit-status balance-edit-status-${type}`;
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

    _escapeAttr(str) {
        return this._escape(str);
    }

    _handleClose() {
        if (this.isSaving) return;
        this.destroy();
    }

    // ============================================
    // PUBLIC
    // ============================================

    destroy() {
        console.log('[BalanceEdit] destroy()');

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

        if (typeof this.onClose === 'function') {
            try { this.onClose(); } catch (e) { console.error(e); }
        }
    }
}