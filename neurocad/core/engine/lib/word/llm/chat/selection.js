// neurocad/core/engine/lib/word/llm/chat/selection.js

/**
 * getLLMChatSelection — return the current selection in the editor.
 *
 * The selection is captured as an "element marker":
 *   - a temporary attribute `data-selected-id="sel-XXXXXXXX"` is put
 *     on the selected component;
 *   - the component's outer HTML is captured as-is;
 *   - the tag name and class list are captured for context.
 *
 * The marker is a random string. It travels to the backend and comes
 * back in the `element_update` event, so the client can find the same
 * component again — even if the component tree has changed.
 *
 * The marker is expected to survive the round-trip: the LLM is
 * instructed (via the prompt) not to remove or change attributes.
 * After the update is applied, the marker is removed by `apply.js`.
 *
 * Returns:
 *   {
 *     "selector":   "sel-abc12345",
 *     "tag":        "section",
 *     "classes":    ["section", "hero"],
 *     "outer_html": "<section class=\"section hero\">...</section>"
 *   }
 *   or null if nothing is selected.
 */
export function getLLMChatSelection(editor) {
    try {
        const ed = editor?.editor;
        if (!ed) return null;

        const selected = ed.getSelected?.();
        if (!selected) {
            console.log('[selection] nothing is selected');
            return null;
        }

        // ---- 1. unique marker ----
        const marker = 'sel-' + makeId(8);
        selected.addAttributes({ 'data-selected-id': marker });

        // ---- 2. outer HTML after adding the marker ----
        const outerHtml = selected.toHTML?.() || '';
        if (!outerHtml) {
            console.warn('[selection] selected component produced empty html');
            return null;
        }

        // ---- 3. tag + classes for context ----
        const tag = (selected.get('tagName') || '').toString().toLowerCase();
        const classes = (selected.getClasses?.() || [])
            .map((c) => String(c))
            .filter(Boolean);

        const selection = {
            selector: marker,
            tag,
            classes,
            outer_html: outerHtml,
        };

        console.log('[selection] captured element:', {
            selector: marker,
            tag,
            classes,
            html_len: outerHtml.length,
        });

        return selection;
    } catch (e) {
        console.warn('[selection] error:', e);
        return null;
    }
}

// ============================================
// INTERNAL
// ============================================

/**
 * Short random id generator: letters + digits, no dashes.
 */
function makeId(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}