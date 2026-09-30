// neurocad/core/engine/lib/word/llm/chat.js

/**
 * LLMChat — thin facade over ./chat/*.js.
 *
 * Sub-modules are loaded lazily via dynamic import() with a version
 * query, matching the style of core/engine/lib/base/base.js.
 *
 *   LLMChatWS        (./chat/ws.js)      — WebSocket transport
 *   LLMChatUI        (./chat/ui.js)      — DOM: messages, progress, typing
 *   LLMChatAPI       (./chat/api.js)     — HTTP: history, active run, clear
 *   LLMChatDebug     (./chat/debug.js)   — console dumps
 *   buildLLMChatCatalog (./chat/catalog.js) — block catalog from GrapesJS
 *   createLLMChatHandler (./chat/handler.js) — incoming WS message handler
 *   getLLMChatSelection (./chat/selection.js) — current selection from GrapesJS
 *   applyLLMChatElementUpdate (./chat/apply.js) — replace a single element on canvas
 *   EditSession      (./chat/edit.js)    — effect edit mode
 *   CreateSession    (./chat/create.js)  — effect create mode
 *
 * What stays here
 * ---------------
 * This file is the ORCHESTRATOR. It owns:
 *
 *   - the WS transport (connect / reconnect / state banners);
 *   - chat history + active run (HTTP);
 *   - the two sub-sessions (EditSession / CreateSession):
 *     * created in _loadModules();
 *     * bind() / unbind() called here;
 *     * _onSend delegates to session.send(text) when a session is active.
 *
 * Everything specific to "edit effect" or "create effect" lives in the
 * respective session file. This file only routes.
 *
 * Page CSS from create_page
 * -------------------------
 *   The create_page agent returns free-form HTML + CSS. The server
 *   sends them as two separate frames:
 *
 *       { type: 'html_update',     html: '...' }
 *       { type: 'page_css_update', css:  '...' }
 *
 *   handler.js calls the chat's applyPageCss callback for the second
 *   frame. This file delegates to _applyPageCss(css), which calls
 *   editor.setStyle(css) — the same channel the Style Manager uses.
 *
 *   The split is required by GrapesJS: it cannot parse <style> mixed
 *   into components and silently drops the whole tree if we inline
 *   the CSS into the HTML. Keeping the two channels separate is what
 *   makes `create` work today — create_page reuses it.
 *
 * Effect edit mode
 * ----------------
 *   The palette emits `word:effect-edit-start`. EditSession._onStart
 *   fetches the current CSS, stores it, greets the user.
 *
 *   LLMChat._onSend: if EditSession.isActive() — session.send(text).
 *
 *   The server replies with `css_update`. handler.js calls the
 *   chat's `applyCss` callback with (effectId, css, opts), which
 *   delegates to EditSession.handleCss(effectId, css, opts).
 *   `opts` may carry `{ newId, newLabel }` if the server proposes to
 *   rename the effect on save.
 *
 *   The user clicks the save icon (in the palette). The palette emits
 *   `word:effect-edit-save`. EditSession either PUTs the CSS in place
 *   (no rename) or POSTs a new effect + DELETEs the old one (rename),
 *   commits the draft, clears state.
 *
 * Effect create mode
 * ------------------
 *   The palette "+" button creates a PENDING block and emits
 *   `word:effect-create-session-started`. CreateSession._onStart resets
 *   state and greets the user.
 *
 *   LLMChat._onSend: if CreateSession.isActive() — session.send(text).
 *   The session forwards `{ type: "create_effect", ... }` with the
 *   previous draft (if any) for iteration.
 *
 *   The server replies with `effect_draft`. handler.js calls the
 *   chat's `applyEffectDraft` callback, which delegates to
 *   CreateSession.handleDraft(draft). Session applies CSS + class +
 *   updates the pending block in the palette.
 *
 *   The user clicks the save icon (on the pending block). The palette
 *   emits `word:effect-create-save`. CreateSession POSTs the effect,
 *   injects the <link>, commits the draft, converts the pending
 *   block into a normal one.
 *
 *   The user clicks the close icon. The palette emits
 *   `word:effect-create-cancel`. CreateSession reverts the draft,
 *   removes the class, removes the pending block.
 */
