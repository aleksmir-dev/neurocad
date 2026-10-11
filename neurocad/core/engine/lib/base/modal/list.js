// app/core/engine/lib/base/modal/list.js

/**
 * BaseModalList — a single-choice picker modal.
 *
 * Namespace: .core-engine-lib-base-modal-list
 *
 * Mirrors the shape of BaseModalInput (title-bar + content +
 * actions-bar), but instead of a text field it renders a scrollable
 * list of selectable items. The user clicks an item — the modal
 * resolves with its `value` and closes.
 *
 * API:
 *   open(text, title, items, options)
 *   setOnOk(callback)       — callback(value)
 *   setOnCancel(callback)   — callback(null)
 *   setOnResult(callback)   — same callback for OK and Cancel
 *   close()
 *   destroy()
 *
 * items
 * -----
 * An array of plain objects. Only `value` is required; all other
 * fields are optional and used for display:
 *
 *   {
 *       value:    <any>      // what the caller receives on click
 *       label:    <string>   // main text (defaults to String(value))
 *       path:     <string>   // secondary text, e.g. "/folder1/sub"
 *       icon:     <string>   // emoji or SVG name (optional)
 *       disabled: <boolean>  // if true, the item cannot be picked
 *   }
 *
 * The caller is responsible for the shape of `value` — BaseModalList
 * does not interpret it. Move uses `null` for the root and `<id>` for
 * a folder; a generic caller may use strings, ids, whatever.
 *
 * Selection behaviour
 * -------------------
 *   - click on an item → onOk(value) + close
 *   - Enter            → onOk(value of the highlighted item) + close
 *   - Escape / overlay → onCancel(null) + close
 *   - close button (✕)  → onCancel(null) + close
 *
 * Keyboard navigation (↑ / ↓) is intentionally NOT implemented — the
 * list is expected to be short (a flat list of folders), and
 * introducing a highlighted-item state here would force every caller
 * to think about focus management. Click and Enter are enough.
 */

export class BaseModalList {
    constructor() {
        this.container = null;
        this.onOk = null;
        this.onCancel = null;

        // Current items (set on open()).
        this.items = [];

        // Load CSS on construct — same pattern as BaseModalInput.
        this._loadCSS();

        this._createDOM();
        this._bindEvents();
    }

    /**
     * Load modal CSS.
     */
    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/list.css');
        }
    }

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-base-modal-list');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-list';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Выбор</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="list-text"></div>
                    <div class="list-body" data-js="list-body"></div>
                    <div class="actions-bar">
                        <button class="btn btn-white cancel-btn">Отмена</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
    }

    _cacheElements() {
        this.titleBarText = this.container.querySelector('.title-bar-text');
        this.listText = this.container.querySelector('.list-text');
        this.listBody = this.container.querySelector('[data-js="list-body"]');
        this.cancelBtn = this.container.querySelector('.cancel-btn');
        this.closeBtn = this.container.querySelector('.close-btn');
    }

    _bindEvents() {
        // === Отмена ===
        this.cancelBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel(null);
            }
            this.close();
        });

        // === Закрытие (✕) ===
        this.closeBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel(null);
            }
            this.close();
        });

        // === Клик по оверлею ===
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                if (this.onCancel) {
                    this.onCancel(null);
                }
                this.close();
            }
        });

        // === Escape ===
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                if (this.onCancel) {
                    this.onCancel(null);
                }
                this.close();
            }
        });

        // === Enter на элементе (делегирование) ===
        // Items are re-created on every open(); the listener lives on
        // the stable .list-body container, so it survives re-renders.
        this.listBody.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const item = e.target.closest('.list-item');
            if (!item || item.classList.contains('disabled')) return;
            e.preventDefault();
            this._pick(item);
        });
    }

    // ============================================
    // RENDER
    // ============================================

    /**
     * Render the list of items into .list-body.
     *
     * Clears the container, then appends one .list-item per entry.
     * Each item carries the index in `data-index` — used by _pick()
     * to resolve the original value.
     */
    _renderItems() {
        this.listBody.innerHTML = '';

        if (!this.items.length) {
            const empty = document.createElement('div');
            empty.className = 'list-empty';
            empty.textContent = 'Нет элементов';
            this.listBody.appendChild(empty);
            return;
        }

        this.items.forEach((item, index) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'list-item';
            el.setAttribute('data-index', String(index));

            if (item.disabled) {
                el.classList.add('disabled');
                el.disabled = true;
            }

            // ---- Icon (optional) ----
            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'list-item-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = item.icon;
                el.appendChild(icon);
            }

            // ---- Body: label + optional path ----
            const body = document.createElement('span');
            body.className = 'list-item-body';

            const label = document.createElement('span');
            label.className = 'list-item-label';
            label.textContent = item.label != null
                ? String(item.label)
                : String(item.value);
            body.appendChild(label);

            if (item.path) {
                const path = document.createElement('span');
                path.className = 'list-item-path';
                path.textContent = String(item.path);
                body.appendChild(path);
            }

            el.appendChild(body);

            // ---- Click → pick ----
            el.addEventListener('click', () => this._pick(el));

            this.listBody.appendChild(el);
        });
    }

    /**
     * Resolve the clicked item and close.
     *
     * The DOM element is the source of truth — we read `data-index`
     * back into `this.items` so the caller receives exactly the
     * object it passed in, not a re-serialized copy.
     */
    _pick(el) {
        if (!el || el.classList.contains('disabled')) return;

        const rawIndex = el.getAttribute('data-index');
        const index = Number.parseInt(rawIndex, 10);
        if (Number.isNaN(index)) return;

        const item = this.items[index];
        if (!item || item.disabled) return;

        if (this.onOk) {
            this.onOk(item.value);
        }
        this.close();
    }

    // ============================================
    // PUBLIC
    // ============================================

    /**
     * Open the modal.
     *
     * @param {string} text    — optional caption above the list
     * @param {string} title   — window title (defaults to "Выбор")
     * @param {Array}  items   — see the class docstring for the shape
     * @param {Object} [opts]  — { emptyText } optional overrides
     */
    open(text, title, items, opts = {}) {
        this.listText.textContent = text || '';
        this.titleBarText.textContent = title || 'Выбор';

        this.items = Array.isArray(items) ? items : [];

        // Optional empty-text override — set as a data attribute on
        // the container so CSS can decide how (or whether) to show it.
        // Kept simple: if provided, _renderItems uses it for the
        // "no items" state via a closure-like lookup.
        this._emptyText = opts.emptyText || 'Нет элементов';

        this._renderItems();

        this.container.classList.add('active');

        // Focus the first non-disabled item so Enter works
        // immediately without a mouse.
        setTimeout(() => {
            const first = this.listBody.querySelector('.list-item:not(.disabled)');
            if (first) first.focus();
        }, 100);
    }

    close() {
        this.container.classList.remove('active');
    }

    setOnOk(callback) {
        this.onOk = callback;
    }

    setOnCancel(callback) {
        this.onCancel = callback;
    }

    setOnResult(callback) {
        this.onOk = callback;
        this.onCancel = callback;
    }

    destroy() {
        if (this.container) {
            this.container.remove();
        }
    }
}