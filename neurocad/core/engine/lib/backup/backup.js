// neurocad/core/engine/lib/backup/backup.js

/**
 * Backup — admin page for backups: settings, schedules, history.
 *
 * Rendered into area-center by BasePages.showServices('backup')
 * through BaseAreas.renderInArea(). Follows the standard widget
 * contract:
 *
 *   - constructor(options)  — single argument, no container.
 *   - render()              — creates the widget DOM and returns it.
 *   - bindEvents(container) — attaches listeners, triggers first load.
 *   - destroy()             — removes the widget from the DOM.
 *
 * Three tabs:
 *   - "Настройки"   — form for BackupSettingsSchema. Fields are
 *                     rendered manually (S3 + retention + include).
 *                     The S3 section has a "Проверить подключение"
 *                     button that calls POST /backup/s3/test.
 *   - "Расписания"  — panel_tasks rows for backup_*, read from
 *                     GET /backup/schedules. Each row can be edited
 *                     (cron / active) and run manually (level-specific).
 *   - "История"     — recent backup_runs from GET /backup/list.
 *
 * Header actions:
 *   - "← Назад"      — real <a href="?page=services"> link.
 *   - "Запустить"    — POST /backup/run (background, hourly).
 *   - "Обновить"     — reload the current tab.
 */
export class Backup {
    constructor(options = {}) {
        console.log('[Backup] Constructor', { options });

        this.options = options;
        this.props = options;

        this.user = options.user || null;
        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;
        this._savedCaption = null;

        // Tab state
        this.activeTab = 'settings';

        // Cached data per tab
        this.settingsSchema = null;   // JSON schema (from /settings/schema)
        this.settingsData = null;     // current values (from /settings)
        this.schedules = null;        // panel_tasks backup_* (from /schedules)
        this.history = null;          // backup_runs (from /list)

        // UI state
        this._initialized = false;
        this._initPromise = null;
        this._rendered = false;

        this.element = null;
        this.tabsEl = null;
        this.contentEl = null;
        this.statusEl = null;

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    async _init() {
        console.log('[Backup] _init() START');
        try {
            await this._loadCSS();
            this._initialized = true;
            console.log('[Backup] _init() COMPLETE');
        } catch (error) {
            console.error('[Backup] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    async _loadCSS() {
        console.log('[Backup] _loadCSS()');
        if (window.coreEngine?.loadCSS) {
            await window.coreEngine.loadCSS('core/engine/lib/backup/backup.css');
        }
    }

    render() {
        console.log('[Backup] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Бэкапы', 'Бэкапы');
        }

        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget';

        widget.innerHTML = `
            <div class="core-engine-lib-base-widget-content">
                <div class="core-engine-lib-backup">
                    <div class="backup-tabs" data-role="tabs">
                        <button type="button" class="backup-tab is-active" data-tab="settings">Настройки</button>
                        <button type="button" class="backup-tab" data-tab="schedules">Расписания</button>
                        <button type="button" class="backup-tab" data-tab="history">История</button>
                        <div class="backup-tabs-spacer"></div>
                        <a class="backup-back-link" href="${this._servicesUrl()}">← Назад</a>
                        <button type="button" class="backup-icon-btn" data-action="run" title="Запустить hourly сейчас">
                            <span aria-hidden="true">▶</span>
                        </button>
                        <button type="button" class="backup-icon-btn" data-action="reload" title="Обновить">
                            <span aria-hidden="true">↻</span>
                        </button>
                    </div>

                    <div class="backup-status" data-role="status" style="display:none;"></div>
                    <div class="backup-content" data-role="content"></div>
                </div>
            </div>
        `;

        this.element = widget;
        this.tabsEl = widget.querySelector('[data-role="tabs"]');
        this.contentEl = widget.querySelector('[data-role="content"]');
        this.statusEl = widget.querySelector('[data-role="status"]');

        this._rendered = true;
        return widget;
    }

    bindEvents(container) {
        console.log('[Backup] bindEvents()');

        if (!this.element) return;

        // Tabs + header actions
        this.tabsEl.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                if (action === 'reload') this._reload();
                if (action === 'run') this._runLevel('hourly');
                return;
            }

            const tab = e.target.closest('[data-tab]');
            if (!tab) return;
            const name = tab.dataset.tab;
            if (name === this.activeTab) return;
            this._switchTab(name);
        });

