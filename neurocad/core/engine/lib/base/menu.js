// app/core/engine/lib/base/menu.js

export class Menu {
    constructor(options = {}) {
        this.items = options.items || [];
        this.user = options.user || null;
        this.auth = options.auth || null;
        this.isOpen = false;
    }

    setUser(user) {
        this.user = user;
        this.updateUI();
    }

    setAuth(auth) {
        this.auth = auth;
    }

    /**
     * Whether current user can see superadmin-only items
     * ("Настройки" and "Баланс").
     */
    _canSeeSetup() {
        return this.user?.is_superadmin === true;
    }

    updateUI() {
        const guestEl = document.querySelector('.core-engine-lib-base-menu-guest');
        const loginEl = document.querySelector('.core-engine-lib-base-menu-login');
        const setupEl = document.querySelector('.core-engine-lib-base-menu-setup');
        const balanceEl = document.querySelector('.core-engine-lib-base-menu-balance');

        // Show / hide superadmin-only items.
        const show = this._canSeeSetup();
        if (setupEl) {
            setupEl.style.display = show ? '' : 'none';
        }
        if (balanceEl) {
            balanceEl.style.display = show ? '' : 'none';
        }

        if (!guestEl || !loginEl) return;

        if (this.user && this.user.login) {
            const displayName = this.user.name || this.user.login || 'Пользователь';
            guestEl.textContent = displayName;
            guestEl.dataset.action = 'profile';
            loginEl.textContent = 'Выход';
            loginEl.dataset.action = 'logout';
        } else {
            guestEl.textContent = 'Гость';
            guestEl.dataset.action = '';
            loginEl.textContent = 'Вход';
            loginEl.dataset.action = 'auth';
        }
    }

    render() {
        const displayName = this.user && this.user.login
            ? (this.user.name || this.user.login || 'Пользователь')
            : 'Гость';

        const loginText = this.user && this.user.login ? 'Выход' : 'Вход';
        const loginAction = this.user && this.user.login ? 'logout' : 'auth';

        const itemsHtml = this.items.map(item => {
            return `<a href="${item.href || '#'}" class="core-engine-lib-base-menu-item">${item.text}</a>`;
        }).join('');

        // Superadmin-only items: "Настройки" and "Баланс".
        // Hidden via inline style so updateUI() can toggle them
        // without re-rendering the whole menu.
        const superadminStyle = this._canSeeSetup() ? '' : 'display:none;';

        const balanceHtml = `
            <span class="core-engine-lib-base-menu-item core-engine-lib-base-menu-balance"
                  data-action="balance"
                  style="${superadminStyle}">Баланс</span>
        `;

        const setupHtml = `
            <span class="core-engine-lib-base-menu-item core-engine-lib-base-menu-setup"
                  data-action="setup"
                  style="${superadminStyle}">Настройки</span>
        `;        

        return `
            ${itemsHtml}
            ${balanceHtml}
            ${setupHtml}            
            <span class="core-engine-lib-base-menu-item core-engine-lib-base-menu-guest" data-action="profile">${displayName}</span>
            <span class="core-engine-lib-base-menu-item core-engine-lib-base-menu-login" data-action="${loginAction}">${loginText}</span>
        `;
    }

    toggleMobile() {
        const menu = document.querySelector('[data-js="menu"]');
        if (!menu) return;

        this.isOpen = !this.isOpen;
        document.body.classList.toggle('menu-open', this.isOpen);
        menu.classList.toggle('mobile-open', this.isOpen);
    }

    closeMobile() {
        if (!this.isOpen) return;
        this.toggleMobile();
    }

    bindEvents() {
        const menuItems = document.querySelectorAll('.core-engine-lib-base-menu-item');
        menuItems.forEach((item) => {
            if (item.classList.contains('core-engine-lib-base-menu-guest') ||
                item.classList.contains('core-engine-lib-base-menu-login') ||
                item.classList.contains('core-engine-lib-base-menu-setup') ||
                item.classList.contains('core-engine-lib-base-menu-balance')) {
                return;
            }

            item.addEventListener('click', (e) => {
                e.preventDefault();
                const href = item.getAttribute('href');
                if (href && href !== '#') {
                    window.location.href = href;
                }
                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });

        // "Настройки" — opens setup page in area-center (superadmin only).
        const setupItems = document.querySelectorAll('[data-action="setup"]');
        setupItems.forEach(item => {
            item.style.cursor = 'pointer';

            item.addEventListener('click', () => {
                if (!this._canSeeSetup()) return;

                if (window.coreEngine?.base?.showSetup) {
                    window.coreEngine.base.showSetup('main');
                } else {
                    console.warn('[Menu] coreEngine.base.showSetup not available');
                }

                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });

        // "Баланс" — opens the balance admin page (superadmin only).
        // This is a standalone page (app/balance/balance.json), so it
        // navigates via window.location.href — not base.renderInArea().
        const balanceItems = document.querySelectorAll('[data-action="balance"]');
        balanceItems.forEach(item => {
            item.style.cursor = 'pointer';

            item.addEventListener('click', () => {
                if (!this._canSeeSetup()) return;

                window.location.href = '/core/engine/default/balance';

                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });

        const loginItems = document.querySelectorAll('[data-action="auth"], [data-action="logout"]');
        loginItems.forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;

                if (action === 'auth') {
                    if (this.auth && typeof this.auth.showLogin === 'function') {
                        this.auth.showLogin();
                    }
                } else if (action === 'logout') {
                    if (this.auth && typeof this.auth.logout === 'function') {
                        this.auth.logout();
                    }
                }

                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });

        const guestItems = document.querySelectorAll('[data-action="profile"]');
        guestItems.forEach(item => {
            item.style.cursor = 'pointer';

            item.addEventListener('click', () => {
                if (this.user && this.user.login) {
                    // Profile lives in lib/base/profile (Base.showProfile).
                    // Fallback to auth.showProfile() for backward compat.
                    if (window.coreEngine?.base?.showProfile) {
                        window.coreEngine.base.showProfile('main');
                    } else if (this.auth && typeof this.auth.showProfile === 'function') {
                        this.auth.showProfile();
                    } else {
                        console.warn('[Menu] No profile handler available');
                    }
                }

                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });
    }
}