export class LLMChat {
    constructor(editor) {
        console.log('[LLMChat] Constructor');
        this.editor = editor;

        this._apiBase = '/core/engine/lib/word/llm';

        // Base for the effects editor API:
        //   /core/engine/lib/word/editor/effects
        this._effectsApiBase = '/core/engine/lib/word/editor/effects';

        // Sub-modules — created in _loadModules()
        this.ws = null;
        this.ui = null;
        this.api = null;
        this.debug = null;
        this._onWsMessage = null;
        this._buildBlockCatalog = null;
        this._getSelection = null;
        this._applyElementUpdate = null;

        // Effects live-edit helpers (loaded in _loadModules)
        this._applyEffectDraft = null;
        this._commitEffectDraft = null;
        this._revertEffectDraft = null;
        this._addEffectLink = null;
        this._removeEffectLink = null;

        // Sessions (created in _loadModules after their modules load)
        this._editSession = null;
        this._createSession = null;

        // Run state
        this._running = false;
        this._currentRunId = null;
        this._pendingStart = null;

        // Data
        this.messages = [];
    }

    async init() {
        console.log('[LLMChat] init() START');

        if (!this.editor.chatEl) {
            console.error('[LLMChat] chatEl not found');
            return;
        }

        await this._loadModules();

        this.debug.dumpEnv();

        this.ui.mount();
        this.ui.onSubmit(() => this._onSend());
        this.ui.onClear(() => this._onClear());

        await this._loadHistory();

        if (this.messages.length === 0) {
            this.ui.addMessage({
                role: 'assistant',
                content: 'Опишите, что нужно сделать со страницей. Например: «собери лендинг для спа-салона», «выдели блок и скажи „заполни текстом“ или „закрась жёлтым“».',
                created_at: new Date().toISOString(),
            });
        }

        // Wire up the sessions (they subscribe to editor events).
        this._editSession?.bind();
        this._createSession?.bind();

        this.ws.connect();
        await this._checkActiveRun();

        console.log('[LLMChat] init() COMPLETE');
    }

    // ============================================
    // MODULE LOADING
    // ============================================

    async _loadModules() {
        const v = window.coreEngine?.static_version || Date.now();

        const [
            { LLMChatWS },
            { LLMChatUI },
            { LLMChatAPI },
            { LLMChatDebug },
            { buildLLMChatCatalog },
            { createLLMChatHandler },
            { getLLMChatSelection },
            { applyLLMChatElementUpdate },
            {
                applyDraft,
                commitDraft,
                revertDraft,
                addEffectLink,
                removeEffectLink,
            },
            { EditSession },
            { CreateSession },
        ] = await Promise.all([
            import(`./chat/ws.js?v=${v}`),
            import(`./chat/ui.js?v=${v}`),
            import(`./chat/api.js?v=${v}`),
            import(`./chat/debug.js?v=${v}`),
            import(`./chat/catalog.js?v=${v}`),
            import(`./chat/handler.js?v=${v}`),
            import(`./chat/selection.js?v=${v}`),
            import(`./chat/apply.js?v=${v}`),
            import(`../editor/effects/live.js?v=${v}`),
            import(`./chat/edit.js?v=${v}`),
            import(`./chat/create.js?v=${v}`),
        ]);

        this.debug = new LLMChatDebug(this.editor);
        this.ui = new LLMChatUI(this.editor);
        this.api = new LLMChatAPI(this._apiBase);
        this._buildBlockCatalog = buildLLMChatCatalog;
        this._getSelection = getLLMChatSelection;
        this._applyElementUpdate = applyLLMChatElementUpdate;

        this._applyEffectDraft = applyDraft;
        this._commitEffectDraft = commitDraft;
        this._revertEffectDraft = revertDraft;
        this._addEffectLink = addEffectLink;
        this._removeEffectLink = removeEffectLink;

        // Sessions — created after their modules and the UI/WS are ready.
        // They do NOT subscribe to editor events yet — bind() is called
        // from init() (so that the editor is fully initialized first).
        this._editSession = new EditSession(this);
        this._createSession = new CreateSession(this);

        this.ws = new LLMChatWS({
            urlProvider: () => this._getWsUrl(),
            onOpen: () => this._onWsOpen(),
            onMessage: (m) => this._onWsMessage(m),
            onClose: (info) => this._onWsClose(info),
            onState: (state) => this._onWsState(state),
        });

        this._onWsMessage = createLLMChatHandler({
            ui: this.ui,
            onRunStart: (id) => { this._currentRunId = id; this._running = true; },
            onRunEnd: () => { this._currentRunId = null; this._running = false; },
            applyHtml: (html) => this._applyHtml(html),
            applyPageCss: (css) => this._applyPageCss(css),
            applyElement: (selector, html) => this._applyElement(selector, html),
            // handler.js passes a third `opts` argument that may carry
            // { newId, newLabel } for effect renames. Forward it to
            // EditSession.handleCss unchanged.
            applyCss: (effectId, css, opts) =>
                this._editSession?.handleCss(effectId, css, opts),
            applyEffectDraft: (draft) => this._createSession?.handleDraft(draft),
        });
    }

