// neurocad/core/engine/lib/base/setup/llm/llm.js

/**
 * BaseSetupLlm — LLM settings page.
 *
 * Rendered into area-center by Base.showSetup('llm').
 * Loads LLM settings via GET /core/engine/lib/base/setup/llm
 * and saves them via PUT.
 *
 * Test button:
 *   Each provider block has a "Проверить" button next to its title.
 *   Clicking it POSTs the current form values for that provider to
 *   /core/engine/lib/base/setup/llm/test. The result (success or
 *   error with a human-readable detail) is shown inline inside the
 *   same provider block, right below the header row.
 *
 *   /test returns HTTP 200 with { success: false, message, detail }
 *   on failure. fetchJson() throws on success:false and stores the
 *   full server response in err.data — _handleTest() reads both
 *   message and detail from there.
 *
 * Layout:
 *   - titlebar        — fixed at the top (save, close)
 *   - status / warning — fixed, just below the titlebar
 *   - active-provider row + <hr> — fixed, below the status
 *   - providers list  — scrollable; only the active provider is visible
 *     Each provider block contains:
 *       .llm-provider-header  — title + "Проверить" button
 *       .llm-test-status      — inline test result (hidden by default)
 *       ...fields...
 *
 * All provider blocks are kept in the DOM (with the `hidden` attribute
 * on the inactive ones) so that switching the select is instant and
 * the form payload always includes every provider's values.
 *
 * Uses window.coreEngine.fetchJson — loaded once by CoreEngine.loadApi().
 *
 * Props:
 *   - section        {string}   — 'llm'
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved; sets the caption
 *   - restoreCaption {Function} — (saved) => void; restores the caption
 *   - onNavigate     {Function} — (section) => void, switches back to 'main'
 *
 * Caption: BaseSetupLlm saves the current header/tab title on open and
 * restores it on destroy.
 */
export class BaseSetupLlm {
    constructor(options = {}) {
        console.log('[BaseSetupLlm] Constructor called');

        this.options = options;
        this.section = options.section || 'llm';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        // Caption helpers — provided by Base via options.
        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;

        // Saved caption state — filled in render(), used in destroy().
        this._savedCaption = null;

        // Loaded from the server.
        this.settings = null;
        this.cryptoAvailable = false;

        // Init state
        this._initialized = false;
        this._initPromise = null;

        this._loadCSS();

        this._initPromise = this._init();
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    async _init() {
        console.log('[BaseSetupLlm] _init() START');
        try {
            await this._loadSettings();
            this._initialized = true;
            console.log('[BaseSetupLlm] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseSetupLlm] Init error:', error);
            this._initialized = false;
            // Do not rethrow — render() will show the error state.
        }
    }

    _loadCSS() {
        console.log('[BaseSetupLlm] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/setup/llm/llm.css');
        }
    }

    // ============================================
    // API
    // ============================================

    get _apiBase() {
        return '/core/engine/lib/base/setup/llm';
    }

    async _loadSettings() {
        console.log('[BaseSetupLlm] _loadSettings()');

        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(this._apiBase);

        this.settings = json.data || { active_provider: 'deepseek', providers: {} };
        this.cryptoAvailable = json.crypto_available === true;

        console.log('[BaseSetupLlm] Settings loaded, crypto:', this.cryptoAvailable);
    }

    async _saveSettings() {
        console.log('[BaseSetupLlm] _saveSettings()');

        const payload = this._collectFormData();

        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(this._apiBase, {
            method: 'PUT',
            body: payload,
        });

        this.settings = json.data;
        this.cryptoAvailable = json.crypto_available === true;

        return json.message || null;
    }

    /**
     * Test one provider with the current form values (not the saved ones).
     *
     * POST /core/engine/lib/base/setup/llm/test
     *   { "provider": "gemini", "config": { ... } }
     *
     * Response (HTTP 200):
     *   { "success": true,  "message": "OK", "detail": "..." }
     *   { "success": false, "message": "Ошибка Gemini (400)", "detail": "..." }
     *
     * NOTE: fetchJson throws on success:false. Callers should catch
     * the error and read err.data (which contains the full response).
     */
    async _testProvider(providerName, providerConfig) {
        console.log('[BaseSetupLlm] _testProvider()', providerName);

        const fetchJson = window.coreEngine?.fetchJson;
        const json = await fetchJson(`${this._apiBase}/test`, {
            method: 'POST',
            body: {
                provider: providerName,
                config: providerConfig,
            },
        });

        return json;
    }

