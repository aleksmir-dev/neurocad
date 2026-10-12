# neurocad/core/engine/lib/pages/public/cookies.py

"""
Cookie helpers for the public /pages catalog.

The public catalog is hierarchical. The current folder is resolved
from one of three sources (in order of precedence):

  1. the URL segment: /pages/<id> — explicit, source of truth;
  2. the query flag `?root=1` — explicit "show the root";
  3. the cookie `nc_folder_path`: "12.45" — fallback when neither
     of the above is present.

This module owns the cookie side of that scheme — reading the
cookie, serializing the path back into it, and clearing it when
the visitor is at the root.

Why a cookie at all
-------------------
`/pages` alone is ambiguous: without an explicit folder in the
URL, we want the visitor to land where they last were. The cookie
is what remembers "where they last were" between visits. It is
NOT a session token and carries no secret — just a dot-separated
list of folder ids from the root to the current folder.

Why not HttpOnly
----------------
The public JS reads the cookie to mirror the value into
localStorage (see pages-public.js). It carries no secret, so
exposing it to JS is safe.

Cookie validation
-----------------
`parse_folder_cookie` does a structural parse only — it splits on
dots and tries to int() each segment. Whether the ids are valid
folders of the current nav, nested correctly, etc., is the
service's job (`CoreEngineLibPagesPublicService.resolve_folder_path`).
A structurally broken cookie yields an empty list here, and the
service then falls back to the root.

Namespace: CoreEngineLibPagesPublicCookies*
"""

from typing import List, Optional

from fastapi.responses import HTMLResponse


# ============================================
# CONSTANTS
# ============================================

#: Cookie that carries the current folder path.
#:
#: Value: dot-separated folder ids, root → current, e.g. "12.45".
#: Empty / missing → the root of the catalog.
#:
#: Not HttpOnly on purpose: the public JS reads it to mirror the
#: value into localStorage (see pages-public.js). It carries no
#: secret — just a folder path — so exposing it to JS is safe.
FOLDER_COOKIE = "nc_folder_path"

#: One year. A folder path is stable UX state, not a session token.
FOLDER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


# ============================================
# PUBLIC API
# ============================================

def parse_folder_cookie(raw: Optional[str]) -> List[int]:
    """
    Parse the cookie value into a list of folder ids.

    "12.45"   → [12, 45]
    "" / None → []
    "12.abc"  → []   (any bad segment invalidates the whole path —
                      we do not try to salvage a prefix here; the
                      service's resolve_folder_path does the
                      authoritative validation anyway)

    Structural parse only. Does not touch the DB. The caller is
    expected to pass the result through
    CoreEngineLibPagesPublicService.resolve_folder_path, which
    validates each id against the actual folder tree.
    """
    if not raw:
        return []
    result: List[int] = []
    for part in raw.split("."):
        part = part.strip()
        if not part:
            return []
        try:
            result.append(int(part))
        except ValueError:
            return []
    return result


def serialize_folder_cookie(path_ids: List[int]) -> str:
    """
    [12, 45] → '12.45'. [] → '' (cookie is cleared).
    """
    return ".".join(str(i) for i in path_ids)


def set_folder_cookie(
    response: HTMLResponse,
    path_ids: List[int],
) -> None:
    """
    Write the current folder path into the response cookie.

    Called on every /pages render — so the next bare /pages visit
    opens the same folder. If `path_ids` is empty the cookie is
    cleared (Max-Age=0) rather than left with a stale value.

    A non-empty path is written with:
      - path="/"     — applies to the whole site;
      - samesite="lax" — a folder path is not a security-sensitive
                         value, and "lax" keeps the cookie coming
                         along on top-level navigations from other
                         sites (e.g. clicking a link to /pages from
                         a search engine result) while still
                         blocking it on cross-site POSTs.

    The cookie is NOT HttpOnly on purpose — see the module
    docstring for the rationale.
    """
    value = serialize_folder_cookie(path_ids)
    if value:
        response.set_cookie(
            key=FOLDER_COOKIE,
            value=value,
            max_age=FOLDER_COOKIE_MAX_AGE,
            path="/",
            samesite="lax",
        )
    else:
        # Empty path = root. Clear the cookie so a stale value
        # does not resurrect an old folder on the next visit.
        response.delete_cookie(key=FOLDER_COOKIE, path="/")