// app/core/engine/lib/base/areas.js

/**
 * BaseAreas — area-center management.
 *
 * Owns everything that has to do with the "active page" rendered into
 * area-center and the area-left / area-right side panels:
 *
 *   - renderInArea(ComponentClass, options) — mount a new page into
 *     area-center, tearing down the previous one first;
 *   - teardownAreas()                       — destroy the active page
 *     (with the confirmClose() prompt) and clear side areas;
 *   - _destroyAreaInstance()                — destroy the active page
 *     without asking (used on 401);
 *   - _clearSideAreas() / _restoreSideAreas().
 *
 * All state lives on the owning Base instance:
 *   - base.areaInstance           — current page instance
 *   - base.leftEl / base.rightEl  — side panels
 *   - base.showLeft / base.showRight — side panels visibility
 *
 * Public entry points on Base (renderInArea / teardownAreas) simply
 * delegate here, so external callers (auth.js, menu.js) do not change.
 *
 * No imports. The module is self-contained and is loaded dynamically
 * from Base._loadModules() with a cache-busting ?v= query.
 */
export class BaseAreas {
    constructor(base) {
        this.base = base;
    }

    /**
     * Mount a component into area-center.
     *
     * Destroys the previous areaInstance (via teardownAreas) before
     * rendering the new one. teardownAreas may prompt the user via
     * confirmClose() — if the user cancels, we abort and return null.
     *
     * @param {Function} ComponentClass — component constructor
     * @param {Object}   options        — props passed to the constructor
     * @returns {Promise<Object|null>}  — instance, or null on cancel/error
     */
    async renderInArea(ComponentClass, options = {}) {
        console.log('[BaseAreas] renderInArea()');

        const center = document.querySelector('.core-engine-lib-base-area-center');
        if (!center) {
            console.error('[BaseAreas] area-center not found');
            return null;
        }

        // Destroy previous page instance and clear side areas.
        // If the user cancels the confirmClose() dialog, abort.
        const proceed = await this.teardownAreas();
        if (!proceed) {
            console.log('[BaseAreas] renderInArea cancelled by user');
            return null;
        }

        center.innerHTML = '';

        let instance;
        try {
            instance = new ComponentClass(options);

            if (instance._initPromise) {
                await instance._initPromise;
            }

            const element = await instance.render();
            center.appendChild(element);

            if (typeof instance.bindEvents === 'function') {
                instance.bindEvents(center);
            }
        } catch (e) {
            console.error('[BaseAreas] renderInArea error:', e);
            center.innerHTML = `
                <div style="padding:40px;text-align:center;color:#dc2626;">
                    <div style="font-size:32px;margin-bottom:12px;">❌</div>
                    <div>Не удалось загрузить страницу</div>
                </div>
            `;
            return null;
        }

        this.base.areaInstance = instance;
        return instance;
    }

    /**
     * Destroy the active area-center page and clear side areas.
     *
     * If the active page has unsaved changes (confirmClose), the user
     * is asked first. Returns:
     *   true  — proceed (page destroyed, side areas cleared);
     *   false — user cancelled; nothing was destroyed.
     */
    async teardownAreas() {
        const inst = this.base.areaInstance;

        if (inst?.confirmClose) {
            try {
                const choice = await inst.confirmClose();
                if (choice === 'cancel') {
                    console.log('[BaseAreas] teardownAreas cancelled by user');
                    return false;
                }
            } catch (e) {
                console.warn('[BaseAreas] confirmClose error:', e);
            }
        }

        try {
            this._destroyAreaInstance();
        } catch (e) {
            console.warn('[BaseAreas] teardownAreas: _destroyAreaInstance error:', e);
        }
        try {
            this._clearSideAreas();
        } catch (e) {
            console.warn('[BaseAreas] teardownAreas: _clearSideAreas error:', e);
        }

        return true;
    }

    /**
     * Destroy the active area-center page without asking.
     * Used on 401 (session gone — nothing to save anyway).
     */
    _destroyAreaInstance() {
        const inst = this.base.areaInstance;
        if (!inst) return;

        try {
            if (typeof inst.destroy === 'function') {
                inst.destroy();
            }
        } catch (e) {
            console.warn('[BaseAreas] areaInstance destroy error:', e);
        }

        this.base.areaInstance = null;
    }

    /**
     * Hide and clear area-left / area-right.
     *
     * Safety net for pages that don't clean up after themselves.
     * For Word, Editor.destroy() already clears them — this is a no-op.
     */
    _clearSideAreas() {
        if (this.base.leftEl) {
            this.base.leftEl.innerHTML = '';
            this.base.leftEl.style.display = 'none';
        }
        if (this.base.rightEl) {
            this.base.rightEl.innerHTML = '';
            this.base.rightEl.style.display = 'none';
        }
    }

    /**
     * Restore side areas visibility (they may have been hidden on 401).
     */
    _restoreSideAreas() {
        if (this.base.leftEl) {
            this.base.leftEl.style.display = this.base.showLeft ? 'flex' : 'none';
        }
        if (this.base.rightEl) {
            this.base.rightEl.style.display = this.base.showRight ? 'flex' : 'none';
        }
    }

    /**
     * Tear down everything — used by Base.destroy().
     */
    destroy() {
        this._destroyAreaInstance();
        this._clearSideAreas();
    }
}