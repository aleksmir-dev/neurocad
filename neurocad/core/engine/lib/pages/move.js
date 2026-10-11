// app/core/engine/lib/pages/move.js

/**
 * Move actions for the Pages catalog.
 *
 * Loaded dynamically from pages.js with ?v=<version>:
 *
 *     const { moveSelected } = await import(
 *         `./move.js?v=${version}`
 *     );
 *
 *     // then, from a BaseCards callback:
 *     onMoveSelected: (id) => this._move.moveSelected(this, id),
 *
 * The module takes the Pages instance as its first argument — same
 * pattern as utils.js and copy.js. No `this`, no state: the caller
 * decides which Pages instance to operate on.
 *
 * What "move" means
 * -----------------
 * The toolbar's "Переместить" button works on EXACTLY ONE selected
 * item — same rule as "Редактировать". The user picks a target
 * folder from a flat list (see buildFolderOptions below), and we
 * PUT the new parent_id:
 *
 *     PUT /core/engine/lib/pages/item/<id>
 *     body: { "parent_id": <id> | null }
 *
 * `parent_id: null` moves the item to the root.
 *
 * The backend already supports this — see pages/service.py →
 * update_item, where `parent_id` is in `noneable_fields` and can be
 * explicitly set to null. No backend change is needed for the move
 * itself.
 *
 * Folder source
 * -------------
 * The picker list is built in this order:
 *
 *   1. From the items ALREADY loaded on the current level
 *      (`cardsInstance.props.items`). This is what the user sees.
 *
 *   2. If those items do not give us the full tree for this nav
 *      (i.e. there may be folders on other levels we have not
 *      visited yet), we fetch the whole flat list once:
 *
 *          GET /core/engine/lib/pages/list        (no parent_id)
 *
 *      and build the tree from that. We cache nothing: the list is
 *      refetched on every open, because folders may have been
 *      created or renamed since the last visit.
 *
 * The decision "is the tree complete?" is heuristic: if the current
 * level contains ANY folder, we assume the tree may be deeper and
 * fetch the flat list. If the current level has no folders at all,
 * the flat list is not fetched (only the root + current items are
 * candidates).
 *
 * Cycle prevention
 * ----------------
 * Moving a folder into itself (or into one of its descendants)
 * would break the tree. We prevent this on the client by excluding:
 *
 *   - the item being moved, if it is a folder;
 *   - all of its descendants.
 *
 * The descendants are computed from the flat list (`parent_id`
 * chains) — see collectDescendantIds below.
 *
 * Error reporting
 * ---------------
 * The backend sends a human-readable reason in `detail` on failure
 * (400 cycle, 404 missing, 403 balance, …). sendMove() extracts it
 * so moveSelected() can show the real text instead of a generic
 * "Не удалось переместить".
 *
 * No static imports — every dependency is resolved lazily.
 */


// ============================================
// PUBLIC ENTRY
// ============================================

/**
 * Move the single selected item.
 *
 * Called by BaseCards → onMoveSelected when the "Переместить" button
 * in the toolbar is clicked. The toolbar only enables the button
 * when the selection has EXACTLY ONE item, so we can safely resolve
 * the single id here.
 *
 * Steps:
 *   1. Find the item in the current list.
 *   2. Build the flat folder list (see buildFolderOptions). The
 *      item being moved is excluded from the list; if it is a
 *      folder, all of its descendants are excluded too — moving a
 *      folder into itself would create a cycle.
 *   3. Open BaseModalList via the shared modal factory.
 *   4. On pick — PUT /item/<id> with the chosen parent_id
 *      (null = root).
 *   5. Reload the current folder level.
 *
 * If the folder list is empty (no folders, no root candidate), we
 * show a message dialog instead of the picker.
 *
 * On a failed PUT, the backend's `detail` string is shown to the
 * user. This is how the cycle-prevention message reaches them
 * ("Нельзя переместить папку внутрь себя...") instead of a
 * generic "Не удалось переместить".
 *
 * @param {Object} pages — Pages instance
 * @param {number} id    — selected item id
 */
export async function moveSelected(pages, id) {
    console.log('[Pages move] moveSelected() id =', id);

    const version = window.coreEngine?.static_version || Date.now();
    const { message } = await import(`./utils.js?v=${version}`);

    // ---- 1. Find the item on the current level ----
    const items = pages.cardsInstance?.props?.items || pages.props.items || [];
    const item = items.find(i => String(i.id) === String(id));

    if (!item) {
        console.warn('[Pages move] item not found:', id);
        await message('Элемент не найден', 'Ошибка');
        return;
    }

    // ---- 2. Build the flat folder list ----
    const folderItems = await buildFolderOptions(pages, item);
    if (!folderItems.length) {
        await message('Нет доступных папок для перемещения', 'Перемещение');
        return;
    }

    // ---- 3. Show the picker ----
    const picked = await openListModal(
        pages,
        item,
        folderItems,
    );

    // User cancelled (undefined) → do nothing.
    // Picked `null` → root (valid target).
    // Picked `<id>` → a folder.
    if (picked === undefined) return;

    // ---- 4. Send the update ----
    const { ok, error } = await sendMove(pages, item.id, picked);
    if (!ok) {
        await message(error || 'Не удалось переместить', 'Ошибка');
        return;
    }

    // ---- 5. Reload the current folder level ----
    // Clear the selection first — after a move, the card may have
    // left the current view entirely.
    pages.cardsInstance?.selectedIds.clear();
    pages.cardsInstance?._syncToolbar?.();

    await pages._reload();
}


