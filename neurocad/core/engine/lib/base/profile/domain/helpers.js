// neurocad/core/engine/lib/base/profile/domain/helpers.js

/**
 * Small helpers for the domain page.
 *
 * Pure functions — no state, no DOM access beyond what is passed in.
 * Kept in a separate file so both cards.js and actions.js can reuse
 * them without importing the main BaseProfileDomain class (which
 * would create a circular dependency).
 */

/**
 * Build a full URL from a bare hostname.
 *
 *   "testuser1.neurocad.ru" → "https://testuser1.neurocad.ru"
 *   "atou.ru"               → "https://atou.ru"
 *
 * Every domain on the domain page is shown and copied as a full URL
 * — users paste it straight into the address bar.
 */
export function fullUrl(host) {
    const h = String(host ?? '').trim();
    if (!h) return '';
    if (h.startsWith('http://') || h.startsWith('https://')) return h;
    return `https://${h}`;
}

/**
 * Escape a string for safe inclusion in an HTML attribute or text
 * node. Escapes &, <, >, " — enough for the values we interpolate
 * (domains, titles, error messages from the backend).
 */
export function escapeAttr(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Return a <span class="domain-badge ..."> for a custom-domain status
 * code. See DOMAIN_STATUS_* in the backend schema.
 */
export function statusBadge(status) {
    switch (status) {
        case 'active':
            return `<span class="domain-badge domain-badge-ok">Активен</span>`;
        case 'dns_fail':
            return `<span class="domain-badge domain-badge-warn">DNS не настроен</span>`;
        case 'caddy_off':
            return `<span class="domain-badge domain-badge-warn">Caddy недоступен</span>`;
        default:
            return `<span class="domain-badge">Неизвестно</span>`;
    }
}

/**
 * Copy the given text to the clipboard, with a transient "Скопировано"
 * label on the button. Restores the original label after 1.5 s.
 *
 * Uses navigator.clipboard — needs HTTPS or localhost. On plain HTTP
 * the writeText() promise rejects; the caller sees "Не удалось".
 */
export async function copyToClipboard(btn, text) {
    if (!text) return;
    const prev = btn.textContent;
    try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Скопировано';
    } catch (err) {
        console.error('[BaseProfileDomain] Copy error:', err);
        btn.textContent = 'Не удалось';
    }
    setTimeout(() => {
        if (btn.isConnected) {
            btn.textContent = prev || 'Копировать';
        }
    }, 1500);
}