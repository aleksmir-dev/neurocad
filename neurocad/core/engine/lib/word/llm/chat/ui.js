// neurocad/core/engine/lib/word/llm/chat/ui.js

/**
 * LLMChatUI — DOM part of the chat.
 *
 * Messages, progress bubble, typing indicator, input form, send/stop
 * button, and the "clear chat" button in the toolbar.
 *
 * Knows nothing about WebSocket or HTTP — the caller wires up the
 * onClear callback to whatever API method is appropriate.
 *
 * Message roles:
 *   user      — user message (right-aligned, blue bubble)
 *   assistant — assistant message (left-aligned, gray bubble)
 *   error     — error message (left-aligned, red bubble)
 *
 * Progress bubble
 * ---------------
 * The progress bubble is a single assistant-style line whose text is
 * replaced via setProgressText(text). It is used by BOTH agent modes:
 *
 *   - single-shot agents (create, fill, effect):
 *       "Выбрано блоков: 5 (hero, features, ...)"
 *       "Заполняю текстом: запрос 2 из 4..."
 *       "Генерация изображения 1 из 6..."
 *
 *   - stepwise create_page (one section per LLM call):
 *       "Шаг 3: секция «features»"
 *       "Завершаю страницу..."
 *
 * The UI does not parse or reformat the string — whatever the handler
 * passes in is what the user sees. The handler is responsible for
 * building the correct message for each mode.
 *
 * finalizeProgress() is called by the handler on terminal frames
 * (`assistant_message`, `done`, `cancelled`, `error`). In stepwise
 * mode the terminal `page_step` (with `done: true`) is followed by
 * the usual global `done` frame, so the progress bubble is removed
 * exactly once at the end of the run — no special-casing needed here.
 *
 * Message actions:
 *   `addMessage()` accepts an optional `msg.action` of shape
 *   `{ label, href?, onClick? }`. It is rendered as an inline link
 *   under the bubble text. Used by the error path in handler.js to
 *   offer "Перейти к балансу" when the LLM quota is exhausted.
 *
 * User-facing strings are in Russian.
 */
export class LLMChatUI {
    constructor(editor) {
        this.rootEl = editor.chatEl;

        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;
        this.clearBtn = null;

        this._progressEl = null;
        this._progressText = '';

        this._typingEl = null;

        // Connection banner (shown between messages and the form).
        this._bannerEl = null;
    }

    // ============================================
    // MOUNT
    // ============================================

    mount() {
        while (this.rootEl.firstChild) {
            this.rootEl.removeChild(this.rootEl.firstChild);
        }

        const messages = document.createElement('div');
        messages.className = 'core-engine-lib-word-llm-chat-messages';
        messages.setAttribute('data-js', 'llm-chat-messages');
        this.messagesEl = messages;
        this.rootEl.appendChild(messages);

        // Connection banner slot — created here, shown/hidden later via
        // setConnectionBanner(). Sits between messages and the form so it
        // never overlaps the scrollable message list.
        const banner = document.createElement('div');
        banner.className = 'core-engine-lib-word-llm-chat-banner';
        banner.setAttribute('data-js', 'llm-chat-banner');
        banner.hidden = true;
        this._bannerEl = banner;
        this.rootEl.appendChild(banner);

        const form = document.createElement('form');
        form.className = 'core-engine-lib-word-llm-chat-form';

        const input = document.createElement('textarea');
        input.className = 'core-engine-lib-word-llm-chat-input';
        input.setAttribute('data-js', 'llm-chat-input');
        input.setAttribute('placeholder', 'Опишите, что сделать...');
        input.setAttribute('rows', '2');
        this.inputEl = input;
        form.appendChild(input);

        const sendBtn = document.createElement('button');
        sendBtn.type = 'submit';
        sendBtn.className = 'core-engine-lib-word-llm-chat-send';
        sendBtn.setAttribute('title', 'Отправить (Enter)');
        sendBtn.setAttribute('aria-label', 'Отправить');
        sendBtn.textContent = '▶';
        this.sendBtn = sendBtn;
        form.appendChild(sendBtn);

        this.formEl = form;
        this.rootEl.appendChild(form);

        // Clear button in the toolbar (if the toolbar exists).
        this._mountClearButton();
    }

