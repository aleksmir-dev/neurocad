// neurocad/core/engine/lib/word/llm/chat/debug.js

/**
 * LLMChatDebug — debug dumps for the browser console.
 *
 * Prints environment, blocks, selection, and payload. Does not
 * compute anything — only formats and logs.
 */
export class LLMChatDebug {
    constructor(editor) {
        this.editor = editor;
    }

    // ============================================
    // ENV
    // ============================================

    dumpEnv() {
        console.group('[LLMChat][debug] environment');
        console.log('pageId:', this.editor.pageId);

        const auth = window.coreEngine?.auth;
        console.log('auth object:', auth);
        if (auth?.isSuperadmin) console.log('auth.isSuperadmin():', auth.isSuperadmin());
        if (auth?.getUser) console.log('auth.getUser():', auth.getUser());

        console.log('document.cookie:', document.cookie || '(empty)');
        console.log(
            'cookie names (visible):',
            (document.cookie || '')
                .split(';')
                .map(s => s.trim().split('=')[0])
                .filter(Boolean)
        );

        console.log('sessionStorage keys:', Object.keys(sessionStorage));
        console.log('localStorage keys:', Object.keys(localStorage));

        console.groupEnd();
    }

    // ============================================
    // BLOCKS
    // ============================================

    /**
     * Print the block catalog as a single object — expandable in the
     * console with a click. No tables, no loops.
     */
    dumpBlocks(catalog) {
        console.log(
            '%c[BLOCKS] ' + catalog.length + ' items ready to send:',
            'background:#222;color:#3b82f6;padding:2px 6px;font-weight:bold;border-radius:4px;'
        );
        console.log('[BLOCKS]', catalog);
    }

    // ============================================
    // SELECTION
    // ============================================

    /**
     * Print the current selection in the editor.
     */
    dumpSelection(selection) {
        console.log(
            '%c[SELECTION] current selection:',
            'background:#222;color:#0f0;padding:2px 6px;font-weight:bold;border-radius:4px;'
        );
        console.log('[SELECTION]', selection);
    }

    // ============================================
    // PAYLOAD
    // ============================================

    dumpPayload(payload) {
        const str = JSON.stringify(payload, null, 2);

        console.log(
            '%c[PAYLOAD] SEND TO BACKEND',
            'background:#111;color:#0f0;padding:4px 8px;font-weight:bold;border-radius:4px;'
        );
        console.log(
            '%c[PAYLOAD] type    : ' + payload.type,
            'color:#3b82f6;font-weight:bold;'
        );
        console.log(
            '%c[PAYLOAD] message : ' + JSON.stringify(payload.message),
            'color:#3b82f6;font-weight:bold;'
        );
        console.log(
            '%c[PAYLOAD] catalog : ' + (payload.block_catalog?.length || 0) + ' blocks',
            'color:#3b82f6;font-weight:bold;'
        );
        console.log(
            '%c[PAYLOAD] selection : ' + JSON.stringify(payload.selection),
            'color:#3b82f6;font-weight:bold;'
        );
        console.log(
            '%c[PAYLOAD] size    : ' + str.length + ' chars (' +
                new Blob([str]).size + ' bytes)',
            'color:#3b82f6;font-weight:bold;'
        );
        console.log(
            '%c[PAYLOAD] RAW (JSON):',
            'background:#222;color:#3b82f6;padding:2px 6px;font-weight:bold;'
        );
        console.log(str);
    }
}