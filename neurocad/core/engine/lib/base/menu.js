// app/core/engine/lib/base/menu.js

/**
 * Menu — header menu.
 *
 * Rendered once (Server or Base.render) and then re-used. Because
 * of that, event handlers are attached ONCE via delegation on the
 * DOCUMENT — not per-item and not per-container. The container
 * `[data-js="menu"]` is re-created every time Base.render() rewrites
 * `document.body.innerHTML`; a listener bound to the old container
 * would silently stop working. A listener bound to `document`
 * survives any re-render.
 *
 * Navigation vs actions
 * ---------------------
 * Items that navigate to a URL are rendered as real <a href="...">,
 * WITHOUT any JS interceptor:
 *
 *   - "Главная"           — <a href="item.href">
 *   - "Профиль" (user)    — <a href="<module>?page=profile">
 *   - "Логин" (guest)     — <a href="<module>?auth=login">
 *   - "Баланс" (superadm) — <a href="<module>/balance">
 *   - items from `items`  — <a href="item.href">
 *
 * The browser handles them natively. If JS fails to load, or an
 * init step throws, or the menu was re-rendered without re-binding
 * — the links still work.
 *
 * Items that perform an ACTION (no URL) are rendered as <a href="#">
 * with `data-action="..."` and handled by the delegated listener:
 *
 *   - "Настройки" — opens setup page in area-center (superadmin)
 *   - "Выход" / "Вход" — auth.logout() / auth.showLogin()
 *
 * These deliberately keep href="#" so they remain focusable and
 * keyboard-accessible, but the click is intercepted (preventDefault)
 * because there is no real destination.
 *
 * URL scheme — auth vs page
 * -------------------------
 * The project does NOT expose /auth/login, /auth/profile, etc. as
 * standalone URLs. Query params on the CURRENT module are used
 * instead. They are split by MEANING:
 *
 *   `auth`  — which AUTH form to open, i.e. which form from
 *             base/auth/: login / register / restore / password.
 *             Strictly authentication. Does NOT carry `profile`.
 *
 *   `page`  — which APP page to open, i.e. which page from
 *             base/pages/: profile / setup. User-facing page inside
 *             the shell.
 *
 *   `section` — a sub-page inside `page`:
 *                 page=profile → section=balance / domain / ...
 *                 page=setup   → section=llm / ...
 *
 * So:
 *
 *   <module>?auth=login                    → login form
 *   <module>?auth=register                 → register form
 *   <module>?page=profile                  → profile landing
 *   <module>?page=profile&section=balance  → profile → balance
 *   <module>?page=setup                    → setup landing
 *
 * <module> here is window.coreEngine.baseUrl — e.g. /core/engine/admin.
 */
