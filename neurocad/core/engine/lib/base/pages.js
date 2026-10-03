// app/core/engine/lib/base/pages.js

/**
 * BasePages — page controllers for area-center.
 *
 * Owns the three "page-level" entry points that replace area-center
 * with a full-page component:
 *
 *   - showProfile(section)  — user profile (main / balance / domain)
 *   - showSetup(section)    — superadmin setup (main / llm)
 *   - showAuthPage()        — auth fallback page (login/register/...)
 *
 * Each show* method:
 *   1. checks the guard (authenticated / superadmin);
 *   2. calls base.teardownAreas() — destroys the previous page, may
 *      prompt the user via confirmClose();
 *   3. dynamically imports the target component with ?v=<static_version>;
 *   4. calls base.renderInArea(ComponentClass, options).
 *
 * Navigation between sections is done by passing `onNavigate` down to
 * the component — the component calls it with the next section name,
 * and it calls back into this module.
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

    // ============================================
    // SETUP (superadmin only)
    // ============================================

    /**
     * Open a setup page in area-center.
     *
     * Available to superadmin only. The guard is checked here; server-side
     * permissions are enforced on the API endpoints.
     *
     * Two sections, two separate components:
     *   - 'main' → setup/setup.js   (BaseSetup)     — setup landing page
     *   - 'llm'  → setup/llm/llm.js (BaseSetupLlm)  — LLM settings page
     *
     * @param {string} section — 'main' (default) or 'llm'
     */
    async showSetup(section = 'main') {
        console.log('[BasePages] showSetup()', section);

        const user = this.base.auth?.getUser?.();
        const isSuperadmin = user?.is_superadmin === true;
        if (!isSuperadmin) {
            console.warn('[BasePages] showSetup: access denied (not superadmin)');
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