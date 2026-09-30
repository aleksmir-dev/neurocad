// neurocad/core/engine/lib/word/llm/chat/handler.js

/**
 * createLLMChatHandler — factory for the incoming WS message handler.
 *
 * Returns a function (msg) => void, closed over the UI instance and
 * seven callbacks:
 *   - onRunStart(runId)                 — a run has started
 *   - onRunEnd()                        — a run has finished
 *   - applyHtml(html)                   — replace the whole canvas (create / create_page)
 *   - applyPageCss(css)                 — replace the whole page CSS (create_page)
 *   - applyElement(selector, html)      — replace a single element (fill / effect)
 *   - applyCss(effectId, css, opts)     — replace the CSS of an effect (edit).
 *                                         `opts` may carry `{ newLabel, newMedia }`
 *                                         for a rename round-trip, or
 *                                         `{ newId, newLabel }` for a
 *                                         meaning-changing edit that
 *                                         proposes a rename on save.
 *   - applyEffectDraft(draft)           — receive a draft for a NEW effect
 *                                         (create_effect — not yet saved)
 *
 * All "what to do with this message" logic lives here, not in chat.js.
 *
 * Error messages (type: "error") are rendered with role="error" —
 * they get a distinct red bubble style (.core-engine-lib-word-llm-chat-msg-error)
 * instead of the normal assistant bubble.
 *
 * User-facing strings are in Russian — they go straight to the chat UI.
 * Internal log strings stay in English.
 */
export function createLLMChatHandler({
    ui,
    onRunStart,
    onRunEnd,
    applyHtml,
    applyPageCss,
    applyElement,
    applyCss,
    applyEffectDraft,
}) {
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

            // --------------------------------------------------------
            // SVG ILLUSTRATIONS (step 4): the agent sends one
            // `svg_progress` frame BEFORE each placeholder image is
            // sent to the LLM. The user sees "Генерация изображения
            // 2 из 6..." updating live in the progress bubble.
            //
            // Frame shape (from step.py → step_svg_illustrations):
            //   { type: 'svg_progress', current: 2, total: 6, alt: '...' }
            //
            // We do not use `alt` in the visible text — it can be long
            // or empty. Keep the message short and consistent with
            // fill_progress.
            // --------------------------------------------------------
            case 'svg_progress':
                ui.setProgressText(
                    `Генерация изображения ${msg.current} из ${msg.total}...`
                );
                return;

            // --------------------------------------------------------
            // HTML UPDATE: replace the whole canvas.
            //   - create       — HTML built from our ready blocks.
            //   - create_page  — free-form HTML, arrives together with
            //                    `page_css_update` (see below).
            // --------------------------------------------------------
            case 'html_update':
                applyHtml(msg.html || '');
                return;

            // --------------------------------------------------------
            // PAGE CSS UPDATE: replace the whole page CSS.
            //
            // Sent by create_page right after `html_update`. Carries
            // the model-generated CSS WITHOUT the surrounding <style>
            // tag. Applied through editor.setStyle(css) — the same
            // channel that the Style Manager uses on save.
            //
            // This must be a separate frame: GrapesJS cannot parse
            // <style> mixed into components and would drop the whole
            // tree if we tried to inline it into `html`.
            //
            // Frame shape (from dispatch.py → _run_agent):
            //   { type: 'page_css_update', css: '...' }
            // --------------------------------------------------------
            case 'page_css_update':
                if (typeof applyPageCss === 'function') {
                    applyPageCss(msg.css || '');
                } else {
                    console.warn('[LLMChat] page_css_update received but no applyPageCss handler');
                }
                return;

            case 'element_update':
                applyElement(msg.selector || '', msg.html || '');
                return;

            // --------------------------------------------------------
            // EFFECT EDIT / EFFECT RENAME: server returns a new full
            // CSS for one effect. The client applies it live in the
            // iframe (see live.js). Nothing is written to disk —
            // saving happens on the explicit save click (edit flow)
            // or is not needed at all (rename flow).
            //
            // The server MAY also send optional fields in the same
            // message:
            //
            //   new_id    — proposed new id (edit flow only, when the
            //               edit changed the MEANING of the effect).
            //               Handled by EditSession as "rename on save".
            //
            //   new_label — proposed new human-readable label. Used
            //               both by the edit flow (meaning change) and
            //               by the rename flow (label-only change).
            //
            //   new_media — proposed new SVG miniature. Used by the
            //               rename flow only: the palette block gets
            //               a fresh icon while its id and CSS stay
            //               untouched.
            //
            // All three are optional. `null` means "not present in
            // this message". They are forwarded as `opts` so the
            // edit session can decide what to do.
            // --------------------------------------------------------
            case 'css_update':
                if (typeof applyCss === 'function') {
                    const opts = {
                        newId: typeof msg.new_id === 'string' ? msg.new_id : null,
                        newLabel: typeof msg.new_label === 'string' ? msg.new_label : null,
                        newMedia: typeof msg.new_media === 'string' ? msg.new_media : null,
                    };
                    console.log('[LLMChat] css_update opts:', {
                        newId: opts.newId,
                        newLabel: opts.newLabel,
                        newMediaLen: opts.newMedia ? opts.newMedia.length : 0,
                    });
                    applyCss(msg.effect_id || '', msg.css || '', opts);
                } else {
                    console.warn('[LLMChat] css_update received but no applyCss handler');
                }
                return;

            // --------------------------------------------------------
            // EFFECT CREATE: server returns a DRAFT for a new effect.
            // Nothing has been written to disk yet. chat.js stores the
            // draft and shows a "сохрани" hint. When the user confirms,
            // chat.js POSTs to /editor/effects.
            //
            // The draft shape is:
            //   { id, label, hint, css, media }
            // --------------------------------------------------------
            case 'effect_draft':
                if (typeof applyEffectDraft === 'function') {
                    applyEffectDraft(msg.draft || null);
                } else {
                    console.warn('[LLMChat] effect_draft received but no applyEffectDraft handler');
                }
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
                // Error messages use role="error" — distinct red bubble.
                // The ⚠️ prefix is kept for extra visual cue.
                ui.addMessage({
                    role: 'error',
                    content: `⚠️ ${msg.message || 'Неизвестная ошибка'}`,
                    created_at: new Date().toISOString(),
                });
                return;

            default:
                console.log('[LLMChat] Unknown WS message:', msg);
        }
    };
}