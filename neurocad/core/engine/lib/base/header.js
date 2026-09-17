// app/core/engine/lib/base/header.js

export class Header {
    constructor(props) {
        this.props = props;
        this.logo = null;
        this.title = null;
        this.menu = null;
        this.user = props.user || null;
        this.auth = props.auth || null;
        this.initialized = false;

        this._loadCSS();
    }

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/header.css');
        }
    }

    async init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        const version = window.coreEngine?.static_version || Date.now();

        const [
            { Logo },
            { Title },
            { Menu }
        ] = await Promise.all([
            import(`./logo.js?v=${version}`),
            import(`./title.js?v=${version}`),
            import(`./menu.js?v=${version}`)
        ]);

        this.logo = new Logo(this.props.logoText);
        this.title = new Title(this.props.title);
        this.menu = new Menu({
            items: this.props.menu,
            user: this.user,
            auth: this.auth
        });
    }

    setUser(user) {
        this.user = user;
        if (this.menu) {
            this.menu.setUser(user);
        }
    }

    setAuth(auth) {
        this.auth = auth;
        if (this.menu) {
            this.menu.setAuth(auth);
        }
    }

    render() {
        if (!this.logo || !this.title || !this.menu) {
            return '<header class="core-engine-lib-base-header">Загрузка...</header>';
        }

        const menuHtml = this.menu.render();

        return `
            <header class="core-engine-lib-base-header">
                <div class="core-engine-lib-base-header-inner">
                    ${this.logo.render()}
                    ${this.title.render()}
                    <div class="core-engine-lib-base-menu" data-js="menu">
                        ${menuHtml}
                    </div>
                    <button class="core-engine-lib-base-burger" data-js="burger">☰</button>
                </div>
            </header>
        `;
    }

    bindEvents() {
        if (this.title) {
            this.title.bindEvents();
        }

        if (this.menu) {
            this.menu.bindEvents();
        }

        const burger = document.querySelector('[data-js="burger"]');
        if (burger) {
            burger.addEventListener('click', () => {
                if (this.menu) {
                    this.menu.toggleMobile();
                }
            });
        }

        document.addEventListener('click', (e) => {
            const menu = document.querySelector('[data-js="menu"]');
            const burgerEl = document.querySelector('[data-js="burger"]');
            if (this.menu && this.menu.isOpen) {
                const isClickInside = menu?.contains(e.target) || burgerEl?.contains(e.target);
                if (!isClickInside) {
                    this.menu.closeMobile();
                }
            }
        });
    }
}