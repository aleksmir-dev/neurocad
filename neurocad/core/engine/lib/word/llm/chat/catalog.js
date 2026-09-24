// neurocad/core/engine/lib/word/llm/chat/catalog.js

/**
 * buildLLMChatCatalog — collect the block catalog from GrapesJS.
 *
 * Pure function: editor → [{id, label, category, html}].
 * Knows nothing about WS, UI, or HTTP.
 */
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

    return catalog;
}