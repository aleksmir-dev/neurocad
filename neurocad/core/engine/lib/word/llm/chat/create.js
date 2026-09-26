// neurocad/core/engine/lib/word/llm/chat/create.js

/**
 * CreateSession — the "effect create" mode of LLMChat.
 *
 * Owned by LLMChat (one instance per chat). Handles everything that
 * happens when the user clicks "+" in the "Эффекты" category header
 * (editor/effects/index.js):
 *
 *   1. `bind()` subscribes to three editor events:
 *        word:effect-create-session-started
 *                                    — EffectBlocks created a pending
 *                                      block (user clicked "+")
 *        word:effect-create-save     — user clicked the save icon
 *                                      on the pending block
 *        word:effect-create-cancel   — user clicked the close icon
 *                                      on the pending block
 *
 *      NOTE: we deliberately do NOT listen on `word:effect-create-start`.
 *      That name is the *inbound* event for EffectBlocks itself
 *      (header.js → index.js → onCreateClick). If the chat subscribed
 *      to it *and* EffectBlocks re-emitted it after creating a pending
 *      block, the two would form an infinite recursion.
 *
 *   2. On `start`:
 *        - reset `_state = { draft: null, hintShown: false }`;
 *        - greet the user in the chat.
 *        (The pending block in the palette is created by
 *         EffectBlocks itself, not here.)
 *
 *   3. `send(text)` is called by LLMChat._onSend when this session
 *      is active. It forwards `{ type: "create_effect", ... }` over
 *      the WS, passing the previous draft (if any) so the LLM
 *      revises instead of starting from scratch. It also passes
 *      `existing_effect_ids` — the list of ids already registered
 *      in the palette — so the server can pass it to the LLM and
 *      avoid generating a colliding id.
 *
 *   4. `handleDraft(draft)` is called by the WS handler when
 *      `effect_draft` arrives. It:
 *        - stores `draft` in `_state.draft`;
 *        - applies the draft CSS to the iframe
 *          (live.js → applyDraft on a local id);
 *        - applies the effect class to the selected element
 *          (with UndoManager.skip);
 *        - calls EffectBlocks.applyDraftToPendingBlock(draft) so the
 *          pending block in the palette gets draft.media and enables
 *          its save button.
 *
 *   5. On `save`:
 *        - POST /editor/effects with the current draft;
 *        - addEffectLink (real <link> in the iframe);
 *        - commitDraft (remove the draft <style>, bump ?v=);
 *        - EffectBlocks.finalizePending(effect) — converts the
 *          pending block into a normal effect block;
 *        - clear state, show a short success message.
 *
 *      Collision handling:
 *        - BEFORE the POST we check the local palette. If the draft
 *          id is already there, we do not even try — we show a clear
 *          message and keep the pending block, so the user can ask
 *          for a different name.
 *        - If the server still rejects the POST (409 Conflict), we
 *          surface the server's `detail` string instead of the
 *          generic "сервер отклонил запрос".
 *
 *   6. On `cancel`:
 *        - revertDraft (remove the draft <style>);
 *        - remove the effect class from the selected element;
 *        - EffectBlocks.cancelPending() — remove the pending block;
 *        - clear state, show "Создание эффекта отменено".
 *
 * All HTTP calls and UI updates go through the parent chat:
 *   this.chat.ui.addMessage(...)
 *   this.chat.ws.send(...)
 *   this.chat.editor.editor
 *   this.chat._applyEffectDraft / _commitEffectDraft / _revertEffectDraft
 *   this.chat._addEffectLink
 *   this.chat._effectBlocks()
 *
 * No static imports. Instantiated by LLMChat._loadModules.
 */
export class CreateSession {
    /**
     * @param {LLMChat} chat — parent chat instance
     */
    constructor(chat) {
        this.chat = chat;

        // { draft: { id, label, hint, css, media } | null, hintShown: bool }
        // or null when inactive.
        this._state = null;

        // Bound editor handlers — for unbind().
        this._onStart = null;
        this._onSave = null;
        this._onCancel = null;
    }

    // ============================================
    // LIFECYCLE
    // ============================================

    /**
     * Subscribe to editor events. Called once from LLMChat.init().
     */
    bind() {
        const ed = this.chat.editor?.editor;
        if (!ed) return;

        this._onStart = () => {
            this._handleStart();
        };
        this._onSave = () => {
            this._handleSave();
        };
        this._onCancel = () => {
            this._handleCancel();
        };

        // NOTE: `word:effect-create-start` is NOT listened to here —
        // it is the inbound event for EffectBlocks. We listen on
        // `word:effect-create-session-started`, which EffectBlocks
        // emits *after* the pending block has been created.
        ed.on('word:effect-create-session-started', this._onStart);
        ed.on('word:effect-create-save', this._onSave);
        ed.on('word:effect-create-cancel', this._onCancel);
    }

