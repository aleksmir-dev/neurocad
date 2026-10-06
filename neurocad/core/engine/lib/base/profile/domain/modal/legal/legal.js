// neurocad/core/engine/lib/base/profile/domain/modal/legal/legal.js

/**
 * LegalModal — universal editor for policy / rules markdown texts.
 *
 * One modal, two targets. BaseProfileDomain opens it from either of
 * the two "Редактировать" buttons in the legal card:
 *
 *   - the button in the "Политика" row → which = "policy"
 *     (users.policy, served at /policy on the user's host);
 *   - the button in the "Правила" row  → which = "rules"
 *     (users.rules,  served at /rules  on the user's host).
 *
 * The modal itself does not care which document is being edited —
 * it receives `which` and the current text, and POSTs them back.
 * The backend routes the save to the right column via
 * POST /domain/legal.
 *
 * Layout:
 *
 *   [ header: presets | title ]       ← two preset buttons
 *   [ hint: what this document is ]   ← changes per `which`
 *   [ textarea          | preview ]   ← split pane on wide screens
 *   [ error (if any)                  ]
 *   [ actions: Отмена | Сохранить ]
 *
 * The preview is a live, client-side markdown render. It uses the
 * same parser the backend uses for the public /policy and /rules
 * pages — but only a subset is implemented here (headings,
 * paragraphs, lists, code, links, bold, italic, tables). This is
 * enough for authoring; the authoritative rendering is done by the
 * backend, and the preview is a convenience, not a contract.
 *
 * Presets:
 *   - "Вставить шаблон" — fills the textarea with a starter
 *     markdown document. The template depends on `which`:
 *     Policy gets a 152-ФЗ-shaped skeleton, Rules gets a
 *     terms-of-use skeleton.
 *   - "Очистить" — empties the textarea. The user still has to
 *     click "Сохранить" to persist.
 *
 * Behaviour:
 *   - "Отмена" — close without saving. Also triggered by Escape and
 *     by a click on the overlay outside the dialog.
 *   - "Сохранить" — POST /core/engine/lib/base/profile/domain/legal
 *     with { which, text: <textarea value> }. On success: call
 *     onSaved(which, text), close. On failure: show an inline error
 *     inside the dialog and keep it open, so the user does not lose
 *     their text.
 *
 * The modal is a plain singleton-style class: a single instance is
 * created by BaseProfileDomain and reused across opens. `open()` is
 * idempotent — calling it twice just updates the title, hint,
 * textarea and preview, and refocuses the textarea.
 *
 * legal.css is loaded from here on first construction, so the modal
 * is self-contained.
 *
 * Module location
 * ---------------
 * This file lives at ./modal/legal/legal.js — under the domain
 * page's ./modal/ subfolder, next to its own legal.css. It is
 * imported on demand by ./modals.js (openLegalModal), not at the
 * top of any other module.
 *
 * Fallback vs user text
 * ---------------------
 * open() takes a third argument, `isDefault`:
 *
 *   - isDefault = false → the textarea shows the user's own text.
 *     The hint is the standard "this document is published at
 *     /policy" line.
 *
 *   - isDefault = true  → the user has not written their own text
 *     yet. The textarea is seeded with the universal fallback (the
 *     same text the public /policy or /rules endpoint serves when
 *     the field is empty — see public.py → read_default), and the
 *     hint is extended with a note explaining that this fallback is
 *     currently published on the site, and that the user may keep
 *     it or replace it with their own.
 *
 * The caller (modals.js → openLegalModal) decides which case
 * applies based on ctx.data.policy / ctx.data.rules.
 *
 * Props:
 *   - onSaved    {Function} — (which: "policy"|"rules", savedText: string) => void
 *                             Called after a successful POST, so the
 *                             caller can update its local state.
 */
export class LegalModal {
    constructor(options = {}) {
        console.log('[LegalModal] Constructor called');

        this.options = options || {};
        this.onSaved = typeof this.options.onSaved === 'function'
            ? this.options.onSaved
            : null;

        // DOM
        this._overlay = null;
        this._dialog = null;
        this._textarea = null;
        this._preview = null;
        this._errorEl = null;
        this._okBtn = null;
        this._titleEl = null;
        this._hintEl = null;

        // UI state
        this._which = 'policy';
        this._isDefault = false;
        this._saving = false;
        this._boundKeyDown = null;
        this._onInput = null;

        this._loadCSS();
    }

