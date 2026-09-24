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
    // MESSAGES
    // ============================================

    addMessage(msg) {
        this._render(msg);
        this._scroll();
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
        bubble.textContent = msg.content;
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
    }
}