// ============================================
// FOLDER LIST
// ============================================

/**
 * Build the flat list of candidate folders for the picker.
 *
 * Each entry is:
 *   { value: <id|null>, label: <title>, path: <string>, icon: '📁' }
 *
 * The special "root" entry is always first:
 *   { value: null, label: 'Корень', path: '/', icon: '🏠' }
 *
 * Source:
 *   1. Try the items already loaded on the current level.
 *   2. If the current level has any folder, fetch the whole flat
 *      list for the nav (GET /list without parent_id) and use it.
 *
 * Cycle prevention:
 *   - if `item` is a folder, exclude it;
 *   - exclude all its descendants.
 *
 * @param {Object} pages
 * @param {Object} item — the item being moved
 * @returns {Promise<Array>}
 */
async function buildFolderOptions(pages, item) {
    // ---- 1. Candidates from the currently loaded level ----
    const loaded = pages.cardsInstance?.props?.items || pages.props.items || [];

    let source = loaded;
    const hasFolder = loaded.some(i => i.card_type === 'folder');

    // ---- 2. If there may be more folders deeper — fetch flat ----
    if (hasFolder) {
        const flat = await fetchFlatList(pages);
        if (flat && flat.length) {
            source = flat;
        }
    }

    // ---- 3. Compute excluded ids (the item itself + descendants) ----
    const excluded = new Set();

    if (item.card_type === 'folder') {
        excluded.add(String(item.id));

        const descendants = collectDescendantIds(source, item.id);
        for (const d of descendants) {
            excluded.add(String(d));
        }
    }

    // ---- 4. Build the list ----
    const options = [];

    // Root is always first. Skip it if the item is already at the
    // root AND the item is a page — moving a root page to the root
    // is a no-op. For a folder we still show it (the user may want
    // to confirm the move visually). This is a UX choice, not a
    // technical constraint.
    options.push({
        value: null,
        label: 'Корень',
        path: '/',
        icon: '🏠',
    });

    // Only folders.
    const folders = source.filter(i => i.card_type === 'folder');

    // Build parent → children map for path computation.
    const childrenByParent = new Map();
    for (const f of folders) {
        const pid = f.parent_id != null ? String(f.parent_id) : '__root__';
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(f);
    }

    // Compute path by walking up parent_id. Cache per id.
    const pathCache = new Map();

    function buildPath(folder) {
        const idStr = String(folder.id);
        if (pathCache.has(idStr)) return pathCache.get(idStr);

        const parts = [];
        let current = folder;
        let safety = 0;

        while (current && safety < 50) {
            safety++;
            parts.unshift(slug(current.title));

            const pid = current.parent_id;
            if (pid == null) break;

            const parent = folders.find(f => String(f.id) === String(pid));
            if (!parent) break;
            current = parent;
        }

        const path = '/' + parts.join('/');
        pathCache.set(idStr, path);
        return path;
    }

    for (const f of folders) {
        const idStr = String(f.id);
        if (excluded.has(idStr)) continue;

        options.push({
            value: f.id,
            label: f.title || `Папка ${f.id}`,
            path: buildPath(f),
            icon: '📁',
        });
    }

    // Sort folders by path, alphabetically. Root stays first.
    const [rootOpt, ...rest] = options;
    rest.sort((a, b) => String(a.path).localeCompare(String(b.path)));

    return [rootOpt, ...rest];
}

/**
 * Fetch the whole flat list for the current nav.
 *
 * GET /core/engine/lib/pages/list   — no parent_id.
 *
 * Why no parent_id: the backend distinguishes "parameter absent"
 * from "parameter present but empty" (see pages/route.py →
 * get_pages_list). Absent → the whole flat list (all levels).
 * Empty   → only the root level.
 *
 * Returns [] on any failure — the caller falls back to whatever it
 * has on the current level.
 *
 * @param {Object} pages
 * @returns {Promise<Array>}
 */
async function fetchFlatList(pages) {
    try {
        const url = pages._apiUrl('/core/engine/lib/pages/list');
        const fetchJson = window.coreEngine?.fetchJson;
        const result = await fetchJson(url);

        if (result?.success && Array.isArray(result.data)) {
            console.log('[Pages move] flat list:', result.data.length);
            return result.data;
        }
        console.warn('[Pages move] flat list: bad response', result);
        return [];
    } catch (e) {
        console.warn('[Pages move] flat list fetch failed:', e);
        return [];
    }
}