    /**
     * Unsubscribe. Called from LLMChat.destroy().
     */
    unbind() {
        const ed = this.chat.editor?.editor;
        if (ed) {
            if (this._onStart) {
                try { ed.off('word:effect-create-session-started', this._onStart); } catch (_) {}
            }
            if (this._onSave) {
                try { ed.off('word:effect-create-save', this._onSave); } catch (_) {}
            }
            if (this._onCancel) {
                try { ed.off('word:effect-create-cancel', this._onCancel); } catch (_) {}
            }
        }
        this._onStart = null;
        this._onSave = null;
        this._onCancel = null;
    }

    /**
     * True if a create session is currently active.
     */
    isActive() {
        return !!this._state;
    }

    /**
     * Current state, or null.
     * Shape: { draft, hintShown }
     */
    getState() {
        return this._state;
    }

    // ============================================
    // CREATE START
    // ============================================

    _handleStart() {
        console.log('[LLMChat] effect-create-session-started');

        // Reset any previous draft state.
        this._state = { draft: null, hintShown: false };

        this.chat.ui.addMessage({
            role: 'assistant',
            content: 'Опишите, какой эффект хотите для выделенного элемента, например: «мерцающие точки по фону» или «градиентный уголок в правом верхнем углу». Я сразу применю его. Если понравится — нажмите дискету на новом блоке в палитре.',
            created_at: new Date().toISOString(),
        });
    }

    // ============================================
    // SEND (called by LLMChat._onSend)
    // ============================================

    /**
     * Send the user's message to the LLM as a "create_effect" request.
     * LLMChat._onSend already added the user message to the UI and
     * set the sending state.
     */
    send(text) {
        if (!this._state) return;

        const payload = {
            type: 'create_effect',
            message: text,
            previous_draft: this._state.draft || null,
            existing_effect_ids: this._collectExistingIds(),
        };

        this.chat.debug.dumpPayload?.(payload);

        if (this.chat.ws.isOpen()) {
            console.log('[LLMChat] sending create_effect over open WS');
            this.chat.ws.send(payload);
        } else {
            console.warn('[LLMChat] WS not ready, queueing create_effect');
            this.chat._pendingStart = payload;
            this.chat.ws.connect();
        }
    }

    /**
     * Collect the ids of all registered effects in the palette.
     * Passed to the server so it can pass them to the LLM and avoid
     * generating a colliding id.
     *
     * @returns {string[]}
     */
    _collectExistingIds() {
        try {
            const fx = this.chat._effectBlocks?.();
            if (!fx || !fx._blocks) return [];
            const ids = Array.from(fx._blocks.keys());
            console.log('[LLMChat] create: _collectExistingIds →', ids);
            return ids;
        } catch (e) {
            console.warn('[LLMChat] create: _collectExistingIds failed', e);
            return [];
        }
    }

    // ============================================
    // DRAFT (called by handler via chat.js)
    // ============================================

