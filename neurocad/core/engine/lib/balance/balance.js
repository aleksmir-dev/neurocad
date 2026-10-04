// neurocad/core/engine/lib/balance/balance.js

/**
 * Balance — admin balance table (superadmin-only).
 *
 * Rendered into area-center by the "balance" page config
 * (app/default/balance.json → content: "{{ balance }}").
 *
 * Loads all users + their balance via
 *   GET /core/engine/lib/balance/list
 * and shows them in a table.
 *
 * Each row has three action buttons:
 *   - "Редактировать"  → opens edit/edit.js (modal, all Balance fields)
 *   - "Оплата"         → opens paid/paid.js (modal, sum += N)
 *   - "Войти"          → impersonate the user: calls
 *                        POST /core/auth/impersonate/{user_id}, then
 *                        reloads the page so every component
 *                        re-reads the new session. Available only
 *                        because the page itself is superadmin-only.
 *
 * QR-код Сбера:
 *   Above the table there's a small toolbar:
 *     - "Загрузить QR"  → opens a file picker (PNG only)
 *     - "Посмотреть QR" → opens the QR in a modal (BaseModalImage)
 *     - "Удалить QR"    → removes the file (with confirm)
 *   State (exists / url) is loaded from
 *     GET /core/engine/lib/balance/qr/status
 *
 *   The QR file itself is stored at media/<nav_id>/qr.png and is
 *   used by the tarif modal when a user has insufficient funds.
 *
 * Columns:
 *   - `gen`   — accumulated generations
 *   - `mb`    — used storage, in megabytes; formatted as "100 МБ"
 *               or "1 ГБ" via _formatStorage()
 *
 * Access:
 *   Only superadmin. The server enforces this on /list (403);
 *   this component also checks the same flag before rendering
 *   anything, so a non-superadmin who somehow lands on the page
 *   sees a "доступ запрещён" placeholder instead of an empty table.
 *
 * Rendering:
 *   The Renderer instantiates components and awaits their
 *   _initPromise — it does NOT call render() itself. So we call
 *   render() ourselves, from _init(), after data is loaded
 *   (or immediately, for the forbidden / error states).
 *
 *   IMPORTANT: the container passed to the constructor is a
 *   staging <div> (hidden), not area-center. Base.renderContent()
 *   takes our rootEl out of staging and moves it into
 *   area-center — and then removes the staging div. So on
 *   _reload() we must NOT re-append rootEl to this.container:
 *   that div is gone, and rootEl would end up detached.
 *   Instead, _reload() refreshes the table inside the existing
 *   rootEl (which already lives in area-center).
 *
 * Caption:
 *   On _init() we pick up the shared caption helpers from
 *   window.coreEngine.base (_setCaption / _restoreCaption) and set
 *   the header/tab title to "Управление балансом" while the page is
 *   on screen. The previous caption is restored in destroy().
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 */

