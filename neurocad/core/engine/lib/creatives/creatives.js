// neurocad/core/engine/lib/creatives/creatives.js

/**
 * Creatives — admin page for creatives, placements and reports.
 *
 * Rendered into area-center by BasePages.showCreatives()
 * (or BasePages.showSetup('creatives')) through
 * BaseAreas.renderInArea(). Follows the BaseSetup contract:
 *
 *   - constructor(options) — single argument, no container.
 *   - render()             — creates the widget DOM and returns it;
 *                            does NOT attach to any container.
 *   - bindEvents(container) — attaches delegated listeners on the
 *                            container (area-center) and triggers
 *                            the first data load.
 *   - destroy()            — removes the widget from the DOM.
 *
 * Widget layout
 * -------------
 * The wrapper is the standard .core-engine-lib-base-widget with a
 * SINGLE child — .core-engine-lib-base-widget-content. There is NO
 * titlebar: the page title is already shown in the shell header via
 * setCaption('Креативы', 'Креативы'), so a duplicate titlebar inside
 * the widget would be redundant.
 *
 *   .core-engine-lib-base-widget
 *     .core-engine-lib-base-widget-content
 *       .core-engine-lib-creatives
 *         .creatives-tabs
 *         .creatives-status
 *         .creatives-content
 *
 * Three tabs:
 *   - "Креативы"   — list of creatives (name, erid, target_url, ...).
 *                    Create / Edit / Delete via the form modal.
 *   - "Размещения" — read-only list of placements. Placements are
 *                    NOT created from this page: they appear
 *                    automatically when a page is saved with a
 *                    creative attached to it (see pages / page
 *                    editor). Here the user can only view them.
 *                    To close a placement, the user edits the
 *                    page and clears the "Креатив" select or
 *                    unchecks "Публиковать".
 *   - "Отчёт"      — shows / clicks / target_actions for a period.
 *
 * Modals
 * ------
 * Create and Edit use createModal('form') — a multi-field modal
 * that renders the full creative payload and returns it as a
 * single object. Fields:
 *
 *   name         — internal name (list / admin);
 *   erid         — ERID token;
 *   target_url   — where the link leads;
 *
 *   text         — публичный рекламный текст (textarea);
 *   button_text  — текст кнопки-ссылки;
 *
 *   brand        — наименование рекламодателя (юр. реквизит);
 *   inn          — ИНН рекламодателя (юр. реквизит);
 *
 *   is_active    — чекбокс «Активен».
 *
 * The fields text / button_text / brand / inn feed the
 * "core-creative" block on the page: when the block is dropped in
 * the editor, it is populated from the chosen creative. They are
 * optional — a creative without them is still valid and works in
 * the placements / report tabs.
 *
 * Delete (creatives only) uses createModal('confirm').
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 */

export class Creatives {
    constructor(options = {}) {
        console.log('[Creatives] Constructor', { options });

        // BaseAreas passes a single `options` object:
        //   { section, user, setCaption, restoreCaption }
        this.options = options;
        this.props = options;

        // Tab state
        this.activeTab = 'creatives';

        // Cached data per tab (null = not loaded yet)
        this.creatives = null;
        this.placements = null;
        this.report = null;

        // Report period (defaults to current month)
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        this.reportFrom = this._isoDate(firstDay);
        this.reportTo = this._isoDate(today);

        // UI state
        this.isLoading = false;
        this.error = null;

        // Active modals
        this.editModal = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Caption helpers
        this._setCaption = options.setCaption || null;
        this._restoreCaption = options.restoreCaption || null;
        this._savedCaption = null;

        // DOM refs (filled in render())
        this.element = null;
        this.tabsEl = null;
        this.contentEl = null;
        this.statusEl = null;

        // Guard against double render
        this._rendered = false;

        this._loadCSS();
    }

