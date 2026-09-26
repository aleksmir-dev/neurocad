// neurocad/core/engine/lib/word/llm/chat/edit.js

/**
 * EditSession — the "effect edit" mode of LLMChat.
 *
 * Two distinct user actions are handled here:
 *
 *   EDIT (pencil→save flow)
 *     User clicks the pencil icon → session opens with a greeting.
 *     User describes changes in the chat → LLM returns new CSS.
 *     User clicks SAVE (diskette) → PUT /editor/effects/<id>.
 *
 *   RENAME (pencil-icon, auto flow)
 *     User clicks the rename icon in the block.
 *     The chat sends an `effect_rename` request to the server.
 *     The server proposes a new label and a new SVG miniature.
 *     The client then RELABELS the block in the palette — the id
 *     and the CSS are NOT changed. No POST, no DELETE, no class
 *     swap on the element. The class on the canvas stays `.fx-<id>`
 *     exactly as it was, and the .css file stays on disk untouched.
 *     The only feedback is a single chat message:
 *     "Переименовано в «...»".
 *
 * Events handled (subscribed in bind()):
 *     word:effect-edit-start   — user clicked the edit icon
 *     word:effect-edit-save    — user clicked it again (save)
 *     word:effect-edit-cancel  — cancelled programmatically
 *     word:effect-edit-rename  — user clicked the rename icon
 *
 * No static imports. Instantiated by LLMChat._loadModules.
 */
