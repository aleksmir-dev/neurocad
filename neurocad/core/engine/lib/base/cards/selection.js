// app/core/engine/lib/base/cards/selection.js

/**
 * Card selection and UI synchronization.
 * All functions take `cards` (a BaseCards instance).
 *
 * Confirmations use BaseModalConfirm (via createModal factory)
 * instead of native browser confirm().
 *
 * Error handling:
 *   - 401 Unauthorized  → redirect to login page (with ?next=)
 *   - other errors      → show modal message with the server's text
 */

/**
 * Confirm dialog helper.
 *
 * Uses BaseModalConfirm — same look and feel as the rest of the UI.
 * Returns a Promise<boolean>:
 *   true  — OK clicked
 *   false — Cancel / Escape / click on overlay
 *
 * @param {Object} cards — BaseCards instance
 * @param {string} text  — confirmation text
 * @param {string} [title] — dialog title
 * @returns {Promise<boolean>}
 */
async function _confirm(cards, text, title = 'Подтверждение') {
    const version = window.coreEngine?.static_version || Date.now();

    try {
        // Path is relative to selection.js (base/cards/):
        //   ../modal/index.js → base/modal/index.js
        const { createModal } = await import(`../modal/index.js?v=${version}`);
        const modal = await createModal('confirm');
        if (!modal) return false;

        return new Promise((resolve) => {
            modal.open(text, title, 'ОК', 'Отмена');

            modal.setOnOk(() => {
                modal.destroy();
                resolve(true);
            });
            modal.setOnCancel(() => {
                modal.destroy();
                resolve(false);
            });
        });
    } catch (e) {
        console.warn('[BaseCards] BaseModalConfirm unavailable, using native confirm:', e);
        return confirm(text);
    }
}

/**
 * Show an error message in a BaseModalMessage dialog.
 *
 * @param {string} message — text to show
 * @param {string} [title] — dialog title
 */
async function _showError(message, title = 'Ошибка') {
    const version = window.coreEngine?.static_version || Date.now();

    try {
        const { createModal } = await import(`../modal/index.js?v=${version}`);
        const modal = await createModal('message');
        if (!modal) {
            // Fallback — native alert
            alert(message);
            return;
        }

        modal.open(message, title, 'Понятно');
        modal.setOnOk(() => modal.destroy());
    } catch (e) {
        console.warn('[BaseCards] Message modal unavailable:', e);
        alert(message);
    }
}

/**
 * Handle 401 Unauthorized globally.
 *
 * Hard redirect to the login page, preserving the current URL as `?next=`.
 * After successful login the server may redirect back to `next`.
 */
function _handleUnauthorized() {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    console.warn('[BaseCards] 401 Unauthorized — redirecting to login');

    // Hard redirect
    window.location.href = `/core/auth/login?next=${next}`;
}

/**
 * Central error handler for card operations.
 *
 * - 401 → redirect to login
 * - others → show modal message
 *
 * @param {Error} err
 */
function _handleOperationError(err) {
    if (err && err.status === 401) {
        _handleUnauthorized();
        return;
    }

    const message = err?.message || 'Неизвестная ошибка';
    _showError(message, 'Ошибка');
}

/**
 * Activate a card (left click / tap).
 * Delegates to onItemClick.
 */
export function handleActivate(cards, id, e) {
    console.log('[BaseCards] _handleActivate() for id:', id);
    if (cards.onItemClick) {
        cards.onItemClick(id, e);
    }
}

/**
 * Select a card (right click / long press).
 * Single selection only.
 */
export function handleSelect(cards, id, e) {
    console.log('[BaseCards] _handleSelect() for id:', id);

    const card = cards.itemInstances.get(id);
    if (!card) {
        console.warn('[BaseCards] Card not found:', id);
        return;
    }

    if (cards.selectedIds.size === 1 && cards.selectedIds.has(id)) {
        cards.selectedIds.clear();
        card.setSelected(false);
    } else {
        for (const [, instance] of cards.itemInstances) {
            instance.setSelected(false);
        }
        cards.selectedIds.clear();

        card.setSelected(true);
        cards.selectedIds.add(id);
    }

    updateUI(cards);
    syncToolbar(cards);
}