    _mountClearButton() {
        // The toolbar is rendered outside this component (widgets.js /
        // editor template), so we look it up by data-js attribute.
        const toolbar = document.querySelector('[data-js="editor-chat-toolbar"]');
        if (!toolbar) {
            console.warn('[LLMChatUI] toolbar not found — clear button skipped');
            return;
        }

        // Avoid duplicates on re-mount.
        const existing = toolbar.querySelector('.core-engine-lib-word-llm-chat-clear');
        if (existing) {
            this.clearBtn = existing;
            return;
        }

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'core-engine-lib-word-llm-chat-clear';
        clearBtn.setAttribute('title', 'Очистить чат');
        clearBtn.setAttribute('aria-label', 'Очистить чат');

        // Icon — same style as the other editor buttons.
        const icon = document.createElement('img');
        icon.className = 'core-engine-lib-word-editor-btn-icon';
        icon.src = '/static/core/engine/lib/base/images/reset.svg';
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');
        clearBtn.appendChild(icon);

        this.clearBtn = clearBtn;
        toolbar.appendChild(clearBtn);
    }

    onClear(cb) {
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                cb();
            });
        }
    }

    onSubmit(cb) {
        if (this.formEl) {
            this.formEl.addEventListener('submit', (e) => {
                e.preventDefault();
                cb();
            });
        }
        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    cb();
                }
            });
        }
    }

    // ============================================
    // CONNECTION BANNER
    // ============================================
    //
    // Called from LLMChat._setConnectionBanner(spec).
    //
    //   spec = null                                  → hide
    //   spec = { kind: 'info'|'warn'|'error', text } → show
    //
    // The banner is a single line above the form. It uses the same
    // palette as the rest of the chat via CSS classes:
    //   .is-info  — neutral (connecting)
    //   .is-warn  — yellow (reconnecting)
    //   .is-error — red (auth failure)
    //
    // Hidden (not removed) so repeated show/hide does not cause
    // layout thrash or re-create the DOM node.

    setConnectionBanner(spec) {
        if (!this._bannerEl) return;

        if (!spec || !spec.text) {
            this._bannerEl.hidden = true;
            this._bannerEl.textContent = '';
            this._bannerEl.className = 'core-engine-lib-word-llm-chat-banner';
            return;
        }

        const kind = spec.kind || 'info';
        this._bannerEl.textContent = spec.text;
        this._bannerEl.className =
            `core-engine-lib-word-llm-chat-banner is-${kind}`;
        this._bannerEl.hidden = false;
    }

    // ============================================
    // MESSAGES
    // ============================================

    /**
     * Add a message bubble.
     *
     * msg = { role, content, created_at?, action? }
     *   role   = 'user' | 'assistant' | 'error'
     *   action = { label, href?, onClick? } — optional inline link
     *            under the bubble text (used by the error path to
     *            offer e.g. "Перейти к балансу").
     */
    addMessage(msg) {
        this._render(msg);
        this._scroll();
    }

    /**
     * Convenience: add an error message.
     * Renders as a red bubble in the assistant column.
     */
    addError(text) {
        this.addMessage({
            role: 'error',
            content: text || 'Неизвестная ошибка',
            created_at: new Date().toISOString(),
        });
    }

    setMessages(rows) {
        if (!this.messagesEl) return;
        while (this.messagesEl.firstChild) {
            this.messagesEl.removeChild(this.messagesEl.firstChild);
        }
        for (const m of rows) this._render(m);
        this._scroll();
    }

    _render(msg) {
        if (!this.messagesEl) return;

        const el = document.createElement('div');
        el.className = `core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-${msg.role}`;

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';

        // Text — via textContent (not innerHTML) so no XSS is possible
        // from server-controlled error strings.
        const text = document.createElement('span');
        text.className = 'core-engine-lib-word-llm-chat-bubble-text';
        text.textContent = msg.content || '';
        bubble.appendChild(text);

        // Optional inline action (link / button) under the text.
        // Shape: { label, href?, onClick? }.
        //   - if onClick is provided, it runs on click (href is a
        //     no-op, mostly for cursor/hover styling);
        //   - otherwise the <a> navigates to href as usual.
        if (msg.action && msg.action.label) {
            const link = document.createElement('a');
            link.className = 'core-engine-lib-word-llm-chat-bubble-action';
            link.href = msg.action.href || '#';
            link.textContent = msg.action.label;

            link.addEventListener('click', (e) => {
                if (typeof msg.action.onClick === 'function') {
                    e.preventDefault();
                    msg.action.onClick(e);
                }
            });

            bubble.appendChild(link);
        }

        el.appendChild(bubble);
        this.messagesEl.appendChild(el);
    }

    _scroll() {
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    // ============================================
    // INPUT
    // ============================================

    getInputValue() {
        return this.inputEl?.value || '';
    }

    clearInput() {
        if (this.inputEl) this.inputEl.value = '';
    }

    // ============================================
    // SEND / STOP BUTTON
    // ============================================

    setSendingState(sending) {
        if (!this.sendBtn) return;
        this.sendBtn.disabled = false;
        this.sendBtn.textContent = sending ? '■' : '▶';
        this.sendBtn.classList.toggle('is-stop', !!sending);
        this.sendBtn.setAttribute('title', sending ? 'Остановить' : 'Отправить (Enter)');
        this.sendBtn.setAttribute('aria-label', sending ? 'Остановить' : 'Отправить');
    }

    // ============================================
    // PROGRESS BUBBLE
    // ============================================

    ensureProgress() {
        if (this._progressEl) return;
        if (!this.messagesEl) return;

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-assistant core-engine-lib-word-llm-chat-progress';

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';

        const text = document.createElement('span');
        text.className = 'core-engine-lib-word-llm-chat-progress-text';
        text.textContent = this._progressText || '';

        bubble.appendChild(text);
        el.appendChild(bubble);

        this.messagesEl.appendChild(el);
        this._scroll();
        this._progressEl = el;
    }

    setProgressText(text) {
        this._progressText = text || '';
        this.ensureProgress();
        if (this._progressEl) {
            const t = this._progressEl.querySelector('.core-engine-lib-word-llm-chat-progress-text');
            if (t) t.textContent = this._progressText;
        }
        this._scroll();
    }

    finalizeProgress() {
        if (this._progressEl && this._progressEl.parentNode) {
            this._progressEl.parentNode.removeChild(this._progressEl);
        }
        this._progressEl = null;
        this._progressText = '';
    }

    // ============================================
    // TYPING INDICATOR
    // ============================================
    //
    // Three big pulsing dots, animated entirely by CSS. No JS timer
    // is used here — the animation and stagger are declared in llm.css
    // (keyframes core-engine-lib-word-llm-typing-pulse).

    showTyping() {
        if (!this.messagesEl) return;
        if (this.messagesEl.querySelector('.core-engine-lib-word-llm-chat-typing')) return;

        const el = document.createElement('div');
        el.className = 'core-engine-lib-word-llm-chat-msg core-engine-lib-word-llm-chat-msg-assistant core-engine-lib-word-llm-chat-typing';

        const bubble = document.createElement('div');
        bubble.className = 'core-engine-lib-word-llm-chat-bubble';

        // Three dots, each its own element, so CSS can stagger them.
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'core-engine-lib-word-llm-chat-typing-dot';
            bubble.appendChild(dot);
        }

        el.appendChild(bubble);
        this.messagesEl.appendChild(el);
        this._scroll();

        this._typingEl = el;
    }

    hideTyping() {
        if (this._typingEl && this._typingEl.parentNode) {
            this._typingEl.parentNode.removeChild(this._typingEl);
        }
        this._typingEl = null;
    }

    // ============================================
    // DESTROY
    // ============================================

    destroy() {
        if (this.clearBtn && this.clearBtn.parentNode) {
            this.clearBtn.parentNode.removeChild(this.clearBtn);
        }
        this.rootEl = null;
        this.messagesEl = null;
        this.inputEl = null;
        this.sendBtn = null;
        this.formEl = null;
        this.clearBtn = null;
        this._progressEl = null;
        this._progressText = '';
        this._typingEl = null;
        this._bannerEl = null;
    }
}