/**
 * Collect the ids of all descendants of a folder.
 *
 * Walks the tree defined by `parent_id` links. The `source` list may
 * be flat (all levels) or partial (current level only) — the
 * function simply follows whatever parent_id links it can find.
 *
 * Guards against cycles in the input with a depth limit — a
 * malformed tree must not hang the UI.
 *
 * @param {Array}  source    — list of items (any level)
 * @param {number} folderId  — root of the subtree
 * @returns {number[]}       — descendant ids (not including folderId)
 */
function collectDescendantIds(source, folderId) {
    const result = [];
    const visited = new Set();
    const queue = [String(folderId)];

    let safety = 0;
    while (queue.length && safety < 1000) {
        safety++;
        const parentId = queue.shift();
        if (visited.has(parentId)) continue;
        visited.add(parentId);

        for (const it of source) {
            if (String(it.parent_id) === parentId) {
                const idStr = String(it.id);
                if (visited.has(idStr)) continue;
                result.push(it.id);
                queue.push(idStr);
            }
        }
    }

    return result;
}

/**
 * Turn a title into a URL-ish slug for the path segment.
 *
 * Not a real slugify — just enough to keep the path readable and
 * free of spaces / slashes. Cyrillic is preserved as-is (we do NOT
 * transliterate), because the user typed it in Russian.
 *
 * @param {string} s
 * @returns {string}
 */
function slug(s) {
    return String(s || '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/\//g, '-')
        .toLowerCase();
}


// ============================================
// LIST MODAL
// ============================================

/**
 * Open the list modal and resolve to the picked value.
 *
 * Resolves to:
 *   - undefined — user cancelled;
 *   - null      — user picked "Корень";
 *   - <id>      — user picked a folder.
 *
 * Uses BaseModalList via the shared modal factory.
 *
 * @param {Object} pages
 * @param {Object} item      — item being moved (for the caption)
 * @param {Array}  options   — items for the picker, built by buildFolderOptions
 * @returns {Promise<any|undefined>}
 */
async function openListModal(pages, item, options) {
    const version = window.coreEngine?.static_version || Date.now();
    const { createModal } = await import(
        `../base/modal/index.js?v=${version}`
    );

    const modal = await createModal('list');
    if (!modal) {
        console.warn('[Pages move] list modal unavailable');
        return undefined;
    }

    const label = item.card_type === 'folder' ? 'папку' : 'статью';
    const text = `Куда переместить ${label} «${item.title || ''}»?`;

    const result = await new Promise((resolve) => {
        modal.setOnOk((value) => resolve(value));
        modal.setOnCancel(() => resolve(undefined));
        modal.open(text, 'Перемещение', options);
    });

    modal.destroy();
    return result;
}


// ============================================
// API CALL
// ============================================

/**
 * Send the PUT that moves the item.
 *
 * PUT /core/engine/lib/pages/item/<id>
 * body: { "parent_id": <id> | null }
 *
 * Returns:
 *   { ok: true }                  — on success.
 *   { ok: false, error: <text> }  — on failure, with a
 *                                   human-readable reason.
 *
 * The error text is taken from the backend's `detail` field when
 * present. `detail` may be:
 *
 *   - a string     — the common case (400 cycle, 404 missing);
 *   - an object    — 403 balance uses { code, message, action }
 *                    (see route.py → _page_error_payload);
 *   - absent       — fall back to a generic Russian message.
 *
 * The raw response is logged in full so a 400/404/500 can be
 * diagnosed without opening DevTools → Network.
 *
 * @param {Object}    pages
 * @param {number}    id
 * @param {any}       parentId
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendMove(pages, id, parentId) {
    try {
        const url = pages._apiUrl(`/core/engine/lib/pages/item/${id}`);
        const fetchJson = window.coreEngine?.fetchJson;

        const result = await fetchJson(url, {
            method: 'PUT',
            body: { parent_id: parentId },
        });

        // ---- Success: { success: true, data: {...} } ----
        if (result?.success) {
            console.log('[Pages move] moved:', id, '-> parent_id =', parentId);
            return { ok: true };
        }

        // ---- Failure. Extract a human-readable reason. ----
        let errorText = 'Не удалось переместить';

        const detail = result?.detail ?? result?.error ?? null;

        if (typeof detail === 'string' && detail.trim()) {
            // Common case: { detail: "Article not found" }
            errorText = detail.trim();
        } else if (detail && typeof detail === 'object') {
            // Structured case: { detail: { code, message, action } }
            if (typeof detail.message === 'string' && detail.message.trim()) {
                errorText = detail.message.trim();
            } else if (typeof detail.code === 'string' && detail.code.trim()) {
                errorText = detail.code.trim();
            }
        }

        console.warn('[Pages move] PUT failed:', result);
        return { ok: false, error: errorText };
    } catch (e) {
        console.error('[Pages move] PUT error:', e);
        return { ok: false, error: 'Не удалось переместить' };
    }
}