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
 */
export class LLMChat {
    constructor(editor) {
        console.log('[LLMChat] Constructor');
        this.editor = editor;

        this._apiBase = '/core/engine/lib/word/llm';

        // Sub-modules — created in _loadModules()
        this.ws = null;
        this.ui = null;
        this.api = null;
        this.debug = null;
        this._onWsMessage = null;
        this._buildBlockCatalog = null;
        this._getSelection = null;
        this._applyElementUpdate = null;

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
        ] = await Promise.all([
            import(`./chat/ws.js?v=${v}`),
            import(`./chat/ui.js?v=${v}`),
            import(`./chat/api.js?v=${v}`),
            import(`./chat/debug.js?v=${v}`),
            import(`./chat/catalog.js?v=${v}`),
            import(`./chat/handler.js?v=${v}`),
            import(`./chat/selection.js?v=${v}`),
            import(`./chat/apply.js?v=${v}`),
        ]);

        this.debug = new LLMChatDebug(this.editor);
        this.ui = new LLMChatUI(this.editor);
        this.api = new LLMChatAPI(this._apiBase);
        this._buildBlockCatalog = buildLLMChatCatalog;
        this._getSelection = getLLMChatSelection;
        this._applyElementUpdate = applyLLMChatElementUpdate;

        this.ws = new LLMChatWS({
            urlProvider: () => this._getWsUrl(),
            onOpen: () => this._onWsOpen(),
            onMessage: (m) => this._onWsMessage(m),
            onClose: () => this._onWsClose(),
        });

        this._onWsMessage = createLLMChatHandler({
            ui: this.ui,
            onRunStart: (id) => { this._currentRunId = id; this._running = true; },
            onRunEnd: () => { this._currentRunId = null; this._running = false; },
            applyHtml: (html) => this._applyHtml(html),
            applyElement: (selector, html) => this._applyElement(selector, html),
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
        if (this._pendingStart) {
            const p = this._pendingStart;
            this._pendingStart = null;
            console.log('[LLMChat] flushing pending start');
            this.ws.send(p);
        }
    }

    _onWsClose() {
        if (this._running) {
            this.ui.setProgressText('Соединение потеряно. Переподключаюсь...');
        }
        setTimeout(() => this._checkActiveRun(), 3500);
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
    // APPLY HTML / ELEMENT
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
        if (this.ws) this.ws.destroy();
        if (this.ui) this.ui.destroy();
        this.messages = [];
        this._running = false;
        this._currentRunId = null;
        this._pendingStart = null;
    }
}