// neurocad/core/engine/lib/word/llm/chat/handler.js

/**
 * createLLMChatHandler — factory for the incoming WS message handler.
 *
 * Returns a function (msg) => void, closed over the UI instance and
 * four callbacks:
 *   - onRunStart(runId)                 — a run has started
 *   - onRunEnd()                        — a run has finished
 *   - applyHtml(html)                   — replace the whole canvas (create)
 *   - applyElement(selector, html)      — replace a single element (fill / effect)
 *
 * All "what to do with this message" logic lives here, not in chat.js.
 *
 * User-facing strings are in Russian — they go straight to the chat UI.
 * Internal log strings stay in English.
 */
export function createLLMChatHandler({ ui, onRunStart, onRunEnd, applyHtml, applyElement }) {
    return function handle(msg) {
        const t = msg.type;
        console.log('[LLMChat] WS message:', t, msg);

        switch (t) {
            case 'pong':
                return;

            case 'run_started':
                onRunStart(msg.run_id);
                ui.setSendingState(true);
                // Do NOT hide typing here — it stays until the first
                // 'step' event, so the user sees the pulsing dots
                // while the router is deciding what to do.
                ui.ensureProgress();
                return;

            case 'step':
                ui.hideTyping();
                ui.setProgressText(msg.message || '');
                return;

            case 'plan':
                if (Array.isArray(msg.blocks) && msg.blocks.length) {
                    const ids = msg.blocks.map(b => b.block_id).join(', ');
                    ui.setProgressText(`Выбрано блоков: ${msg.blocks.length} (${ids})`);
                }
                return;

            case 'fill_progress':
                ui.setProgressText(
                    `Заполняю текстом: запрос ${msg.request} из ${msg.total}...`
                );
                return;

            case 'html_update':
                applyHtml(msg.html || '');
                return;

            case 'element_update':
                applyElement(msg.selector || '', msg.html || '');
                return;

            case 'assistant_message':
                ui.finalizeProgress();
                if (msg.content) {
                    ui.addMessage({
                        role: 'assistant',
                        content: msg.content,
                        created_at: new Date().toISOString(),
                    });
                }
                return;

            case 'done':
                onRunEnd();
                ui.setSendingState(false);
                ui.finalizeProgress();
                return;

            case 'cancelled':
                onRunEnd();
                ui.setSendingState(false);
                ui.setProgressText('Отменено.');
                ui.finalizeProgress();
                return;

            case 'error':
                onRunEnd();
                ui.setSendingState(false);
                ui.hideTyping();
                ui.finalizeProgress();
                ui.addMessage({
                    role: 'assistant',
                    content: `⚠️ ${msg.message || 'Неизвестная ошибка'}`,
                    created_at: new Date().toISOString(),
                });
                return;

            default:
                console.log('[LLMChat] Unknown WS message:', msg);
        }
    };
}