    /**
     * Handle a draft coming from the WS (handler → effect_draft).
     *
     * The draft is applied IMMEDIATELY to the selected element:
     *
     *   1. draft CSS → <style id="fx-draft-<id>"> in the iframe;
     *   2. effect class → selected component, with undo skipped;
     *   3. pending block in the palette → applyDraftToPendingBlock.
     *
     * The user judges the result by looking at the element. No CSS
     * is shown in the chat. The agent's `assistant_message` already
     * tells the user what to do; we do not duplicate it here.
     */
    handleDraft(draft) {
        console.log('[LLMChat] handleDraft: enter, draft=', draft ? draft.id : null);
        if (!draft) {
            console.warn('[LLMChat] handleDraft: draft is null — aborting');
            return;
        }

        if (!this._state) {
            console.warn('[LLMChat] handleDraft: no active create state — auto-enabling');
            // Auto-enable create mode if a draft arrives without a
            // prior "start" event (rare but safe).
            this._state = { draft: null, hintShown: false };
        }

        this._state.draft = draft;
        console.log('[LLMChat] handleDraft: state.draft stored:', draft.id);

        const ed = this.chat.editor.editor;

        // ---- 1. Apply the draft CSS to the iframe ----
        try {
            this.chat._applyEffectDraft?.(ed, draft.id, draft.css);
            console.log('[LLMChat] create-effect: draft CSS applied to iframe:', draft.id);
        } catch (e) {
            console.warn('[LLMChat] applyDraft failed:', e);
        }

        // ---- 2. Apply the effect class to the selected element ----
        try {
            const selected = ed?.getSelected?.();
            if (selected) {
                const classes = selected.getClasses() || [];
                const next = classes.filter(c => !c.startsWith('fx-'));
                next.push(draft.id);

                const um = ed.UndoManager;
                if (um && typeof um.skip === 'function') {
                    um.skip(() => selected.setClass(next));
                } else {
                    selected.setClass(next);
                }
                console.log('[LLMChat] create-effect: draft class applied to element:', draft.id);
            } else {
                console.warn('[LLMChat] create-effect: no selected element to apply draft to');
            }
        } catch (e) {
            console.warn('[LLMChat] apply draft to element failed:', e);
        }

        // ---- 3. Update the pending block in the palette ----
        try {
            const fx = this.chat._effectBlocks();
            console.log('[LLMChat] handleDraft: _effectBlocks() =', fx);
            if (!fx) {
                console.error('[LLMChat] handleDraft: _effectBlocks() returned null — save button will stay disabled');
            } else if (typeof fx.applyDraftToPendingBlock !== 'function') {
                console.error(
                    '[LLMChat] handleDraft: _effectBlocks() has no applyDraftToPendingBlock; keys:',
                    Object.keys(fx)
                );
            } else {
                console.log('[LLMChat] handleDraft: → applyDraftToPendingBlock', draft.id);
                fx.applyDraftToPendingBlock(draft);
                console.log('[LLMChat] handleDraft: ← applyDraftToPendingBlock returned');
            }
        } catch (e) {
            console.error('[LLMChat] handleDraft: applyDraftToPendingBlock threw:', e);
        }

        if (!this._state.hintShown) {
            this._state.hintShown = true;
        }
    }

    // ============================================
    // SAVE / CANCEL
    // ============================================

    /**
     * User clicked the save icon on the pending block.
     * Emitted as `word:effect-create-save` from EffectBlocks.
     */
    async _handleSave() {
        console.log('[LLMChat] effect-create-save');

        if (!this._state || !this._state.draft) {
            console.warn('[LLMChat] effect-create-save: no draft');
            return;
        }

        this.chat.ui.showTyping();
        this.chat._running = true;
        this.chat.ui.setSendingState(true);

        try {
            await this._saveNewEffect(this._state.draft);
        } finally {
            this.chat._running = false;
            this.chat.ui.setSendingState(false);
            this.chat.ui.hideTyping();
        }
    }

    /**
     * User clicked the close icon on the pending block.
     * Emitted as `word:effect-create-cancel` from EffectBlocks.
     *
     * Removes the draft <style> from the iframe, removes the effect
     * class from the selected element, and removes the pending block.
     */
    _handleCancel() {
        console.log('[LLMChat] effect-create-cancel');

        const draftId = this._state?.draft?.id;

        // ---- 1. Remove the draft CSS ----
        if (draftId) {
            try {
                this.chat._revertEffectDraft?.(this.chat.editor.editor, draftId);
            } catch (e) {
                console.warn('[LLMChat] revertDraft failed:', e);
            }
        }

        // ---- 2. Remove the effect class from the selected element ----
        try {
            const ed = this.chat.editor.editor;
            const selected = ed?.getSelected?.();
            if (selected) {
                const classes = selected.getClasses() || [];
                const next = classes.filter(c => !c.startsWith('fx-'));
                if (next.length !== classes.length) {
                    const um = ed.UndoManager;
                    if (um && typeof um.skip === 'function') {
                        um.skip(() => selected.setClass(next));
                    } else {
                        selected.setClass(next);
                    }
                }
            }
        } catch (e) {
            console.warn('[LLMChat] remove draft class failed:', e);
        }

        // ---- 3. Remove the pending block ----
        try {
            const fx = this.chat._effectBlocks();
            console.log('[LLMChat] _handleCancel: _effectBlocks() =', fx);
            fx?.cancelPending();
        } catch (e) {
            console.warn('[LLMChat] cancelPending failed:', e);
        }

        // ---- 4. Clear state ----
        this._state = null;

        this.chat.ui.addMessage({
            role: 'assistant',
            content: 'Создание эффекта отменено.',
            created_at: new Date().toISOString(),
        });
    }

