// neurocad/core/engine/lib/word/llm/chat/api.js

/**
 * LLMChatAPI — HTTP part of the chat.
 *
 * Only GETs for history and active run; one DELETE for clearing
 * the chat history of a page.
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
            const r = await fetch(url, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });
            console.log('[LLMChatAPI] history status:', r.status);
            if (!r.ok) return null;

            const data = await r.json();
            if (data.success && Array.isArray(data.data)) return data.data;

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
            const r = await fetch(url, {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });
            console.log('[LLMChatAPI] clear status:', r.status);
            if (!r.ok) return null;

            const data = await r.json();
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
            const r = await fetch(url, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });
            console.log('[LLMChatAPI] active run status:', r.status);
            if (!r.ok) return null;

            const data = await r.json();
            return data?.data || null;
        } catch (e) {
            console.warn('[LLMChatAPI] active run error:', e);
            return null;
        }
    }
}