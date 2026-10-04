// app/core/engine/lib/pages/title.js

/**
 * PagesTitle — catalog title (Nav.name) helper for the Pages component.
 *
 * Owns everything related to the article catalog's title:
 *
 *   - reading the current Nav.name from the backend
 *     (GET /core/engine/lib/pages/nav-name);
 *   - opening the "Заголовок" modal on top of BaseModalInput
 *     (see ../base/modal/input.js) with the current name prefilled;
 *   - saving the new value via PUT /core/engine/lib/pages/nav-name;
 *   - updating the header/tab caption so the user sees the new name
 *     without a page reload.
 *
 * Split out of pages.js to keep that file focused on the catalog
 * itself (list, cards, navigation, onboarding hints). Pages.js just
 * creates one PagesTitle instance in _init() and calls:
 *
 *   - this._title.setCaptionHelpers({ setCaption, restoreCaption })
 *   - await this._title.loadCaption()        // sets the caption
 *   - this._title.openModal()                // on «Заголовок» click
 *
 * The helper does not touch BaseCards, does not render any DOM of its
 * own, and does not know anything about the toolbar. It only knows
 * how to talk to the nav-name API and how to open the input modal.
 */
export class PagesTitle {
    constructor({ navId = null, getApiUrl } = {}) {
        // Nav instance this catalog belongs to. Passed through to
        // every nav-name request as ?nav_id=<navId>.
        this.navId = navId;

        // Function (endpoint, extraQuery?) => string, provided by
        // Pages. Used to build nav-name URLs with nav_id attached,
        // using exactly the same rules as the rest of the API calls.
        this._getApiUrl = typeof getApiUrl === 'function'
            ? getApiUrl
            : (endpoint) => endpoint;

        // Caption helpers, injected by Pages in _init().
        // Kept here so save() can refresh the header/tab title
        // without a round-trip through Pages.
        this._setCaption = null;
        this._restoreCaption = null;
        this._savedCaption = null;
    }

    // ============================================
    // CAPTION
    // ============================================

    /**
     * Inject the shared caption helpers picked up from Base.
     * Called once from Pages._init().
     */
    setCaptionHelpers({ setCaption, restoreCaption } = {}) {
        this._setCaption = setCaption || null;
        this._restoreCaption = restoreCaption || null;
    }

    /**
     * Load Nav.name and set it as the header/tab caption.
     *
     * Called from Pages._init() before the cards are rendered, so the
     * user sees the real catalog title (e.g. "Примеры демо-сайтов")
     * instead of the hardcoded "Каталог статей".
     *
     * Falls back to "Каталог статей" if the request fails or the name
     * is empty. Never throws — a failed caption is not worth blocking
     * the whole catalog.
     */
    async loadCaption() {
        if (!this._setCaption) return;

        let caption = 'Каталог статей';

        try {
            const url = this._getApiUrl('/core/engine/lib/pages/nav-name');
            const fetchJson = window.coreEngine?.fetchJson;
            const res = await fetchJson(url);
            const name = res?.data?.name;
            if (name && String(name).trim()) {
                caption = String(name).trim();
            }
        } catch (err) {
            console.warn('[PagesTitle] nav-name caption load failed:', err);
        }

        this._savedCaption = this._setCaption(caption, caption);
    }

    /**
     * Restore the caption that was on screen before Pages mounted.
     * Called from Pages.destroy().
     */
    restoreCaption() {
        if (this._restoreCaption) {
            this._restoreCaption(this._savedCaption);
        }
        this._savedCaption = null;
    }

    // ============================================
    // MODAL
    // ============================================

    /**
     * Open the "Заголовок" modal — edit Nav.name for the current nav.
     *
     * Uses the shared BaseModalInput from base/modal/input.js — a
     * single-text-field dialog with OK / Отмена. BaseCardsEdit is NOT
     * used here: it is the card form and expects all card fields
     * (title / description / logo / ...), so feeding it a single
     * "name" field would fail.
     *
     * Flow:
     *   1. GET nav-name — current value.
     *   2. createModal('input') — get a BaseModalInput instance.
     *   3. On OK — PUT nav-name.
     *   4. On success — refresh the header/tab caption.
     */
    async openModal() {
        console.log('[PagesTitle] openModal()');

        // ---- 1. Load the current name ----
        const currentName = await this._loadCurrentName();

        // ---- 2. Create the input modal via the factory ----
        let modal = null;
        try {
            const version = window.coreEngine?.static_version || Date.now();
            const mod = await import(`../base/modal/index.js?v=${version}`);
            modal = await mod.createModal('input');
        } catch (err) {
            console.error('[PagesTitle] createModal import failed:', err);
        }

        // ---- 3. Fallback: no modal factory available ----
        if (!modal) {
            console.warn('[PagesTitle] input modal not available, fallback to prompt');
            const v = prompt('Заголовок каталога:', currentName);
            if (v !== null) await this.save(v);
            return;
        }

        // ---- 4. Wire up callbacks ----
        // BaseModalInput's onOk receives the trimmed field value.
        // onCancel fires on Отмена / ✕ / Escape / click outside.
        modal.setOnOk(async (value) => {
            await this.save(value);
        });

        modal.setOnCancel(() => {
            console.log('[PagesTitle] modal cancelled');
        });

        // ---- 5. Open with the current value prefilled ----
        // BaseModalInput.open(text, title, placeholder, defaultValue)
        modal.open(
            'Введите название каталога. Оно будет отображаться как ' +
            'заголовок публичной страницы /pages.',
            'Заголовок каталога',
            'Например: Примеры демо-сайтов',
            currentName
        );
    }

    // ============================================
    // SAVE
    // ============================================

    /**
     * Save the new Nav.name to the server and update the caption.
     *
     * @param {string} name — new name; trimmed of leading/trailing
     *                        whitespace. Empty after trimming is
     *                        silently ignored (the input field has
     *                        required + minLength=1, so this is a
     *                        defensive guard).
     */
    async save(name) {
        const trimmed = String(name ?? '').trim();
        if (!trimmed) {
            console.warn('[PagesTitle] empty title, skip save');
            return;
        }

        const url = this._getApiUrl('/core/engine/lib/pages/nav-name');
        const fetchJson = window.coreEngine?.fetchJson;

        try {
            await fetchJson(url, {
                method: 'PUT',
                body: { name: trimmed },
            });

            // Refresh the header/tab caption so the user sees the
            // new name without a page reload.
            if (this._setCaption) {
                this._setCaption(trimmed, trimmed);
                this._savedCaption = trimmed;
            }

            console.log('[PagesTitle] nav name saved:', trimmed);
        } catch (err) {
            console.error('[PagesTitle] nav name save failed:', err);
        }
    }

    // ============================================
    // INTERNAL
    // ============================================

    /**
     * Fetch the current Nav.name. Returns '' on any failure — the
     * modal then opens with an empty field, which is fine.
     */
    async _loadCurrentName() {
        try {
            const url = this._getApiUrl('/core/engine/lib/pages/nav-name');
            const fetchJson = window.coreEngine?.fetchJson;
            const res = await fetchJson(url);
            return (res && res.data && res.data.name) || '';
        } catch (err) {
            console.warn('[PagesTitle] nav-name load failed:', err);
            return '';
        }
    }
}