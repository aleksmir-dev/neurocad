// neurocad/core/engine/lib/word/llm/chat/apply.js

/**
 * applyLLMChatElementUpdate — replace a single element on the canvas.
 *
 * The server sends:
 *   {
 *     "type": "element_update",
 *     "selector": "sel-abc12345",
 *     "html": "<section class="section hero effect-y3k9" data-selected-id="sel-abc12345">...</section>"
 *   }
 *
 * We find the component whose root element carries
 * `data-selected-id="sel-abc12345"` and replace it with the new HTML.
 *
 * Safety rules:
 *   - Never call editor.setComponents() as a fallback. It would wipe
 *     the whole canvas and replace it with a single element.
 *   - Refuse to replace if the incoming HTML does not look like HTML
 *     (for example, a plain error message from the LLM).
 *   - Refuse to replace if the incoming HTML does not carry the
 *     marker — otherwise the element would become untraceable on the
 *     next update.
 *   - The marker attribute `data-selected-id` is REMOVED from the new
 *     HTML before inserting it, so the canvas is left clean.
 */
export function applyLLMChatElementUpdate(editor, selector, html) {
    if (!selector) {
        console.warn('[apply] empty selector, skipping');
        return;
    }
    if (!html) {
        console.warn('[apply] empty html, skipping');
        return;
    }

    const ed = editor?.editor;
    if (!ed) {
        console.error('[apply] editor.editor is null');
        return;
    }

    // ---- 1. html must look like html ----
    const trimmed = String(html).trim();
    if (!trimmed.startsWith('<')) {
        console.error(
            `[apply] html does not look like HTML — refusing to replace. ` +
            `First 80 chars: ${JSON.stringify(trimmed.slice(0, 80))}`
        );
        return;
    }

    // ---- 2. html must contain the marker ----
    if (!htmlContainsMarker(html, selector)) {
        console.error(
            `[apply] html does not contain marker "${selector}" — ` +
            `refusing to replace the element`
        );
        return;
    }

    // ---- 3. find the target on the canvas ----
    const target = findElementByMarker(ed, selector);
    if (!target) {
        console.error(
            `[apply] element "${selector}" not found on canvas. ` +
            `Nothing replaced. This usually means the marker was removed ` +
            `from the HTML by the LLM.`
        );
        return;
    }

    console.log(`[apply] replacing element "${selector}"`);

    const parent = target.parent();
    if (!parent) {
        console.error('[apply] target has no parent, cannot replace');
        return;
    }

    const index = target.index();

    // Clean the marker attribute from the incoming HTML.
    const cleanHtml = stripMarker(html, selector);

    try {
        // Remove the old component, insert the new one at the same index.
        parent.components().remove(target);
        parent.components().add(cleanHtml, { at: index });
        console.log(`[apply] element "${selector}" replaced`);
    } catch (e) {
        console.error('[apply] replace failed:', e);
    }
}

// ============================================
// INTERNAL
// ============================================

/**
 * True if the html string contains data-selected-id="<selector>"
 * in any of the supported quote forms.
 */
function htmlContainsMarker(html, selector) {
    if (!html || !selector) return false;

    const escaped = escapeRegex(selector);

    // double or single quotes
    const quoted = new RegExp(
        `data-selected-id\\s*=\\s*["']${escaped}["']`
    );
    if (quoted.test(html)) return true;

    // unquoted (stops at whitespace, > or /)
    const unquoted = new RegExp(
        `data-selected-id\\s*=\\s*${escaped}(?=\\s|>|/)`
    );
    if (unquoted.test(html)) return true;

    return false;
}

/**
 * Find a component whose root element has `data-selected-id="<selector>"`.
 * Walks the whole component tree from the wrapper.
 */
function findElementByMarker(ed, selector) {
    const wrapper = ed.getWrapper?.();
    if (!wrapper) return null;

    const stack = [wrapper];
    while (stack.length) {
        const node = stack.pop();
        const attrs = node.getAttributes?.() || {};
        if (attrs['data-selected-id'] === selector) {
            return node;
        }
        const children = node.components?.();
        if (children && children.length) {
            for (let i = 0; i < children.length; i++) {
                stack.push(children.at(i));
            }
        }
    }
    return null;
}

/**
 * Remove the data-selected-id attribute from the html string.
 *
 * Matches both:
 *   data-selected-id="sel-abc12345"
 *   data-selected-id='sel-abc12345'
 *   data-selected-id=sel-abc12345
 */
function stripMarker(html, selector) {
    if (!html || !selector) return html;

    const escaped = escapeRegex(selector);

    const patterns = [
        // double or single quotes
        new RegExp(
            `\\s+data-selected-id\\s*=\\s*["']${escaped}["']`,
            'g'
        ),
        // unquoted
        new RegExp(
            `\\s+data-selected-id\\s*=\\s*${escaped}(?=\\s|>|/)`,
            'g'
        ),
    ];

    let out = html;
    for (const re of patterns) {
        out = out.replace(re, '');
    }
    return out;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}