// neurocad/core/engine/lib/base/pages.js

/**
 * BasePages — page controllers for area-center.
 *
 * Owns the five "page-level" entry points that replace area-center
 * with a full-page component:
 *
 *   - showProfile(section)  — user profile (main / balance / domain)
 *   - showSetup(section)    — setup landing + sub-pages (main / llm / creatives)
 *   - showCreatives()       — creatives page (top-level, ?page=creatives)
 *   - showServices(section) — services page (superadmin, or botinv for
 *                             users with use_botinv = True)
 *   - showAuthPage()        — auth fallback page (login/register/...)
 *
 * Each show* method:
 *   1. checks the guard (authenticated / superadmin / use_botinv);
 *   2. calls base.teardownAreas() — destroys the previous page, may
 *      prompt the user via confirmClose();
 *   3. dynamically imports the target component with ?v=<static_version>;
 *   4. calls base.renderInArea(ComponentClass, options).
 *
 * Navigation between sections is done by passing `onNavigate` down to
 * the component — the component calls it with the next section name,
 * and it calls back into this module. Exceptions: showCreatives and
 * showServices do not pass onNavigate — their sections are handled
 * via real URLs (full page reload), not in-place navigation.
 *
 * All state lives on the owning Base instance:
 *   - base.auth, base.savedContent, base.redirectUrl, base.authRedirect
 *
 * No imports. Loaded dynamically from Base._loadModules() with a
 * cache-busting ?v= query.
 */
export class BasePages {
    constructor(base) {
        this.base = base;
    }

    // ============================================
    // PROFILE
    // ============================================

