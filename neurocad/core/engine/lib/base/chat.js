// app/core/engine/lib/base/chat.js

/**
 * BaseChatController — chat panel lifecycle.
 *
 * Owns everything that has to do with the in-page chat widget:
 *
 *   - init()       — dynamic-import the BaseChat module, instantiate
 *                    it, attach the media-query listener for the
 *                    "sidebar ↔ floating" mode switch;
 *   - updateMode() — recompute the layout mode (sidebar on desktop,
 *                    floating overlay on mobile);
 *   - open()       — show the chat (sidebar or overlay, depending
 *                    on the current mode);
 *   - close()      — hide the chat;
 *   - destroy()    — detach the listener, destroy the BaseChat
 *                    instance.
 *
 * All state lives on the owning Base instance:
 *   - base.chat             — the BaseChat instance (or null)
 *   - base.showChat         — whether chat is enabled at all
 *   - base.showRight        — whether area-right is visible
 *   - base.rightEl          — the area-right DOM node
 *
 * No imports. Loaded dynamically from Base._loadModules() with a
 * cache-busting ?v= query.
 */
export class BaseChatController {
    constructor(base) {
        this.base = base;
        this._mediaQuery = null;
    }

    // ============================================
    // INIT
    // ============================================

    /**
     * Load the BaseChat module and wire up the chat widget.
     *
     * No-op when chat is disabled (base.showChat is false).
     * On any error — the base chat simply stays null; the rest of
     * the page keeps working.
     */
    async init() {
        if (!this.base.showChat) return;

        console.log('[BaseChatController] init()');
        const version = window.coreEngine?.static_version || Date.now();

        // Ensure chat CSS is on the page.
        const href = `/static/core/engine/lib/base/chat/chat.css?v=${version}`;
        const existing = document.querySelector(`link[href="${href}"]`);
        if (!existing) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }

        try {
            const module = await import(`./chat/chat.js?v=${version}`);
            this.base.chat = new module.BaseChat();
            this.updateMode();

            this._mediaQuery = window.matchMedia('(min-width: 1024px)');
            this._mediaQuery.addEventListener('change', () => {
                this.updateMode();
            });
        } catch (error) {
            console.error('[BaseChatController] chat load error:', error);
        }
    }

    // ============================================
    // MODE
    // ============================================

    /**
     * Recompute the layout mode.
     *
     * Desktop (>= 1024px) with area-right visible → chat lives in
     * area-right as a sidebar.
     *
     * Otherwise → chat lives as a floating overlay on document.body.
     *
     * Called on init and on every media-query change.
     */
    updateMode() {
        const chat = this.base.chat;
        if (!chat) return;

        const isDesktop = window.innerWidth >= 1024;

        if (isDesktop && this.base.showRight && this.base.showChat) {
            // Sidebar mode — attach into area-right.
            if (this.base.rightEl) {
                chat.attach(this.base.rightEl);
            }
            return;
        }

        // Floating mode — detach from area-right if it was in sidebar mode.
        if (chat.isSidebarMode) {
            if (chat.container && chat.container.parentNode) {
                chat.container.remove();
                document.body.appendChild(chat.container);
            }
            chat.isSidebarMode = false;
            chat.container.classList.remove('sidebar-mode');
            chat.container.classList.add('hidden');
            chat.container.style.display = 'none';
        }
    }

    // ============================================
    // OPEN / CLOSE
    // ============================================

    /**
     * Show the chat.
     *
     * On desktop, with area-right visible: reveal area-right and the
     * chat container inside it.
     *
     * Otherwise: open the floating overlay.
     */
    open() {
        const chat = this.base.chat;
        if (!chat) return;

        const isDesktop = window.innerWidth >= 1024;
        if (isDesktop && this.base.showRight) {
            if (this.base.rightEl) {
                this.base.rightEl.style.display = 'flex';
            }
            if (chat.container) {
                chat.container.style.display = 'flex';
            }
        } else {
            chat.open();
        }
    }

    /**
     * Hide the chat.
     */
    close() {
        if (this.base.chat) {
            this.base.chat.close();
        }
    }

    // ============================================
    // DESTROY
    // ============================================

    /**
     * Detach the media-query listener and destroy the chat instance.
     * Called from Base.destroy().
     */
    destroy() {
        if (this._mediaQuery) {
            this._mediaQuery.removeEventListener('change', this.updateMode);
            this._mediaQuery = null;
        }

        if (this.base.chat) {
            if (typeof this.base.chat.destroy === 'function') {
                this.base.chat.destroy();
            }
            this.base.chat = null;
        }
    }
}