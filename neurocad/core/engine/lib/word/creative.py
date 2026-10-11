# neurocad/core/engine/lib/word/creative.py

"""
Creative-block patching for saved page HTML.

Two responsibilities, same intent:

  1. On SAVE (`save_content`): before the incoming HTML is
     written to the DB, rewrite data-creative-id on every
     <section data-block="core-creative"> to the page's current
     active creative (placements.date_end IS NULL). This fixes
     the HTML that lands in the DB for FUTURE saves.

  2. On READ (`_page_to_dict`, `get_history_item`): rewrite
     data-creative-id again, right before returning the page to
     the frontend. This fixes pages saved BEFORE the save-time
     patch existed — no re-save required. Also covers the case
     where the page's creative was changed via the page
     properties (PUT /pages/item) — a route that does NOT
     re-save the HTML, so the saved data-creative-id can be
     stale.

Why both:
    - Save-time patch keeps the DB clean long-term.
    - Read-time patch is the safety net for every path that
      bypasses save_content, and for already-saved pages.

Why the attribute is rewritten (not just filled when empty)
-----------------------------------------------------------
Earlier versions only filled data-creative-id when it was empty.
That was wrong: when the user changes the creative on the page
via the properties form, the page is saved through
PUT /pages/item — a route that does NOT touch the HTML. The old
data-creative-id stays in the DB (e.g. "2"), while the new active
placement is "3". block.js on the frontend trusts the attribute,
fetches /creatives/public/item/2, and shows the OLD creative.

The SINGLE source of truth for "which creative is on this page"
is the active placement. So we rewrite the attribute to match it
on every save and every read — even when the attribute is
already set (to a different value).

Blocks with an explicit per-block value are NOT supported in
this scheme: a page has ONE active creative, so every
core-creative section on that page is rewritten to the same id.

This module is imported by word/service.py. It is intentionally
free of DB-session management: callers pass the session in, and
this module only provides pure functions on strings plus one
async lookup helper.

Namespace: CoreEngineLibWordCreative*
"""

import re
from typing import Optional

from sqlalchemy import select

from ....models.placement import Placement


# ============================================
# REGEX PATTERNS
# ============================================
#
# Matches ONLY the opening <section ...> tag that carries
# data-block="core-creative". The rest of the HTML (content,
# children, whitespace) is left untouched. `re.DOTALL` is on
# for safety — attributes may wrap across lines when GrapesJS
# pretty-prints.
_CREATIVE_SECTION_OPEN_RE = re.compile(
    r'<section\s+([^>]*?data-block="core-creative"[^>]*?)>',
    re.IGNORECASE | re.DOTALL,
)

# Matches the current value of data-creative-id inside a section's
# attribute string. Used to decide whether a rewrite is needed.
_CREATIVE_ID_ATTR_RE = re.compile(
    r'data-creative-id="([^"]*)"',
    re.IGNORECASE,
)


# ============================================
# PUBLIC API
# ============================================

async def load_active_creative_id(
    session,
    page_id: int,
) -> Optional[int]:
    """
    Return the id of the creative currently attached to the page,
    or None.

    A creative is "attached" when there is an active placement for
    the page — a row in `placements` with page_id = <page_id> and
    date_end IS NULL. Only one such row can exist at a time (the
    sync logic in pages/service.py enforces this by closing the
    previous row before opening a new one).
    """
    stmt = (
        select(Placement.creative_id)
        .where(
            Placement.page_id == page_id,
            Placement.date_end.is_(None),
        )
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


def patch_creative_id_in_html(
    html: str,
    creative_id: Optional[int],
) -> str:
    """
    Rewrite data-creative-id on every core-creative section to the
    given creative_id (or to "" when None).

    This is a PURE function — synchronous, no DB. Used on both save
    and read:

      - On save: the DB is updated with the rewritten HTML, so
        future reads return the fresh attribute.
      - On read: the frontend gets the fresh attribute even for
        pages whose HTML was never re-saved.

    Rules:
      - data-creative-id present — rewritten to id_str.
      - data-creative-id missing — added.
      - creative_id is None — data-creative-id set to "".
        block.js treats "" as "no creative" and hides the block.
    """
    if not html or 'core-creative' not in html:
        return html

    id_str = str(creative_id) if creative_id is not None else ""

    def _replace(match: re.Match) -> str:
        attrs = match.group(1)
        id_match = _CREATIVE_ID_ATTR_RE.search(attrs)

        if id_match:
            current = (id_match.group(1) or '').strip()
            if current == id_str:
                # Already correct — keep as-is.
                return match.group(0)

            # Different value — replace it.
            new_attrs = (
                attrs[:id_match.start(1)]
                + id_str
                + attrs[id_match.end(1):]
            )
            return f'<section {new_attrs}>'

        # Attribute not present at all — add it.
        return f'<section {attrs.rstrip()} data-creative-id="{id_str}">'

    return _CREATIVE_SECTION_OPEN_RE.sub(_replace, html)


async def patch_creative_blocks(
    html: str,
    page_id: int,
    session,
) -> str:
    """
    Async convenience wrapper: look up the active creative_id for
    the page and rewrite data-creative-id on every section.

    Used by save_content and by get_history_item / _page_to_dict.
    """
    if not html or 'core-creative' not in html:
        return html

    creative_id = await load_active_creative_id(session, page_id)
    return patch_creative_id_in_html(html, creative_id)