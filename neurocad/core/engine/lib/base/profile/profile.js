// neurocad/core/engine/lib/base/profile/profile.js

/**
 * BaseProfile — profile landing page.
 *
 * Rendered into area-center by Base.showProfile('main').
 * Provides navigation to profile sections (currently: balance) and
 * opens the existing password-change page (auth/password.js).
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

        this._loadCSS();

        this._initPromise = this._init();
    }

    async _init() {
        console.log('[BaseProfile] _init() START');
        try {
            this._initialized = true;
            console.log('[BaseProfile] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseProfile] Init error:', error);
            this._initialized = false;
            throw error;
        }
    }

    _loadCSS() {
        console.log('[BaseProfile] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/profile/profile.css');
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