    /**
     * Open a profile page in area-center.
     *
     * Available to any authenticated user (no superadmin check).
     *
     * Three sections, three separate components:
     *   - 'main'    → profile/profile.js          (BaseProfile)
     *   - 'balance' → profile/balance/balance.js  (BaseProfileBalance)
     *   - 'domain'  → profile/domain/domain.js    (BaseProfileDomain)
     *
     * Password change is NOT a profile section — it lives in
     * auth/password.js and is opened directly via auth.showPassword()
     * from the profile landing page.
     *
     * @param {string} section — 'main' (default), 'balance' or 'domain'
     */
    async showProfile(section = 'main') {
        console.log('[BasePages] showProfile()', section);

        const user = this.base.auth?.getUser?.();
        if (!user) {
            console.warn('[BasePages] showProfile: access denied (not authenticated)');
            if (this.base.auth) this.base.auth.showLogin();
            return;
        }

        const proceed = await this.base.teardownAreas();
        if (!proceed) {
            console.log('[BasePages] showProfile cancelled by user');
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();

        let ComponentClass = null;
        try {
            if (section === 'balance') {
                const mod = await import(`./profile/balance/balance.js?v=${version}`);
                ComponentClass = mod.BaseProfileBalance;
            } else if (section === 'domain') {
                const mod = await import(`./profile/domain/domain.js?v=${version}`);
                ComponentClass = mod.BaseProfileDomain;
            } else {
                const mod = await import(`./profile/profile.js?v=${version}`);
                ComponentClass = mod.BaseProfile;
            }
        } catch (err) {
            console.error('[BasePages] showProfile import error:', err);
            return;
        }

        if (!ComponentClass) {
            console.error('[BasePages] showProfile: component class not found for section', section);
            return;
        }

        await this.base.renderInArea(ComponentClass, {
            section,
            user,
            setCaption: this.base._setCaption,
            restoreCaption: this.base._restoreCaption,
            onNavigate: (nextSection) => this.showProfile(nextSection),
        });
    }

    /**
     * Open a setup page (any authenticated user).
     *
     * Available to every authenticated user — the setup section
     * hosts per-user tools like "Настройки LLM" and "Креативы".
     * Server-side permissions are still enforced on the API
     * endpoints themselves.
     *
     * Three sections, three separate components:
     *   - 'main'      → setup/setup.js            (BaseSetup)     — setup landing page
     *   - 'llm'       → setup/llm/llm.js          (BaseSetupLlm)  — LLM settings page
     *   - 'creatives' → ../creatives/creatives.js (Creatives)     — creatives and placements
     *
     * @param {string} section — 'main' (default), 'llm' or 'creatives'
     */
    async showSetup(section = 'main') {
        console.log('[BasePages] showSetup()', section);

        // Any authenticated user may open setup. Guests cannot — the
        // menu hides the item for them, and this is the server-side
        // mirror of that rule (server enforces it on the API anyway).
        const user = this.base.auth?.getUser?.();
        if (!user) {
            console.warn('[BasePages] showSetup: access denied (not authenticated)');
            return;
        }

        const proceed = await this.base.teardownAreas();
        if (!proceed) {
            console.log('[BasePages] showSetup cancelled by user');
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();

        let ComponentClass = null;
        try {
            if (section === 'llm') {
                const mod = await import(`./setup/llm/llm.js?v=${version}`);
                ComponentClass = mod.BaseSetupLlm;
            } else if (section === 'creatives') {
                const mod = await import(`../creatives/creatives.js?v=${version}`);
                ComponentClass = mod.Creatives;
            } else {
                const mod = await import(`./setup/setup.js?v=${version}`);
                ComponentClass = mod.BaseSetup;
            }
        } catch (err) {
            console.error('[BasePages] showSetup import error:', err);
            return;
        }

        if (!ComponentClass) {
            console.error('[BasePages] showSetup: component class not found for section', section);
            return;
        }

        await this.base.renderInArea(ComponentClass, {
            section,
            user,
            setCaption: this.base._setCaption,
            restoreCaption: this.base._restoreCaption,
            onNavigate: (nextSection) => this.showSetup(nextSection),
        });
    }

    // ============================================
    // CREATIVES
    // ============================================

    /**
     * Open the Creatives page in area-center.
     *
     * Available to every authenticated user — the page hosts
     * per-user creatives and placements. Guests are stopped here;
     * the server enforces the same rule on the API endpoints.
     *
     * Unlike showProfile/showSetup there are no sub-sections:
     * Creatives is a single page with its own internal tabs
     * (Креативы / Размещения / Отчёт). The URL that leads here
     * is ?page=creatives on the current module.
     *
     * No `onNavigate` is passed — tabs are handled inside the
     * component, not via BasePages.
     */
    async showCreatives() {
        console.log('[BasePages] showCreatives()');

        const user = this.base.auth?.getUser?.();
        if (!user) {
            console.warn('[BasePages] showCreatives: access denied (not authenticated)');
            return;
        }

        const proceed = await this.base.teardownAreas();
        if (!proceed) {
            console.log('[BasePages] showCreatives cancelled by user');
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();

        let ComponentClass = null;
        try {
            const mod = await import(`../creatives/creatives.js?v=${version}`);
            ComponentClass = mod.Creatives;
        } catch (err) {
            console.error('[BasePages] showCreatives import error:', err);
            return;
        }

        if (!ComponentClass) {
            console.error('[BasePages] showCreatives: Creatives class not found');
            return;
        }

        await this.base.renderInArea(ComponentClass, {
            section: 'creatives',
            user,
            setCaption: this.base._setCaption,
            restoreCaption: this.base._restoreCaption,
        });
    }

    // ============================================
    // SERVICES
    // ============================================

    /**
     * Open the Services page in area-center.
     *
     * Access is per-section:
     *
     *   - landing / 'backup' / 'panel' — SUPERADMIN ONLY. Services
     *     expose system-level tools (backup, panel, metrics). Guests
     *     and regular users are stopped by the guard below; the
     *     server enforces the same rule on the API endpoints.
     *
     *   - 'botinv' — SUPERADMIN OR any user with use_botinv = True.
     *     The inventory module is a per-user tool; the flag is set
     *     manually in the DB (see models/user.py → use_botinv). The
     *     server enforces the same rule via _resolve_nav_id_for_botinv
     *     (see botinv/route.py).
     *
     * Sections, separate components:
     *   - null / 'main' → ./services/services.js  (BaseServices) — services landing / menu
     *   - 'backup'      → ../backup/backup.js     (Backup)       — backup: settings, schedules, history
     *   - 'botinv'      → ../botinv/botinv.js     (BaseBotInv)   — inventory: sheets, walk, chat
     *
     * Navigation between sections is done by passing `onNavigate`
     * down to the component ONLY for sections that need it. The
     * services landing (BaseServices) does NOT need it — its items
     * are real <a href> links that trigger a full page reload; the
     * URL (?page=services&section=X) is re-read by Base._initAuth()
     * and routed back here.
     *
     * Same for Backup / BotInv: they have internal tabs (not URL
     * sections), so `onNavigate` is not passed.
     *
     * @param {string|null} section — null (landing), 'backup' or 'botinv'
     */
    async showServices(section = null) {
        console.log('[BasePages] showServices()', section);

        const user = this.base.auth?.getUser?.();
        if (!user) {
            console.warn('[BasePages] showServices: access denied (not authenticated)');
            if (this.base.auth) this.base.auth.showLogin();
            return;
        }

        const isSuperadmin =
            user.is_superadmin === true ||
            user.is_superadmin === 1 ||
            user.is_superadmin === '1';

        const canBotInv = user.use_botinv === true;
        const isBotInvSection = (section === 'botinv');

        // Per-section access check.
        if (isBotInvSection) {
            if (!canBotInv && !isSuperadmin) {
                console.warn('[BasePages] showServices: access denied (no use_botinv)');
                return;
            }
        } else {
            if (!isSuperadmin) {
                console.warn('[BasePages] showServices: access denied (not superadmin)');
                return;
            }
        }

        const proceed = await this.base.teardownAreas();
        if (!proceed) {
            console.log('[BasePages] showServices cancelled by user');
            return;
        }

        const version = window.coreEngine?.static_version || Date.now();

        let ComponentClass = null;
        try {
            if (section === 'backup') {
                const mod = await import(`../backup/backup.js?v=${version}`);
                ComponentClass = mod.Backup;
            } else if (section === 'botinv') {
                const mod = await import(`../botinv/botinv.js?v=${version}`);
                ComponentClass = mod.BaseBotInv;
            } else {
                const mod = await import(`./services/services.js?v=${version}`);
                ComponentClass = mod.BaseServices;
            }
        } catch (err) {
            console.error('[BasePages] showServices import error:', err);
            return;
        }

        if (!ComponentClass) {
            console.error('[BasePages] showServices: component class not found for section', section);
            return;
        }

        await this.base.renderInArea(ComponentClass, {
            section,
            user,
            setCaption: this.base._setCaption,
            restoreCaption: this.base._restoreCaption,
        });
    }

    // ============================================
    // AUTH FALLBACK PAGE
    // ============================================

    /**
     * Show the auth fallback page in area-center.
     *
     * Called from Base._initAuth() when authRequired is true and the
     * user is not authenticated. Delegates to base.auth.showPage(),
     * which decides which form to render (login / register / ...).
     *
     * Also saves the current content so Base.onAuthSuccess() can restore
     * it after a successful login, and remembers the redirect target
     * in sessionStorage.
     */
    showAuthPage() {
        console.log('[BasePages] showAuthPage()');

        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) return;

        this.base.savedContent = center.innerHTML;

        if (this.base.authRedirect) {
            this.base.redirectUrl = this.base.authRedirect;
        } else {
            this.base.redirectUrl = window.location.pathname;
        }
        sessionStorage.setItem('auth_redirect_url', this.base.redirectUrl);

        if (this.base.auth) {
            this.base.auth.showPage(center);
        }
    }
}