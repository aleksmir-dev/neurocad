// app/core/engine/lib/word/editor/formatter.js

/**
 * Formatter — CSS / HTML pretty-print utilities for the editor.
 *
 * Uses js-beautify (loaded lazily from /static/libs/js-beautify-1.15.1/).
 * Falls back to raw strings if the library is unavailable.
 */

const BEAUTIFY_BASE = '/static/libs/js-beautify-1.15.1';

let _loaded = false;
let _loading = null;

/**
 * Load js-beautify CSS + HTML scripts once per session.
 *
 * @returns {Promise<void>}
 */
export async function loadBeautify() {
    if (_loaded) return;
    if (_loading) return _loading;

    const version = window.coreEngine?.static_version || Date.now();

    const loadScript = (src) => new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === '1') return resolve();
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { s.dataset.loaded = '1'; resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
    });

    _loading = Promise.all([
        loadScript(`${BEAUTIFY_BASE}/beautify-css.min.js?v=${version}`),
        loadScript(`${BEAUTIFY_BASE}/beautify-html.min.js?v=${version}`),
    ]).then(() => {
        _loaded = true;
        console.log('[Formatter] js-beautify loaded');
    }).catch((e) => {
        console.warn('[Formatter] js-beautify load failed:', e);
    });

    return _loading;
}

/**
 * Pretty-print CSS.
 * Falls back to raw string if js-beautify is not available.
 *
 * @param {string} css
 * @returns {string}
 */
export function formatCss(css) {
    if (!css) return '';

    if (typeof window.css_beautify === 'function') {
        try {
            return window.css_beautify(css, {
                indent_size: 4,
                selector_separator_newline: true,
                newline_between_rules: true,
            });
        } catch (e) {
            console.warn('[Formatter] css_beautify error:', e);
        }
    }

    // Fallback: minimal formatter
    return css
        .replace(/\s*{\s*/g, ' {\n    ')
        .replace(/;\s*/g, ';\n    ')
        .replace(/\s*}\s*/g, '\n}\n')
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

/**
 * Pretty-print HTML.
 * Falls back to raw string if js-beautify is not available.
 *
 * @param {string} html
 * @returns {string}
 */
export function formatHtml(html) {
    if (!html) return '';

    if (typeof window.html_beautify === 'function') {
        try {
            return window.html_beautify(html, {
                indent_size: 4,
                wrap_line_length: 0,
                preserve_newlines: true,
                max_preserve_newlines: 2,
            });
        } catch (e) {
            console.warn('[Formatter] html_beautify error:', e);
        }
    }

    // Fallback: minimal formatter
    const VOID = /^<(br|hr|img|input|meta|link|area|base|col|embed|source|track|wbr)\b/i;
    const tokens = html.split(/(<[^>]+>)/g).filter(Boolean);

    let out = '';
    let indent = 0;

    for (const token of tokens) {
        if (token.startsWith('</')) {
            indent = Math.max(0, indent - 1);
            out += '    '.repeat(indent) + token + '\n';
        } else if (token.startsWith('<!--')) {
            out += '    '.repeat(indent) + token + '\n';
        } else if (token.startsWith('<')) {
            out += '    '.repeat(indent) + token + '\n';
            if (!token.endsWith('/>') && !VOID.test(token)) {
                indent++;
            }
        } else {
            const text = token.trim();
            if (text) {
                out += '    '.repeat(indent) + text + '\n';
            }
        }
    }

    return out.trim();
}