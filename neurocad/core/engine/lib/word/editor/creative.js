// neurocad/core/engine/lib/word/editor/creative.js

/**
 * Creative block patcher.
 *
 * Fills the "Creative" block (core-creative, see blocks/ready.js)
 * with data of the creative attached to the page (select "Креатив"
 * in page properties → pageData.creative_id).
 *
 * TWO EVENTS, TWO TASKS
 * ---------------------
 * 1. canvas:drop — the user has just dragged the block from the
 *    panel. We set data-creative-id on the block root and fill it
 *    with data. This is UX: the editor immediately sees what the
 *    block looks like.
 *
 * 2. update — the GrapesJS model changed. We refresh every existing
 *    core-creative block to match pageData.creative_id.
 *
 *    WHY 'update', NOT 'load' / 'project:load':
 *      In GrapesJS 0.21.13, loadProjectData emits only
 *      `change:changesCount` and `update` — NOT `load` and NOT
 *      `project:load` (verified experimentally). DataLoader uses
 *      loadProjectData (see dataloader.js → loadInitial), so the
 *      only event that reliably fires after a project load is
 *      `update`. We subscribe to it and schedule the refresh on
 *      the next animation frame.
 *
 *    WHY requestAnimationFrame, NOT setTimeout:
 *      `update` fires synchronously during loadProjectData — the
 *      model is ready, but the iframe DOM may still be mid-render.
 *      requestAnimationFrame defers to "after the browser paints
 *      the current frame" — a semantically correct boundary, not
 *      a magic number. Multiple `update` events arriving in the
 *      same frame collapse into one refresh via the boolean flag.
 *
 *    WHY THE creative-applied-id MARKER:
 *      applyCreative() calls comp.set('content', ...) — which
 *      itself emits `update`. Without a guard, the cycle would
 *      be:
 *          update → rAF → refresh → applyCreative → set() → update → ...
 *      We store the applied id on the block root and skip blocks
 *      whose id already matches. The first pass writes the id and
 *      applies data; subsequent updates with the same id do
 *      nothing — no fetch, no set(), no cycle.
 *
 * WHY setText DOES NOT CALL components().reset()
 * ----------------------------------------------
 * The text fields (.creative-block__text, .creative-block__btn-text,
 * .creative-block__brand, .creative-block__inn, .creative-block__erid)
 * are <p>/<span> components with data-gjs-type="text". In GrapesJS
 * 0.21.x their visible text lives in the component's `content`
 * property, NOT in child components.
 *
 * An earlier version called children.reset() before set('content', ...)
 * intending to clear a stale textnode. That was wrong: reset() on an
 * empty collection still triggers a view rebuild on the parent, and
 * after that rebuild set('content', ...) updates the model but does
 * NOT reach the iframe DOM. The visible symptom was exactly what we
 * saw: block fields empty, but the link href (set via addAttributes,
 * a separate code path) correctly updated.
 *
 * comp.set('content', ...) replaces the content on its own — no
 * pre-clearing needed. So setText does exactly that and nothing else.
 *
 * ON THE PUBLIC PAGE — A DIFFERENT SCRIPT
 * ---------------------------------------
 * editor/creative.js works only inside the editor. On a public page
 * the block is refreshed by creatives/public/block.js — it reads
 * data-creative-id and fetches GET /creatives/public/item/{id}.
 *
 * Both use the SAME block structure:
 *   <section data-block="core-creative" data-creative-id="5">
 *     <div data-creative-block>...</div>
 *   </section>
 *
 * WHY pageData.creative_id IS THE SINGLE SOURCE OF TRUTH
 * ------------------------------------------------------
 * The data-creative-id attribute stored in the saved HTML is a
 * denormalized copy of "which creative is on this page". It is
 * only updated by word.service.save_content — and changing the
 * creative via page properties (PUT /pages/item) does NOT
 * re-save the HTML. So the attribute in the loaded HTML can be
 * stale: e.g. "2", while the page's active placement now points
 * to "1".
 *
 * The backend patches the attribute on save and on read (see
 * word/creative.py), and the public page patches it at render
 * time (see pages/public/route.py). Here in the editor we do the
 * same: we ALWAYS rewrite data-creative-id to match
 * pageData.creative_id — even when the attribute is already set
 * to a DIFFERENT value.
 *
 * The rule is uniform across all three layers:
 *     the active placement is the ONLY source of truth.
 *
 * Loaded dynamically with ?v= — see editor.js → _init().
 * No static imports.
 */

