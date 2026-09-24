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
     * Whether current user can see the "Настройки" menu item.
     * Only superadmins.
     */
    _canSeeSetup() {
        return this.user?.is_superadmin === true;
    }

    updateUI() {
        const guestEl = document.querySelector('.core-engine-lib-base-menu-guest');
        const loginEl = document.querySelector('.core-engine-lib-base-menu-login');
        const setupEl = document.querySelector('.core-engine-lib-base-menu-setup');

        // Show / hide "Настройки" based on role.
        if (setupEl) {
            setupEl.style.display = this._canSeeSetup() ? '' : 'none';
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

        // "Настройки" — visible to superadmins only.
        // Hidden via inline style so we can toggle it in updateUI()
        // without re-rendering the whole menu.
        const setupStyle = this._canSeeSetup() ? '' : 'display:none;';
        const setupHtml = `
            <span class="core-engine-lib-base-menu-item core-engine-lib-base-menu-setup"
                  data-action="setup"
                  style="${setupStyle}">Настройки</span>
        `;

        return `
            ${itemsHtml}
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
                item.classList.contains('core-engine-lib-base-menu-setup')) {
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
                    if (this.auth && typeof this.auth.showProfile === 'function') {
                        this.auth.showProfile();
                    }
                }

                if (this.isOpen) {
                    this.closeMobile();
                }
            });
        });
    }
}