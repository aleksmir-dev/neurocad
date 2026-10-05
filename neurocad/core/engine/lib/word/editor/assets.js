// app/core/engine/lib/word/editor/assets.js

/**
 * AssetsManager — image picker for the GrapesJS editor.
 *
 * The built-in GrapesJS Asset Manager is DISABLED (see
 * grapes/config.js → assetManager.custom = true). Image selection
 * in the editor goes through the shared BaseAssets picker — the
 * same full-screen modal the article edit form uses:
 *
 *     BaseAssets.open({
 *         sources: ['media', 'logos'],
 *         initialSource: 'logos',
 *         onSelect: (src) => { ... },
 *     })
 *
 * BaseAssets already knows how to:
 *   - show the media library (media/<nav_id>/) and the shared
 *     logos directory (word/editor/images/) as two tabs;
 *   - list items on a full-screen grid;
 *   - upload and delete files (with per-tariff storage limits);
 *   - open on a specific tab.
 *
 * Responsibilities of this class:
 *   1. openPicker({ onSelect })  — open BaseAssets and return the
 *      chosen src through the callback. Used by the toolbar and by
 *      the "Choose from library" button in the image traits panel.
 *
 *   2. bindTraits(gjs)           — attach the "Choose from library"
 *      button to the `src` trait of every <img> component in the
 *      canvas. Called once, after GrapesJS is initialised.
 *
 * Backend response shape (kept for reference — BaseAssets handles
 * the HTTP itself, this class does not call the API directly):
 *     { success: true, data: [{ src, name, type }, ...] }
 *
 * Notes:
 *   - Errors are logged, not thrown — the editor must open even
 *     if the media library is empty or BaseAssets fails to load.
 *   - BaseAssets is imported dynamically with a cache-buster, like
 *     every other module in the project.
 */

const BASE_ASSETS_PATH = '/static/core/engine/lib/base/assets/assets.js';

export class AssetsManager {
    /**
     * @param {Object} editor — parent Editor instance
     */
    constructor(editor) {
        this.editor = editor;
    }

    // ============================================
    // OPEN PICKER
    // ============================================

    /**
     * Open the shared BaseAssets picker and call onSelect with the
     * chosen image URL.
     *
     * @param {Object} opts
     * @param {string[]} [opts.sources]        — ['media'] | ['logos'] | ['media','logos']
     * @param {string}   [opts.initialSource]  — which tab opens first
     * @param {Function} opts.onSelect         — (src) => void, called on pick
     * @param {Function} [opts.onCancel]       — called on cancel/close
     */
    async openPicker(opts = {}) {
        const version = window.coreEngine?.static_version || Date.now();

        try {
            const { BaseAssets } = await import(`${BASE_ASSETS_PATH}?v=${version}`);

            BaseAssets.open({
                // Default: show both tabs, open on the media library.
                // Callers that know better (e.g. the logo field) may
                // pass their own sources / initialSource.
                sources: opts.sources || ['media', 'logos'],
                initialSource: opts.initialSource || 'media',

                onSelect: (src) => {
                    if (typeof opts.onSelect === 'function') {
                        opts.onSelect(src);
                    }
                },
                onCancel: () => {
                    if (typeof opts.onCancel === 'function') {
                        opts.onCancel();
                    }
                },
            });
        } catch (e) {
            console.warn('[AssetsManager] Failed to open BaseAssets:', e);
        }
    }

    // ============================================
    // TRAITS — "Choose from library" button on <img> src
    // ============================================

    /**
     * Attach a "Choose from library" button to the `src` trait of
     * every <img> component in the canvas.
     *
     * GrapesJS renders one built-in text input for `src`. There is
     * no first-class hook to add a second button next to it, so we
     * inject the button via a DOM observer: whenever the Trait
     * Manager re-renders (i.e. when the user selects a different
     * component), we look for the `src` field inside a `trait`
     * whose name is `src`, and append our button after it.
     *
     * The button click opens BaseAssets. On selection, the chosen
     * src is written back to the component through GrapesJS's own
     * public API — the same path the built-in input uses.
     *
     * Safe to call once, after `editor.init()`. Calling it twice is
     * a no-op (guarded by `this._traitsBound`).
     *
     * @param {Object} gjs — the GrapesJS instance (editor.editor)
     */
    bindTraits(gjs) {
        if (!gjs) return;
        if (this._traitsBound) return;
        this._traitsBound = true;

        // Where GrapesJS appends the traits panel. Read from the
        // config — the parent Editor stored it as e.traitsEl.
        const traitsEl = this.editor.traitsEl;
        if (!traitsEl) {
            console.warn('[AssetsManager] traitsEl not set — cannot bind traits button');
            return;
        }

        const attach = () => this._attachTraitButton(gjs, traitsEl);

        // Run once now (in case the panel is already rendered),
        // then re-run whenever the traits panel's content changes.
        // MutationObserver is the simplest way — no GrapesJS
        // internals, no fragile event subscriptions.
        attach();

        const observer = new MutationObserver(() => attach());
        observer.observe(traitsEl, { childList: true, subtree: true });

        // Keep the observer on the instance so it can be
        // disconnected in destroy() if needed. Currently the
        // editor is torn down as a whole, so this is defensive.
        this._traitsObserver = observer;
    }

    /**
     * One attach pass: find the `src` trait input of the currently
     * selected <img> component, and make sure our button is next
     * to it.
     *
     * Guards against double-attaching: if the button is already
     * there (data-js="assets-pick-btn"), we do nothing.
     */
    _attachTraitButton(gjs, traitsEl) {
        const selected = gjs.getSelected();
        if (!selected || selected.get('tagName') !== 'img') {
            return;
        }

        // GrapesJS renders traits as .gjs-trt-trait elements, each
        // with a data-trait attribute equal to the trait name.
        // We look for the one with data-trait="src".
        const srcTrait = traitsEl.querySelector('[data-trait="src"]');
        if (!srcTrait) return;

        // Already attached?
        if (srcTrait.querySelector('[data-js="assets-pick-btn"]')) {
            return;
        }

        // The button itself. Styled inline for now — the editor
        // chrome uses its own theme; if this needs to match the
        // surrounding GrapesJS look, extract to a CSS file.
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gjs-btn-prim';
        btn.setAttribute('data-js', 'assets-pick-btn');
        btn.textContent = 'Выбрать из медиатеки';
        btn.style.marginTop = '6px';
        btn.style.width = '100%';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.openPicker({
                sources: ['media', 'logos'],
                initialSource: 'media',
                onSelect: (src) => {
                    if (!src) return;
                    // Set the src on the component — same path the
                    // built-in input would take.
                    selected.set('src', src);
                    // Force GrapesJS to re-render the trait input so
                    // the new value is visible in the panel too.
                    gjs.TraitManager.render();
                },
            });
        });

        srcTrait.appendChild(btn);
    }

    // ============================================
    // TEARDOWN
    // ============================================

    destroy() {
        if (this._traitsObserver) {
            this._traitsObserver.disconnect();
            this._traitsObserver = null;
        }
        this._traitsBound = false;
        this.editor = null;
    }
}