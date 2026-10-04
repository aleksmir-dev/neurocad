// neurocad/core/engine/lib/pages/public/cookie.js

/**
 * Cookie consent banner for public pages.
 *
 * Loaded on every public page:
 *   - public.html  — a single article
 *   - pages.html   — the article catalog
 *
 * Behaviour:
 *   1. On load, check localStorage for the consent flag.
 *      If present — do nothing (the user has already agreed).
 *      If absent — render the banner.
 *   2. On "Согласен" — write the flag to localStorage, fade out
 *      the banner, remove it from the DOM.
 *
 * Design choices:
 *   - Self-contained: CSS is injected as a <style> tag from this
 *     file. The banner must look the same on both templates, and
 *     public.html loads content CSS from GrapesJS that we cannot
 *     predict — so we cannot rely on any inherited styles. All
 *     properties that matter (font, color, background, box-shadow)
 *     are set explicitly.
 *   - One button: "Согласен". For a Russian-language site with
 *     a "continue to use = consent" legal model, a single explicit
 *     accept button is enough. Adding "Отклонить" would raise the
 *     question "what happens if I decline?", and there is no
 *     meaningful answer here — the site needs cookies to work.
 *   - Bottom-right corner. Does not cover page content, does not
 *     jump to the top of the screen on load, does not interfere
 *     with scroll position.
 *   - z-index 9999 — above any page content, below nothing (there
 *     are no other overlays on public pages).
 *   - No close icon (×) — the only way to dismiss is to click
 *     "Согласен". This is intentional: an × would let users
 *     dismiss without consent, and then we would show the banner
 *     again on the next page view — annoying and pointless.
 *   - Mobile: on narrow screens the banner stretches full-width
 *     with 12px margins, so it does not look cramped.
 *
 * Storage key:
 *   neurocad.cookie.consent
 *
 * Value stored: a small JSON object with `accepted: true` and
 * `at: <ISO timestamp>`. The timestamp is not used for anything
 * right now — it is kept so that, if we ever need an audit or
 * want to re-ask for consent after a policy change, we can
 * compare dates instead of guessing. The parse path tolerates
 * older values that may just be the string "accepted".
 *
 * How to reset (for testing):
 *   localStorage.removeItem('neurocad.cookie.consent');
 *   then reload the page.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'neurocad.cookie.consent';

    // ---- 1. Already accepted? ----
    if (readConsent()) {
        return;
    }

    // ---- 2. First visit — show the banner ----

    // The <script> is loaded with `defer`, so the DOM is parsed
    // by the time this runs. No need to wait for DOMContentLoaded.
    // If for some reason body is not ready (e.g. someone included
    // this script without defer), bail out and try once more on
    // DOMContentLoaded.
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        injectStyles();
        const banner = createBanner();
        document.body.appendChild(banner);

        // Fade-in on the next frame so the transition has a
        // starting point (opacity: 0 → 1).
        requestAnimationFrame(() => {
            banner.classList.add('cookie-banner--visible');
        });

        const btn = banner.querySelector('.cookie-banner-btn');
        btn.addEventListener('click', () => {
            writeConsent();
            dismiss(banner);
        });
    }

    // ============================================
    // STORAGE
    // ============================================

    function readConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;

            // Current format: JSON { accepted: true, at: "..." }
            // Older format (defensive): a plain string "accepted".
            if (raw === 'accepted') return true;

            const parsed = JSON.parse(raw);
            return !!(parsed && parsed.accepted);
        } catch (e) {
            // localStorage may be unavailable (private mode,
            // disabled cookies). Treat that as "not accepted" and
            // show the banner — the user will see it on every page
            // view, but that is better than silently pretending
            // consent was given.
            return false;
        }
    }

    function writeConsent() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                accepted: true,
                at: new Date().toISOString(),
            }));
        } catch (e) {
            // Same as readConsent — swallow. The banner will show
            // again next time; nothing we can do about it.
        }
    }

    // ============================================
    // DOM
    // ============================================

    function createBanner() {
        const el = document.createElement('div');
        el.className = 'cookie-banner';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-label', 'Уведомление об использовании cookie');

        // No link to a privacy policy — the page does not exist
        // yet. When it does, add it here as a <a href="/privacy">.
        el.innerHTML = `
            <p class="cookie-banner-text">
                Мы используем cookie, чтобы сайт работал корректно
                и мы понимали, что вам интересно.
            </p>
            <button type="button" class="cookie-banner-btn">
                Согласен
            </button>
        `;

        return el;
    }

    function dismiss(banner) {
        banner.classList.remove('cookie-banner--visible');
        // Remove after the transition finishes (200 ms — matches
        // the CSS below). If the element is somehow already gone
        // (fast double-click), the remove() call is a no-op.
        setTimeout(() => {
            if (banner.parentNode) {
                banner.parentNode.removeChild(banner);
            }
        }, 220);
    }

    // ============================================
    // STYLES
    // ============================================

    /**
     * Inject the banner CSS once, as a <style> in <head>.
     *
     * Scoping:
     *   - All rules are prefixed with .cookie-banner (or use
     *     .cookie-banner-* class names), so nothing else on the
     *     page is touched.
     *   - The public.html template loads arbitrary CSS from the
     *     GrapesJS editor; our classes never collide with typical
     *     user classes (.btn, .card, .hero, ...). If a user ever
     *     does pick .cookie-banner-* as a class name, the
     *     specificity is low enough that user CSS would win —
     *     acceptable trade-off for a banner.
     *
     * Colors match the public catalog (pages.css):
     *   - background #ffffff, border #e2e8f0
     *   - text #1e293b, muted #64748b
     *   - accent #3b82f6 (same blue as the primary button there)
     */
    function injectStyles() {
        if (document.getElementById('cookie-banner-styles')) return;

        const style = document.createElement('style');
        style.id = 'cookie-banner-styles';
        style.textContent = `
            .cookie-banner {
                position: fixed;
                right: 20px;
                bottom: 20px;
                z-index: 9999;

                max-width: 380px;
                padding: 16px 18px;
                box-sizing: border-box;

                display: flex;
                flex-direction: column;
                gap: 12px;

                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                box-shadow:
                    0 10px 30px rgba(15, 23, 42, 0.12),
                    0 2px 6px rgba(15, 23, 42, 0.06);

                font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.45;
                color: #1e293b;

                /* Hidden by default; .--visible fades it in. This
                   lets the transition run on the next frame after
                   appendChild, instead of snapping in instantly. */
                opacity: 0;
                transform: translateY(8px);
                transition:
                    opacity 0.2s ease,
                    transform 0.2s ease;
                pointer-events: none;
            }

            .cookie-banner--visible {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }

            .cookie-banner-text {
                margin: 0;
                color: #1e293b;
            }

            .cookie-banner-btn {
                align-self: flex-end;

                padding: 9px 18px;
                border: 1px solid #2563eb;
                border-radius: 8px;

                background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
                color: #ffffff;

                font-family: inherit;
                font-size: 14px;
                font-weight: 600;
                line-height: 1;
                cursor: pointer;

                box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
                transition:
                    background 0.15s,
                    border-color 0.15s,
                    box-shadow 0.15s,
                    transform 0.05s;
            }

            .cookie-banner-btn:hover {
                background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
                border-color: #1d4ed8;
            }

            .cookie-banner-btn:active {
                transform: translateY(1px);
                box-shadow: none;
            }

            .cookie-banner-btn:focus-visible {
                outline: none;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35);
            }

            @media (max-width: 480px) {
                .cookie-banner {
                    left: 12px;
                    right: 12px;
                    bottom: 12px;
                    max-width: none;
                    padding: 14px 16px;
                }

                .cookie-banner-btn {
                    align-self: stretch;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .cookie-banner {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }
})();