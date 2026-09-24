// neurocad/core/engine/lib/word/llm/chat/ws.js

/**
 * LLMChatWS — WebSocket transport for the chat.
 *
 *   connect()      — open the socket, start heartbeat
 *   send(payload)  — send JSON, return true/false
 *   isOpen()       — readyState === OPEN
 *   destroy()      — close and clear timers
 *
 * Reconnect: 3s, no backoff.
 * Heartbeat: ping every 30s, pong is silently dropped.
 */
export class LLMChatWS {
    constructor({ urlProvider, onOpen, onMessage, onClose }) {
        this._urlProvider = urlProvider;
        this._onOpen = onOpen;
        this._onMessage = onMessage;
        this._onClose = onClose;

        this._ws = null;
        this._reconnectTimer = null;
        this._heartbeatTimer = null;
    }

    get readyState() {
        return this._ws?.readyState;
    }

    isOpen() {
        return this._ws && this._ws.readyState === WebSocket.OPEN;
    }

    connect() {
        const url = this._urlProvider();
        if (!url) {
            console.warn('[LLMChatWS] No URL — WS not opened');
            return;
        }

        console.log('[LLMChatWS] Opening WS:', url);

        try {
            this._ws = new WebSocket(url);
        } catch (e) {
            console.error('[LLMChatWS] create error:', e);
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            console.log('[LLMChatWS] open — readyState:', this._ws?.readyState);
            this._startHeartbeat();
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
            this._onClose?.();
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

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        console.log('[LLMChatWS] reconnect in 3s');
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connect();
        }, 3000);
    }

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

    destroy() {
        this._stopHeartbeat();
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._ws) {
            try { this._ws.close(); } catch (e) { /* ignore */ }
            this._ws = null;
        }
    }
}