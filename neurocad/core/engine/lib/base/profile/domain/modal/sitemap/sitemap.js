// neurocad/core/engine/lib/base/profile/domain/modal/sitemap/sitemap.js

/**
 * SitemapModal — read-only viewer for the generated sitemap.xml.
 *
 * Unlike RobotsModal, this modal has NO save button and does NOT
 * POST anything: the sitemap is generated on the fly from the
 * `pages` table (and from the robots.txt stored on the user) at
 * request time. There is no file on disk and nothing to keep in
 * sync when a page is added, edited or deleted — the DB is the
 * single source of truth.
 *
 * Flow:
 *   1. open() shows the modal with a "Загружаю…" placeholder.
 *   2. Fetches GET /domain/sitemap (admin-side path; the backend
 *      resolves the user from the session and returns text/plain
 *      XML). Note: NOT the public /sitemap.xml — that one would
 *      hit the ADMIN host when the admin is impersonating a user.
 *   3. Renders the XML into a <pre> block with a copy button.
 *
 * Instance is reusable: the same object can open / close many
 * times without leaking overlays. On each open it re-fetches, so
 * a page created after the last open shows up immediately.
 *
 * Module location
 * ---------------
 * This file lives at ./modal/sitemap/sitemap.js — under the domain
 * page's ./modal/ subfolder, next to its own sitemap.css. It is
 * imported on demand by ./modals.js (openSitemapModal), not at the
 * top of any other module.
 *
 * Styling
 * -------
 * Unlike robots.js and legal.js, this modal does NOT call
 * coreEngine.loadCSS() from its own constructor. The stylesheet
 * ./modal/sitemap/sitemap.css is preloaded once by the domain page
 * (see domain.js → _loadCSS), together with the other modal
 * stylesheets. That is safe because:
 *
 *   - the sitemap modal is only ever opened from the domain page;
 *   - the domain page already loads its CSS before the user can
 *     click "Просмотреть sitemap.xml".
 *
 * If a future caller ever opens SitemapModal from a different
 * page, add a _loadCSS() call here (mirroring robots.js) instead
 * of relying on the domain page's preload.
 */

export class SitemapModal {
    constructor(options = {}) {
        this.apiUrl = options.apiUrl
            || '/core/engine/lib/base/profile/domain/sitemap';

        // Fires with (text) after a successful load — lets the
        // caller react if it ever needs to. Optional.
        this.onLoaded = options.onLoaded || null;

        this.overlay = null;
        this._escHandler = null;
        this._onCopy = null;

        // Cache the last successfully fetched XML for the session —
        // reopening the modal without closing the tab shows it
        // instantly. Set to null on error.
        this._lastXml = null;
    }

    // ============================================
    // OPEN / CLOSE
    // ============================================

    async open() {
        this._render();

        // Reset to "loading" every time — sitemap may have changed
        // since the last open (a page was added, for example).
        const pre = this.overlay.querySelector('[data-js="sitemap-body"]');
        const copyBtn = this.overlay.querySelector('[data-action="copy"]');
        if (pre) pre.textContent = 'Загружаю…';
        if (copyBtn) copyBtn.disabled = true;

        await this._load(pre, copyBtn);
    }

    close() {
        if (!this.overlay) return;

        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }

        this.overlay.remove();
        this.overlay = null;
    }

    // ============================================
    // RENDER
    // ============================================

    _render() {
        // Single instance — kill any previous overlay first.
        if (this.overlay) this.close();

        const overlay = document.createElement('div');
        overlay.className = 'core-engine-lib-base-profile-domain-sitemap-overlay';
        overlay.innerHTML = `
            <div class="domain-sitemap-modal" role="dialog" aria-modal="true">
                <div class="domain-sitemap-header">
                    <div class="domain-sitemap-title">sitemap.xml</div>
                    <button type="button"
                            class="domain-icon-btn"
                            data-action="close"
                            title="Закрыть">
                        <span aria-hidden="true">✕</span>
                    </button>
                </div>

                <div class="domain-sitemap-hint">
                    Файл генерируется на лету из ваших страниц.
                    Ничего не сохраняется — при каждом открытии вы
                    видите актуальную версию.
                </div>

                <pre class="domain-sitemap-body"
                     data-js="sitemap-body"
                     spellcheck="false">Загружаю…</pre>

                <div class="domain-sitemap-actions">
                    <button type="button"
                            class="domain-btn"
                            data-action="copy"
                            disabled>
                        Копировать
                    </button>
                    <button type="button"
                            class="domain-btn"
                            data-action="close">
                        Закрыть
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Close handlers
        overlay.querySelectorAll('[data-action="close"]').forEach((btn) => {
            btn.addEventListener('click', () => this.close());
        });

        // Click on the dim backdrop closes the modal (but clicks
        // inside the modal itself do not).
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // Escape closes.
        this._escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this._escHandler);

        // Copy button — uses the current <pre> contents.
        const copyBtn = overlay.querySelector('[data-action="copy"]');
        this._onCopy = async () => {
            const pre = this.overlay?.querySelector('[data-js="sitemap-body"]');
            const text = pre?.textContent || '';
            if (!text) return;

            const prev = copyBtn.textContent;
            try {
                await navigator.clipboard.writeText(text);
                copyBtn.textContent = 'Скопировано';
            } catch (err) {
                console.error('[SitemapModal] Copy error:', err);
                copyBtn.textContent = 'Не удалось';
            }
            setTimeout(() => {
                if (copyBtn.isConnected) copyBtn.textContent = prev;
            }, 1500);
        };
        copyBtn.addEventListener('click', this._onCopy);
    }

    // ============================================
    // LOAD
    // ============================================

    async _load(pre, copyBtn) {
        try {
            // fetchJson parses JSON by default. We want raw text —
            // for XML we call fetch() directly with credentials so
            // the session cookie is sent on same-origin requests.
            const res = await fetch(this.apiUrl, {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'text/plain, application/xml' },
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const text = await res.text();
            this._lastXml = text;

            if (pre) pre.textContent = text || '(пусто)';
            if (copyBtn) copyBtn.disabled = !text;

            if (typeof this.onLoaded === 'function') {
                try { this.onLoaded(text); } catch (_) { /* ignore */ }
            }
        } catch (err) {
            console.error('[SitemapModal] load error:', err);
            this._lastXml = null;
            if (pre) pre.textContent = `Не удалось загрузить sitemap: ${err.message || err}`;
            if (copyBtn) copyBtn.disabled = true;
        }
    }

    // ============================================
    // PUBLIC
    // ============================================

    destroy() {
        this.close();
    }
}