    // ============================================
    // LIFECYCLE — render / bindEvents / destroy
    // ============================================

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/creatives/creatives.css');
        }
    }

    /**
     * Create the widget DOM and return the root element.
     *
     * BaseAreas calls this and appends the result to area-center
     * itself — so we must NOT touch any container here.
     *
     * The widget has NO titlebar — the page title lives in the shell
     * header (set via setCaption). Only .core-engine-lib-base-widget-content
     * is rendered.
     */
    render() {
        console.log('[Creatives] render()');

        // Save current header/tab title, set our own.
        if (this._setCaption && !this._savedCaption) {
            this._savedCaption = this._setCaption('Креативы', 'Креативы');
        }

        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget';

        widget.innerHTML = `
            <div class="core-engine-lib-base-widget-content">
                <div class="core-engine-lib-creatives">
                    <div class="creatives-tabs" data-role="tabs">
                        <button type="button" class="creatives-tab is-active" data-tab="creatives">Креативы</button>
                        <button type="button" class="creatives-tab" data-tab="placements">Размещения</button>
                        <button type="button" class="creatives-tab" data-tab="report">Отчёт</button>
                        <div class="creatives-tabs-spacer"></div>
                        <button type="button" class="creatives-icon-btn" data-action="reload" title="Обновить">
                            <span aria-hidden="true">↻</span>
                        </button>
                    </div>

                    <div class="creatives-status" data-role="status" style="display:none;"></div>
                    <div class="creatives-content" data-role="content"></div>
                </div>
            </div>
        `;

        this.element = widget;

        this.tabsEl    = widget.querySelector('[data-role="tabs"]');
        this.contentEl = widget.querySelector('[data-role="content"]');
        this.statusEl  = widget.querySelector('[data-role="status"]');

        this._rendered = true;
        return widget;
    }

    /**
     * Attach delegated listeners and trigger the first data load.
     *
     * BaseAreas calls this AFTER appending our element to area-center
     * and passes that area-center as `container`. We do not use it
     * here — every listener is bound to our own tabsEl / contentEl.
     */
    bindEvents(container) {
        console.log('[Creatives] bindEvents()');

        if (!this.element) return;

        // Tabs (switch + reload) — one delegated listener on tabs.
        this.tabsEl.addEventListener('click', (e) => {
            const reloadBtn = e.target.closest('[data-action="reload"]');
            if (reloadBtn) {
                this._reload();
                return;
            }

            const tab = e.target.closest('[data-tab]');
            if (!tab) return;
            const name = tab.dataset.tab;
            if (name === this.activeTab) return;
            this._switchTab(name);
        });

        // Actions inside the tab content.
        this.contentEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : null;

            switch (action) {
                case 'creative-create':  this._openCreateCreative();  break;
                case 'creative-edit':    this._openEditCreative(id);  break;
                case 'creative-delete':  this._deleteCreative(id);    break;
                case 'report-refresh':   this._applyReportPeriod();   break;
            }
        });

        // First load — the tab we start on.
        this._switchTab(this.activeTab).then(() => {
            this._initialized = true;
        });
    }

    /**
     * Remove the widget from the DOM and release state.
     */
    destroy() {
        console.log('[Creatives] destroy()');

        if (this._restoreCaption) {
            this._restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.editModal?.destroy) this.editModal.destroy();
        this.editModal = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this.tabsEl = null;
        this.contentEl = null;
        this.statusEl = null;
        this.creatives = null;
        this.placements = null;
        this.report = null;
        this._rendered = false;

        this._initialized = false;
        this._initPromise = null;
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/creatives';
    }

    get _navId() {
        const v = window.coreEngine?.navId ?? document.body?.dataset?.navId;
        return v != null && v !== '' ? Number(v) : null;
    }

    _qs(extra = {}) {
        const params = new URLSearchParams();
        if (this._navId != null) params.set('nav_id', this._navId);
        for (const [k, v] of Object.entries(extra)) {
            if (v != null && v !== '') params.set(k, v);
        }
        const s = params.toString();
        return s ? `?${s}` : '';
    }

    async _loadCreatives() {
        const url = `${this._apiBase}/list${this._qs()}`;
        const json = await window.coreEngine.fetchJson(url);
        this.creatives = json.data || [];
    }

    async _loadPlacements() {
        const url = `${this._apiBase}/placements${this._qs()}`;
        const json = await window.coreEngine.fetchJson(url);
        this.placements = json.data || [];
    }

    async _loadReport() {
        const url = `${this._apiBase}/stats${this._qs({
            date_from: this.reportFrom,
            date_to: this.reportTo,
        })}`;
        const json = await window.coreEngine.fetchJson(url);
        this.report = json.data || [];
    }

    // ============================================
    // TABS
    // ============================================

    async _switchTab(name) {
        console.log('[Creatives] _switchTab()', name);

        this.activeTab = name;

        this.tabsEl.querySelectorAll('.creatives-tab').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.tab === name);
        });

        this.contentEl.innerHTML = '<div class="creatives-loading">Загрузка…</div>';

        try {
            if (name === 'creatives') {
                if (this.creatives === null) await this._loadCreatives();
                this._renderCreatives();
            } else if (name === 'placements') {
                if (this.placements === null) await this._loadPlacements();
                this._renderPlacements();
            } else if (name === 'report') {
                if (this.report === null) await this._loadReport();
                this._renderReport();
            }
        } catch (err) {
            console.error('[Creatives] Tab load error:', err);
            this._renderError(err?.data?.detail || err.message || 'Ошибка загрузки');
        }
    }

    async _reload() {
        if (this.activeTab === 'creatives') this.creatives = null;
        if (this.activeTab === 'placements') this.placements = null;
        if (this.activeTab === 'report') this.report = null;
        await this._switchTab(this.activeTab);
    }

    // ============================================
    // TAB: CREATIVES
    // ============================================

    _renderCreatives() {
        const items = this.creatives || [];

        const rows = items.length === 0
            ? `<tr><td colspan="7" class="creatives-empty">Нет креативов</td></tr>`
            : items.map((c) => `
                <tr>
                    <td>${c.id}</td>
                    <td>${this._escape(c.name || '—')}</td>
                    <td>${this._escape(c.erid || '—')}</td>
                    <td>${c.target_url ? `<a href="${this._escapeAttr(c.target_url)}" target="_blank" rel="noopener noreferrer">${this._escape(this._shortUrl(c.target_url))}</a>` : '—'}</td>
                    <td>${c.is_active ? '✅' : '❌'}</td>
                    <td>${this._formatDate(c.created_at)}</td>
                    <td class="creatives-actions">
                        <button type="button" class="creatives-action-btn" data-action="creative-edit" data-id="${c.id}">Редактировать</button>
                        <button type="button" class="creatives-action-btn creatives-action-btn-danger" data-action="creative-delete" data-id="${c.id}">Удалить</button>
                    </td>
                </tr>
            `).join('');

        this.contentEl.innerHTML = `
            <div class="creatives-toolbar">
                <button type="button" class="creatives-btn creatives-btn-primary" data-action="creative-create">Создать креатив</button>
            </div>
            <div class="creatives-scroll">
                <table class="creatives-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Название</th>
                            <th>ERID</th>
                            <th>Ссылка</th>
                            <th>Активен</th>
                            <th>Создан</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // TAB: PLACEMENTS
    // ============================================

    /**
     * Read-only list of placements.
     *
     * Placements are created automatically when a PAGE is saved with
     * a creative attached to it (see the page editor). This page does
     * NOT create or delete them — it only lists them.
     *
     * That is why there is no toolbar with a "Создать размещение"
     * button and no per-row "Удалить" button: the action lives where
     * the data is born (the page editor), not here. To close a
     * placement, the user edits the page and clears the "Креатив"
     * select or unchecks "Публиковать".
     */
    _renderPlacements() {
        const items = this.placements || [];

        const rows = items.length === 0
            ? `<tr><td colspan="6" class="creatives-empty">Нет размещений</td></tr>`
            : items.map((p) => `
                <tr>
                    <td>${p.id}</td>
                    <td>${this._escape(p.creative_name || '—')}</td>
                    <td>${p.page_id}</td>
                    <td>${p.date_start ? this._formatDate(p.date_start) : '—'}</td>
                    <td>${p.date_end ? this._formatDate(p.date_end) : '—'}</td>
                    <td>${p.is_active ? '✅' : '❌'}</td>
                </tr>
            `).join('');

        this.contentEl.innerHTML = `
            <div class="creatives-scroll">
                <table class="creatives-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Креатив</th>
                            <th>Страница</th>
                            <th>Начало</th>
                            <th>Конец</th>
                            <th>Активно</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // TAB: REPORT
    // ============================================

    _renderReport() {
        const items = this.report || [];

        const rows = items.length === 0
            ? `<tr><td colspan="6" class="creatives-empty">Нет данных за период</td></tr>`
            : items.map((r) => `
                <tr>
                    <td>${this._escape(r.creative_name || '—')}</td>
                    <td>${this._escape(r.erid || '—')}</td>
                    <td>${r.page_id}</td>
                    <td class="creatives-num">${r.shows ?? 0}</td>
                    <td class="creatives-num">${r.clicks ?? 0}</td>
                    <td class="creatives-num">${r.target_actions ?? 0}</td>
                </tr>
            `).join('');

        this.contentEl.innerHTML = `
            <div class="creatives-toolbar">
                <label class="creatives-period-label">Период:</label>
                <input type="date" class="creatives-date" data-role="report-from" value="${this._escapeAttr(this.reportFrom)}">
                <span>—</span>
                <input type="date" class="creatives-date" data-role="report-to" value="${this._escapeAttr(this.reportTo)}">
                <button type="button" class="creatives-btn creatives-btn-primary" data-action="report-refresh">Обновить</button>
            </div>
            <div class="creatives-scroll">
                <table class="creatives-table">
                    <thead>
                        <tr>
                            <th>Креатив</th>
                            <th>ERID</th>
                            <th>Страница</th>
                            <th>Показы</th>
                            <th>Клики</th>
                            <th>Целевые действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async _applyReportPeriod() {
        const from = this.contentEl.querySelector('[data-role="report-from"]')?.value;
        const to = this.contentEl.querySelector('[data-role="report-to"]')?.value;
        if (!from || !to) return;

        this.reportFrom = from;
        this.reportTo = to;
        this.report = null;
        await this._switchTab('report');
    }

    // ============================================
    // MODALS — CREATE / EDIT / DELETE
    // ============================================

    /**
     * Open the Create Creative modal.
     *
     * Uses createModal('form') — a multi-field modal. Returns the
     * full creative payload:
     *
     *   { name, erid, target_url, text, button_text, brand, inn, is_active }
     *
     * The text / button_text / brand / inn fields are optional —
     * they feed the "core-creative" block on the page. A creative
     * without them is still valid and works in placements / report.
     */
    async _openCreateCreative() {
        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `/static/core/engine/lib/base/modal/index.js?v=${version}`
        );

        const modal = await createModal('form');
        modal.setOnOk(async (data) => {
            if (!data.name) {
                this._showStatus('Название обязательно', 'error');
                return;
            }
            await this._postCreative(data);
        });
        modal.open({
            title: 'Создать креатив',
            okText: 'Создать',
            cancelText: 'Отмена',
            fields: [
                // ---- Основное ----
                {
                    name: 'name',
                    label: 'Название',
                    type: 'text',
                    value: '',
                    placeholder: 'Например: Баннер кофейни',
                },
                {
                    name: 'erid',
                    label: 'ERID',
                    type: 'text',
                    value: '',
                    placeholder: 'Например: 2Vfnxx…',
                },
                {
                    name: 'target_url',
                    label: 'Ссылка',
                    type: 'url',
                    value: '',
                    placeholder: 'https://example.com/landing',
                },

                // ---- Контент блока «Креатив» ----
                {
                    name: 'text',
                    label: 'Текст рекламы',
                    type: 'textarea',
                    rows: 3,
                    value: '',
                    placeholder: 'Ищете хостинг для размещения вашего проекта в сети Интернет?',
                },
                {
                    name: 'button_text',
                    label: 'Текст кнопки',
                    type: 'text',
                    value: '',
                    placeholder: 'Посмотрите здесь',
                },

                // ---- Юридические реквизиты ----
                {
                    name: 'brand',
                    label: 'Рекламодатель',
                    type: 'text',
                    value: '',
                    placeholder: 'ООО «Бегет»',
                },
                {
                    name: 'inn',
                    label: 'ИНН',
                    type: 'text',
                    value: '',
                    placeholder: '7801451618',
                },

                // ---- Служебное ----
                {
                    name: 'is_active',
                    label: 'Активен',
                    type: 'checkbox',
                    value: true,
                },
            ],
        });
    }

    /**
     * Open the Edit Creative modal for a given id.
     *
     * Uses createModal('form') — the same multi-field modal as
     * Create, pre-filled with the current values of the creative.
     * Returns the full creative payload.
     *
     * @param {number} id — creative id
     */
    async _openEditCreative(id) {
        const item = (this.creatives || []).find((c) => c.id === id);
        if (!item) return;

        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `/static/core/engine/lib/base/modal/index.js?v=${version}`
        );

        const modal = await createModal('form');
        modal.setOnOk(async (data) => {
            if (!data.name) {
                this._showStatus('Название обязательно', 'error');
                return;
            }
            await this._putCreative(id, data);
        });
        modal.open({
            title: 'Редактировать креатив',
            okText: 'Сохранить',
            cancelText: 'Отмена',
            fields: [
                // ---- Основное ----
                {
                    name: 'name',
                    label: 'Название',
                    type: 'text',
                    value: item.name || '',
                },
                {
                    name: 'erid',
                    label: 'ERID',
                    type: 'text',
                    value: item.erid || '',
                    placeholder: 'Например: 2Vfnxx…',
                },
                {
                    name: 'target_url',
                    label: 'Ссылка',
                    type: 'url',
                    value: item.target_url || '',
                    placeholder: 'https://example.com/landing',
                },

                // ---- Контент блока «Креатив» ----
                {
                    name: 'text',
                    label: 'Текст рекламы',
                    type: 'textarea',
                    rows: 3,
                    value: item.text || '',
                    placeholder: 'Ищете хостинг для размещения вашего проекта в сети Интернет?',
                },
                {
                    name: 'button_text',
                    label: 'Текст кнопки',
                    type: 'text',
                    value: item.button_text || '',
                    placeholder: 'Посмотрите здесь',
                },

                // ---- Юридические реквизиты ----
                {
                    name: 'brand',
                    label: 'Рекламодатель',
                    type: 'text',
                    value: item.brand || '',
                    placeholder: 'ООО «Бегет»',
                },
                {
                    name: 'inn',
                    label: 'ИНН',
                    type: 'text',
                    value: item.inn || '',
                    placeholder: '7801451618',
                },

                // ---- Служебное ----
                {
                    name: 'is_active',
                    label: 'Активен',
                    type: 'checkbox',
                    value: !!item.is_active,
                },
            ],
        });
    }

    async _deleteCreative(id) {
        const item = (this.creatives || []).find((c) => c.id === id);
        if (!item) return;

        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `/static/core/engine/lib/base/modal/index.js?v=${version}`
        );

        const modal = await createModal('confirm');
        modal.setOnOk(async () => {
            await this._doDeleteCreative(id);
        });
        modal.open(
            `Удалить креатив «${item.name}»?`,
            'Удаление',
            'Удалить',
            'Отмена'
        );
    }

    // ============================================
    // API — WRITES
    // ============================================

    async _postCreative(data) {
        try {
            await window.coreEngine.fetchJson(
                `${this._apiBase}/item${this._qs()}`,
                { method: 'POST', body: data }
            );
            this.creatives = null;
            await this._switchTab('creatives');
            this._showStatus('Креатив создан', 'success');
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка создания';
            this._showStatus(msg, 'error');
        }
    }

    async _putCreative(id, data) {
        try {
            await window.coreEngine.fetchJson(
                `${this._apiBase}/item/${id}${this._qs()}`,
                { method: 'PUT', body: data }
            );
            this.creatives = null;
            await this._switchTab('creatives');
            this._showStatus('Изменения сохранены', 'success');
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка сохранения';
            this._showStatus(msg, 'error');
        }
    }

    async _doDeleteCreative(id) {
        try {
            await window.coreEngine.fetchJson(
                `${this._apiBase}/item/${id}${this._qs()}`,
                { method: 'DELETE' }
            );
            this.creatives = null;
            await this._switchTab('creatives');
            this._showStatus('Креатив удалён', 'success');
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка удаления';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _renderError(text) {
        this.contentEl.innerHTML = `
            <div class="creatives-error">
                <div class="creatives-error-icon">❌</div>
                <div class="creatives-error-text">${this._escape(text)}</div>
                <button type="button" class="creatives-btn" data-action="reload">Повторить</button>
            </div>
        `;
    }

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `creatives-status creatives-status-${type}`;
        this.statusEl.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                if (this.statusEl) this.statusEl.style.display = 'none';
            }, 3000);
        }
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

    _shortUrl(url) {
        const s = String(url || '');
        return s.length > 40 ? s.slice(0, 37) + '…' : s;
    }

    _formatDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} `
                + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (e) {
            return iso;
        }
    }

    _isoDate(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    // ============================================
    // PUBLIC
    // ============================================

    isInitialized() {
        return this._initialized;
    }

    async waitForInit() {
        if (this._initPromise) await this._initPromise;
        return this._initialized;
    }
}