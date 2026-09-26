// neurocad/core/engine/lib/word/llm/chat/api.js

/**
 * LLMChatAPI — HTTP part of the chat.
 *
 * Only GETs for history and active run; one DELETE for clearing
 * the chat history of a page.
 *
 * HTTP goes through window.coreEngine.fetchJson
 * (loaded once by CoreEngine.loadApi()).
 *
 * Note: this module is defensive — it returns null on any error
 * instead of throwing, so the chat UI can degrade gracefully.
 */
export class LLMChatAPI {
    constructor(apiBase) {
        this._apiBase = apiBase;
    }

    // ============================================
    // HISTORY
    // ============================================

    async loadHistory(pageId) {
        const url = `${this._apiBase}/chat/${pageId}/history`;
        console.log('[LLMChatAPI] GET', url);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url);

            if (data && data.success && Array.isArray(data.data)) {
                return data.data;
            }

            console.warn('[LLMChatAPI] history: unexpected payload', data);
            return null;
        } catch (e) {
            console.error('[LLMChatAPI] history error:', e);
            return null;
        }
    }

    async clearHistory(pageId) {
        const url = `${this._apiBase}/chat/${pageId}/history`;
        console.log('[LLMChatAPI] DELETE', url);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url, { method: 'DELETE' });
            return data?.deleted ?? 0;
        } catch (e) {
            console.error('[LLMChatAPI] clear error:', e);
            return null;
        }
    }

    // ============================================
    // ACTIVE RUN
    // ============================================

    async checkActiveRun(pageId) {
        const url = `${this._apiBase}/chat/${pageId}/run/active`;
        console.log('[LLMChatAPI] GET', url);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            const data = await fetchJson(url);
            return data?.data || null;
        } catch (e) {
            console.warn('[LLMChatAPI] active run error:', e);
            return null;
        }
    }
}