    // ============================================
    // RENDER
    // ============================================

    render() {
        console.log('[BaseSetupLlm] render()');

        // Save current title, set our own.
        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Настройки LLM', 'Настройки LLM');
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-setup-llm';

        if (!this.settings) {
            wrapper.innerHTML = `
                <div class="llm-body">
                    <div class="llm-error">
                        <div class="llm-error-icon">❌</div>
                        <div class="llm-error-text">Не удалось загрузить настройки LLM</div>
                        <button type="button" class="llm-btn" data-action="back">Назад</button>
                    </div>
                </div>
            `;
            this.element = wrapper;
            return wrapper;
        }

        wrapper.innerHTML = `
            <div class="llm-body">

                <div class="llm-titlebar">
                    <div class="llm-titlebar-left">
                        <button type="button" class="llm-icon-btn" data-action="save" title="Сохранить">
                            <img src="/static/core/engine/lib/base/images/save.svg"
                                 alt=""
                                 aria-hidden="true"
                                 class="llm-icon-img">
                        </button>
                    </div>
                    <div class="llm-titlebar-title"></div>
                    <div class="llm-titlebar-right">
                        <button type="button" class="llm-icon-btn" data-action="close" title="Закрыть">
                            <span aria-hidden="true">✕</span>
                        </button>
                    </div>
                </div>

                <div class="llm-status" data-js="llm-status" style="display:none;"></div>

                ${!this.cryptoAvailable ? `
                    <div class="llm-warning">
                        ⚠️ Ключ шифрования (NEUROCAD_SECRET_KEY) не настроен.
                        Секреты будут сохранены в открытом виде.
                    </div>
                ` : ''}

                <form class="llm-form" data-js="llm-form">

                    <div class="llm-active-row">
                        <label class="llm-label" for="llm-active-provider">Активный провайдер</label>
                        <select class="llm-select" id="llm-active-provider" data-js="llm-active-provider">
                            ${this._renderActiveProviderOptions()}
                        </select>
                    </div>

                    <hr class="llm-hr">

                    <div class="llm-scroll">
                        ${this._renderProviders()}
                    </div>
                </form>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    _renderActiveProviderOptions() {
        const active = this.settings.active_provider || 'deepseek';
        const providers = this._knownProviders();
        return providers.map(name => `
            <option value="${name}" ${name === active ? 'selected' : ''}>
                ${this._providerLabel(name)}
            </option>
        `).join('');
    }

    _renderProviders() {
        const active = this.settings.active_provider || 'deepseek';
        const providers = this._knownProviders();
        return providers.map(name => {
            const config = (this.settings.providers && this.settings.providers[name]) || {};
            const fields = this._providerFields(name);
            const hidden = name === active ? '' : 'hidden';
            return `
                <div class="llm-provider" data-provider="${name}" ${hidden}>
                    <div class="llm-provider-header">
                        <div class="llm-provider-title">${this._providerLabel(name)}</div>
                        <button type="button"
                                class="llm-test-btn"
                                data-action="test"
                                data-provider="${name}">
                            Проверить
                        </button>
                    </div>
                    <div class="llm-test-status"
                         data-js="llm-test-status-${name}"
                         style="display:none;"></div>
                    ${fields.map(field => this._renderField(name, field, config[field])).join('')}
                </div>
            `;
        }).join('');
    }

    _renderField(providerName, field, value) {
        const inputId = `llm-${providerName}-${field}`;
        const label = this._fieldLabel(field);
        const v = value == null ? '' : String(value);

        const isNumber = field === 'max_output_tokens' || field === 'timeout';
        const isTextarea = field === 'ca_pem';

        let inputHtml;
        if (isTextarea) {
            inputHtml = `
                <textarea
                    id="${inputId}"
                    class="llm-input llm-textarea"
                    data-provider="${providerName}"
                    data-field="${field}"
                    rows="8"
                    spellcheck="false"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                >${this._escapeAttr(v)}</textarea>
            `;
        } else {
            const inputType = isNumber ? 'number' : 'text';
            const extraAttrs = isNumber ? 'min="1" step="1"' : '';
            inputHtml = `
                <input
                    type="${inputType}"
                    id="${inputId}"
                    class="llm-input"
                    data-provider="${providerName}"
                    data-field="${field}"
                    value="${this._escapeAttr(v)}"
                    ${extraAttrs}>
            `;
        }

        return `
            <div class="llm-field">
                <label class="llm-label" for="${inputId}">${label}</label>
                ${inputHtml}
            </div>
        `;
    }

    // ============================================
    // PROVIDER METADATA
    // ============================================

    _knownProviders() {
        return ['deepseek', 'openai', 'yandex', 'gigachat', 'gemini'];
    }

    _providerLabel(name) {
        const labels = {
            deepseek: 'DeepSeek',
            openai: 'OpenAI',
            yandex: 'YandexGPT',
            gigachat: 'GigaChat',
            gemini: 'Google Gemini',
        };
        return labels[name] || name;
    }

    _providerFields(name) {
        const fields = {
            deepseek: ['api_key', 'base_url', 'model', 'max_output_tokens', 'timeout'],
            openai:   ['api_key', 'base_url', 'model', 'max_output_tokens', 'timeout'],
            yandex:   ['api_key', 'folder_id', 'model', 'max_output_tokens', 'timeout'],
            gigachat: ['auth_key', 'scope', 'ca_pem', 'model', 'max_output_tokens', 'timeout'],
            gemini:   ['api_key', 'model', 'max_output_tokens', 'timeout'],
        };
        return fields[name] || [];
    }

    _fieldLabel(field) {
        const labels = {
            api_key: 'API key',
            auth_key: 'Authorization Key',
            base_url: 'Base URL',
            proxy_url: 'Прокси (URL, необязательно)',
            model: 'Модель',
            max_output_tokens: 'Макс. выходных токенов',
            timeout: 'Таймаут (сек)',
            folder_id: 'Folder ID',
            scope: 'Scope',
            ca_pem: 'CA PEM',
        };
        return labels[field] || field;
    }

    // ============================================
    // FORM → PAYLOAD
    // ============================================

    _collectFormData() {
        const root = this.element || document;
        const activeSelect = root.querySelector('[data-js="llm-active-provider"]');
        const activeProvider = activeSelect ? activeSelect.value : 'deepseek';

        const providers = {};
        for (const name of this._knownProviders()) {
            providers[name] = this._collectProviderData(name);
        }

        return { active_provider: activeProvider, providers };
    }

    /**
     * Collect values for one provider's fields from the form.
     * Used both by _collectFormData() and by _handleTest().
     */
    _collectProviderData(providerName) {
        const root = this.element || document;
        const config = {};
        const fields = this._providerFields(providerName);

        for (const field of fields) {
            const input = root.querySelector(
                `[data-provider="${providerName}"][data-field="${field}"]`
            );
            if (!input) continue;

            const raw = input.value;
            if (raw === '') continue;

            if (field === 'max_output_tokens' || field === 'timeout') {
                const n = parseInt(raw, 10);
                if (!isNaN(n)) config[field] = n;
            } else {
                config[field] = raw;
            }
        }

        return config;
    }

    // ============================================
    // EVENTS
    // ============================================

    bindEvents(container) {
        console.log('[BaseSetupLlm] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        this.statusEl = root.querySelector('[data-js="llm-status"]');
        this.formEl = root.querySelector('[data-js="llm-form"]');

        // Save — titlebar icon.
        const saveBtn = root.querySelector('[data-action="save"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this._handleSave());
        }

        // Active provider select — show only the selected provider's fields.
        const activeSelect = root.querySelector('[data-js="llm-active-provider"]');
        if (activeSelect) {
            activeSelect.addEventListener('change', () => {
                this._showProvider(activeSelect.value);
            });
        }

        // Enter inside form — save.
        if (this.formEl) {
            this.formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this._handleSave();
            });
        }

        // Back (error state) and Close (titlebar) — same action: return to setup main.
        root.querySelectorAll('[data-action="back"], [data-action="close"]').forEach(btn => {
            btn.addEventListener('click', () => this._handleBack());
        });

        // Test buttons — one per provider.
        root.querySelectorAll('[data-action="test"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const providerName = btn.dataset.provider;
                this._handleTest(providerName, btn);
            });
        });
    }

    _showProvider(name) {
        console.log('[BaseSetupLlm] _showProvider()', name);
        const root = this.element;
        if (!root) return;

        root.querySelectorAll('.llm-provider').forEach(el => {
            if (el.dataset.provider === name) {
                el.removeAttribute('hidden');
            } else {
                el.setAttribute('hidden', '');
            }
        });
    }

    async _handleSave() {
        console.log('[BaseSetupLlm] _handleSave()');
        this._setLoading(true);
        this._hideStatus();

        try {
            const message = await this._saveSettings();
            this._showStatus(message || 'Настройки сохранены', 'success');
        } catch (err) {
            console.error('[BaseSetupLlm] Save error:', err);
            this._showStatus(`Ошибка сохранения: ${err.message}`, 'error');
        }

        this._setLoading(false);
    }

    /**
     * Test one provider with the current form values.
     * Shows the result inline in the provider block, right under the header.
     *
     * fetchJson throws on success:false — the full server response
     * (message + detail) is available in err.data, so we read both
     * from there in the catch branch.
     */
    async _handleTest(providerName, btn) {
        console.log('[BaseSetupLlm] _handleTest()', providerName);

        const config = this._collectProviderData(providerName);

        // Disable the button while testing.
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Проверяю...';
        }

        this._showTestStatus(
            providerName,
            `Проверяю ${this._providerLabel(providerName)}...`,
            'info'
        );

        try {
            const json = await this._testProvider(providerName, config);

            if (json.success) {
                const detail = json.detail ? ` (${json.detail})` : '';
                this._showTestStatus(
                    providerName,
                    `✅ ${this._providerLabel(providerName)}: OK${detail}`,
                    'success'
                );
            } else {
                // Safety net for backends that return success:false
                // with HTTP 200 and don't trip fetchJson.
                const message = json.message || 'Неизвестная ошибка';
                const detail = json.detail ? `: ${json.detail}` : '';
                this._showTestStatus(
                    providerName,
                    `❌ ${this._providerLabel(providerName)}: ${message}${detail}`,
                    'error'
                );
            }
        } catch (err) {
            console.error('[BaseSetupLlm] Test error:', err);

            // fetchJson throws on success:false — the full server
            // response is in err.data. Read message + detail from there.
            const data = err?.data || {};
            const message = data.message || err.message || 'Неизвестная ошибка';
            const detail = data.detail ? `: ${data.detail}` : '';

            this._showTestStatus(
                providerName,
                `❌ ${this._providerLabel(providerName)}: ${message}${detail}`,
                'error'
            );
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Проверить';
        }
    }

    _handleBack() {
        console.log('[BaseSetupLlm] _handleBack()');
        if (typeof this.onNavigate === 'function') {
            this.onNavigate('main');
        }
    }

    // ============================================
    // UI HELPERS
    // ============================================

    _setLoading(loading) {
        const root = this.element;
        if (!root) return;
        const titleSave = root.querySelector('[data-action="save"]');
        if (titleSave) {
            titleSave.disabled = loading;
        }
    }

    _showStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `llm-status llm-status-${type}`;
        this.statusEl.style.display = 'block';
    }

    _hideStatus() {
        if (!this.statusEl) return;
        this.statusEl.textContent = '';
        this.statusEl.style.display = 'none';
        this.statusEl.className = 'llm-status';
    }

    /**
     * Show the test result for one provider.
     * The status element lives inside the provider block
     * ([data-js="llm-test-status-<provider>"]).
     */
    _showTestStatus(providerName, text, type = 'info') {
        const root = this.element;
        if (!root) return;

        const el = root.querySelector(
            `[data-js="llm-test-status-${providerName}"]`
        );
        if (!el) return;

        el.textContent = text;
        el.className = `llm-test-status llm-test-status-${type}`;
        el.style.display = 'block';
    }

    /**
     * Hide the test result for one provider.
     */
    _hideTestStatus(providerName) {
        const root = this.element;
        if (!root) return;

        const el = root.querySelector(
            `[data-js="llm-test-status-${providerName}"]`
        );
        if (!el) return;

        el.textContent = '';
        el.style.display = 'none';
        el.className = 'llm-test-status';
    }

    _escapeAttr(text) {
        return String(text)
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
        console.log('[BaseSetupLlm] destroy()');

        // Restore the title that was on screen before we opened.
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