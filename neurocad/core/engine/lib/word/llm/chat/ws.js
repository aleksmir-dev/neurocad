// neurocad/core/engine/lib/word/llm/chat/ws.js

/**
 * LLMChatWS — WebSocket transport for the chat.
 *
 *   connect()      — open the socket, start heartbeat
 *   send(payload)  — send JSON, return true/false
 *   isOpen()       — readyState === OPEN
 *   destroy()      — close, stop reconnect / heartbeat permanently
 *
 * Reconnect: exponential backoff (1s, 2s, 4s, 8s, 16s, 30s, 30s, ...).
 * Heartbeat: ping every 30s, pong is silently dropped.
 *
 * Auth-close (4403) is treated as terminal: no reconnect, onClose fires
 * with `{auth: true}` so the caller can show "нет доступа" instead of
 * "переподключаюсь".
 *
 * State callback (`onState`) is called with one of:
 *   "connecting" — trying to open
 *   "open"       — connected
 *   "closed"     — disconnected, will retry
 *   "auth"       — closed with 4403, no retry
 *   "dead"       — destroy() called, terminal
 */
export class LLMChatWS {
    // Exponential backoff steps (ms). Last value repeats.
    static BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

    // WebSocket close code used by the server for auth failures.
    static CLOSE_AUTH = 4403;

    constructor({ urlProvider, onOpen, onMessage, onClose, onState }) {
        this._urlProvider = urlProvider;
        this._onOpen = onOpen;
        this._onMessage = onMessage;
        this._onClose = onClose;
        this._onState = onState;

        this._ws = null;
        this._reconnectTimer = null;
        this._heartbeatTimer = null;
        this._attempt = 0;
        this._destroyed = false;

        // Set to true right before close() in destroy(), so onclose
        // knows not to schedule another reconnect.
        this._closingByUser = false;
    }

    get readyState() {
        return this._ws?.readyState;
    }

    isOpen() {
        return this._ws && this._ws.readyState === WebSocket.OPEN;
    }

    connect() {
        if (this._destroyed) return;

        const url = this._urlProvider();
        if (!url) {
            console.warn('[LLMChatWS] No URL — WS not opened');
            return;
        }

        console.log('[LLMChatWS] Opening WS:', url);
        this._setState('connecting');

        try {
            this._ws = new WebSocket(url);
        } catch (e) {
            console.error('[LLMChatWS] create error:', e);
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            console.log('[LLMChatWS] open — readyState:', this._ws?.readyState);
            this._attempt = 0;               // reset backoff on success
            this._startHeartbeat();
            this._setState('open');
            this._onOpen?.();
        };

        this._ws.onmessage = (e) => {
            let msg;
            try {
                msg = JSON.parse(e.data);
            } catch (err) {
                console.warn('[LLMChatWS] Bad message:', e.data);
                return;
            }

            // pong is silent — do not pass it up
            if (msg.type === 'pong') return;

            this._onMessage?.(msg);
        };

        this._ws.onerror = (e) => {
            console.warn('[LLMChatWS] error:', e);
        };

        this._ws.onclose = (e) => {
            console.log(
                `[LLMChatWS] closed: code=${e.code} reason=${e.reason || '(none)'} wasClean=${e.wasClean}`
            );
            this._stopHeartbeat();
            this._ws = null;

            // destroy() already handled state and cleanup.
            if (this._closingByUser) {
                this._closingByUser = false;
                return;
            }

            // Auth failure — terminal, no retry.
            if (e.code === LLMChatWS.CLOSE_AUTH) {
                this._setState('auth');
                this._onClose?.({ auth: true, code: e.code, reason: e.reason });
                return;
            }

            this._setState('closed');
            this._onClose?.({ code: e.code, reason: e.reason });
            this._scheduleReconnect();
        };
    }

    send(payload) {
        if (!this.isOpen()) {
            if (payload.type !== 'ping') {
                console.warn(
                    `[LLMChatWS] not ready (readyState=${this._ws?.readyState}), drop: ${payload.type}`
                );
            }
            return false;
        }
        try {
            this._ws.send(JSON.stringify(payload));
            return true;
        } catch (e) {
            if (payload.type !== 'ping') {
                console.warn('[LLMChatWS] send error:', e);
            }
            return false;
        }
    }

    // ============================================
    // RECONNECT
    // ============================================

    _scheduleReconnect() {
        if (this._destroyed) return;
        if (this._reconnectTimer) return;

        const steps = LLMChatWS.BACKOFF;
        const idx = Math.min(this._attempt, steps.length - 1);
        const delay = steps[idx];
        this._attempt += 1;

        console.log(`[LLMChatWS] reconnect attempt #${this._attempt} in ${delay}ms`);

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, delay);
    }

    // ============================================
    // HEARTBEAT
    // ============================================

    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }

    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    // ============================================
    // STATE
    // ============================================

    _setState(state) {
        try {
            this._onState?.(state);
        } catch (e) {
            console.warn('[LLMChatWS] onState error:', e);
        }
    }

    // ============================================
    // DESTROY
    // ============================================

    destroy() {
        this._destroyed = true;
        this._stopHeartbeat();
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._ws) {
            this._closingByUser = true;
            try { this._ws.close(); } catch (e) { /* ignore */ }
            this._ws = null;
        }
        this._setState('dead');
    }
}