// app/core/engine/lib/pages/logo.js

/**
 * Logo generator — extra button for the "Логотип" media field
 * on the pages card form.
 *
 * Returns a button descriptor consumable by BaseCardsEdit's
 * `field.extraButtons`. BaseCardsEdit itself is unchanged — it only
 * knows how to render a button and call its onClick with a context.
 *
 * The button:
 *   1. reads the current "title" and "description" from the form
 *      (through getAllValues);
 *   2. POSTs to /core/engine/lib/word/editor/images/generate;
 *   3. on success — writes the returned URL into the media field
 *      (setValue) so the hidden input and the preview update;
 *   4. on failure — shows the error under the field (showError).
 *
 * Text of the button never changes — only the disabled state,
 * so it does not "jump" during generation.
 *
 * No global state, no imports — the module is pure.
 */

export function makeLogoGeneratorButton() {
    return {
        label: 'Генерировать',
        className: 'edit-media-btn-generate',
        onClick: async ({ getAllValues, setValue, showError, clearError, button }) => {
            const values = getAllValues() || {};
            const title = String(values.title || '').trim();
            const description = String(values.description || '').trim();

            if (!title) {
                showError('Сначала введите заголовок');
                return;
            }

            const prompt = description
                ? `${title}. ${description}`
                : title;

            // ---- Busy state ----
            // Only the disabled flag changes. The text stays as-is
            // so the button does not "jump" during the request.
            button.disabled = true;
            clearError();

            try {
                const res = await fetch(
                    '/core/engine/lib/word/editor/images/generate',
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt,
                            alt: title,
                            source: 'logo',
                        }),
                    },
                );

                const data = await res.json().catch(() => null);

                if (!res.ok || !data || !data.success) {
                    const msg =
                        (data && (data.detail || data.message)) ||
                        `Ошибка генерации (${res.status})`;
                    showError(msg);
                    return;
                }

                const url = data?.data?.url;
                if (!url) {
                    showError('Пустой ответ сервера');
                    return;
                }

                setValue(url);
            } catch (e) {
                console.error('[logo] generate failed:', e);
                showError('Сеть недоступна');
            } finally {
                button.disabled = false;
            }
        },
    };
}