export function bindCreative(editorInstance) {
    if (!editorInstance || !editorInstance.editor) return;

    const gjs = editorInstance.editor;

    // ---------------------------------------------------------
    // 1. canvas:drop — the block has just been dropped.
    // ---------------------------------------------------------
    gjs.on('canvas:drop', (dataTransfer, model) => {
        try {
            if (!dataTransfer) return;
            if (!model) return;

            // Find the NESTED data-creative-block marker.
            const targets = model.find('[data-creative-block]');
            if (!targets || !targets.length) return;

            const root = targets[0];

            const creativeId = resolvePageCreativeId(editorInstance);

            // ---------------------------------------------------
            // Set data-creative-id on the ROOT <section> so the
            // id ends up in the saved HTML and is available to
            // block.js on the public page / Word / history.
            //
            // Two passes, both are cheap and idempotent:
            //   1. root.parent() — natural parent.
            //   2. explicit search from the wrapper.
            // ---------------------------------------------------
            if (creativeId != null) {
                const idStr = String(creativeId);

                // ----- Pass 1: root.parent() -----
                let sectionComp = typeof root.parent === 'function'
                    ? root.parent()
                    : null;

                if (sectionComp) {
                    const parentAttrs = typeof sectionComp.getAttributes === 'function'
                        ? sectionComp.getAttributes()
                        : {};
                    if (parentAttrs['data-block'] !== 'core-creative') {
                        sectionComp = null;
                    }
                }

                if (sectionComp && typeof sectionComp.addAttributes === 'function') {
                    sectionComp.addAttributes({ 'data-creative-id': idStr });
                }

                // ----- Pass 2: explicit search from wrapper -----
                const wrapper = typeof gjs.getWrapper === 'function'
                    ? gjs.getWrapper()
                    : null;

                if (wrapper) {
                    const sections = wrapper.find('[data-block="core-creative"]');
                    if (sections && sections.length) {
                        sections.forEach((s) => {
                            const inner = typeof s.find === 'function'
                                ? s.find('[data-creative-block]')
                                : null;
                            if (!inner || !inner.length) return;
                            if (inner[0] !== root) return;

                            const attrs = typeof s.getAttributes === 'function'
                                ? s.getAttributes()
                                : {};
                            if (String(attrs['data-creative-id'] || '') !== idStr) {
                                if (typeof s.addAttributes === 'function') {
                                    s.addAttributes({ 'data-creative-id': idStr });
                                }
                            }
                        });
                    }
                }
            } else {
                // No creative attached — set data-creative-id="".
                let sectionComp = typeof root.parent === 'function'
                    ? root.parent()
                    : null;

                if (sectionComp) {
                    const parentAttrs = typeof sectionComp.getAttributes === 'function'
                        ? sectionComp.getAttributes()
                        : {};
                    if (parentAttrs['data-block'] !== 'core-creative') {
                        sectionComp = null;
                    }
                }

                if (sectionComp && typeof sectionComp.addAttributes === 'function') {
                    sectionComp.addAttributes({ 'data-creative-id': '' });
                }

                const wrapper = typeof gjs.getWrapper === 'function'
                    ? gjs.getWrapper()
                    : null;

                if (wrapper) {
                    const sections = wrapper.find('[data-block="core-creative"]');
                    if (sections && sections.length) {
                        sections.forEach((s) => {
                            const inner = typeof s.find === 'function'
                                ? s.find('[data-creative-block]')
                                : null;
                            if (!inner || !inner.length) return;
                            if (inner[0] !== root) return;

                            const attrs = typeof s.getAttributes === 'function'
                                ? s.getAttributes()
                                : {};
                            if (String(attrs['data-creative-id'] || '') !== '') {
                                if (typeof s.addAttributes === 'function') {
                                    s.addAttributes({ 'data-creative-id': '' });
                                }
                            }
                        });
                    }
                }
            }

            // Give GrapesJS one frame to render the iframe, then
            // fill the block with the creative data. rAF, not
            // setTimeout — semantics, not a magic delay.
            requestAnimationFrame(() => {
                applyCreativeById(editorInstance, root, creativeId);
            });
        } catch (e) {
            console.warn('[Creative] drop handler failed:', e);
        }
    });

    // ---------------------------------------------------------
    // 2. update — the GrapesJS model changed. Schedule a refresh
    //    of every core-creative block on the next animation frame.
    // ---------------------------------------------------------
    let _refreshScheduled = false;

    gjs.on('update', () => {
        if (_refreshScheduled) return;
        _refreshScheduled = true;

        requestAnimationFrame(() => {
            _refreshScheduled = false;
            try {
                refreshAllCreativeBlocks(editorInstance);
            } catch (e) {
                console.warn('[Creative] refresh failed:', e);
            }
        });
    });

    console.log('[Creative] bound (canvas:drop + update)');
}


