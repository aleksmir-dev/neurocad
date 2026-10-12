# neurocad/core/engine/lib/word/creative.py

"""
Creative-block patching for saved page HTML.

Two responsibilities, same intent:

  1. On SAVE (`save_content`): before the incoming HTML is
     written to the DB, rewrite data-creative-id on every
     <section data-block="core-creative"> to the page's current
     active creative (placements.date_end IS NULL). This fixes
     the HTML that lands in the DB for FUTURE saves.

  2. On READ (`_page_to_dict`, `get_history_item`, and the
     public route): rewrite data-creative-id again, right before
     returning the page to the frontend. This fixes pages saved
     BEFORE the save-time patch existed — no re-save required.
     Also covers the case where the page's creative was changed
     via the page properties (PUT /pages/item) — a route that
     does NOT re-save the HTML, so the saved data-creative-id
     can be stale.

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

data-placement-id
-----------------
Placement stats (PlacementStat) are keyed by placement_id, not
by creative_id. The public tracking script
(creatives/public/block.js) needs to know the placement id to
POST a hit to /creatives/hit. That id is not stored in the saved
HTML — it depends on the page's CURRENT active placement, which
can change independently of the HTML.

So we patch a SECOND attribute on the same <section>:
data-placement-id="N". Same rules as data-creative-id:
rewrite on save, rewrite on read, "" when there is no active
placement.

Both attributes come from the SAME row in `placements` — the
active one for the page. They are patched by separate helpers
but in one pass per render, so they cannot diverge (e.g.
creative from one row, placement from another).

This module is imported by word/service.py and by
pages/public/route.py. It is intentionally free of DB-session
management: callers pass the session in, and this module only
provides pure functions on strings plus async lookup helpers.

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

# Matches the current value of data-placement-id inside a section's
# attribute string. Same shape as the creative-id regex — the two
# attributes are siblings on the same <section>.
_PLACEMENT_ID_ATTR_RE = re.compile(
    r'data-placement-id="([^"]*)"',
    re.IGNORECASE,
)


# ============================================
# PUBLIC API — lookup helpers
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


async def load_active_placement_id(
    session,
    page_id: int,
) -> Optional[int]:
    """
    Return the id of the active placement for the page, or None.

    The active placement is the row in `placements` with
    page_id = <page_id> and date_end IS NULL — the same row
    load_active_creative_id() reads. A placement carries both
    the creative and the placement id.

    The placement id is what the public tracking script needs to
    POST a hit to /creatives/hit: PlacementStat is keyed by
    placement_id, not by creative_id.

    Kept as a separate helper (rather than returning a tuple from
    load_active_creative_id) because some callers only need the
    creative id (save_content) while others need both (public
    route). Two small functions are clearer than one function with
    a mode flag.
    """
    stmt = (
        select(Placement.id)
        .where(
            Placement.page_id == page_id,
            Placement.date_end.is_(None),
        )
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


# ============================================
# PUBLIC API — pure HTML patchers
# ============================================

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
    return _patch_attr_in_html(
        html,
        attr='data-creative-id',
        attr_re=_CREATIVE_ID_ATTR_RE,
        value=creative_id,
    )


def patch_placement_id_in_html(
    html: str,
    placement_id: Optional[int],
) -> str:
    """
    Rewrite data-placement-id on every core-creative section to
    the given placement_id (or to "" when None).

    Same mechanics as patch_creative_id_in_html — same regex, same
    insert/replace rules, same "" for None. The two attributes
    always travel together (both come from the active placement
    row), so a page rendered by the public route carries both ids:
    the creative id for content, the placement id for hit
    tracking.

    When placement_id is None (no active placement), the attribute
    becomes "". The tracking script treats "" as "no placement to
    count" and skips the POST.
    """
    return _patch_attr_in_html(
        html,
        attr='data-placement-id',
        attr_re=_PLACEMENT_ID_ATTR_RE,
        value=placement_id,
    )


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


async def patch_placement_blocks(
    html: str,
    page_id: int,
    session,
) -> str:
    """
    Async convenience wrapper: look up the active placement_id for
    the page and rewrite data-placement-id on every section.

    Same shape as patch_creative_blocks — the tracking counterpart.
    Callers that render a public page (pages/public/route.py) call
    BOTH, so each core-creative section carries data-creative-id
    AND data-placement-id from the same active placement row.
    """
    if not html or 'core-creative' not in html:
        return html

    placement_id = await load_active_placement_id(session, page_id)
    return patch_placement_id_in_html(html, placement_id)


# ============================================
# INTERNAL — shared attribute patcher
# ============================================

def _patch_attr_in_html(
    html: str,
    attr: str,
    attr_re: re.Pattern,
    value: Optional[int],
) -> str:
    """
    Rewrite one attribute on every core-creative <section>.

    Shared implementation for data-creative-id and
    data-placement-id. Both attributes live on the same opening
    tag and follow identical rules:

      - attribute present, different value → replace;
      - attribute present, same value → leave the tag as-is;
      - attribute missing → append it before the closing '>'.

    `value` is None → the attribute is set to "" (block.js treats
    "" the same as "no value" for both attributes).

    `attr` is passed separately from `attr_re` because the two
    are not derivable from each other without ambiguity (the
    attribute name is `data-creative-id`, the regex is
    `data-creative-id="..."`). Keeping them explicit makes the
    two public wrappers read like a table of what they patch.
    """
    if not html or 'core-creative' not in html:
        return html

    id_str = str(value) if value is not None else ""

    def _replace(match: re.Match) -> str:
        attrs = match.group(1)
        id_match = attr_re.search(attrs)

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
        return f'<section {attrs.rstrip()} {attr}="{id_str}">'

    return _CREATIVE_SECTION_OPEN_RE.sub(_replace, html)