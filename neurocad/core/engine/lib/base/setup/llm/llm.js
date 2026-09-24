// neurocad/core/engine/lib/base/setup/llm/llm.js

/**
 * BaseSetupLlm — LLM settings page.
 *
 * Rendered into area-center by Base.showSetup('llm').
 * Loads LLM settings via GET /core/engine/lib/base/setup/llm
 * and saves them via PUT.
 *
 * Layout:
 *   - titlebar        — fixed at the top (save, close)
 *   - status / warning — fixed, just below the titlebar
 *   - active-provider row + <hr> — fixed, below the status
 *   - providers list  — scrollable; only the active provider is visible
 *
 * All provider blocks are kept in the DOM (with the `hidden` attribute
 * on the inactive ones) so that switching the select is instant and
 * the form payload always includes every provider's values.
 *
 * Props:
 *   - section    {string}   — 'llm'
 *   - user       {object}   — current user (from auth)
 *   - onNavigate {Function} — (section) => void, switches back to 'main'
 */
export class BaseSetupLlm {
    constructor(options = {}) {
        console.log('[BaseSetupLlm] Constructor called');

        this.options = options;
        this.section = options.section || 'llm';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.element = null;

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

        const response = await fetch(this._apiBase, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            let detail = '';
            try {
                const err = await response.json();
                detail = err.detail || '';
            } catch (e) { /* not JSON */ }
            throw new Error(detail || `HTTP ${response.status}`);
        }

        const json = await response.json();
        this.settings = json.data || { active_provider: 'deepseek', providers: {} };
        this.cryptoAvailable = json.crypto_available === true;

        console.log('[BaseSetupLlm] Settings loaded, crypto:', this.cryptoAvailable);
    }

    async _saveSettings() {
        console.log('[BaseSetupLlm] _saveSettings()');

        const payload = this._collectFormData();

        const response = await fetch(this._apiBase, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const json = await response.json();

        if (!response.ok) {
            throw new Error(json.detail || `HTTP ${response.status}`);
        }

        if (!json.success) {
            throw new Error(json.message || 'Не удалось сохранить настройки');
        }

        this.settings = json.data;
        this.cryptoAvailable = json.crypto_available === true;

        return json.message || null;
    }

    // ============================================
    // RENDER
    // ============================================

    render() {
        console.log('[BaseSetupLlm] render()');

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
                    <div class="llm-titlebar-title">Настройки LLM</div>
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
                    <div class="llm-provider-title">${this._providerLabel(name)}</div>
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
        const inputType = isNumber ? 'number' : 'text';
        const extraAttrs = isNumber ? 'min="1" step="1"' : '';

        return `
            <div class="llm-field">
                <label class="llm-label" for="${inputId}">${label}</label>
                <input
                    type="${inputType}"
                    id="${inputId}"
                    class="llm-input"
                    data-provider="${providerName}"
                    data-field="${field}"
                    value="${this._escapeAttr(v)}"
                    ${extraAttrs}>
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
            auth_key: 'Auth key',
            base_url: 'Base URL',
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
            const config = {};
            const fields = this._providerFields(name);
            for (const field of fields) {
                const input = root.querySelector(
                    `[data-provider="${name}"][data-field="${field}"]`
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
            providers[name] = config;
        }

        return { active_provider: activeProvider, providers };
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
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this._initialized = false;
        this._initPromise = null;
    }
}