export class Balance {
    constructor(container, props = {}) {
        console.log('[Balance] Constructor', { container, props });

        this.container = container;
        this.props = props;

        // Data
        this.items = [];
        this.isLoading = false;
        this.error = null;

        // QR state
        this.qr = {
            exists: false,
            url: null,
            uploading: false,
        };

        // Active modals
        this.editModal = null;
        this.paidModal = null;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        // Caption helpers — filled from window.coreEngine.base in _init().
        this._setCaption = null;
        this._restoreCaption = null;
        this._savedCaption = null;

        // DOM refs (filled in render())
        this.rootEl = null;
        this.tableBodyEl = null;
        this.statusEl = null;
        this.qrToolbarEl = null;
        this.fileInputEl = null;

        // Guard against double render (e.g. _init() + explicit call).
        this._rendered = false;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    _loadCSS() {
        if (window.coreEngine?.loadCSS) {
            window.coreEngine.loadCSS('core/engine/lib/balance/balance.css');
        }
    }

    async _init() {
        console.log('[Balance] _init() START');
        try {
            const base = window.coreEngine?.base;
            this._setCaption = base?._setCaption || null;
            this._restoreCaption = base?._restoreCaption || null;

            if (!this._isSuperadmin()) {
                console.warn('[Balance] Access denied (not superadmin)');
                this.error = 'forbidden';
                this.render();
                this._initialized = true;
                return;
            }

            if (this._setCaption && !this._savedCaption) {
                this._savedCaption = this._setCaption(
                    'Управление балансом',
                    'Управление балансом'
                );
            }

            // Load list and QR status in parallel.
            await Promise.all([
                this._loadList(),
                this._loadQrStatus(),
            ]);

            this.render();

            this._initialized = true;
            console.log('[Balance] _init() COMPLETE');
        } catch (error) {
            console.error('[Balance] Init error:', error);
            this.error = error.message || 'load_failed';
            this.render();
            this._initialized = true;
        }
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/balance';
    }

    get _navId() {
        // Nav instance — for media/<nav_id>/qr.png.
        // Priority: window.coreEngine.navId → data-nav-id on body.
        const v = window.coreEngine?.navId ?? document.body?.dataset?.navId;
        return v != null && v !== '' ? Number(v) : null;
    }

    async _loadList() {
        console.log('[Balance] _loadList()');

        this.isLoading = true;
        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const json = await fetchJson(`${this._apiBase}/list`);

            this.items = json.data || [];
            this.error = null;

            console.log('[Balance] Loaded items:', this.items.length);
        } catch (err) {
            console.error('[Balance] List load error:', err);
            this.items = [];
            this.error = err.message || 'load_failed';
        } finally {
            this.isLoading = false;
        }
    }

