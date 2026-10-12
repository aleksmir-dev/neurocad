# neurocad/core/engine/lib/pages/public/paths.py

"""
Folder-path helpers for the public /pages catalog.

The public catalog is hierarchical, just like the admin one. A
folder page can have children that are themselves folders, and the
URL scheme reflects that:

    /pages                — root (or the folder from the cookie)
    /pages/<id>           — explicit folder by its leaf id
    /pages/<id>/…         — (not used; only one segment is parsed)

The URL carries only the LEAF folder's id. Breadcrumbs, the cookie,
and the internal "current folder" state all need the FULL CHAIN
from the root down to the leaf. This module builds that chain.

Two functions:

  - build_folder_path()   — walk parent_id up from a leaf folder
                            and return [root, …, leaf];
  - load_folder_row()     — load (id, parent_id) for one folder.

Both are read-only and safe to call on any nav; they filter by
nav_id, is_delete, is_active, and card_type="folder".

Why walk parent_id
------------------
The admin schema stores the tree as an adjacency list: each folder
has a parent_id (or NULL at the root). There is no denormalized
"path" column and no materialized path — the tree is small
(personal sites, tens of folders), so a parent-walk per request is
cheap and avoids keeping a redundant path in sync on every move.

Defensive stops
---------------
The walk stops on:

  - a missing parent (folder deleted between requests);
  - a nav_id mismatch (folder from another nav — should not happen
    because get_folder_by_id already validates the leaf, but we
    guard anyway);
  - a cycle (folder whose parent chain loops back — data
    corruption, but we must not spin forever).

If the chain is broken above the leaf, the function returns the
longest valid suffix ending at the leaf. In the worst case (leaf's
parent is missing) the result is [leaf] — the leaf itself, with no
ancestors. The caller renders it as a one-level path; the leaf is
still the current folder, the visitor just cannot jump above it.
Never raises, never returns a partially-wrong chain that does not
end at the leaf.

Namespace: CoreEngineLibPagesPublicPaths*
"""

from typing import List, Optional

from sqlalchemy import select

from neurocad.utils.sqlite import get_db_sqlite

from neurocad.core.models.base import Page

from .schema import CARD_TYPE_FOLDER


# ============================================
# PUBLIC API
# ============================================

async def build_folder_path(
    nav_id: int,
    leaf_folder_id: int,
) -> List[int]:
    """
    Walk the parent_id chain from a leaf folder up to the root,
    then reverse it → [root, ..., leaf].

    Used by /pages/<folder_id>: the URL only has the leaf id, but
    breadcrumbs and the cookie need the full chain.

    Stops at a missing parent, a cycle, or a folder whose nav_id
    does not match `nav_id` (defensive — should not happen if the
    leaf was validated by get_folder_by_id).

    If the chain is broken above the leaf, returns the longest
    valid suffix ending at the leaf (i.e. what could be walked).
    In the worst case (leaf's parent is missing) returns [leaf].
    """
    chain: List[int] = []
    current: Optional[int] = leaf_folder_id
    seen: set = set()

    while current is not None and current not in seen:
        seen.add(current)
        row = await load_folder_row(nav_id, current)
        if row is None:
            break
        chain.append(current)
        current = row[1]  # parent_id

    chain.reverse()
    return chain


async def load_folder_row(
    nav_id: int,
    folder_id: int,
):
    """
    Load (id, parent_id) for a folder, or None.

    Only returns rows that are folders of the given nav and are
    not deleted / not disabled. Kept small and separate so
    build_folder_path stays readable.

    Returns a SQLAlchemy Row of (id, parent_id) — callers index
    it positionally ([0] = id, [1] = parent_id). It is not a
    full ORM object, because nothing downstream needs the rest
    of the row: only the parent link matters for the walk.

    Returns None when:
      - the id does not exist;
      - it is a regular page, not a folder;
      - it is soft-deleted or disabled;
      - it belongs to a different nav.
    """
    async for session in get_db_sqlite():
        stmt = select(Page.id, Page.parent_id).where(
            Page.id == folder_id,
            Page.nav_id == nav_id,
            Page.is_delete == 0,
            Page.is_active == 1,
            Page.card_type == CARD_TYPE_FOLDER,
        )
        result = await session.execute(stmt)
        return result.one_or_none()
    return None