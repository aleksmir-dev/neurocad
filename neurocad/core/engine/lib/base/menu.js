// neurocad/core/engine/lib/base/menu.js

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
 *   - "Главная"           — <a href="<moduleBaseUrl>">
 *   - "Профиль" (user)    — <a href="<module>?page=profile">
 *   - "Логин" (guest)     — <a href="<module>?auth=login">
 *   - "Баланс" (superadm) — <a href="<module>/balance">
 *   - "Настройки"         — <a href="<module>?page=setup"> (all authed)
 *   - items from `items`  — <a href="item.href">
 *
 * The browser handles them natively. If JS fails to load, or an
 * init step throws, or the menu was re-rendered without re-binding
 * — the links still work.
 *
 * Items that perform an ACTION (no URL) are rendered as <a href="#">
 * with `data-action="..."` and handled by the delegated listener:
 *
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
 *             base/pages/: profile / setup / creatives. User-facing
 *             page inside the shell.
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
 *
 * Home item — hard target
 * -----------------------
 * The "Главная" item is a CONFIGURED menu entry (props.menu, from
 * the page JSON). Historically its href was "/" — which on the
 * platform host means the public landing page, not the admin shell.
 * That is why the header link went to the wrong place.
 *
 * The renderer now treats an href of "/" (or an empty href) as
 * "the current module root" and substitutes window.coreEngine.baseUrl
 * (e.g. /core/engine/admin). Any other href — a real path or an
 * absolute URL — is rendered as-is, so custom menu entries keep
 * working.
 *
 * This is a safety net: fixing the href in the page JSON is the
 * cleaner fix. The fallback exists so a stale config does not push
 * users to the wrong host.
 *
 * Access
 * ------
 * "Настройки" is visible to every authenticated user (it hosts
 * per-user sections like Creatives). "Баланс" stays superadmin-only.
 * Guests see neither.
 */
export class Menu {
    constructor(options = {}) {
        this.items = options.items || [];
        this.user = options.user || null;
        this.auth = options.auth || null;
        this.isOpen = false;

        // Whether the delegated listener has been attached to the
        // DOCUMENT. Attached once, on first bindEvents().
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
     * Whether the user is authenticated.
     *
     * Used for "Настройки" — shown to every authenticated user
     * (they host per-user sections like Creatives).
     */
    _isAuthed() {
        return !!(this.user && this.user.login);
    }

    /**
     * Whether current user can see superadmin-only items
     * ("Баланс").
     */
    _canSeeBalance() {
        return this.user?.is_superadmin === true;
    }

    /**
     * Base URL of the current module, e.g. /core/engine/admin.
     * Everything else in this file builds URLs from it.
     */
    _moduleBaseUrl() {
        return window.coreEngine?.baseUrl
            || (document.body.dataset.module
                ? `/core/engine/${document.body.dataset.module}`
                : '/core/engine/default');
    }

    /**
     * Build a URL to an AUTH form on the CURRENT module.
     */
    _authUrl(form) {
        const base = this._moduleBaseUrl();
        return `${base}?auth=${form}`;
    }

    /**
     * Build a URL to an APP page on the CURRENT module.
     */
    _pageUrl(page, section = null) {
        const base = this._moduleBaseUrl();
        const query = section
            ? `?page=${page}&section=${section}`
            : `?page=${page}`;
        return `${base}${query}`;
    }

    /**
     * Resolve an item href from the page JSON.
     *
     * A configured href of "/" (or "" / null) is treated as
     * "the current module root" and rewritten to the module base
     * URL — /core/engine/admin on the admin module. Any other
     * value is left untouched: real paths, absolute URLs, and
     * future deep links all render verbatim.
     *
     * Why: on the platform host "/" means the PUBLIC landing page
     * (or the owner's home redirect on a user domain), not the
     * admin shell. The menu is part of the admin shell, so its
     * home link must stay inside the shell.
     */
    _resolveItemHref(item) {
        const raw = item && item.href ? String(item.href) : '';

        if (raw === '' || raw === '/') {
            return this._moduleBaseUrl();
        }

        return raw;
    }

    updateUI() {
        const guestEl = document.querySelector('.core-engine-lib-base-menu-guest');
        const loginEl = document.querySelector('.core-engine-lib-base-menu-login');
        const setupEl = document.querySelector('.core-engine-lib-base-menu-setup');
        const balanceEl = document.querySelector('.core-engine-lib-base-menu-balance');

        // "Настройки" — for every authenticated user.
        if (setupEl) {
            setupEl.style.display = this._isAuthed() ? '' : 'none';
        }

        // "Баланс" — superadmin-only.
        if (balanceEl) {
            balanceEl.style.display = this._canSeeBalance() ? '' : 'none';
        }

        if (!guestEl || !loginEl) return;

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

        const profileHref = isLoggedIn
            ? this._pageUrl('profile')
            : this._authUrl('login');

        const moduleBaseUrl = this._moduleBaseUrl();

        // Items from the page JSON (props.menu). The href is passed
        // through _resolveItemHref — a bare "/" becomes the module
        // base URL, everything else is used as-is.
        const itemsHtml = this.items.map(item => {
            const href = this._resolveItemHref(item);
            return `<a href="${href}" class="core-engine-lib-base-menu-item">${item.text}</a>`;
        }).join('');

        // "Баланс" — superadmin-only. Hidden via inline style so
        // updateUI() can toggle it without re-rendering.
        const balanceStyle = this._canSeeBalance() ? '' : 'display:none;';
        const balanceHtml = `
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-balance"
               href="${moduleBaseUrl}/balance"
               style="${balanceStyle}">Баланс</a>
        `;

        // "Настройки" — for every authenticated user. A real <a href>
        // to ?page=setup on the current module — no JS interceptor,
        // so F5, bookmarks and the browser Back button all work.
        // Hidden for guests via inline style.
        const setupStyle = this._isAuthed() ? '' : 'display:none;';
        const setupHtml = `
            <a class="core-engine-lib-base-menu-item core-engine-lib-base-menu-setup"
               href="${moduleBaseUrl}?page=setup"
               style="${setupStyle}">Настройки</a>
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
     * Only `data-action` items are intercepted. Real <a href> links
     * ("Настройки", "Баланс", "Профиль", "Главная", auth form links)
     * are followed by the browser natively — no JS interceptor.
     */
    bindEvents() {
        if (this._bound) return;
        this._bound = true;

        document.addEventListener('click', (e) => {
            const menu = e.target.closest('[data-js="menu"]');
            if (!menu) return;

            const item = e.target.closest('[data-action]');
            if (!item || !menu.contains(item)) return;

            const action = item.getAttribute('data-action');

            switch (action) {
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
                    break;
            }

            if (this.isOpen) {
                this.closeMobile();
            }
        });
    }
}