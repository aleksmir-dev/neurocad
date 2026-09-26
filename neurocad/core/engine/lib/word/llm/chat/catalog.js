// neurocad/core/engine/lib/word/llm/chat/catalog.js

/**
 * buildLLMChatCatalog — collect the block catalog from GrapesJS.
 *
 * Pure function: editor → [{id, label, category, html}].
 * Knows nothing about WS, UI, or HTTP.
 *
 * NOTE: this catalog is for HTML blocks (elements, layout, ready),
 * NOT for effects. The list of existing effect ids is collected
 * separately in llm/chat/edit.js from EffectBlocks._blocks.
 *
 * Excluded categories
 * -------------------
 * Blocks from the "Разметка" (layout) category — grids, containers,
 * flex-shell — are NOT sent to the backend. The LLM must compose pages
 * from ready-made sections and elements only; it must not use raw
 * layout blocks. This is enforced HERE, at the source, so:
 *   - they never reach the WS payload (less traffic);
 *   - the backend never has to filter them out of the prompt.
 *
 * The backend still keeps its own filter (llm/prompts/plan.py) as a
 * belt-and-suspenders safeguard, in case some other caller builds a
 * catalog without going through this function.
 */

//: Categories that must NOT be sent to the LLM on the planning step.
const EXCLUDED_CATEGORIES = new Set([
    'Разметка',
]);

export function buildLLMChatCatalog(editor) {
    const ed = editor.editor;
    if (!ed) {
        console.warn('[catalog] editor.editor is null');
        return [];
    }

    const catalog = [];
    const blocks = ed.BlockManager.getAll();
    console.log(`[catalog] BlockManager has ${blocks.length} blocks`);

    blocks.forEach((b) => {
        const rawCat = b.get('category');
        let category = 'other';
        if (typeof rawCat === 'string') {
            category = rawCat;
        } else if (rawCat && typeof rawCat === 'object') {
            category = rawCat.id || rawCat.get?.('label') || 'other';
        }

        // ---- Exclude layout blocks from the LLM catalog ----
        if (EXCLUDED_CATEGORIES.has(category)) {
            return;
        }

        const content = b.get('content');
        if (typeof content !== 'string') {
            // Component-type block — skipped
            return;
        }

        const html = content.trim();
        if (!html) return;

        catalog.push({
            id: b.id,
            label: b.get('label') || b.id,
            category,
            html,
        });
    });

    console.log(`[catalog] catalog for LLM: ${catalog.length} blocks ` +
                `(excluded categories: ${[...EXCLUDED_CATEGORIES].join(', ') || '—'})`);

    return catalog;
}