export class Menu {
    constructor(options = {}) {
        this.items = options.items || [];
        this.user = options.user || null;
        this.auth = options.auth || null;
        this.isOpen = false;

        // Whether the delegated listener has been attached to the
        // DOCUMENT. Attached once, on first bindEvents().
        //
        // NOTE: the listener is on `document`, not on the menu
        // container. The container is re-created every time
        // Base.render() rewrites document.body.innerHTML — a
        // container-bound listener would die with the old node.
        // A document-bound listener survives any number of
        // re-renders: it looks up the current container at click
        // time via `closest('[data-js="menu"]')`.
        this._bound = false;
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

    /**
     * Base URL of the current module, e.g. /core/engine/admin.
     * Everything else in this file builds URLs from it.
     *
     * Fallback to /core/engine/default if baseUrl is somehow missing
     * (defensive).
     */
    _moduleBaseUrl() {
        return window.coreEngine?.baseUrl
            || (document.body.dataset.module
                ? `/core/engine/${document.body.dataset.module}`
                : '/core/engine/default');
    }

    /**
     * Build a URL to an AUTH form on the CURRENT module.
     *
     * Auth forms are not standalone URLs in this project — they are
     * opened as `?auth=<form>` on the current module, and
     * Base._initAuth() picks the right form on load.
     *
     * Only login / register / restore / password. `profile` is NOT
     * an auth form — use _pageUrl('profile') for that.
     *
     * @param {string} form — 'login' | 'register' | 'restore' | 'password'
     * @returns {string}
     */
    _authUrl(form) {
        const base = this._moduleBaseUrl();
        return `${base}?auth=${form}`;
    }

    /**
     * Build a URL to an APP page on the CURRENT module.
     *
     * App pages are not standalone URLs in this project — they are
     * opened as `?page=<name>` on the current module, and
     * Base._initAuth() picks the right page on load. An optional
     * `section` narrows it down to a sub-page:
     *
     *   _pageUrl('profile')                     → ?page=profile
     *   _pageUrl('profile', 'balance')          → ?page=profile&section=balance
     *   _pageUrl('setup')                       → ?page=setup
     *
     * @param {string} page — 'profile' | 'setup'
     * @param {string} [section] — 'balance' | 'domain' | 'llm' | ...
     * @returns {string}
     */
    _pageUrl(page, section = null) {
        const base = this._moduleBaseUrl();
        const query = section
            ? `?page=${page}&section=${section}`
            : `?page=${page}`;
        return `${base}${query}`;
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

        // Profile link text + href depend on whether the user is
        // logged in. When logged in — the name, and href to the
        // profile page. When not — "Гость" and href to the login
        // page. The <a> element itself stays the same; we only
        // update text and href.
        if (this.user && this.user.login) {
            const displayName = this.user.name || this.user.login || 'Пользователь';
            guestEl.textContent = displayName;
            guestEl.setAttribute('href', this._pageUrl('profile'));

            loginEl.textContent = 'Выход';
            loginEl.setAttribute('data-action', 'logout');
            loginEl.setAttribute('href', '#');
        } else {
            guestEl.textContent = 'Гость';
            guestEl.setAttribute('href', this._authUrl('login'));

            loginEl.textContent = 'Вход';
            loginEl.setAttribute('data-action', 'auth');
            loginEl.setAttribute('href', '#');
        }
    }

    render() {
        const displayName = this.user && this.user.login
            ? (this.user.name || this.user.login || 'Пользователь')
            : 'Гость';

        const isLoggedIn = !!(this.user && this.user.login);

        const loginText = isLoggedIn ? 'Выход' : 'Вход';
        const loginAction = isLoggedIn ? 'logout' : 'auth';

        // Profile: real link. When logged in — opens the profile
        // page via ?page=profile on the current module. When not
        // logged in — opens the login form via ?auth=login.
        const profileHref = isLoggedIn
            ? this._pageUrl('profile')
            : this._authUrl('login');

        const moduleBaseUrl = this._moduleBaseUrl();

        const itemsHtml = this.items.map(item => {
            return `<a href="${item.href || '#'}" class="core-engine-lib-base-menu-item">${item.text}</a>`;
        }).join('');

        // Superadmin-only items: "Настройки" and "Баланс".
        // Hidden via inline style so updateUI() can toggle them
        // without re-rendering the whole menu.
        const superadminStyle = this._canSeeSetup() ? '' : 'display:none;';

        // "Баланс" — real link to the admin balance page (the
        // superadmin's own tabular view of everyone's balances).
        // This is a standalone route on the backend, not ?page=.
        const balanceHtml = `
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-balance"
               href="${moduleBaseUrl}/balance"
               style="${superadminStyle}">Баланс</a>
        `;

        // "Настройки" — action, not a navigation: opens the setup
        // page in area-center via base.showSetup(). href="#" keeps
        // the element focusable; the delegated listener intercepts
        // the click.
        const setupHtml = `
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-setup"
               href="#"
               data-action="setup"
               style="${superadminStyle}">Настройки</a>
        `;

        return `
            ${itemsHtml}
            ${balanceHtml}
            ${setupHtml}
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-guest"
               href="${profileHref}">${displayName}</a>
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-login"
               href="#"
               data-action="${loginAction}">${loginText}</a>
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

    /**
     * Attach the delegated click listener on `document`.
     *
     * Called once (idempotent — subsequent calls are no-ops).
     *
     * WHY `document` AND NOT THE MENU CONTAINER
     * -----------------------------------------
     * Base.render() rewrites `document.body.innerHTML` whenever the
     * page is re-initialised. That destroys the current
     * `[data-js="menu"]` container and creates a fresh one. A
     * listener attached to the OLD container dies with it, and the
     * new container has no listener — the "Выход" button silently
     * stops working.
     *
     * A listener attached to `document` survives every re-render.
     * At click time it looks up the CURRENT container via
     * `e.target.closest('[data-js="menu"]')` and only handles clicks
     * inside it. Everything else is ignored.
     *
     * Navigation items (<a href> without data-action) are NOT
     * intercepted — the browser follows them natively.
     */
    bindEvents() {
        if (this._bound) return;
        this._bound = true;

        document.addEventListener('click', (e) => {
            // Only react to clicks inside a menu container.
            const menu = e.target.closest('[data-js="menu"]');
            if (!menu) return;

            // Only react to [data-action] items inside that menu.
            const item = e.target.closest('[data-action]');
            if (!item || !menu.contains(item)) return;

            const action = item.getAttribute('data-action');

            switch (action) {
                case 'setup':
                    e.preventDefault();
                    if (!this._canSeeSetup()) return;
                    if (window.coreEngine?.base?.showSetup) {
                        window.coreEngine.base.showSetup('main');
                    } else {
                        console.warn('[Menu] coreEngine.base.showSetup not available');
                    }
                    break;

                case 'auth':
                    e.preventDefault();
                    if (this.auth && typeof this.auth.showLogin === 'function') {
                        this.auth.showLogin();
                    }
                    break;

                case 'logout':
                    e.preventDefault();
                    if (this.auth && typeof this.auth.logout === 'function') {
                        this.auth.logout();
                    }
                    break;

                default:
                    // Unknown action — do nothing, let the browser
                    // handle the link if there is one.
                    break;
            }

            if (this.isOpen) {
                this.closeMobile();
            }
        });
    }
}