/**
 * Clear selection without full re-render.
 */
export function clearSelection(cards) {
    if (cards.selectedIds.size === 0) return;

    for (const [, instance] of cards.itemInstances) {
        instance.setSelected(false);
    }
    cards.selectedIds.clear();
    updateUI(cards);
    syncToolbar(cards);
}

/**
 * Sync toolbar state with selection.
 */
export function syncToolbar(cards) {
    if (!cards.toolbar) return;

    const count = cards.selectedIds.size;
    cards.toolbar.setSelectedCount(count);

    if (count === 1) {
        cards.toolbar.setFirstSelectedId(Array.from(cards.selectedIds)[0]);
    } else {
        cards.toolbar.setFirstSelectedId(null);
    }
}

export function selectAll(cards) {
    const itemsToShow = getItemsToShowSafe(cards);
    cards.selectedIds.clear();

    itemsToShow.forEach(item => {
        cards.selectedIds.add(item.id);
        const card = cards.itemInstances.get(item.id);
        if (card) card.setSelected(true);
    });

    updateUI(cards);
    syncToolbar(cards);
}

/**
 * Delete selected items (with confirmation).
 *
 * On 401 — redirect to login.
 * On other errors — show modal message.
 */
export async function handleDeleteSelected(cards) {
    if (cards.selectedIds.size === 0) return;
    if (cards.isDeletedMode) return;

    const ids = Array.from(cards.selectedIds);
    const ok = await _confirm(
        cards,
        `Удалить ${ids.length} элементов?`,
        'Удаление'
    );
    if (!ok) return;

    try {
        for (const id of ids) {
            await cards._deleteItem(id);
        }
        cards.selectedIds.clear();
        if (cards.onReload) await cards.onReload();
    } catch (err) {
        console.error('[BaseCards] Delete error:', err);
        _handleOperationError(err);
    }
}

/**
 * Restore selected items (with confirmation).
 *
 * On 401 — redirect to login.
 * On other errors — show modal message.
 */
export async function handleRestoreSelected(cards) {
    if (cards.selectedIds.size === 0) return;
    if (!cards.isDeletedMode) return;

    const ids = Array.from(cards.selectedIds);
    const ok = await _confirm(
        cards,
        `Восстановить ${ids.length} элементов?`,
        'Восстановление'
    );
    if (!ok) return;

    try {
        for (const id of ids) {
            await cards._restoreItem(id);
        }
        cards.selectedIds.clear();
        if (cards.onReload) await cards.onReload();
    } catch (err) {
        console.error('[BaseCards] Restore error:', err);
        _handleOperationError(err);
    }
}

/**
 * Update counters and toolbar state.
 */
export function updateUI(cards) {
    const total = getItemsToShowSafe(cards).length;
    const selected = cards.selectedIds.size;

    if (cards.countEl) {
        cards.countEl.textContent = `${total} элементов`;
    }

    if (cards.selectedEl) {
        cards.selectedEl.textContent = selected > 0 ? `Выбрано: ${selected}` : '';
        cards.selectedEl.style.display = selected > 0 ? 'inline' : 'none';
    }

    if (cards.statusTextEl) {
        cards.statusTextEl.textContent = selected > 0
            ? `Выбрано: ${selected}`
            : cards.widgetStatus;
    }

    if (cards.toolbar) {
        cards.toolbar.setSelectedCount(selected);
    }
}

// Internal helper: get items for display via render module,
// to avoid duplicating filter logic.
function getItemsToShowSafe(cards) {
    if (cards._render && typeof cards._render.getItemsToShow === 'function') {
        return cards._render.getItemsToShow(cards);
    }
    return cards.items || [];
}