    // ============================================
    // URL
    // ============================================

    _getWsUrl() {
        const pageId = this.editor.pageId;
        if (!pageId) return null;

        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${proto}//${host}${this._apiBase}/ws/${pageId}`;
    }

    /**
     * ?module=<name> for the effects editor API.
     */
    _qsForEffects() {
        const moduleName = window.coreEngine?.moduleName
            || document.body.dataset.module
            || '';
        return moduleName
            ? `?module=${encodeURIComponent(moduleName)}`
            : '';
    }

    // ============================================
    // HISTORY / ACTIVE RUN (HTTP)
    // ============================================

    async _loadHistory() {
        const pageId = this.editor.pageId;
        if (!pageId) return;

        const rows = await this.api.loadHistory(pageId);
        if (rows) {
            this.messages = rows;
            this.ui.setMessages(rows);
            console.log(`[LLMChat] Loaded messages: ${this.messages.length}`);
        }
    }

    async _checkActiveRun() {
        const pageId = this.editor.pageId;
        if (!pageId) return;

        const run = await this.api.checkActiveRun(pageId);
        if (!run) {
            console.log('[LLMChat] no active run');
            return;
        }

        console.log('[LLMChat] active run found:', run.id, run.status);
        this._currentRunId = run.id;
        this._running = true;
        this.ui.setSendingState(true);
        this.ui.setProgressText(run.message || `Run #${run.id} в процессе...`);
    }

    // ============================================
    // CLEAR CHAT
    // ============================================

    async _onClear() {
        console.log('[LLMChat] _onClear()');

        const pageId = this.editor.pageId;
        if (!pageId) return;

        const deleted = await this.api.clearHistory(pageId);
        if (deleted === null) {
            console.error('[LLMChat] clear failed');
            this.ui.addMessage({
                role: 'assistant',
                content: '⚠️ Не удалось очистить историю чата.',
                created_at: new Date().toISOString(),
            });
            return;
        }

        console.log(`[LLMChat] cleared ${deleted} messages`);
        this.messages = [];
        this.ui.setMessages([]);
        this.ui.finalizeProgress();
        this.ui.hideTyping();
        this.ui.addMessage({
            role: 'assistant',
            content: 'Чат очищен. Опишите, что сделать со страницей.',
            created_at: new Date().toISOString(),
        });
    }

    // ============================================
    // WS CALLBACKS
    // ============================================

    _onWsOpen() {
        console.log('[LLMChat] WS open — readyState:', this.ws.readyState);

        this._setConnectionBanner(null);

        if (this._pendingStart) {
            const p = this._pendingStart;
            this._pendingStart = null;
            console.log('[LLMChat] flushing pending start');
            this.ws.send(p);
        }
    }

    _onWsClose(info = {}) {
        console.log('[LLMChat] WS close', info);

        if (info.auth) {
            this._setConnectionBanner({
                kind: 'error',
                text: 'Нет доступа к чату. Войдите как супер-администратор.',
            });
            this.ui.setSendingState(false);
            this.ui.hideTyping();
            return;
        }

        if (this._running) {
            this.ui.setProgressText('Соединение потеряно. Переподключаюсь...');
        }

        setTimeout(() => this._checkActiveRun(), 3500);
    }

    _onWsState(state) {
        switch (state) {
            case 'connecting':
                this._setConnectionBanner({ kind: 'info', text: 'Подключение к чату...' });
                break;
            case 'open':
                this._setConnectionBanner(null);
                break;
            case 'closed':
                this._setConnectionBanner({ kind: 'warn', text: 'Соединение потеряно. Переподключаюсь...' });
                break;
            case 'auth':
                this._setConnectionBanner({ kind: 'error', text: 'Нет доступа к чату. Войдите как супер-администратор.' });
                break;
            case 'dead':
                this._setConnectionBanner(null);
                break;
        }
    }

