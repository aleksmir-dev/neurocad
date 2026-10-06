// neurocad/core/engine/lib/base/profile/domain/modal/robots/robots.js

/**
 * RobotsModal — universal editor for robots.txt.
 *
 * One modal, two targets. BaseProfileDomain opens it from either of
 * the two "Редактировать robots.txt" buttons:
 *
 *   - the button in the "Бесплатный поддомен" card   → which = "3"
 *     (users.robots_3, the free third-level subdomain);
 *   - the button in the "Свой домен 2 уровня" card   → which = "2"
 *     (users.robots_2, the custom second-level domain).
 *
 * The modal itself does not care which field is being edited — it
 * receives `which` and the current text, and POSTs them back. The
 * backend routes the save to the right column.
 *
 * Owns:
 *   - a <textarea> with the current body;
 *   - two preset buttons ("Открыть всем", "Закрыть от всех") that
 *     only fill the textarea;
 *   - "Отмена" / "ОК" at the bottom.
 *
 * Behaviour:
 *   - "Открыть всем" — fills the textarea with a working "open"
 *     template: Allow: /, disallow the platform's static/api/admin
 *     paths, and set Host to the current domain.
 *   - "Закрыть от всех" — fills the textarea with "User-agent: *"
 *     + "Disallow: /". Nothing else is needed for a full close.
 *   - Both buttons only fill the textarea. The user still has to
 *     click OK to save.
 *   - "Отмена" — close without saving. Also triggered by Escape and
 *     by a click on the overlay outside the dialog.
 *   - "ОК" — POST /core/engine/lib/base/profile/domain/robots with
 *     { which, robots: <textarea value> }. On success: call
 *     onSaved(which, text), close. On failure: show an inline error
 *     inside the dialog and keep it open, so the user does not lose
 *     their text.
 *
 * NOTE — no Sitemap line in the "open" template (yet)
 * ------------------------------------------------
 * The platform does not expose /sitemap.xml at the moment, so the
 * open template does not reference it. When a sitemap endpoint is
 * added, this is the only place that needs an extra line:
 *
 *     `Sitemap: https://${d}/sitemap.xml`
 *
 * IMPORTANT — /robots.txt is always served
 * ----------------------------------------
 * The file itself is always returned with HTTP 200, text/plain,
 * regardless of whether it says "Disallow: /" or "Disallow:". That
 * is how robots.txt works: crawlers must be able to read it in order
 * to know what to skip. "Closing" the site means writing a file that
 * says "don't index", not making the file itself unreachable.
 *
 * The modal is a plain singleton-style class: a single instance is
 * created by BaseProfileDomain and reused across opens. `open()` is
 * idempotent — calling it twice just refocuses the textarea.
 *
 * robots.css is loaded from here on first construction, so the modal
 * is self-contained.
 *
 * Module location
 * ---------------
 * This file lives at ./modal/robots/robots.js — under the domain
 * page's ./modal/ subfolder, next to its own robots.css. It is
 * imported on demand by ./modals.js (openRobotsModal), not at the
 * top of any other module.
 *
 * Style scope
 * -----------
 * Buttons inside the dialog use `.domain-btn` / `.domain-btn-primary`,
 * whose rules in domain.css are scoped to
 * `.core-engine-lib-base-profile-domain .domain-btn`. To make those
 * rules apply, the overlay is appended to the nearest
 * `.core-engine-lib-base-profile-domain` container (which is what
 * BaseProfileDomain renders). If that container is not in the DOM
 * (e.g. the modal is opened from a different page), we fall back to
 * `document.body` and the buttons rely on the extra rules in
 * robots.css (see the `.robots-overlay .domain-btn` section there).
 *
 * Props:
 *   - onSaved    {Function} — (which: "2"|"3", savedText: string) => void
 *                             Called after a successful POST, so the
 *                             caller can update its local state.
 *   - domain     {string}   — the current domain the modal is editing
 *                             (e.g. "testuser3.neurocad.ru" or
 *                             "atou.ru"). Used by the "open" template
 *                             for the Host line. The caller is
 *                             expected to set it via setDomain()
 *                             before every open(); if it is missing,
 *                             the Host line is simply omitted.
 */