        // Actions inside tab content
        this.contentEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const id = btn.dataset.id ? parseInt(btn.dataset.id, 10) : null;
            const level = btn.dataset.level || null;

            switch (action) {
                case 'settings-save':     this._saveSettings();      break;
                case 'settings-test':     this._testS3();            break;
                case 'schedule-run':      this._runLevel(level);     break;
                case 'schedule-edit':     this._editSchedule(id);    break;
                case 'schedule-toggle':   this._toggleSchedule(id);  break;
                case 'history-refresh':   this._reload();            break;
            }
        });

        // First load
        this._switchTab(this.activeTab).then(() => {
            this._initialized = true;
        });
    }

    destroy() {
        console.log('[Backup] destroy()');

        if (this.restoreCaption) {
            this.restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.element) {
            this.element.remove();
            this.element = null;
        }

        this.tabsEl = null;
        this.contentEl = null;
        this.statusEl = null;
        this.settingsSchema = null;
        this.settingsData = null;
        this.schedules = null;
        this.history = null;
        this._rendered = false;

        this._initialized = false;
        this._initPromise = null;
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/backup';
    }

    _servicesUrl() {
        const base = window.coreEngine?.baseUrl
            || (document.body.dataset.module
                ? `/core/engine/${document.body.dataset.module}`
                : '/core/engine/default');
        return `${base}?page=services`;
    }

    async _fetchSchema() {
        const json = await window.coreEngine.fetchJson(`${this._apiBase}/settings/schema`);
        this.settingsSchema = json.schema || null;
    }

    async _fetchSettings() {
        const json = await window.coreEngine.fetchJson(`${this._apiBase}/settings`);
        this.settingsData = json.data || null;
    }

    async _fetchSchedules() {
        const json = await window.coreEngine.fetchJson(`${this._apiBase}/schedules`);
        this.schedules = json.data || [];
    }

    async _fetchHistory() {
        const json = await window.coreEngine.fetchJson(`${this._apiBase}/list?limit=100`);
        this.history = json.data || [];
    }

    // ============================================
    // SAVE SETTINGS
    // ============================================

    /**
     * Read the form, build a settings object, PUT it to the backend.
     *
     * The form uses `data-field="<name>"` on each input. For nested
     * values, the name is dotted — "keep.hourly". We build the final
     * object by walking each input and setting the nested path.
     */
    async _saveSettings() {
        if (!this.settingsData) {
            this.settingsData = {};
        }

        const inputs = this.contentEl.querySelectorAll('[data-field]');
        const data = JSON.parse(JSON.stringify(this.settingsData)); // deep clone

        for (const input of inputs) {
            const field = input.dataset.field;
            if (!field) continue;

            let value = input.value;

            // Convert numbers for keep.*
            if (field.startsWith('keep.')) {
                value = parseInt(value, 10);
                if (isNaN(value)) value = 0;
            }

            // include is a comma-separated list
            if (field === 'include') {
                value = String(value)
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
            }

            // Set nested path
            this._setPath(data, field, value);
        }

        try {
            await window.coreEngine.fetchJson(`${this._apiBase}/settings`, {
                method: 'PUT',
                body: data,
            });
            this._showStatus('Настройки сохранены', 'success');

            // Update local cache with what we just saved, keeping
            // the secret-set marker.
            this.settingsData = data;
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка сохранения';
            this._showStatus(msg, 'error');
        }
    }

    /**
     * Set a value at a dotted path inside an object.
     * Creates intermediate objects if they do not exist.
     *
     *   _setPath(obj, "keep.hourly", 24)
     */
    _setPath(obj, path, value) {
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (typeof cur[k] !== 'object' || cur[k] === null) {
                cur[k] = {};
            }
            cur = cur[k];
        }
        cur[parts[parts.length - 1]] = value;
    }

    // ============================================
    // TEST S3
    // ============================================

    async _testS3() {
        const endpoint = this.contentEl.querySelector('[data-field="s3_endpoint"]')?.value || '';
        const region = this.contentEl.querySelector('[data-field="s3_region"]')?.value || '';
        const accessKey = this.contentEl.querySelector('[data-field="s3_access_key"]')?.value || '';
        const secretKey = this.contentEl.querySelector('[data-field="s3_secret_key"]')?.value || '';
        const remote = this.contentEl.querySelector('[data-field="rclone_remote"]')?.value || 'selectel';
        const bucket = this.contentEl.querySelector('[data-field="rclone_bucket"]')?.value || '';

        this._showStatus('Проверка подключения…', 'info');

        try {
            const json = await window.coreEngine.fetchJson(`${this._apiBase}/s3/test`, {
                method: 'POST',
                body: {
                    s3_endpoint: endpoint,
                    s3_region: region,
                    s3_access_key: accessKey,
                    s3_secret_key: secretKey,
                    rclone_remote: remote,
                    rclone_bucket: bucket,
                },
            });

            if (json.success) {
                const list = (json.buckets || []).join(', ') || '(пусто)';
                this._showStatus(`OK. Бакеты: ${list}`, 'success');
            } else {
                this._showStatus(`Ошибка: ${json.message}`, 'error');
            }
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка проверки';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // RUN LEVEL (manual, from header or a schedule row)
    // ============================================

    async _runLevel(level) {
        if (!level) {
            this._showStatus('Не указан уровень', 'error');
            return;
        }
        try {
            await window.coreEngine.fetchJson(`${this._apiBase}/run`, {
                method: 'POST',
                body: { level },
            });
            this._showStatus(`Бэкап ${level} запущен в фоне. Обновите историю через минуту.`, 'success');
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка запуска';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // EDIT SCHEDULE (cron / active)
    // ============================================

    async _editSchedule(id) {
        if (!id) return;
        const item = (this.schedules || []).find(t => t.id === id);
        if (!item) return;

        const version = window.coreEngine?.static_version || Date.now();
        const { createModal } = await import(
            `/static/core/engine/lib/base/modal/index.js?v=${version}`
        );

        const modal = await createModal('form');
        modal.setOnOk(async (data) => {
            if (!data.cron) {
                this._showStatus('Cron обязателен', 'error');
                return;
            }
            await this._putSchedule(id, {
                cron: data.cron,
                active: !!data.active,
            });
        });
        modal.open({
            title: `Расписание: ${item.title || item.name}`,
            okText: 'Сохранить',
            cancelText: 'Отмена',
            fields: [
                {
                    name: 'cron',
                    label: 'Cron-выражение',
                    type: 'text',
                    value: item.cron || '',
                    placeholder: '0 * * * *',
                },
                {
                    name: 'active',
                    label: 'Активна',
                    type: 'checkbox',
                    value: !!item.active,
                },
            ],
        });
    }

    async _toggleSchedule(id) {
        if (!id) return;
        const item = (this.schedules || []).find(t => t.id === id);
        if (!item) return;

        await this._putSchedule(id, { active: !item.active });
    }

    async _putSchedule(id, data) {
        try {
            const json = await window.coreEngine.fetchJson(
                `${this._apiBase}/schedules/${id}`,
                { method: 'PUT', body: data }
            );

            if (json.crontab_applied === false) {
                this._showStatus(
                    'Сохранено, но crontab не перегенерирован (проверь права на /etc/cron.d/)',
                    'error'
                );
            } else {
                this._showStatus('Расписание обновлено', 'success');
            }

            this.schedules = null;  // drop cache
            await this._switchTab('schedules');
        } catch (err) {
            const msg = err?.data?.detail || err.message || 'Ошибка сохранения';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // TABS
    // ============================================

    async _switchTab(name) {
        console.log('[Backup] _switchTab()', name);

        this.activeTab = name;

        this.tabsEl.querySelectorAll('.backup-tab').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.tab === name);
        });

        this.contentEl.innerHTML = '<div class="backup-loading">Загрузка…</div>';

        try {
            if (name === 'settings') {
                if (this.settingsSchema === null) await this._fetchSchema();
                if (this.settingsData === null)   await this._fetchSettings();
                this._renderSettings();
            } else if (name === 'schedules') {
                if (this.schedules === null) await this._fetchSchedules();
                this._renderSchedules();
            } else if (name === 'history') {
                if (this.history === null) await this._fetchHistory();
                this._renderHistory();
            }
        } catch (err) {
            console.error('[Backup] Tab load error:', err);
            this._renderError(err?.data?.detail || err.message || 'Ошибка загрузки');
        }
    }

    async _reload() {
        if (this.activeTab === 'settings') {
            this.settingsSchema = null;
            this.settingsData = null;
        }
        if (this.activeTab === 'schedules') this.schedules = null;
        if (this.activeTab === 'history')   this.history = null;
        await this._switchTab(this.activeTab);
    }

    // ============================================
    // TAB: SETTINGS
    // ============================================

    _renderSettings() {
        const data = this.settingsData || {};
        const keep = data.keep || {};
        const hasSecret = data.s3_secret_key_set === true;

        const secretPlaceholder = hasSecret
            ? '••••••••• (сохранён — оставь пустым, чтобы не менять)'
            : 'Secret Access Key';

        const html = `
            <div class="backup-scroll">
                <div class="backup-form">
                    <label class="backup-field">
                        <span class="backup-field-label">Папка проекта</span>
                        <span class="backup-field-hint">Что бэкапить (абсолютный путь)</span>
                        <input type="text" data-field="project_dir"
                               value="${this._escapeAttr(data.project_dir || '')}"
                               placeholder="/root/projects/aleksmir-dev/neurocad.ru">
                    </label>

                    <label class="backup-field">
                        <span class="backup-field-label">Локальная папка</span>
                        <span class="backup-field-hint">Куда складывать временные архивы</span>
                        <input type="text" data-field="local_dir"
                               value="${this._escapeAttr(data.local_dir || '')}"
                               placeholder="/root/backups/neurocad.ru">
                    </label>

                    <fieldset class="backup-fieldset">
                        <legend>S3 (Selectel)</legend>

                        <div class="backup-field-row">
                            <label class="backup-field">
                                <span class="backup-field-label">Endpoint</span>
                                <span class="backup-field-hint">https://s3.storage.selcloud.ru</span>
                                <input type="text" data-field="s3_endpoint"
                                       value="${this._escapeAttr(data.s3_endpoint || 'https://s3.storage.selcloud.ru')}">
                            </label>

                            <label class="backup-field">
                                <span class="backup-field-label">Регион</span>
                                <span class="backup-field-hint">ru-3 (СПб) или ru-1 (Москва)</span>
                                <input type="text" data-field="s3_region"
                                       value="${this._escapeAttr(data.s3_region || 'ru-3')}">
                            </label>
                        </div>

                        <div class="backup-field-row">
                            <label class="backup-field">
                                <span class="backup-field-label">rclone remote</span>
                                <span class="backup-field-hint">Имя remote в rclone.conf</span>
                                <input type="text" data-field="rclone_remote"
                                       value="${this._escapeAttr(data.rclone_remote || 'selectel')}">
                            </label>

                            <label class="backup-field">
                                <span class="backup-field-label">Бакет</span>
                                <span class="backup-field-hint">Имя бакета в S3</span>
                                <input type="text" data-field="rclone_bucket"
                                       value="${this._escapeAttr(data.rclone_bucket || 'neurocad-backups')}">
                            </label>
                        </div>

                        <div class="backup-field-row">
                            <label class="backup-field">
                                <span class="backup-field-label">Access Key ID</span>
                                <span class="backup-field-hint">Из панели Selectel</span>
                                <input type="text" data-field="s3_access_key"
                                       value="${this._escapeAttr(data.s3_access_key || '')}">
                            </label>

                            <label class="backup-field">
                                <span class="backup-field-label">Secret Access Key</span>
                                <span class="backup-field-hint">${hasSecret ? 'Сохранён' : 'Не сохранён'}</span>
                                <input type="password" data-field="s3_secret_key"
                                       value=""
                                       placeholder="${secretPlaceholder}">
                            </label>
                        </div>

                        <div class="backup-form-actions backup-form-actions-inline">
                            <button type="button" class="backup-btn" data-action="settings-test">
                                Проверить подключение
                            </button>
                        </div>
                    </fieldset>

                    <fieldset class="backup-fieldset">
                        <legend>Сколько хранить (последних архивов)</legend>
                        <div class="backup-keep-grid">
                            ${this._keepInput('hourly',  'Час',    keep.hourly  ?? 24)}
                            ${this._keepInput('daily',   'День',   keep.daily   ?? 7)}
                            ${this._keepInput('weekly',  'Неделя', keep.weekly  ?? 4)}
                            ${this._keepInput('monthly', 'Месяц',  keep.monthly ?? 12)}
                            ${this._keepInput('yearly',  'Год',    keep.yearly  ?? 1)}
                        </div>
                    </fieldset>

                    <label class="backup-field">
                        <span class="backup-field-label">Что включать в архив</span>
                        <span class="backup-field-hint">Через запятую, относительно папки проекта</span>
                        <textarea rows="3" data-field="include">${this._escape((data.include || []).join(', '))}</textarea>
                    </label>

                    <div class="backup-form-actions">
                        <button type="button" class="backup-btn backup-btn-primary" data-action="settings-save">
                            Сохранить настройки
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.contentEl.innerHTML = html;
    }

    _keepInput(level, label, value) {
        return `
            <label class="backup-keep">
                <span class="backup-keep-label">${label}</span>
                <input type="number" min="0" max="9999"
                       data-field="keep.${level}"
                       value="${Number(value)}">
            </label>
        `;
    }

    // ============================================
    // TAB: SCHEDULES
    // ============================================

    _renderSchedules() {
        const items = this.schedules || [];

        const rows = items.length === 0
            ? `<tr><td colspan="7" class="backup-empty">Нет расписаний</td></tr>`
            : items.map((t) => {
                const statusIcon =
                    t.last_status === 'success' ? '✅' :
                    t.last_status === 'failed'  ? '❌' :
                    '—';

                const errorText = t.last_error
                    ? this._escape(this._short(t.last_error, 40))
                    : '—';

                return `
                    <tr class="${t.active ? '' : 'backup-row-inactive'}">
                        <td>${this._escape(t.title || t.name)}</td>
                        <td><code>${this._escape(t.cron || '')}</code></td>
                        <td>${t.last_run_at ? this._formatDate(t.last_run_at) : '—'}</td>
                        <td>${statusIcon}</td>
                        <td>${t.next_run_at ? this._formatDate(t.next_run_at) : '—'}</td>
                        <td>${errorText}</td>
                        <td class="backup-actions">
                            <button type="button" class="backup-action-btn"
                                    data-action="schedule-run" data-level="${this._escapeAttr(t.name.replace(/^backup_/, ''))}"
                                    title="Запустить вручную">▶</button>
                            <button type="button" class="backup-action-btn"
                                    data-action="schedule-edit" data-id="${t.id}"
                                    title="Редактировать">✎</button>
                            <button type="button" class="backup-action-btn"
                                    data-action="schedule-toggle" data-id="${t.id}"
                                    title="${t.active ? 'Выключить' : 'Включить'}">${t.active ? '⏸' : '⏵'}</button>
                        </td>
                    </tr>
                `;
            }).join('');

        this.contentEl.innerHTML = `
            <div class="backup-hint">
                Расписания хранятся в <code>panel_tasks</code>.
                При сохранении файл <code>/etc/cron.d/neurocad</code>
                перегенерируется автоматически — системный cron подхватит изменения.
            </div>
            <div class="backup-scroll">
                <table class="backup-table">
                    <thead>
                        <tr>
                            <th>Задача</th>
                            <th>Cron</th>
                            <th>Последний</th>
                            <th>Статус</th>
                            <th>Следующий</th>
                            <th>Ошибка</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // TAB: HISTORY
    // ============================================

    _renderHistory() {
        const items = this.history || [];

        const rows = items.length === 0
            ? `<tr><td colspan="5" class="backup-empty">Нет записей</td></tr>`
            : items.map((r) => `
                <tr class="${r.status === 'success' ? 'backup-row-success' : 'backup-row-failed'}">
                    <td>${this._escape(r.level)}</td>
                    <td>${r.status === 'success' ? '✅ Успех' : '❌ Ошибка'}</td>
                    <td>${this._formatDate(r.finished_at)}</td>
                    <td>${this._formatBytes(r.size_bytes)}</td>
                    <td>${r.error ? this._escape(this._short(r.error, 80)) : '—'}</td>
                </tr>
            `).join('');

        this.contentEl.innerHTML = `
            <div class="backup-scroll">
                <table class="backup-table">
                    <thead>
                        <tr>
                            <th>Уровень</th>
                            <th>Статус</th>
                            <th>Завершён</th>
                            <th>Размер</th>
                            <th>Ошибка</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `backup-status backup-status-${type}`;
        this.statusEl.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                if (this.statusEl) this.statusEl.style.display = 'none';
            }, 5000);
        }
    }

    _renderError(text) {
        this.contentEl.innerHTML = `
            <div class="backup-error">
                <div class="backup-error-icon">❌</div>
                <div class="backup-error-text">${this._escape(text)}</div>
                <button type="button" class="backup-btn" data-action="history-refresh">Повторить</button>
            </div>
        `;
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

    _short(str, n) {
        const s = String(str || '');
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

    _formatBytes(bytes) {
        if (bytes == null) return '—';
        const b = Number(bytes);
        if (!isFinite(b) || b <= 0) return '—';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let v = b;
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024;
            i++;
        }
        return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
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