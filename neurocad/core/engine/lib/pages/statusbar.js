// app/core/engine/lib/pages/statusbar.js

/**
 * PagesStatusbar — widget chrome helper for the Pages component.
 *
 * Owns everything related to the widget's top and bottom bars:
 *
 *   - titlebar text — the name of the currently-open folder, or
 *     the nav name at the root.
 *   - statusbar path — the breadcrumb trail from the root:
 *       <nav name> / <folder> / <subfolder>
 *     In the root only the nav name is shown.
 *   - mobile visibility — the statusbar is hidden below 768px,
 *     because the path does not fit on a phone screen anyway; the
 *     titlebar (folder name) carries the same information.
 *
 * Split out of pages.js to keep that file focused on the catalog
 * itself (list, cards, navigation, onboarding hints). Pages.js just
 * creates one PagesStatusbar instance in _init() and calls:
 *
 *   - this._statusbar.init(cardsInstance, navName)
 *   - this._statusbar.sync(parentId, items); this._statusbar.render()
 *   - this._statusbar.destroy()
 *
 * The helper does not talk to the backend, does not know anything
 * about the toolbar, and does not touch the grid. It only writes
 * text into the two slots BaseCards creates:
 *
 *   - cards.titleTextEl   — the titlebar text node
 *   - cards.breadcrumbsEl — the breadcrumbs slot in the statusbar
 *
 * Pages-specific chrome overrides
 * -------------------------------
 * init() adds a marker class .pages-widget to the BaseCards widget
 * element. The CSS in pages.css uses this marker to hide the two
 * chrome elements that Pages does not want:
 *
 *   - the titlebar toggle ("👁️" — collapse / expand the content);
 *   - the status text ("N статей") and the element counter
 *     ("N элементов") in the statusbar.
 *
 * Any other consumer of BaseCards is unaffected — the marker is
 * added only when this helper is bound.
 *
 * Breadcrumb state
 * ----------------
 * The path is kept in this._items — an array of {id, title}, where
 * index 0 is the root ({id: null, title: navName}). On every sync()
 * the array is reconciled with the new parentId:
 *
 *   - parentId matches the last element → nothing to do;
 *   - parentId points to an element deeper in the array → the user
 *     went up: truncate the stack to that point;
 *   - otherwise → the user opened a new folder: look it up in the
 *     items array and push.
 *
 * Sync order (important)
 * ----------------------
 * sync() MUST be called BEFORE the new items are fetched.
 *
 * When the user opens a folder, that folder lives in the CURRENT
 * items list (the one being displayed) — it was rendered as a
 * card one level up. After the next loadFromServer() that list is
 * replaced by the folder's CHILDREN, which do not contain the
 * folder's own entry. Looking up the folder in the NEW list always
 * fails, and the breadcrumb trail stays stuck at the root.
 *
 * On _goUp the same order works: the target folder is already
 * higher up in _items, so sync() just truncates the stack — no
 * lookup in the items array is needed.
 *
 * The root entry is (re)seeded from the navName passed to init().
 * If PagesTitle has not resolved the nav name yet, the fallback
 * title is "Каталог статей".
 *
 * Defensive _stringify()
 * ----------------------
 * Every value that reaches the DOM — the titlebar text, each crumb
 * title — goes through _stringify() first. The method accepts any
 * value and returns a plain string:
 *
 *   - null / undefined → ''
 *   - string           → as-is
 *   - number / boolean → String(v)
 *   - object           → v.title || v.name || v.label || v.text || ''
 *   - anything else    → ''
 *
 * This guards against a broken caller passing an object where a
 * string is expected (which used to render as "[object Object]"
 * in the titlebar and in each crumb). The upstream sources — the
 * nav name from PagesTitle and the folder title from BaseCards —
 * are expected to be strings already; _stringify() is a safety
 * net, not a normalisation layer.
 *
 * User-facing strings are in Russian. Code comments, docstrings
 * and identifiers are in English.
 */