export class RobotsModal {
    constructor(options = {}) {
        console.log('[RobotsModal] Constructor called');

        this.options = options || {};
        this.onSaved = typeof this.options.onSaved === 'function'
            ? this.options.onSaved
            : null;

        // Domain used in the "open" template (Host line). The caller
        // may update it via setDomain() between opens.
        this._domain = typeof this.options.domain === 'string'
            ? this.options.domain.trim()
            : '';

        // DOM
        this._overlay = null;
        this._dialog = null;
        this._textarea = null;
        this._errorEl = null;
        this._okBtn = null;
        this._titleEl = null;
        this._hintEl = null;

        // UI state
        this._which = '2';
        this._saving = false;
        this._boundKeyDown = null;

        this._loadCSS();
    }

    // ============================================
    // CSS
    // ============================================

    _loadCSS() {
        console.log('[RobotsModal] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS(
                'core/engine/lib/base/profile/domain/modal/robots/robots.css'
            );
        }
    }

    // ============================================
    // PUBLIC
    // ============================================

    /**
     * Update the domain used by the "open" template. Called by
     * BaseProfileDomain right before open() so the Host line always
     * points at the domain the user is editing.
     */
    setDomain(domain) {
        this._domain = typeof domain === 'string' ? domain.trim() : '';
    }

    /**
     * Open the modal.
     *
     * @param {string} which       — "2" (custom domain) or "3" (subdomain)
     * @param {string} initialText — current robots.txt body
     *
     * If the modal is already open, the new `which` / `initialText`
     * are applied to the existing dialog (title, hint, textarea) and
     * the textarea is refocused. This makes open() safe to call from
     * any click handler without checking state first.
     */
    open(which, initialText) {
        console.log('[RobotsModal] open()', which);

        this._which = which === '3' ? '3' : '2';

        if (this._overlay) {
            // Already open — update title / hint / textarea and refocus.
            if (typeof initialText === 'string' && this._textarea) {
                this._textarea.value = initialText || this._textClosed();
                this._clearError();
            }
            this._renderHeader();
            this._focusTextarea();
            return;
        }

        this._initialText = typeof initialText === 'string' ? initialText : '';

        this._render();
        this._bindEvents();
        this._focusTextarea();
    }

    /**
     * Close the modal without saving.
     *
     * Safe to call even if the modal was never opened or was already
     * closed.
     */
    close() {
        console.log('[RobotsModal] close()');

        if (!this._overlay) return;

        this._unbindEvents();

        try {
            this._overlay.remove();
        } catch (e) {
            console.warn('[RobotsModal] overlay.remove error:', e);
        }

        this._overlay = null;
        this._dialog = null;
        this._textarea = null;
        this._errorEl = null;
        this._okBtn = null;
        this._titleEl = null;
        this._hintEl = null;
        this._saving = false;
    }

    /**
     * Destroy — close + drop callbacks. Called from the page's
     * destroy() so a navigating user does not leave a dangling
     * modal behind.
     */
    destroy() {
        console.log('[RobotsModal] destroy()');
        this.close();
        this.onSaved = null;
    }

    // ============================================
    // PRESETS
    // ============================================

    /**
     * "Закрыть от всех" — full block for every crawler.
     */
    _textClosed() {
        return [
            'User-agent: *',
            'Disallow: /',
            '',
        ].join('\n');
    }

    /**
     * "Открыть всем" — working open template.
     *
     * Mirrors the layout a real site would use:
     *   - User-agent: *      — applies to every crawler;
     *   - Allow: /           — the whole site is allowed;
     *   - Disallow: /static/ — platform static assets (no SEO value);
     *   - Disallow: /admin/  — editor and admin UI, not public;
     *   - Disallow: /api/    — backend API, not for crawlers;
     *   - Host:              — the current domain (Yandex directive).
     *
     * No Sitemap line — the platform does not expose /sitemap.xml
     * yet. When it does, add one line at the end:
     *
     *     `Sitemap: https://${d}/sitemap.xml`
     *
     * The Host line uses `this._domain`. BaseProfileDomain sets it
     * via setDomain() before every open, so in normal use it is
     * always the real hostname (subdomain or custom domain). If for
     * some reason it is empty, the Host line is simply omitted —
     * we do not invent a placeholder domain.
     */
    _textOpen() {
        const lines = [
            'User-agent: *',
            'Allow: /',
            'Disallow: /static/',
            'Disallow: /admin/',
            'Disallow: /api/',
            '',
        ];

        if (this._domain) {
            lines.push(`Host: ${this._domain}`);
            lines.push('');
        }

        return lines.join('\n');
    }

    // ============================================
    // RENDER
    // ============================================

    _render() {
        const overlay = document.createElement('div');
        overlay.className = 'robots-overlay';

        overlay.innerHTML = `
            <div class="robots-dialog" role="dialog" aria-modal="true" aria-labelledby="robots-title">
                <div class="robots-header">
                    <div class="robots-presets">
                        <button type="button"
                                class="domain-btn"
                                data-action="robots-open-all">
                            Открыть всем
                        </button>
                        <button type="button"
                                class="domain-btn"
                                data-action="robots-close-all">
                            Закрыть от всех
                        </button>
                    </div>
                </div>

                <div class="robots-title" id="robots-title">robots.txt</div>

                <p class="robots-hint" data-js="robots-hint"></p>

                <textarea class="robots-textarea"
                          data-js="robots-textarea"
                          spellcheck="false"
                          wrap="off"
                          rows="12"
                          placeholder="User-agent: *&#10;Disallow: /"></textarea>

                <div class="robots-error" data-js="robots-error" hidden></div>

                <div class="robots-actions">
                    <button type="button"
                            class="domain-btn"
                            data-action="robots-cancel">
                        Отмена
                    </button>
                    <button type="button"
                            class="domain-btn domain-btn-primary"
                            data-action="robots-ok">
                        ОК
                    </button>
                </div>
            </div>
        `;

        // Append the overlay to the domain-page container so that
        // .domain-btn rules (which are scoped under
        // .core-engine-lib-base-profile-domain in domain.css) apply
        // to the buttons inside the dialog. Fallback to <body> if
        // the container is not present.
        const scope = document.querySelector('.core-engine-lib-base-profile-domain');

        if (scope) {
            scope.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }

        this._overlay = overlay;
        this._dialog = overlay.querySelector('.robots-dialog');
        this._textarea = overlay.querySelector('[data-js="robots-textarea"]');
        this._errorEl = overlay.querySelector('[data-js="robots-error"]');
        this._okBtn = overlay.querySelector('[data-action="robots-ok"]');
        this._titleEl = overlay.querySelector('#robots-title');
        this._hintEl = overlay.querySelector('[data-js="robots-hint"]');

        // Seed the textarea. Empty string falls back to the "closed"
        // template so the user always sees a valid starting point —
        // matches what get_for_user would serve in this state.
        this._textarea.value = this._initialText || this._textClosed();

        this._renderHeader();
    }

    _renderHeader() {
        if (!this._titleEl || !this._hintEl) return;

        if (this._which === '3') {
            this._titleEl.textContent = 'robots.txt — бесплатный поддомен';
            this._hintEl.innerHTML =
                'Файл отдаётся по адресу <code>/robots.txt</code> на вашем ' +
                'бесплатном поддомене. По умолчанию поддомен <b>закрыт</b> ' +
                'от всех роботов — пока вы не откроете его вручную.';
        } else {
            this._titleEl.textContent = 'robots.txt — свой домен 2 уровня';
            this._hintEl.innerHTML =
                'Файл отдаётся по адресу <code>/robots.txt</code> на вашем ' +
                'домене второго уровня. По умолчанию домен <b>закрыт</b> ' +
                'от всех роботов — пока вы не откроете его вручную.';
        }
    }

    _focusTextarea() {
        if (!this._textarea) return;
        // setTimeout(0) — let the browser finish the layout pass
        // before focusing, otherwise the caret can end up in the
        // wrong place on some browsers.
        setTimeout(() => {
            if (this._textarea && this._textarea.isConnected) {
                this._textarea.focus();
                // Put the caret at the end, not at the start.
                const len = this._textarea.value.length;
                try {
                    this._textarea.setSelectionRange(len, len);
                } catch (e) {
                    // Some browsers refuse setSelectionRange on a
                    // detached textarea — silently ignore.
                }
            }
        }, 0);
    }

    // ============================================
    // EVENTS
    // ============================================

    _bindEvents() {
        if (!this._overlay) return;

        // Click inside the dialog: buttons.
        this._overlay.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            const actionEl = target.closest('[data-action]');
            if (!actionEl) return;

            const action = actionEl.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'robots-open-all':
                    e.preventDefault();
                    this._applyPreset(this._textOpen());
                    break;
                case 'robots-close-all':
                    e.preventDefault();
                    this._applyPreset(this._textClosed());
                    break;
                case 'robots-cancel':
                    e.preventDefault();
                    this.close();
                    break;
                case 'robots-ok':
                    e.preventDefault();
                    this._save();
                    break;
                default:
                    break;
            }
        });

        // Click on the overlay (outside the dialog) closes the modal.
        this._overlay.addEventListener('mousedown', (e) => {
            if (e.target === this._overlay) {
                this.close();
            }
        });

        // Escape closes the modal.
        this._boundKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this._boundKeyDown);
    }

    _unbindEvents() {
        if (this._boundKeyDown) {
            document.removeEventListener('keydown', this._boundKeyDown);
            this._boundKeyDown = null;
        }
    }

    // ============================================
    // ACTIONS
    // ============================================

    _applyPreset(text) {
        if (!this._textarea) return;
        this._textarea.value = text;
        this._clearError();
        this._textarea.focus();
    }

    _showError(message) {
        if (!this._errorEl) return;
        this._errorEl.textContent = message || 'Не удалось сохранить';
        this._errorEl.hidden = false;
    }

    _clearError() {
        if (!this._errorEl) return;
        this._errorEl.textContent = '';
        this._errorEl.hidden = true;
    }

    _setSaving(on) {
        this._saving = !!on;
        if (!this._okBtn) return;
        this._okBtn.disabled = this._saving;
        this._okBtn.textContent = this._saving ? 'Сохраняю…' : 'ОК';
    }

    async _save() {
        if (this._saving) return;
        if (!this._textarea) return;

        const text = this._textarea.value;
        const which = this._which;

        this._clearError();
        this._setSaving(true);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (typeof fetchJson !== 'function') {
                throw new Error('fetchJson недоступен');
            }

            const json = await fetchJson(
                '/core/engine/lib/base/profile/domain/robots',
                {
                    method: 'POST',
                    body: { which, robots: text },
                }
            );

            const savedText = (json && json.data && typeof json.data.robots === 'string')
                ? json.data.robots
                : text;
            const savedWhich = (json && json.data && typeof json.data.which === 'string')
                ? json.data.which
                : which;

            console.log('[RobotsModal] robots_%s saved, %d bytes', savedWhich, savedText.length);

            if (typeof this.onSaved === 'function') {
                try {
                    this.onSaved(savedWhich, savedText);
                } catch (e) {
                    console.warn('[RobotsModal] onSaved threw:', e);
                }
            }

            this._setSaving(false);
            this.close();
        } catch (err) {
            console.error('[RobotsModal] save error:', err);
            this._setSaving(false);

            // The server returns { detail } on 4xx / 5xx; fetchJson
            // wraps that into err.message. Fall back to a generic
            // string if the error carries nothing usable.
            const msg = (err && err.message) ? err.message : 'Не удалось сохранить';
            this._showError(msg);
        }
    }
}