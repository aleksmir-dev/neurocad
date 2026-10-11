// app/core/engine/lib/pages/copy.js

/**
 * Copy actions for the Pages catalog.
 *
 * Loaded dynamically from pages.js with ?v=<version>:
 *
 *     const { copySelected } = await import(
 *         `./copy.js?v=${version}`
 *     );
 *
 *     // then, from a BaseCards callback:
 *     onCopySelected: (ids) => this._copy.copySelected(this, ids),
 *
 * The module takes the Pages instance as its first argument — same
 * pattern as utils.js. No `this`, no state: the caller decides which
 * Pages instance to operate on.
 *
 * What "copy" means
 * -----------------
 * The toolbar's "Копировать" button works on the CURRENT SELECTION
 * (one or more ids). For each id we POST to:
 *
 *     POST /core/engine/lib/pages/item/<id>/duplicate
 *
 * The backend generates the copy title ("<original> (копия)"), a
 * fresh datetime, and copies all content fields. History (PageHist)
 * and LLM chat (PageChat) are NOT copied — the duplicate starts
 * clean.
 *
 * After at least one success, we clear the selection and reload the
 * current folder level via the Pages instance — see pages.js →
 * _reload().
 *
 * Confirmation
 * ------------
 * A single styled confirm dialog (utils.js → confirm, which wraps
 * BaseModalConfirm) is shown before any API call. The dialog text
 * depends on the number of selected items:
 *
 *   - 1 item  → "Скопировать <папку|статью> «<title>»?"
 *   - N items → "Скопировать N элементов?"
 *
 * On "Отмена" nothing happens — the selection stays as-is.
 *
 * Errors
 * ------
 * Per-item failures are logged but do not pop a modal per item — a
 * partial failure in a batch should not open 5 dialogs. If NO item
 * was copied successfully, one message dialog is shown (utils.js →
 * message, which wraps BaseModalMessage).
 *
 * No static imports — every dependency is resolved lazily.
 */

/**
 * Copy the selected items (one or more).
 *
 * Called by BaseCards → onCopySelected when the "Копировать" button
 * in the toolbar is clicked. The toolbar already checked that at
 * least one item is selected.
 *
 * Steps:
 *   1. Resolve the first item to build a human-readable confirm
 *      text ("<copy> «<title>»?" for 1, "<copy> N элементов?" for N).
 *   2. Ask for confirmation through utils.confirm (BaseModalConfirm).
 *   3. For each id — POST /item/<id>/duplicate (silent, no
 *      per-item prompts — the user already confirmed).
 *   4. If at least one succeeded — clear the selection, sync the
 *      toolbar, and reload the current folder level.
 *   5. If none succeeded — show a single message dialog.
 *
 * @param {Object}   pages — Pages instance
 * @param {number[]} ids   — selected item ids
 */
export async function copySelected(pages, ids) {
    console.log('[Pages copy] copySelected() ids =', ids);

    if (!ids || ids.length === 0) return;

    // Lazy-load utils — confirm / message wrappers live there.
    const version = window.coreEngine?.static_version || Date.now();
    const { confirm, message } = await import(
        `./utils.js?v=${version}`
    );

    const items = pages.cardsInstance?.props?.items || pages.props.items || [];
    const first = items.find(i => String(i.id) === String(ids[0]));
    const label = first?.card_type === 'folder' ? 'папку' : 'статью';

    const text = ids.length === 1
        ? `Скопировать ${label} «${first?.title || ''}»?`
        : `Скопировать ${ids.length} элементов?`;

    const confirmed = await confirm(text, 'Копирование', 'Скопировать', 'Отмена');
    if (!confirmed) return;

    let ok = 0;
    for (const id of ids) {
        const success = await duplicateItemSilent(pages, id);
        if (success) ok++;
    }

    console.log(`[Pages copy] copySelected: ${ok}/${ids.length} copied`);

    if (ok > 0) {
        // Clear the selection — the copies are new rows and should
        // not inherit the "selected" state of the originals.
        pages.cardsInstance?.selectedIds.clear();
        pages.cardsInstance?._syncToolbar?.();

        await pages._reload();
    } else {
        await message('Не удалось скопировать', 'Ошибка');
    }
}

/**
 * Duplicate one item (silent — no confirm, no alert on success).
 *
 * Used by copySelected for batch copying. The user already
 * confirmed the whole batch, so we don't ask again per item.
 *
 * Returns true if the copy was created, false otherwise.
 * Errors are logged but not shown to the user — a partial failure
 * in a batch should not pop a modal per failed item.
 *
 * @param {Object} pages — Pages instance
 * @param {number} id    — item id to duplicate
 * @returns {Promise<boolean>}
 */
export async function duplicateItemSilent(pages, id) {
    try {
        const url = pages._apiUrl(
            `/core/engine/lib/pages/item/${id}/duplicate`
        );

        const fetchJson = window.coreEngine?.fetchJson;
        const result = await fetchJson(url, { method: 'POST' });

        if (!result.success) {
            console.warn('[Pages copy] duplicate silent: bad response', result);
            return false;
        }

        console.log('[Pages copy] duplicated:', id, '->', result.data?.id);
        return true;
    } catch (e) {
        console.error('[Pages copy] duplicate silent error:', e);
        return false;
    }
}