    /**
     * POST /editor/effects with the current draft.
     *
     * Flow:
     *   0. LOCAL COLLISION CHECK — if the draft id is already
     *      registered in the palette, show a clear message and keep
     *      the pending block (the user can ask for a different name).
     *   1. POST the draft.
     *   2. On success:
     *        - addEffectLink (real <link> in the iframe);
     *        - commitDraft (remove the draft <style>, bump ?v=);
     *        - EffectBlocks.finalizePending(effect) — converts the
     *          pending block into a normal effect block;
     *        - clear state, show success message.
     *   3. On failure:
     *        - extract the most specific error text we can
     *          (server `detail`, fetch error message, generic);
     *        - show it in the chat;
     *        - keep the pending block and the state, so the user can
     *          rephrase and try again.
     */
    async _saveNewEffect(draft) {
        const base = this.chat._effectsApiBase;
        const qs = this.chat._qsForEffects();
        const url = `${base}${qs}`;
        console.log('[LLMChat] POST', url, draft.id);

        // ---- 0. Local collision check ----
        if (this._idExistsLocally(draft.id)) {
            console.warn('[LLMChat] saveNewEffect: local collision for', draft.id);
            this.chat.ui.addMessage({
                role: 'error',
                content:
                    `⚠️ Имя «${draft.id}» уже занято другим эффектом в палитре. ` +
                    `Опишите эффект чуть иначе — я предложу другое имя.`,
                created_at: new Date().toISOString(),
            });
            return false;
        }

        // ---- 1. POST ----
        let ok = false;
        let data = null;
        let errText = '';

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            data = await fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: draft.id,
                    label: draft.label,
                    hint: draft.hint || '',
                    css: draft.css,
                    media: draft.media || '',
                }),
            });
            ok = !!(data && data.success);
        } catch (e) {
            console.error('[LLMChat] saveNewEffect error:', e);
            errText = this._extractErrorText(e);
        }

        if (!ok) {
            const reason =
                errText
                || (data && (data.detail || data.message))
                || 'сервер отклонил запрос';
            console.warn('[LLMChat] saveNewEffect: failed —', reason);
            this.chat.ui.addMessage({
                role: 'error',
                content: `⚠️ Не удалось сохранить эффект: ${reason}.`,
                created_at: new Date().toISOString(),
            });
            return false;
        }

        // ---- 2. Inject the real <link> and drop the draft <style> ----
        try {
            this.chat._addEffectLink?.(this.chat.editor.editor, draft.id);
            this.chat._commitEffectDraft?.(this.chat.editor.editor, draft.id);
        } catch (e) {
            console.warn('[LLMChat] addEffectLink/commitDraft failed:', e);
        }

        // ---- 3. Convert the pending block into a normal effect block ----
        try {
            const fx = this.chat._effectBlocks();
            console.log('[LLMChat] _saveNewEffect: _effectBlocks() =', fx);
            fx?.finalizePending({
                id: draft.id,
                label: draft.label,
                hint: draft.hint || draft.label,
                media: draft.media || '',
                builtin: false,
            });
        } catch (e) {
            console.warn('[LLMChat] finalizePending failed:', e);
        }

        // ---- 4. Clear state and notify ----
        this._state = null;

        this.chat.ui.addMessage({
            role: 'assistant',
            content: 'Эффект сохранён и добавлен в библиотеку.',
            created_at: new Date().toISOString(),
        });

        return true;
    }

    // ============================================
    // HELPERS
    // ============================================

    /**
     * True if the given id is already registered in the palette.
     */
    _idExistsLocally(id) {
        if (!id) return false;
        try {
            const fx = this.chat._effectBlocks?.();
            if (!fx || !fx._blocks) return false;
            return fx._blocks.has(id);
        } catch (_) {
            return false;
        }
    }

    /**
     * Extract a human-readable message from an error thrown by
     * `fetchJson`.
     *
     * Different fetch wrappers put the useful text in different
     * places:
     *   - `e.message` — usually the most informative thing we get
     *     from a non-2xx response when the wrapper re-throws with
     *     the server's `detail`;
     *   - `e.response.detail` / `e.data.detail` — fallbacks for
     *     wrappers that attach the parsed body;
     *   - `e.toString()` — last resort.
     */
    _extractErrorText(e) {
        if (!e) return '';
        if (typeof e === 'string') return e;

        const direct = e.message;
        if (direct && typeof direct === 'string') return direct;

        const fromResponse =
            (e.response && (e.response.detail || e.response.message))
            || (e.data && (e.data.detail || e.data.message));
        if (fromResponse) return String(fromResponse);

        try {
            return String(e);
        } catch (_) {
            return '';
        }
    }
}