export class PagesStatusbar {
    constructor() {
        // BaseCards instance this helper is bound to.
        this._cards = null;

        // Nav name — the root crumb and the titlebar text at the
        // root. Set in init(); may be updated later via
        // updateNavName() once PagesTitle has loaded the real name.
        this._navName = null;

        // Breadcrumb path from the root. Index 0 is the root entry
        // ({id: null, title: this._navName}); each subsequent entry
        // is an opened folder.
        this._items = [];

        // Resize handler that hides the statusbar on narrow screens.
        // Registered in init(), removed in destroy().
        this._onResize = null;
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    /**
     * Bind the helper to a BaseCards instance and start watching
     * the viewport width.
     *
     * Also adds the .pages-widget marker class to the widget
     * element, so pages.css can hide the two chrome elements Pages
     * does not want (titlebar toggle, status counters). The marker
     * is scoped to this instance — other consumers are unaffected.
     *
     * @param {object} cardsInstance — the BaseCards instance whose
     *                                 chrome this helper manages.
     *                                 Must expose widgetStatusbar
     *                                 (may be null if the consumer
     *                                 did not request the statusbar).
     * @param {string|null} navName — the nav name to use as the
     *                                root title. May be null — the
     *                                fallback is used instead.
     */
    init(cardsInstance, navName) {
        this._cards = cardsInstance || null;
        this._navName = navName || null;

        // Marker for pages.css: hides the titlebar toggle and the
        // statusbar counters. Only applied when this helper is
        // bound — other BaseCards consumers keep the full chrome.
        if (this._cards?.widget) {
            this._cards.widget.classList.add('pages-widget');
        }

        // Seed the root entry so render() has something to show
        // even before the first sync().
        this._items = [{ id: null, title: this._rootTitle() }];

        this._setupVisibility();
    }

    /**
     * Update the nav name after init(). Called by Pages once
     * PagesTitle has loaded the real name (loadCaption resolves
     * asynchronously).
     */
    updateNavName(navName) {
        this._navName = navName || null;
        // Refresh the root entry so both the titlebar and the first
        // crumb pick up the new name.
        if (this._items.length > 0) {
            this._items[0].title = this._rootTitle();
        }
    }

    /**
     * Remove the resize listener and the marker class. Called from
     * Pages.destroy().
     */
    destroy() {
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
        if (this._cards?.widget) {
            this._cards.widget.classList.remove('pages-widget');
        }
        this._cards = null;
        this._items = [];
    }

    // ============================================
    // SYNC
    // ============================================

    /**
     * Reconcile this._items with the new parentId.
     *
     * Called from Pages._reload() BEFORE the new items have been
     * fetched — see "Sync order" in the module docstring for why.
     * The `items` argument must be the CURRENT page list (the
     * children of the parent we are leaving — the folder the user
     * just opened is one of them).
     *
     * @param {number|null} parentId — the currently-open folder id,
     *                                 or null at the root.
     * @param {Array} items — the current item list (the one being
     *                        displayed — NOT the one about to be
     *                        fetched).
     */
    sync(parentId, items) {
        const rootTitle = this._rootTitle();

        // Seed / refresh the root entry.
        if (this._items.length === 0) {
            this._items.push({ id: null, title: rootTitle });
        } else {
            this._items[0].title = rootTitle;
        }

        // Root is open — nothing else to sync.
        if (parentId == null) {
            if (this._items.length > 1) {
                this._items = [this._items[0]];
            }
            return;
        }

        // Walk up if the target is already in the trail.
        const idx = this._items.findIndex(b => b.id === parentId);
        if (idx >= 0) {
            if (idx < this._items.length - 1) {
                this._items = this._items.slice(0, idx + 1);
            }
            return;
        }

        // New folder — look it up in the current items. Those are
        // the children of the previous parent, so the folder the
        // user just opened is among them. (This is why sync() must
        // run before the next loadFromServer() — after it, the
        // folder would no longer be in the list.)
        const list = items || [];
        const folder = list.find(i => i.id === parentId);
        if (folder) {
            this._items.push({
                id: parentId,
                title: this._stringify(
                    folder.title || folder.name || 'Папка'
                ),
            });
        }
    }

    // ============================================
    // RENDER
    // ============================================

    /**
     * Push the current titlebar text and breadcrumb path into the
     * DOM. Called from Pages._init() and Pages._reload().
     *
     * If BaseCards was built without the chrome (no titleTextEl /
     * breadcrumbsEl), both writes are silent no-ops — the helper
     * never throws.
     */
    render() {
        if (!this._cards) return;

        const items = this._items;
        const last = items[items.length - 1];
        const titlebarText = this._stringify(
            last ? last.title : 'Каталог статей'
        );

        // Titlebar — plain text update. Prefer the dedicated span
        // cached by dom.js; fall back to the old :first-child
        // selector for compatibility with older BaseCards builds.
        if (this._cards.titleTextEl) {
            this._cards.titleTextEl.textContent = titlebarText;
        } else {
            const legacy = this._cards.widget?.querySelector(
                '.core-engine-lib-base-widget-titlebar span:first-child'
            );
            if (legacy) legacy.textContent = titlebarText;
        }

        // Breadcrumbs — rebuild into the slot dom.js created. Build
        // DOM nodes (not innerHTML) so folder titles are inserted
        // as text, not as HTML.
        const slot = this._cards.breadcrumbsEl;
        if (!slot) return;

        slot.innerHTML = '';
        items.forEach((crumb, i) => {
            if (i > 0) {
                const sep = document.createElement('span');
                sep.className = 'pages-breadcrumb-sep';
                sep.textContent = ' / ';
                slot.appendChild(sep);
            }
            const span = document.createElement('span');
            span.className = 'pages-breadcrumb';
            span.textContent = this._stringify(crumb.title);
            slot.appendChild(span);
        });
    }

    // ============================================
    // INTERNAL
    // ============================================

    /**
     * The title to use for the root crumb / root titlebar text.
     * Never returns an empty string.
     */
    _rootTitle() {
        return this._stringify(this._navName) || 'Каталог статей';
    }

    /**
     * Coerce any value into a displayable string.
     *
     * Safety net for the two places this helper writes to the DOM:
     * the titlebar and each crumb. Upstream values are expected to
     * be strings, but a broken caller (or an object accidentally
     * stored in _items / _navName) used to render as "[object
     * Object]". This method returns something sensible for every
     * input shape, without throwing.
     *
     * @param {*} v
     * @returns {string}
     */
    _stringify(v) {
        if (v == null) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') {
            return String(v);
        }
        if (typeof v === 'object') {
            // Common shapes we may encounter: {title}, {name},
            // {label}, {text}. Anything else becomes empty — no
            // "[object Object]" leaks into the UI.
            return v.title || v.name || v.label || v.text || '';
        }
        return '';
    }

    /**
     * Hide the statusbar below 768px, restore it above. The
     * breakpoint matches the one that flips the grid to a single
     * column on phones — that is the point where the path stops
     * fitting.
     *
     * No-op if BaseCards did not create the statusbar (a consumer
     * that did not request it, or a future BaseCards build).
     */
    _setupVisibility() {
        if (!this._cards?.widgetStatusbar) return;

        const apply = () => {
            const hide = window.matchMedia('(max-width: 768px)').matches;
            this._cards.widgetStatusbar.style.display = hide ? 'none' : '';
        };

        this._onResize = apply;
        window.addEventListener('resize', this._onResize);
        apply();
    }
}