    // ============================================
    // CSS
    // ============================================

    _loadCSS() {
        console.log('[LegalModal] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS(
                'core/engine/lib/base/profile/domain/modal/legal/legal.css'
            );
        }
    }

    // ============================================
    // PUBLIC
    // ============================================

    /**
     * Open the modal.
     *
     * @param {"policy"|"rules"} which  — target document
     * @param {string} initialText      — markdown body to show
     * @param {boolean} isDefault       — true when initialText is
     *   the universal fallback (user has no own text), false when
     *   it is the user's own text. Controls the extended hint.
     *
     * If the modal is already open, the new `which` / `initialText`
     * / `isDefault` are applied to the existing dialog (title, hint,
     * textarea, preview) and the textarea is refocused. This makes
     * open() safe to call from any click handler without checking
     * state first.
     */
    open(which, initialText, isDefault = false) {
        console.log('[LegalModal] open()', which, 'isDefault=', isDefault);

        this._which = which === 'rules' ? 'rules' : 'policy';
        this._isDefault = !!isDefault;
        this._initialText = typeof initialText === 'string' ? initialText : '';

        if (this._overlay) {
            // Already open — update title / hint / textarea / preview
            // and refocus.
            if (this._textarea) {
                this._textarea.value = this._initialText;
            }
            this._renderHeader();
            this._refreshPreview();
            this._clearError();
            this._focusTextarea();
            return;
        }

        this._render();
        this._bindEvents();
        this._focusTextarea();
    }

    /**
     * Close the modal without saving.
     *
     * Safe to call even if the modal was never opened or was already
     * closed.
     */
    close() {
        console.log('[LegalModal] close()');

        if (!this._overlay) return;

        this._unbindEvents();

        try {
            this._overlay.remove();
        } catch (e) {
            console.warn('[LegalModal] overlay.remove error:', e);
        }

        this._overlay = null;
        this._dialog = null;
        this._textarea = null;
        this._preview = null;
        this._errorEl = null;
        this._okBtn = null;
        this._titleEl = null;
        this._hintEl = null;
        this._saving = false;
    }

    /**
     * Destroy — close + drop callbacks. Called from the page's
     * destroy() so a navigating user does not leave a dangling
     * modal behind.
     */
    destroy() {
        console.log('[LegalModal] destroy()');
        this.close();
        this.onSaved = null;
    }

    // ============================================
    // PRESETS
    // ============================================

    _textPolicyTemplate() {
        return [
            '# Политика обработки персональных данных',
            '',
            '**Оператор:** ИП / самозанятый / ООО «...»',
            '',
            '**Дата последнего обновления:** ' + new Date().toISOString().slice(0, 10),
            '',
            '---',
            '',
            '## 1. Общие положения',
            '',
            'Настоящая Политика определяет порядок обработки персональных данных',
            'и меры по обеспечению их безопасности, предпринимаемые Оператором.',
            '',
            '## 2. Какие данные обрабатываются',
            '',
            '- имя;',
            '- адрес электронной почты;',
            '- номер телефона;',
            '- IP-адрес;',
            '- данные cookie-файлов.',
            '',
            '## 3. Цели обработки',
            '',
            '- оказание услуг;',
            '- обратная связь с пользователем;',
            '- улучшение качества сервиса.',
            '',
            '## 4. Права субъекта персональных данных',
            '',
            'Пользователь вправе запросить доступ, уточнение, блокирование',
            'или удаление своих персональных данных, направив запрос на',
            'адрес электронной почты Оператора.',
            '',
        ].join('\n');
    }

    _textRulesTemplate() {
        return [
            '# Правила использования сайта',
            '',
            '**Дата последнего обновления:** ' + new Date().toISOString().slice(0, 10),
            '',
            '---',
            '',
            '## 1. Общие положения',
            '',
            'Настоящие Правила регулируют отношения между владельцем сайта',
            'и любым лицом, использующим сайт.',
            '',
            '## 2. Права и обязанности пользователя',
            '',
            '- не нарушать законодательство;',
            '- не размещать противоправный контент;',
            '- не нарушать права третьих лиц.',
            '',
            '## 3. Ответственность',
            '',
            'Сайт предоставляется на условиях «как есть». Владелец не несёт',
            'ответственности за возможные убытки, возникшие в результате',
            'использования сайта.',
            '',
        ].join('\n');
    }

    // ============================================
    // RENDER
    // ============================================

    _render() {
        const overlay = document.createElement('div');
        overlay.className = 'legal-overlay';

        overlay.innerHTML = `
            <div class="legal-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-title">
                <div class="legal-header">
                    <div class="legal-presets">
                        <button type="button"
                                class="domain-btn"
                                data-action="legal-template">
                            Вставить шаблон
                        </button>
                        <button type="button"
                                class="domain-btn"
                                data-action="legal-clear">
                            Очистить
                        </button>
                    </div>
                </div>

                <div class="legal-title" id="legal-title"></div>

                <p class="legal-hint" data-js="legal-hint"></p>

                <div class="legal-editor">
                    <textarea class="legal-textarea"
                              data-js="legal-textarea"
                              spellcheck="false"
                              wrap="off"
                              rows="16"
                              placeholder="# Заголовок&#10;&#10;Текст в формате Markdown…"></textarea>

                    <div class="legal-preview"
                         data-js="legal-preview"
                         aria-live="polite"></div>
                </div>

                <div class="legal-error" data-js="legal-error" hidden></div>

                <div class="legal-actions">
                    <button type="button"
                            class="domain-btn"
                            data-action="legal-cancel">
                        Отмена
                    </button>
                    <button type="button"
                            class="domain-btn domain-btn-primary"
                            data-action="legal-ok">
                        Сохранить
                    </button>
                </div>
            </div>
        `;

        // Append the overlay to the domain-page container so that
        // .domain-btn rules (which are scoped under
        // .core-engine-lib-base-profile-domain in domain.css) apply
        // to the buttons inside the dialog. Fallback to <body> if
        // the container is not present.
        const scope = document.querySelector('.core-engine-lib-base-profile-domain');

        if (scope) {
            scope.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }

        this._overlay = overlay;
        this._dialog = overlay.querySelector('.legal-dialog');
        this._textarea = overlay.querySelector('[data-js="legal-textarea"]');
        this._preview = overlay.querySelector('[data-js="legal-preview"]');
        this._errorEl = overlay.querySelector('[data-js="legal-error"]');
        this._okBtn = overlay.querySelector('[data-action="legal-ok"]');
        this._titleEl = overlay.querySelector('#legal-title');
        this._hintEl = overlay.querySelector('[data-js="legal-hint"]');

        // Seed the textarea with the current body (may be empty).
        this._textarea.value = this._initialText || '';

        this._renderHeader();
        this._refreshPreview();
    }

    _renderHeader() {
        if (!this._titleEl || !this._hintEl) return;

        const isRules = this._which === 'rules';
        const url = isRules ? '/rules' : '/policy';

        this._titleEl.textContent = isRules
            ? 'Правила использования'
            : 'Политика обработки данных';

        let hint =
            `Документ публикуется по адресу <code>${url}</code> ` +
            `на вашем домене. Поддерживается Markdown.`;

        if (this._isDefault) {
            hint +=
                '<br><br>' +
                '<b>Пока вы не заполнили поле</b>, на сайте публикуется ' +
                'универсальный текст для сайта-визитки. Вы можете ' +
                'оставить его как есть или заменить своим.';
        }

        this._hintEl.innerHTML = hint;
    }

    _focusTextarea() {
        if (!this._textarea) return;
        // setTimeout(0) — let the browser finish the layout pass
        // before focusing, otherwise the caret can end up in the
        // wrong place on some browsers.
        setTimeout(() => {
            if (this._textarea && this._textarea.isConnected) {
                this._textarea.focus();
                // Put the caret at the end, not at the start.
                const len = this._textarea.value.length;
                try {
                    this._textarea.setSelectionRange(len, len);
                } catch (e) {
                    // Some browsers refuse setSelectionRange on a
                    // detached textarea — silently ignore.
                }
            }
        }, 0);
    }

    // ============================================
    // PREVIEW
    // ============================================

    _refreshPreview() {
        if (!this._preview || !this._textarea) return;
        const md = this._textarea.value || '';
        this._preview.innerHTML = this._renderMarkdown(md);
    }

    /**
     * Minimal client-side markdown renderer for the preview pane.
     *
     * Supports the subset that legal texts actually use:
     *   - ATX headings (# / ## / ### / ####);
     *   - paragraphs;
     *   - unordered lists (- / *);
     *   - ordered lists (1. / 2. ...);
     *   - fenced code blocks (```);
     *   - inline code (`code`);
     *   - bold (**text**);
     *   - italic (*text* / _text_);
     *   - links [text](url);
     *   - horizontal rules (--- / ***);
     *   - GFM tables (| a | b | ... );
     *
     * This is NOT a full CommonMark parser. It is good enough for
     * authoring feedback. The authoritative rendering is done by
     * the backend (markdown-it-py) when the document is served at
     * /policy or /rules.
     *
     * All output is escaped first — raw HTML in the source is not
     * passed through, same policy as the backend.
     */
    _renderMarkdown(src) {
        const escapeHtml = (s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
        const out = [];
        let i = 0;
        let inUl = false;
        let inOl = false;
        let inCode = false;
        let codeBuf = [];
        let paraBuf = [];

        const flushPara = () => {
            if (paraBuf.length) {
                out.push(`<p>${this._inline(paraBuf.join(' '), escapeHtml)}</p>`);
                paraBuf = [];
            }
        };
        const closeLists = () => {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (inOl) { out.push('</ol>'); inOl = false; }
        };
        const flushCode = () => {
            if (inCode) {
                out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
                codeBuf = [];
                inCode = false;
            }
        };

        while (i < lines.length) {
            const line = lines[i];

            // ---- Fenced code ----
            if (line.trim().startsWith('```')) {
                if (inCode) {
                    flushCode();
                } else {
                    flushPara();
                    closeLists();
                    inCode = true;
                    codeBuf = [];
                }
                i++;
                continue;
            }
            if (inCode) {
                codeBuf.push(line);
                i++;
                continue;
            }

            // ---- Table (GFM) ----
            // A table is: a header row with pipes, a separator row
            // of dashes/pipes/colons, then zero or more body rows.
            if (line.includes('|') && i + 1 < lines.length &&
                /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) &&
                lines[i + 1].includes('-')) {
                flushPara();
                closeLists();
                const { html, consumed } = this._renderTable(lines, i, escapeHtml);
                out.push(html);
                i += consumed;
                continue;
            }

            // ---- Headings ----
            const h = /^(#{1,4})\s+(.*)$/.exec(line);
            if (h) {
                flushPara();
                closeLists();
                const level = h[1].length;
                out.push(`<h${level}>${this._inline(h[2], escapeHtml)}</h${level}>`);
                i++;
                continue;
            }

            // ---- Horizontal rule ----
            if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                flushPara();
                closeLists();
                out.push('<hr>');
                i++;
                continue;
            }

            // ---- Unordered list ----
            const ul = /^\s*[-*]\s+(.*)$/.exec(line);
            if (ul) {
                flushPara();
                if (!inUl) {
                    closeLists();
                    out.push('<ul>');
                    inUl = true;
                }
                out.push(`<li>${this._inline(ul[1], escapeHtml)}</li>`);
                i++;
                continue;
            }

            // ---- Ordered list ----
            const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
            if (ol) {
                flushPara();
                if (!inOl) {
                    closeLists();
                    out.push('<ol>');
                    inOl = true;
                }
                out.push(`<li>${this._inline(ol[1], escapeHtml)}</li>`);
                i++;
                continue;
            }

            // ---- Blank line ----
            if (!line.trim()) {
                flushPara();
                closeLists();
                i++;
                continue;
            }

            // ---- Paragraph line ----
            paraBuf.push(line.trim());
            i++;
        }

        flushPara();
        closeLists();
        flushCode();

        return out.join('\n');
    }

    /**
     * Render a GFM table starting at `start`. Returns
     * { html, consumed }.
     */
    _renderTable(lines, start, escapeHtml) {
        const splitRow = (row) =>
            row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

        const header = splitRow(lines[start]);
        const body = [];
        let i = start + 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
            body.push(splitRow(lines[i]));
            i++;
        }

        const th = header
            .map(c => `<th>${this._inline(c, escapeHtml)}</th>`)
            .join('');
        const rows = body.map(r => {
            const tds = r.map(c => `<td>${this._inline(c, escapeHtml)}</td>`).join('');
            return `<tr>${tds}</tr>`;
        }).join('');

        const html = `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
        return { html, consumed: i - start };
    }

    /**
     * Inline markdown: bold, italic, inline code, links.
     *
     * Order matters: code spans are extracted first so that
     * asterisks inside them are not treated as emphasis.
     */
    _inline(text, escapeHtml) {
        let s = escapeHtml(text);

        // Inline code — protect contents from further processing.
        const codeStore = [];
        s = s.replace(/`([^`]+)`/g, (_, code) => {
            codeStore.push(code);
            return `\u0000CODE${codeStore.length - 1}\u0000`;
        });

        // Links [text](url)
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
            const safeUrl = escapeHtml(url);
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });

        // Bold **text**
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic *text* or _text_
        s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
        s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

        // Restore code spans.
        s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => {
            return `<code>${codeStore[Number(idx)]}</code>`;
        });

        return s;
    }

    // ============================================
    // EVENTS
    // ============================================

    _bindEvents() {
        if (!this._overlay) return;

        // Click inside the dialog: buttons.
        this._overlay.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            const actionEl = target.closest('[data-action]');
            if (!actionEl) return;

            const action = actionEl.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'legal-template':
                    e.preventDefault();
                    this._applyTemplate();
                    break;
                case 'legal-clear':
                    e.preventDefault();
                    this._applyPreset('');
                    break;
                case 'legal-cancel':
                    e.preventDefault();
                    this.close();
                    break;
                case 'legal-ok':
                    e.preventDefault();
                    this._save();
                    break;
                default:
                    break;
            }
        });

        // Live preview: update on every input.
        this._onInput = () => this._refreshPreview();
        if (this._textarea) {
            this._textarea.addEventListener('input', this._onInput);
        }

        // Click on the overlay (outside the dialog) closes the modal.
        this._overlay.addEventListener('mousedown', (e) => {
            if (e.target === this._overlay) {
                this.close();
            }
        });

        // Escape closes the modal.
        this._boundKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        };
        document.addEventListener('keydown', this._boundKeyDown);
    }

    _unbindEvents() {
        if (this._boundKeyDown) {
            document.removeEventListener('keydown', this._boundKeyDown);
            this._boundKeyDown = null;
        }
        if (this._onInput && this._textarea) {
            this._textarea.removeEventListener('input', this._onInput);
        }
        this._onInput = null;
    }

    // ============================================
    // ACTIONS
    // ============================================

    _applyTemplate() {
        const template = this._which === 'rules'
            ? this._textRulesTemplate()
            : this._textPolicyTemplate();
        this._applyPreset(template);
    }

    _applyPreset(text) {
        if (!this._textarea) return;
        this._textarea.value = text;
        this._clearError();
        this._refreshPreview();
        this._textarea.focus();
    }

    _showError(message) {
        if (!this._errorEl) return;
        this._errorEl.textContent = message || 'Не удалось сохранить';
        this._errorEl.hidden = false;
    }

    _clearError() {
        if (!this._errorEl) return;
        this._errorEl.textContent = '';
        this._errorEl.hidden = true;
    }

    _setSaving(on) {
        this._saving = !!on;
        if (!this._okBtn) return;
        this._okBtn.disabled = this._saving;
        this._okBtn.textContent = this._saving ? 'Сохраняю…' : 'Сохранить';
    }

    async _save() {
        if (this._saving) return;
        if (!this._textarea) return;

        const text = this._textarea.value;
        const which = this._which;

        this._clearError();
        this._setSaving(true);

        try {
            const fetchJson = window.coreEngine?.fetchJson;
            if (typeof fetchJson !== 'function') {
                throw new Error('fetchJson недоступен');
            }

            const json = await fetchJson(
                '/core/engine/lib/base/profile/domain/legal',
                {
                    method: 'POST',
                    body: { which, text },
                }
            );

            const savedText = (json && json.data && typeof json.data.text === 'string')
                ? json.data.text
                : text;
            const savedWhich = (json && json.data && typeof json.data.which === 'string')
                ? json.data.which
                : which;

            console.log('[LegalModal] %s saved, %d bytes', savedWhich, savedText.length);

            if (typeof this.onSaved === 'function') {
                try {
                    this.onSaved(savedWhich, savedText);
                } catch (e) {
                    console.warn('[LegalModal] onSaved threw:', e);
                }
            }

            this._setSaving(false);
            this.close();
        } catch (err) {
            console.error('[LegalModal] save error:', err);
            this._setSaving(false);

            // The server returns { detail } on 4xx / 5xx; fetchJson
            // wraps that into err.message. Fall back to a generic
            // string if the error carries nothing usable.
            const msg = (err && err.message) ? err.message : 'Не удалось сохранить';
            this._showError(msg);
        }
    }
}