    _setConnectionBanner(spec) {
        if (typeof this.ui?.setConnectionBanner === 'function') {
            this.ui.setConnectionBanner(spec);
        } else if (spec) {
            console.log('[LLMChat] connection state:', spec.kind, spec.text);
        }
    }

    // ============================================
    // HELPERS USED BY SESSIONS
    // ============================================

    /**
     * Access the EffectBlocks instance.
     *
     * The instance is registered by word/editor/index.js (BlocksRegistry
     * → register EffectBlocks) and stored somewhere on the editor /
     * word component. The exact field depends on which object holds it:
     *
     *   - this.editor._effectBlocks             — Word component
     *   - this.editor.editor._effectBlocks      — GrapesJS editor
     *   - this.editor.blocks._effectBlocks      — BlocksRegistry module
     *   - this.editor.editor.effectBlocks       — alternative field name
     *   - window._effectBlocks                  — last-resort global
     *
     * We probe all of them and log which one hit, so a missing
     * registration is visible in the console instead of silently
     * producing null.
     *
     * NOTE: this method is intentionally verbose on the console — it
     * is the single point where the "save button stays disabled" bug
     * manifests, and we want the exact hit / miss in the log.
     */
    _effectBlocks() {
        const candidates = [
            ['this.editor._effectBlocks',        this.editor?._effectBlocks],
            ['this.editor.editor._effectBlocks', this.editor?.editor?._effectBlocks],
            ['this.editor.blocks._effectBlocks', this.editor?.blocks?._effectBlocks],
            ['this.editor.editor.effectBlocks',  this.editor?.editor?.effectBlocks],
            ['this.editor.effectBlocks',         this.editor?.effectBlocks],
            ['window._effectBlocks',             window._effectBlocks],
        ];

        for (const [where, value] of candidates) {
            if (value) {
                console.log('[LLMChat] _effectBlocks() found at:', where);
                return value;
            }
        }

        console.warn(
            '[LLMChat] _effectBlocks() NOT FOUND. Probed:',
            candidates.map(([where, v]) => `${where}=${v ? 'set' : 'null'}`)
        );
        return null;
    }