/**
 * Find the creative_id attached to the current page.
 *
 * Source — editorInstance.pageData.creative_id.
 * Returns a number, a string id, or null.
 */
function resolvePageCreativeId(editorInstance) {
    const pageData = editorInstance?.pageData;
    if (pageData && pageData.creative_id != null) {
        return pageData.creative_id;
    }
    return null;
}


/**
 * Refresh all existing core-creative blocks on the page.
 *
 * Called from the `update` handler (on the next animation frame).
 * For each core-creative section:
 *   - reads data-creative-id from attributes;
 *   - REWRITES it to the current pageData.creative_id — even
 *     when the attribute is already set to a DIFFERENT value;
 *   - skips blocks whose applied id already matches — this is the
 *     cycle guard (see module docstring, "creative-applied-id");
 *   - otherwise fetches the creative data and applies it;
 *   - if the creative is not found / is turned off — the block
 *     stays empty in the editor (the public script will hide it).
 *
 * @param {Object} editorInstance — Editor
 */
function refreshAllCreativeBlocks(editorInstance) {
    if (!editorInstance || !editorInstance.editor) return;

    const gjs = editorInstance.editor;
    const wrapper = typeof gjs.getWrapper === 'function'
        ? gjs.getWrapper()
        : null;
    if (!wrapper) return;

    // Find all root core-creative sections.
    const sections = wrapper.find('[data-block="core-creative"]');
    if (!sections || !sections.length) return;

    const pageCreativeId = resolvePageCreativeId(editorInstance);

    sections.forEach((section) => {
        // Find the nested marker (structure:
        // <section> → <div data-creative-block>).
        const inner = section.find('[data-creative-block]');
        if (!inner || !inner.length) return;

        const root = inner[0];

        // ===== SINGLE SOURCE OF TRUTH =====
        // The active placement is the ONLY source of truth for
        // "which creative is on this page". We do NOT trust
        // data-creative-id from the loaded HTML — it may be stale.
        // See module docstring for the full rationale.
        const id = pageCreativeId;
        const newIdStr = id != null && id !== '' ? String(id) : '';

        // ----- Rewrite the attribute to match pageCreativeId -----
        const attrs = typeof section.getAttributes === 'function'
            ? section.getAttributes()
            : {};
        const currentIdStr = String(attrs['data-creative-id'] ?? '');

        if (currentIdStr !== newIdStr) {
            if (typeof section.addAttributes === 'function') {
                section.addAttributes({ 'data-creative-id': newIdStr });
            }
        }

        if (newIdStr === '') {
            // No creative — clear the block and its applied marker.
            clearCreative(root);
            return;
        }

        // ===== CYCLE GUARD =====
        // If this exact id has already been applied to this block
        // (by a previous refresh or by the drop handler), do
        // nothing. Otherwise applyCreative() → comp.set() → 'update'
        // → rAF → refresh → ... would loop forever.
        //
        // The marker lives on the component itself (a GrapesJS
        // property), NOT in the DOM and NOT in the saved HTML.
        const applied = root.get('creative-applied-id');
        if (applied != null && String(applied) === newIdStr) {
            return;
        }

        // Fetch and apply.
        applyCreativeById(editorInstance, root, id);
    });
}


/**
 * Fetch creative data by id and apply it to the block.
 *
 * Fetches the list of creatives via /creatives/list, finds the
 * one by id, calls applyCreative.
 *
 * If id is empty — exit silently (the block stays empty).
 * If the creative is not found in the list — a warning, the
 * block stays empty.
 *
 * @param {Object} editorInstance — Editor
 * @param {Object} rootComponent  — GrapesJS component of the block
 *                                  (<div data-creative-block>)
 * @param {number|string|null} creativeId
 */
async function applyCreativeById(editorInstance, rootComponent, creativeId) {
    if (creativeId == null || creativeId === '') {
        console.log(
            '[Creative] no creative attached to the page — ' +
            'the block stays empty'
        );
        return;
    }

    let creatives;

    try {
        const json = await window.coreEngine.fetchJson(
            '/core/engine/lib/creatives/list'
        );
        creatives = json?.data || [];
    } catch (e) {
        console.error('[Creative] list load failed:', e);
        return;
    }

    const chosen = creatives.find(
        (c) => String(c.id) === String(creativeId)
    );

    if (!chosen) {
        console.warn(
            `[Creative] creative id=${creativeId} not found in the list ` +
            `— the block stays empty`
        );
        return;
    }

    applyCreative(rootComponent, chosen);
}