    async _loadQrStatus() {
        console.log('[Balance] _loadQrStatus()');

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const qs = this._navId != null ? `?nav_id=${this._navId}` : '';
            const json = await fetchJson(`${this._apiBase}/qr/status${qs}`);

            this.qr.exists = !!json.exists;
            this.qr.url = json.url || null;

            console.log('[Balance] QR status:', this.qr);
        } catch (err) {
            console.error('[Balance] QR status error:', err);
            this.qr.exists = false;
            this.qr.url = null;
        }
    }

    async _reload() {
        console.log('[Balance] _reload()');
        await this._loadList();

        if (this.rootEl && this.rootEl.parentNode) {
            this.tableBodyEl = this.rootEl.querySelector('[data-role="table-body"]');
            this.statusEl = this.rootEl.querySelector('[data-role="status"]');
            this._renderTable();
            console.log('[Balance] _reload() — table refreshed in place');
        } else {
            this._rendered = false;
            this.render();
            console.log('[Balance] _reload() — full re-render');
        }
    }

    // ============================================
    // RENDER
    // ============================================

    render() {
        console.log('[Balance] render()');

        if (this._rendered && this.rootEl && this.rootEl.parentNode) {
            console.log('[Balance] render() skipped (already rendered)');
            return this.rootEl;
        }

        this.rootEl = document.createElement('div');
        this.rootEl.className = 'core-engine-lib-balance';

        // Superadmin denied
        if (this.error === 'forbidden' || !this._isSuperadmin()) {
            this.rootEl.innerHTML = `
                <div class="balance-body">
                    <div class="balance-error">
                        <div class="balance-error-icon">🔒</div>
                        <div class="balance-error-text">Доступ запрещён</div>
                        <div class="balance-error-hint">
                            Раздел доступен только суперадминистраторам.
                        </div>
                    </div>
                </div>
            `;
            this.container.appendChild(this.rootEl);
            this._rendered = true;
            return this.rootEl;
        }

        // Load error
        if (this.error && this.error !== 'forbidden') {
            this.rootEl.innerHTML = `
                <div class="balance-body">
                    <div class="balance-error">
                        <div class="balance-error-icon">❌</div>
                        <div class="balance-error-text">Не удалось загрузить баланс</div>
                        <div class="balance-error-hint">${this._escape(this.error)}</div>
                        <button type="button" class="balance-btn" data-action="reload">Повторить</button>
                    </div>
                </div>
            `;
            this.container.appendChild(this.rootEl);
            this._rendered = true;

            const reloadBtn = this.rootEl.querySelector('[data-action="reload"]');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => this._reload());
            }

            return this.rootEl;
        }

        // Normal state
        this.rootEl.innerHTML = `
            <div class="balance-body">
                <div class="balance-titlebar">
                    <div class="balance-titlebar-left"></div>
                    <div class="balance-titlebar-title">Управление балансом</div>
                    <div class="balance-titlebar-right">
                        <button type="button" class="balance-icon-btn" data-action="reload" title="Обновить">
                            <span aria-hidden="true">↻</span>
                        </button>
                    </div>
                </div>

                <div class="balance-status" data-role="status" style="display:none;"></div>

                <div class="balance-qr-toolbar" data-role="qr-toolbar"></div>

                <div class="balance-scroll">
                    <table class="balance-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Логин</th>
                                <th>Имя</th>
                                <th>Тариф</th>
                                <th>Сумма</th>
                                <th>Токены</th>
                                <th>Ген</th>
                                <th>Страниц</th>
                                <th>Хранилище</th>
                                <th>Обновлено</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody data-role="table-body"></tbody>
                    </table>
                </div>
            </div>
        `;

        this.tableBodyEl = this.rootEl.querySelector('[data-role="table-body"]');
        this.statusEl = this.rootEl.querySelector('[data-role="status"]');
        this.qrToolbarEl = this.rootEl.querySelector('[data-role="qr-toolbar"]');

        this._renderQrToolbar();
        this._renderTable();

        this.container.appendChild(this.rootEl);
        this._rendered = true;

        this.bindEvents(this.rootEl);

        return this.rootEl;
    }

    _renderQrToolbar() {
        if (!this.qrToolbarEl) return;

        const hasQr = this.qr.exists;

        this.qrToolbarEl.innerHTML = `
            <div class="balance-qr-info">
                <span class="balance-qr-label">QR-код Сбера:</span>
                <span class="balance-qr-state ${hasQr ? 'is-ok' : 'is-missing'}">
                    ${hasQr ? 'загружен' : 'не загружен'}
                </span>
            </div>
            <div class="balance-qr-actions">
                <button type="button"
                        class="balance-qr-btn balance-qr-btn-primary"
                        data-action="qr-upload"
                        ${this.qr.uploading ? 'disabled' : ''}>
                    ${this.qr.uploading ? 'Загрузка…' : (hasQr ? 'Заменить QR' : 'Загрузить QR')}
                </button>
                <button type="button"
                        class="balance-qr-btn"
                        data-action="qr-view"
                        ${hasQr ? '' : 'disabled'}>
                    Посмотреть
                </button>
                <button type="button"
                        class="balance-qr-btn balance-qr-btn-danger"
                        data-action="qr-delete"
                        ${hasQr ? '' : 'disabled'}>
                    Удалить
                </button>
                <input type="file"
                       class="balance-qr-file"
                       data-role="qr-file"
                       accept=".png,image/png"
                       hidden>
            </div>
        `;

        this.fileInputEl = this.qrToolbarEl.querySelector('[data-role="qr-file"]');
    }

    _renderTable() {
        if (!this.tableBodyEl) return;

        if (!this.items || this.items.length === 0) {
            this.tableBodyEl.innerHTML = `
                <tr>
                    <td colspan="11" class="balance-empty">Нет пользователей</td>
                </tr>
            `;
            return;
        }

        this.tableBodyEl.innerHTML = this.items.map((item) => {
            const tarifClass = this._tarifClass(item.tarif);
            const updated = item.updated_at
                ? this._formatDate(item.updated_at)
                : '—';

            return `
                <tr data-user-id="${item.user_id}">
                    <td>${item.user_id}</td>
                    <td>${this._escape(item.login || '—')}</td>
                    <td>${this._escape(item.name || '—')}</td>
                    <td>
                        <span class="balance-tarif balance-tarif-${tarifClass}">
                            ${this._escape(item.tarif_label || 'Free')}
                        </span>
                    </td>
                    <td class="balance-num">${item.sum ?? 0}</td>
                    <td class="balance-num">${item.tokens ?? 0}</td>
                    <td class="balance-num">${item.gen ?? 0}</td>
                    <td class="balance-num">${item.pages ?? 0}</td>
                    <td class="balance-num">${this._formatStorage(item.mb ?? 0)}</td>
                    <td class="balance-date">${updated}</td>
                    <td class="balance-actions">
                        <button type="button"
                                class="balance-action-btn"
                                data-action="edit"
                                data-user-id="${item.user_id}">
                            Редактировать
                        </button>
                        <button type="button"
                                class="balance-action-btn balance-action-btn-primary"
                                data-action="paid"
                                data-user-id="${item.user_id}">
                            Оплата
                        </button>
                        <button type="button"
                                class="balance-action-btn balance-action-btn-impersonate"
                                data-action="impersonate"
                                data-user-id="${item.user_id}"
                                title="Войти под этим пользователем">
                            Войти
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // EVENTS
    // ============================================

    bindEvents(container) {
        console.log('[Balance] bindEvents()');

        const root = this.rootEl || container;
        if (!root) return;

        // Reload button
        root.querySelectorAll('[data-action="reload"]').forEach((btn) => {
            if (btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => this._reload());
        });

        // QR toolbar buttons (delegated on root — DOM may be re-rendered)
        if (root.dataset.qrBound !== '1') {
            root.dataset.qrBound = '1';

            root.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action^="qr-"]');
                if (!btn) return;

                const action = btn.dataset.action;
                if (action === 'qr-upload') this._handleQrUploadClick();
                else if (action === 'qr-view') this._handleQrView();
                else if (action === 'qr-delete') this._handleQrDelete();
            });

            // File input change — bound once, on root (delegated)
            root.addEventListener('change', (e) => {
                const el = e.target;
                if (!el.matches('[data-role="qr-file"]')) return;
                const files = Array.from(el.files || []);
                if (files.length) this._handleQrFile(files[0]);
                el.value = '';
            });
        }

        // Delegated click on table actions
        const tbody = root.querySelector('[data-role="table-body"]');
        if (tbody && tbody.dataset.bound !== '1') {
            tbody.dataset.bound = '1';
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const action = btn.dataset.action;
                const userId = parseInt(btn.dataset.userId, 10);
                if (!Number.isFinite(userId)) return;

                if (action === 'edit') {
                    this._openEdit(userId);
                } else if (action === 'paid') {
                    this._openPaid(userId);
                } else if (action === 'impersonate') {
                    this._handleImpersonate(userId);
                }
            });
        }
    }

    // ============================================
    // IMPERSONATE
    // ============================================

    /**
     * Start an impersonated session for `userId` and reload the page.
     *
     * The backend sets a new HttpOnly `access_token` cookie whose JWT
     * carries `sub = userId` and `imp_by = admin_id`. We do not see
     * the token here (it is HttpOnly by design) — we only verify the
     * success flag, then reload so every component re-reads the new
     * session.
     *
     * The endpoint is superadmin-only on the server side; the
     * surrounding page is already superadmin-only, so we do not
     * double-check the flag here.
     *
     * sessionStorage.clear()
     * ----------------------
     * The frontend keeps the current user in sessionStorage
     * (BaseAuth._restoreSession). After impersonation the cookie
     * already carries the impersonated user, but sessionStorage
     * still holds the admin — so on the next page load the UI
     * would render the admin shell while the backend sees the
     * impersonated user, causing spurious 403s.
     *
     * Clearing sessionStorage before reloading forces
     * auth._restoreSession() to re-read the session from the
     * (now updated) cookie instead of trusting stale data.
     */
    async _handleImpersonate(userId) {
        console.log('[Balance] _handleImpersonate() user =', userId);

        // Optional guard: do not impersonate the admin themselves.
        // Harmless, but avoids a pointless reload.
        const me = window.coreEngine?.auth?.getUser?.();
        if (me && Number(me.id) === Number(userId)) {
            this._showStatus('Вы уже вошли под этим пользователем', 'info');
            return;
        }

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const res = await fetchJson(`/core/auth/impersonate/${userId}`, {
                method: 'POST',
            });

            if (!res || !res.success) {
                this._showStatus('Не удалось войти под пользователем', 'error');
                return;
            }

            // Drop the cached user so that after reload
            // auth._restoreSession() re-reads the session from the
            // (now updated) cookie instead of trusting stale data
            // from sessionStorage.
            try {
                sessionStorage.clear();
            } catch (e) {
                // sessionStorage may be unavailable in some privacy
                // modes — ignore and rely on the reload alone.
            }

            // Reload so the whole UI re-reads the new session.
            window.location.reload();
        } catch (err) {
            console.error('[Balance] impersonate error:', err);
            const msg = err?.data?.detail?.message
                || err?.data?.detail
                || err.message
                || 'Не удалось войти под пользователем';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // QR — UPLOAD / VIEW / DELETE
    // ============================================

    _handleQrUploadClick() {
        if (!this.fileInputEl) return;
        this.fileInputEl.click();
    }

    async _handleQrFile(file) {
        console.log('[Balance] _handleQrFile()', file);

        // Client-side validation — only PNG.
        const isPng = file.type === 'image/png'
            || file.name.toLowerCase().endsWith('.png');

        if (!isPng) {
            this._showStatus(
                'Только PNG. Конвертируйте файл перед загрузкой.',
                'error'
            );
            return;
        }

        // Busy state
        this.qr.uploading = true;
        this._renderQrToolbar();
        this._hideStatus();

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const qs = this._navId != null ? `?nav_id=${this._navId}` : '';

            const form = new FormData();
            form.append('file', file);

            const json = await fetchJson(`${this._apiBase}/qr/upload${qs}`, {
                method: 'POST',
                body: form,
            });

            console.log('[Balance] QR uploaded:', json);

            this.qr.exists = true;
            this.qr.url = json.url || `/media/${this._navId}/qr.png`;
            this._showStatus('QR-код загружен', 'success');
        } catch (err) {
            console.error('[Balance] QR upload error:', err);
            const msg = err?.data?.detail || err.message || 'Ошибка загрузки';
            this._showStatus(msg, 'error');
        } finally {
            this.qr.uploading = false;
            this._renderQrToolbar();
        }
    }

    async _handleQrView() {
        if (!this.qr.exists) return;

        // Re-check status — url might be missing after a manual upload
        // to the media folder (outside the admin UI).
        if (!this.qr.url) {
            await this._loadQrStatus();
        }

        const src = this.qr.url || (this._navId != null ? `/media/${this._navId}/qr.png` : null);
        if (!src) {
            this._showStatus('QR-код не найден', 'error');
            return;
        }

        // Lazy-load createModal (base/modal/index.js)
        const version = window.coreEngine?.static_version || Date.now();
        let createModal;
        try {
            const mod = await import(
                `/static/core/engine/lib/base/modal/index.js?v=${version}`
            );
            createModal = mod.createModal;
        } catch (err) {
            console.error('[Balance] createModal load error:', err);
            // Fallback — open in new tab
            window.open(src, '_blank', 'noopener,noreferrer');
            return;
        }

        const modal = await createModal('image');
        if (!modal) {
            window.open(src, '_blank', 'noopener,noreferrer');
            return;
        }

        modal.open({
            src,
            title: 'QR-код Сбера',
            caption: 'Отсканируйте приложением банка для оплаты',
            alt: 'QR-код Сбера',
        });
    }

    async _handleQrDelete() {
        if (!this.qr.exists) return;

        const ok = window.confirm('Удалить QR-код?');
        if (!ok) return;

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const qs = this._navId != null ? `?nav_id=${this._navId}` : '';

            const json = await fetchJson(`${this._apiBase}/qr${qs}`, {
                method: 'DELETE',
            });

            console.log('[Balance] QR delete:', json);

            this.qr.exists = false;
            this.qr.url = null;

            this._renderQrToolbar();
            this._showStatus('QR-код удалён', 'success');
        } catch (err) {
            console.error('[Balance] QR delete error:', err);
            const msg = err?.data?.detail || err.message || 'Ошибка удаления';
            this._showStatus(msg, 'error');
        }
    }

    // ============================================
    // MODALS (edit / paid)
    // ============================================

    async _openEdit(userId) {
        console.log('[Balance] _openEdit() user =', userId);

        const version = window.coreEngine?.static_version || Date.now();
        let BalanceEdit;
        try {
            const mod = await import(`./edit/edit.js?v=${version}`);
            BalanceEdit = mod.BalanceEdit;
        } catch (err) {
            console.error('[Balance] edit.js load error:', err);
            this._showStatus('Не удалось открыть форму редактирования', 'error');
            return;
        }

        this.editModal = new BalanceEdit({
            userId,
            onSaved: async () => {
                await this._reload();
                this._showStatus('Изменения сохранены', 'success');
            },
            onClose: () => { this.editModal = null; },
        });

        if (this.editModal._initPromise) {
            await this.editModal._initPromise;
        }
    }

    async _openPaid(userId) {
        console.log('[Balance] _openPaid() user =', userId);

        const version = window.coreEngine?.static_version || Date.now();
        let BalancePaid;
        try {
            const mod = await import(`./paid/paid.js?v=${version}`);
            BalancePaid = mod.BalancePaid;
        } catch (err) {
            console.error('[Balance] paid.js load error:', err);
            this._showStatus('Не удалось открыть форму оплаты', 'error');
            return;
        }

        this.paidModal = new BalancePaid({
            userId,
            onSaved: async () => {
                await this._reload();
                this._showStatus('Оплата зачислена', 'success');
            },
            onClose: () => { this.paidModal = null; },
        });

        if (this.paidModal._initPromise) {
            await this.paidModal._initPromise;
        }
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `balance-status balance-status-${type}`;
        this.statusEl.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                if (this.statusEl) this.statusEl.style.display = 'none';
            }, 3000);
        }
    }

    _hideStatus() {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.style.display = 'none';
    }

    _tarifClass(tarif) {
        switch (tarif) {
            case 1: return 'pro';
            case 2: return 'llm';
            default: return 'free';
        }
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

    _formatStorage(mb) {
        const v = Number(mb) || 0;
        if (v >= 1024) {
            const gb = v / 1024;
            return `${gb.toFixed(1).replace(/\.0$/, '')} ГБ`;
        }
        return `${v} МБ`;
    }

    _escape(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _isSuperadmin() {
        const auth = window.coreEngine?.auth;
        if (!auth) return false;

        if (typeof auth.getUser === 'function') {
            const user = auth.getUser();
            if (!user) return false;
            const v = user.is_superadmin;
            return v === true || v === 1 || v === "1";
        }
        return false;
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

    destroy() {
        console.log('[Balance] destroy()');

        if (this._restoreCaption) {
            this._restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;

        if (this.editModal?.destroy) this.editModal.destroy();
        if (this.paidModal?.destroy) this.paidModal.destroy();
        this.editModal = null;
        this.paidModal = null;

        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = null;
        }

        this.tableBodyEl = null;
        this.statusEl = null;
        this.qrToolbarEl = null;
        this.fileInputEl = null;
        this.items = [];
        this._rendered = false;

        this._initialized = false;
        this._initPromise = null;
    }
}