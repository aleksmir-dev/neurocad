// neurocad/core/engine/lib/base/profile/profile.js

/**
 * BaseProfile — profile landing page.
 *
 * Rendered into area-center by Base.showProfile('main').
 * Provides navigation to profile sections (currently: balance,
 * domain, password) and opens the existing password-change page
 * (auth/password.js).
 *
 * Styles / FOUC
 * -------------
 * The component's stylesheet (profile.css) is loaded in _init(),
 * which is awaited by BaseAreas.renderInArea BEFORE render() runs.
 * That means the <link> is not only appended to <head> — it has
 * actually fired `load` and is in effect. By the time the element
 * reaches area-center and Base._initAuth reveals the body, the
 * page is fully styled.
 *
 * The earlier version fired loadCSS() in the constructor without
 * awaiting. The link was appended but not loaded, render() ran
 * immediately, and the user saw a flash of an unstyled menu
 * (FOUC) — the "menu items with no spacing" look that lasts until
 * profile.css finished downloading. Awaiting the CSS here is what
 * closes that gap. Same fix as setup.js.
 *
 * Props:
 *   - section        {string}   — 'main'
 *   - user           {object}   — current user (from auth)
 *   - setCaption     {Function} — (title, headerText) => saved; sets the caption
 *   - restoreCaption {Function} — (saved) => void; restores the caption
 *   - onNavigate     {Function} — (section) => void, switches to another section
 *
 * Caption: BaseProfile saves the current header/tab title on open and
 * restores it on destroy.
 */
export class BaseProfile {
    constructor(options = {}) {
        console.log('[BaseProfile] Constructor called');

        this.options = options;
        this.section = options.section || 'main';
        this.user = options.user || null;
        this.onNavigate = options.onNavigate || null;

        this.setCaption = options.setCaption || null;
        this.restoreCaption = options.restoreCaption || null;

        this.element = null;
        this._savedCaption = null;

        this._initialized = false;
        this._initPromise = null;

        // NOTE: _loadCSS() is NOT called here. It runs inside _init(),
        // which is awaited by BaseAreas.renderInArea before render().
        // That guarantees the stylesheet is fully loaded — not just
        // appended — before the element reaches area-center, so the
        // user never sees an unstyled flash.
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseProfile] _init() START');
        try {
            // Wait for the component's own stylesheet before letting
            // anyone render. _loadCSS is async and resolves only when
            // profile.css has fired `load` (or `error`). renderInArea
            // awaits this._initPromise, so the render path is: CSS
            // ready → render() → mount → Base reveals the body.
            await this._loadCSS();

            this._initialized = true;
            console.log('[BaseProfile] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseProfile] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    /**
     * Load the component's stylesheet and wait for it.
     *
     * window.coreEngine.loadCSS() returns a Promise that resolves
     * once the <link> fires `load` (or `error`). Awaiting it here
     * is what prevents the unstyled flash: by the time _init()
     * resolves, the stylesheet is already applied.
     */
    async _loadCSS() {
        console.log('[BaseProfile] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            await window.coreEngine.loadCSS('core/engine/lib/base/profile/profile.css');
        }
    }

    render() {
        console.log('[BaseProfile] render()');

        if (this.setCaption && !this._savedCaption) {
            this._savedCaption = this.setCaption('Профиль', 'Профиль');
        }

        const displayName = this.user?.name
            || this.user?.login
            || 'Пользователь';

        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-profile';
        wrapper.innerHTML = `
            <div class="profile-body">
                <header class="profile-header">
                    <p class="profile-subtitle">${this._escapeAttr(displayName)}</p>
                </header>

                <nav class="profile-menu">
                    <button type="button" class="profile-menu-item" data-action="balance">
                        <span class="profile-menu-item-body">
                            <span class="profile-menu-item-title">Баланс</span>
                            <span class="profile-menu-item-desc">Тариф, лимиты и остатки</span>
                        </span>
                        <span class="profile-menu-item-arrow">→</span>
                    </button>

                    <button type="button" class="profile-menu-item" data-action="domain">
                        <span class="profile-menu-item-body">
                            <span class="profile-menu-item-title">Управление доменами</span>
                            <span class="profile-menu-item-desc">Поддомен и свой домен 2 уровня</span>
                        </span>
                        <span class="profile-menu-item-arrow">→</span>
                    </button>

                    <button type="button" class="profile-menu-item" data-action="password">
                        <span class="profile-menu-item-body">
                            <span class="profile-menu-item-title">Смена пароля</span>
                            <span class="profile-menu-item-desc">Изменить пароль учётной записи</span>
                        </span>
                        <span class="profile-menu-item-arrow">→</span>
                    </button>
                </nav>
            </div>
        `;

        this.element = wrapper;
        return wrapper;
    }

    bindEvents(container) {
        console.log('[BaseProfile] bindEvents()');
        const root = container || this.element;
        if (!root) return;

        const balanceBtn = root.querySelector('[data-action="balance"]');
        if (balanceBtn) {
            balanceBtn.addEventListener('click', () => {
                if (typeof this.onNavigate === 'function') {
                    this.onNavigate('balance');
                }
            });
        }

        const domainBtn = root.querySelector('[data-action="domain"]');
        if (domainBtn) {
            domainBtn.addEventListener('click', () => {
                if (typeof this.onNavigate === 'function') {
                    this.onNavigate('domain');
                }
            });
        }

        const passwordBtn = root.querySelector('[data-action="password"]');
        if (passwordBtn) {
            passwordBtn.addEventListener('click', () => {
                // Password change is already implemented in auth/password.js.
                const auth = window.coreEngine?.auth;
                if (auth && typeof auth.showPassword === 'function') {
                    auth.showPassword();
                } else {
                    console.warn('[BaseProfile] coreEngine.auth.showPassword not available');
                }
            });
        }
    }

    _escapeAttr(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

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
        console.log('[BaseProfile] destroy()');

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