export class EditSession {
    constructor(chat) {
        this.chat = chat;
        this._state = null;
        this._onStart = null;
        this._onSave = null;
        this._onCancel = null;
        this._onRename = null;
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    bind() {
        const ed = this.chat.editor?.editor;
        console.log('[LLMChat] edit: bind(), editor present =', !!ed);
        if (!ed) return;

        this._onStart = async ({ id }) => {
            console.log('[LLMChat] edit: event word:effect-edit-start', { id });
            await this._handleStart(id);
        };
        this._onSave = async ({ id }) => {
            console.log('[LLMChat] edit: event word:effect-edit-save', { id });
            await this._handleSave(id);
        };
        this._onCancel = ({ id }) => {
            console.log('[LLMChat] edit: event word:effect-edit-cancel', { id });
            this._handleCancel(id);
        };
        this._onRename = async ({ id }) => {
            console.log('[LLMChat] edit: event word:effect-edit-rename', { id });
            await this._handleRename(id);
        };

        ed.on('word:effect-edit-start', this._onStart);
        ed.on('word:effect-edit-save', this._onSave);
        ed.on('word:effect-edit-cancel', this._onCancel);
        ed.on('word:effect-edit-rename', this._onRename);
        console.log('[LLMChat] edit: subscribed to 4 editor events');
    }

    unbind() {
        const ed = this.chat.editor?.editor;
        if (ed) {
            if (this._onStart) {
                try { ed.off('word:effect-edit-start', this._onStart); } catch (_) {}
            }
            if (this._onSave) {
                try { ed.off('word:effect-edit-save', this._onSave); } catch (_) {}
            }
            if (this._onCancel) {
                try { ed.off('word:effect-edit-cancel', this._onCancel); } catch (_) {}
            }
            if (this._onRename) {
                try { ed.off('word:effect-edit-rename', this._onRename); } catch (_) {}
            }
        }
        this._onStart = null;
        this._onSave = null;
        this._onCancel = null;
        this._onRename = null;
        console.log('[LLMChat] edit: unbind() done');
    }

    isActive() {
        return !!this._state;
    }

    getState() {
        return this._state;
    }

    // ============================================
    // EDIT START
    // ============================================

    async _handleStart(id, opts = {}) {
        const silent = !!opts.silent;
        console.log('[LLMChat] edit: _handleStart ENTER', { id, silent });

        const css = await this.chat._loadEffectCss(id);
        if (css == null) {
            this.chat.ui.addMessage({
                role: 'error',
                content: '⚠️ Не удалось загрузить CSS эффекта.',
                created_at: new Date().toISOString(),
            });
            this.chat._effectBlocks()?.cancelEdit(id);
            return;
        }

        const currentLabel = this._lookupLabel(id);

        this._state = {
            id,
            css,
            newLabel: null,
            newMedia: null,
            currentLabel,
            hintShown: silent,     // silent sessions never show the save hint
            renamePending: false,
        };

        // Only the interactive EDIT flow greets the user. The RENAME
        // flow is silent — it fires and forgets.
        if (!silent) {
            this.chat.ui.addMessage({
                role: 'assistant',
                content: 'Режим правки эффекта. Опишите, что хотите изменить. Когда результат устроит — нажмите иконку-дискету «Сохранить» в блоке эффекта.',
                created_at: new Date().toISOString(),
            });
        }
    }

    _lookupLabel(id) {
        try {
            const fx = this.chat._effectBlocks?.();
            if (!fx || !fx._blocks) return id;
            const entry = fx._blocks.get(id);
            return (entry && entry.title) || id;
        } catch (_) {
            return id;
        }
    }

    _collectExistingIds() {
        try {
            const fx = this.chat._effectBlocks?.();
            if (!fx || !fx._blocks) return [];
            const ids = Array.from(fx._blocks.keys());
            console.log('[LLMChat] edit: _collectExistingIds →', ids);
            return ids;
        } catch (e) {
            console.warn('[LLMChat] edit: _collectExistingIds failed', e);
            return [];
        }
    }

    // ============================================
    // SEND (called by LLMChat._onSend)
    // ============================================

    send(text) {
        console.log('[LLMChat] edit: send() called, text =', text);
        if (!this._state) {
            console.warn('[LLMChat] edit: send() but no _state — aborting');
            return;
        }

        const effectiveLabel = this._state.newLabel
            || this._state.currentLabel
            || this._state.id;

        const payload = {
            type: 'effect_edit',
            message: text,
            effect_id: this._state.id,
            effect_label: effectiveLabel,
            effect_css: this._state.css || '',
            existing_effect_ids: this._collectExistingIds(),
        };

        this.chat.debug.dumpPayload?.(payload);

        if (this.chat.ws.isOpen()) {
            this.chat.ws.send(payload);
        } else {
            this.chat._pendingStart = payload;
            this.chat.ws.connect();
        }
    }

    // ============================================
    // RENAME — relabel only, no id/CSS change
    // ============================================

    /**
     * User clicked the "pencil" rename button on an active effect
     * block.
     *
     * This is a FIRE-AND-FORGET action:
     *   1. Open a SILENT session (no greeting, no hint).
     *   2. Send a WS request of type `effect_rename`.
     *   3. When the response arrives, `handleCss` RELABELS the block
     *      in the palette (label + media). The id and CSS stay as
     *      they were — nothing on the canvas is touched.
     *   4. One chat message confirms the rename.
     */
    async _handleRename(id) {
        console.log('[LLMChat] edit: _handleRename ENTER', { id });

        // Cancel any other running session first.
        if (this._state && this._state.id !== id) {
            this._handleCancel(this._state.id);
        }

        // Open a silent session if not already open for this effect.
        if (!this._state || this._state.id !== id) {
            await this._handleStart(id, { silent: true });
        }

        if (!this._state || this._state.id !== id) {
            console.warn('[LLMChat] edit: _handleRename could not open a session for', id);
            return;
        }

        // Mark the session so handleCss knows to relabel on reply.
        this._state.renamePending = true;
        this._state.hintShown = true;   // never show the save hint

        const effectiveLabel = this._state.currentLabel || id;

        const payload = {
            type: 'effect_rename',
            message: '',
            effect_id: id,
            effect_label: effectiveLabel,
            effect_css: this._state.css || '',
            existing_effect_ids: this._collectExistingIds(),
        };

        this.chat.debug.dumpPayload?.(payload);

        if (this.chat.ws.isOpen()) {
            console.log('[LLMChat] edit: sending effect_rename over WS');
            this.chat.ws.send(payload);
        } else {
            console.warn('[LLMChat] edit: WS not ready, queueing effect_rename');
            this.chat._pendingStart = payload;
            this.chat.ws.connect();
        }
    }

    // ============================================
    // CSS UPDATE (called by handler via chat.js)
    // ============================================

    handleCss(effectId, css, opts) {
        console.log('[LLMChat] edit: handleCss ENTER',
            { effectId, cssLen: css ? css.length : 0, opts });

        if (!effectId || !css) return;

        if (!this._state || effectId !== this._state.id) {
            console.warn('[LLMChat] edit: css_update for non-edited effect — aborting');
            return;
        }

        const wasRename = !!this._state.renamePending;
        this._state.renamePending = false;
        this._state.css = css;

        // ---- Apply the CSS draft under the same id ----
        try {
            this.chat._applyEffectDraft?.(this.chat.editor.editor, effectId, css);
        } catch (e) {
            console.error('[LLMChat] edit: _applyEffectDraft THREW', e);
        }

        const newLabel = (opts && opts.newLabel) ? String(opts.newLabel).trim() : '';
        const newMedia = (opts && opts.newMedia) ? String(opts.newMedia).trim() : '';

        // ---- RENAME PATH ----
        if (wasRename) {
            if (!newLabel) {
                this.chat.ui.addMessage({
                    role: 'assistant',
                    content: 'Не удалось подобрать новое название — попробуйте ещё раз.',
                    created_at: new Date().toISOString(),
                });
                this._state = null;
                return;
            }

            this._state.newLabel = newLabel;
            this._state.newMedia = newMedia || null;

            // Relabel the block in the palette: update label, hint
            // and media. The id and the CSS are NOT touched.
            try {
                const fx = this.chat._effectBlocks?.();
                if (fx && typeof fx.relabelOne === 'function') {
                    fx.relabelOne(effectId, {
                        label: newLabel,
                        hint: newLabel,
                        media: newMedia || undefined,
                    });
                    console.log('[LLMChat] edit: relabelOne applied',
                        { id: effectId, label: newLabel,
                          mediaLen: newMedia ? newMedia.length : 0 });
                } else {
                    console.warn('[LLMChat] edit: EffectBlocks.relabelOne not available');
                }
            } catch (e) {
                console.warn('[LLMChat] edit: relabelOne failed', e);
            }

            this._state = null;

            this.chat.ui.addMessage({
                role: 'assistant',
                content: `Переименовано в «${newLabel}».`,
                created_at: new Date().toISOString(),
            });
            return;
        }

        // ---- NORMAL EDIT PATH ----
        // A css_update without renamePending means the user asked to
        // rewrite the CSS. Stash newLabel/newMedia if they came in
        // (the edit agent may occasionally propose them), and wait
        // for the save click. We do NOT auto-apply anything here.
        if (newLabel) {
            this._state.newLabel = newLabel;
            this._state.newMedia = newMedia || null;
        }

        if (!this._state.hintShown) {
            this._state.hintShown = true;
            this.chat.ui.addMessage({
                role: 'assistant',
                content: 'Если результат устраивает — нажмите иконку-дискету «Сохранить» в блоке эффекта.',
                created_at: new Date().toISOString(),
            });
        }
    }

    // ============================================
    // SAVE / CANCEL — used only by the EDIT flow
    // ============================================

    async _handleSave(id) {
        console.log('[LLMChat] edit: _handleSave ENTER', { id });

        if (!this._state || this._state.id !== id) {
            console.warn('[LLMChat] edit: _handleSave no active edit for', id);
            return;
        }

        const state = this._state;
        const css = state.css || '';

        // Save the CSS via PUT. We do NOT change the id, we do NOT
        // touch the label or the media — this is purely a CSS update.
        const ok = await this.chat._saveEffectCss(id, css);
        if (!ok) {
            this.chat.ui.addMessage({
                role: 'error',
                content: '⚠️ Не удалось сохранить эффект.',
                created_at: new Date().toISOString(),
            });
            return;
        }

        this.chat._commitEffectDraft?.(this.chat.editor.editor, id);
        this._state = null;
        this.chat._effectBlocks()?.finishEdit(id);

        this.chat.ui.addMessage({
            role: 'assistant',
            content: 'Эффект сохранён.',
            created_at: new Date().toISOString(),
        });
    }

    _handleCancel(id) {
        console.log('[LLMChat] edit: _handleCancel ENTER', { id });

        if (!this._state || this._state.id !== id) return;

        try {
            this.chat._revertEffectDraft?.(this.chat.editor.editor, this._state.id);
        } catch (e) {
            console.warn('[LLMChat] edit: _handleCancel revertDraft failed', e);
        }

        this._state = null;
    }
}