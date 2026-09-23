// app/core/engine/lib/word/utils.js

/**
 * Word utilities — date formatting, JSON parsing.
 * Pure functions, no state.
 */

/**
 * Format ISO datetime to "19 сентября 2026 г."
 */
export function formatDate(isoString) {
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch (e) {
        return isoString;
    }
}

/**
 * Format ISO datetime to YYYYMMDD.
 */
export function formatDateShort(isoString) {
    try {
        const d = new Date(isoString);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    } catch (e) {
        console.warn('[Word utils] Date format error:', e);
        return '';
    }
}

/**
 * Format ISO datetime to HHMMSS.
 */
export function formatTimeShort(isoString) {
    try {
        const d = new Date(isoString);
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}${mi}${ss}`;
    } catch (e) {
        console.warn('[Word utils] Time format error:', e);
        return '';
    }
}

/**
 * Safe JSON.parse — returns null on error.
 */
export function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.warn('[Word utils] Failed to parse JSON:', e);
        return null;
    }
}