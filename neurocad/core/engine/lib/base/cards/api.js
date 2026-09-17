// app/core/engine/lib/base/cards/api.js

/**
 * CRUD-операции для BaseCards.
 *
 * Все функции принимают `cards` (инстанс BaseCards) первым аргументом.
 * Все сетевые функции — async.
 */

/**
 * Собрать URL из endpoint + параметров.
 * Подставляет {id}, добавляет section/contextId/is_delete.
 */
export function buildUrl(cards, endpoint, params = {}) {
    let url = cards.apiBase + endpoint;
    if (params.id) url = url.replace('{id}', params.id);

    const queryParams = [];
    if (cards.section) queryParams.push(`section=${cards.section}`);
    if (cards.contextId) queryParams.push(`${cards.contextField}=${cards.contextId}`);
    if (cards.isDeletedMode) queryParams.push('is_delete=true');

    if (queryParams.length > 0) {
        url += (url.includes('?') ? '&' : '?') + queryParams.join('&');
    }
    return url;
}

/**
 * Создать элемент.
 */
export async function addItem(cards, data) {
    const url = buildUrl(cards, cards.apiEndpoints.create);
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.detail || 'Failed to create item');
    }
}

/**
 * Обновить элемент.
 */
export async function updateItem(cards, id, data) {
    const url = buildUrl(cards, cards.apiEndpoints.update, { id });
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.detail || 'Failed to update item');
    }
}

/**
 * Удалить элемент.
 */
export async function deleteItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.delete, { id });
    const response = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) throw new Error('Failed to delete item');
}

/**
 * Восстановить элемент.
 */
export async function restoreItem(cards, id) {
    const url = buildUrl(cards, cards.apiEndpoints.restore, { id });
    const response = await fetch(url, { method: 'POST', credentials: 'include' });
    if (!response.ok) throw new Error('Failed to restore item');
}