/**
 * Apply creative data to the block — through the GrapesJS MODEL.
 *
 * Finds the required components by class (fixed in ready.js — do
 * not rename!) and changes their content via comp.set('content', ...).
 * The link href is updated via addAttributes — a separate code path
 * that does not touch component children at all.
 *
 * The DOM updates itself: GrapesJS-View re-renders the iframe
 * after the model changes.
 *
 * At the end, we set `creative-applied-id` on the root — the
 * cycle guard used by refreshAllCreativeBlocks (see module
 * docstring).
 *
 * If a creative field is empty — the corresponding node is hidden
 * (style.display = 'none') so we do not show dashes.
 *
 * NOTE: setText does NOT call components().reset(). On text
 * components (data-gjs-type="text") the content lives in the
 * `content` property; comp.set('content', ...) replaces it on its
 * own. An earlier version called reset() to clear a stale textnode
 * — that triggered a view rebuild and broke the following
 * set('content', ...), leaving the field visibly empty. See module
 * docstring, "WHY setText DOES NOT CALL components().reset()".
 *
 * @param {Object} rootComponent — GrapesJS component of the block
 *                                  (<div data-creative-block>)
 * @param {Object} c             — creative object from the API
 */
function applyCreative(rootComponent, c) {
    if (!rootComponent) {
        console.warn('[Creative] component is null');
        return;
    }

    // ---------------------------------------------------------
    // 1. Text fields — through the MODEL, via set('content', ...).
    // ---------------------------------------------------------
    const setText = (selector, value) => {
        const comps = rootComponent.find(selector);
        if (!comps || !comps.length) return;

        const comp = comps[0];

        const hasValue =
            value !== null && value !== undefined && value !== '';

        if (hasValue) {
            comp.set('content', String(value));
            const style = comp.getStyle() || {};
            delete style.display;
            comp.setStyle(style);
        } else {
            comp.set('content', '');
            comp.setStyle({ ...(comp.getStyle() || {}), display: 'none' });
        }
    };

    setText('.creative-block__text',     c.text);
    setText('.creative-block__btn-text', c.button_text || 'Подробнее');
    setText('.creative-block__brand',    c.brand);
    setText('.creative-block__inn',      c.inn);
    setText('.creative-block__erid',     c.erid);

    // ---------------------------------------------------------
    // 2. Link — through the MODEL (the href attribute).
    // ---------------------------------------------------------
    const links = rootComponent.find('.creative-block__link');
    if (links && links.length) {
        const linkComp = links[0];

        if (c.target_url) {
            linkComp.addAttributes({ href: c.target_url });
        } else {
            linkComp.addAttributes({ href: '#' });
        }

        const attrs = linkComp.getAttributes() || {};
        if (attrs.target !== '_blank') {
            linkComp.addAttributes({ target: '_blank' });
        }
        if (!attrs.rel) {
            linkComp.addAttributes({
                rel: 'noopener noreferrer nofollow sponsored',
            });
        }
    }

    // ---------------------------------------------------------
    // 3. Cycle guard marker — remember what was applied.
    //
    // Not saved into HTML, not part of the model's attributes —
    // just a property on the component. refreshAllCreativeBlocks
    // reads it and skips the block if the id already matches.
    // ---------------------------------------------------------
    rootComponent.set('creative-applied-id', String(c.id));

    console.log('[Creative] applied:', {
        id: c.id,
        name: c.name,
        href: c.target_url,
    });
}


/**
 * Clear a creative block — remove any previously applied data.
 *
 * Called when the page has no active creative
 * (pageData.creative_id is null), but the block still holds
 * content from an earlier render. Without this, the editor would
 * show stale data even after the creative was unbound.
 *
 * Also resets the cycle guard marker — so a subsequent bind+apply
 * of the same id is not skipped.
 *
 * NOTE: like setText, emptyText does NOT call components().reset().
 * See module docstring for the rationale.
 *
 * @param {Object} rootComponent — GrapesJS component of the block
 *                                  (<div data-creative-block>)
 */
function clearCreative(rootComponent) {
    if (!rootComponent) return;

    const emptyText = (selector) => {
        const comps = rootComponent.find(selector);
        if (!comps || !comps.length) return;
        const comp = comps[0];
        comp.set('content', '');
        comp.setStyle({ ...(comp.getStyle() || {}), display: 'none' });
    };

    emptyText('.creative-block__text');
    emptyText('.creative-block__btn-text');
    emptyText('.creative-block__brand');
    emptyText('.creative-block__inn');
    emptyText('.creative-block__erid');

    const links = rootComponent.find('.creative-block__link');
    if (links && links.length) {
        links[0].addAttributes({ href: '#' });
    }

    // Reset the cycle guard so a later bind+apply is not skipped.
    rootComponent.set('creative-applied-id', '');
}