    /**
     * Load the current CSS of an effect from the server.
     * Used by EditSession._handleStart.
     */
    async _loadEffectCss(effectId) {
        const url = `${this._effectsApiBase}/${effectId}.css${this._qsForEffects()}`;
        console.log('[LLMChat] GET', url);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url);
            if (data && data.success && data.data && typeof data.data.css === 'string') {
                return data.data.css;
            }
            console.warn('[LLMChat] loadEffectCss: unexpected payload', data);
            return null;
        } catch (e) {
            console.error('[LLMChat] loadEffectCss error:', e);
            return null;
        }
    }

    /**
     * Save the given effect CSS to the server (PUT).
     * Used by EditSession._handleSave.
     */
    async _saveEffectCss(effectId, css) {
        const url = `${this._effectsApiBase}/${effectId}${this._qsForEffects()}`;
        console.log('[LLMChat] PUT', url, `${css.length} bytes`);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ css }),
            });
            return !!(data && data.success);
        } catch (e) {
            console.error('[LLMChat] saveEffectCss error:', e);
            return false;
        }
    }

    // ============================================
    // SEND / CANCEL
    // ============================================

    _onSend() {
        if (this._running) {
            this._onCancel();
            return;
        }

        const text = (this.ui.getInputValue() || '').trim();
        if (!text) return;

        if (!this.editor.pageId) {
            this.ui.addMessage({
                role: 'assistant',
                content: '⚠️ Не удалось определить страницу (pageId не задан).',
                created_at: new Date().toISOString(),
            });
            return;
        }

        console.log('[LLMChat] _onSend() text:', text);

        this.ui.addMessage({
            role: 'user',
            content: text,
            created_at: new Date().toISOString(),
        });
        this.ui.clearInput();

        // ---- EFFECT CREATE MODE ----
        // While a create session is active, every message goes to the
        // create_effect agent. Saving is NOT done via chat — it is
        // triggered by clicking the save icon on the pending block.
        if (this._createSession?.isActive()) {
            console.log('[LLMChat] create-effect: draft request');
            this.ui.showTyping();
            this._running = true;
            this.ui.setSendingState(true);

            this._createSession.send(text);
            return;
        }

        // ---- EFFECT EDIT MODE ----
        if (this._editSession?.isActive()) {
            this.ui.showTyping();
            this._running = true;
            this.ui.setSendingState(true);

            this._editSession.send(text);
            return;
        }

        // ---- REGULAR PAGE FLOW ----
        this.ui.showTyping();
        this._running = true;
        this.ui.setSendingState(true);

        const blockCatalog = this._buildBlockCatalog(this.editor);
        const selection = this._getSelection(this.editor);

        const payload = {
            type: 'start',
            message: text,
            block_catalog: blockCatalog,
            selection: selection,
        };

        this.debug.dumpBlocks(blockCatalog);
        this.debug.dumpSelection(selection);
        this.debug.dumpPayload(payload);

        if (this.ws.isOpen()) {
            console.log('[LLMChat] sending start over open WS');
            this.ws.send(payload);
        } else {
            console.warn('[LLMChat] WS not ready, queueing start');
            this._pendingStart = payload;
            this.ws.connect();
        }
    }

    _onCancel() {
        console.log('[LLMChat] _onCancel()');

        if (this._pendingStart) {
            this._pendingStart = null;
            this._running = false;
            this.ui.setSendingState(false);
            this.ui.hideTyping();
            this.ui.setProgressText('Отменено.');
            this.ui.finalizeProgress();
            return;
        }

        this.ws.send({ type: 'cancel' });
        this.ui.setProgressText('Отмена...');
    }

    // ============================================
    // APPLY HTML / CSS / ELEMENT
    // ============================================

    _applyHtml(html) {
        if (!html) return;
        if (!this.editor.editor) return;

        try {
            console.log('[LLMChat] Applying HTML to canvas:', html.length);
            this.editor.editor.setComponents(html);
        } catch (e) {
            console.error('[LLMChat] Apply error:', e);
            this.ui.addMessage({
                role: 'assistant',
                content: `⚠️ Ошибка применения HTML: ${e.message}`,
                created_at: new Date().toISOString(),
            });
        }
    }

    /**
     * Apply the whole page CSS from a `page_css_update` frame.
     *
     * Called by handler.js right after `html_update` when the
     * create_page agent returns free-form HTML + CSS. The CSS is a
     * separate string WITHOUT the surrounding <style> tag — we feed
     * it straight to editor.setStyle(), the same channel the Style
     * Manager uses on save.
     *
     * Doing this via setStyle (and not by inlining <style> into the
     * HTML) is required: GrapesJS cannot parse <style> mixed into
     * components and would drop the whole tree if we tried.
     */
    _applyPageCss(css) {
        if (!css || !css.trim()) return;
        if (!this.editor.editor) return;

        try {
            console.log('[LLMChat] Applying page CSS:', css.length);
            this.editor.editor.setStyle(css);
        } catch (e) {
            console.error('[LLMChat] Page CSS apply error:', e);
            this.ui.addMessage({
                role: 'assistant',
                content: `⚠️ Ошибка применения CSS: ${e.message}`,
                created_at: new Date().toISOString(),
            });
        }
    }

    _applyElement(selector, html) {
        if (!selector || !html) return;
        if (!this.editor.editor) return;

        try {
            console.log('[LLMChat] Applying element update:', selector, html.length);
            this._applyElementUpdate(this.editor, selector, html);
        } catch (e) {
            console.error('[LLMChat] Element apply error:', e);
            this.ui.addMessage({
                role: 'assistant',
                content: `⚠️ Ошибка замены элемента ${selector}: ${e.message}`,
                created_at: new Date().toISOString(),
            });
        }
    }

    // ============================================
    // PUBLIC
    // ============================================

    getMessages() {
        return this.messages.slice();
    }

    destroy() {
        console.log('[LLMChat] destroy()');

        // Sessions — detach from editor events.
        if (this._editSession) {
            try { this._editSession.unbind(); } catch (_) {}
            this._editSession = null;
        }
        if (this._createSession) {
            try { this._createSession.unbind(); } catch (_) {}
            this._createSession = null;
        }

        if (this.ws) this.ws.destroy();
        if (this.ui) this.ui.destroy();

        this.messages = [];
        this._running = false;
        this._currentRunId = null;
        this._pendingStart = null;
    }
}