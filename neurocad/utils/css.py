# neurocad/utils/css.py

"""
CSS utilities.

Generic helpers for deriving cached CSS files from DB-stored CSS:

  - css_hash(css)              — short stable hash for ?v= cache-busting
  - ensure_css_file(...)       — write CSS to a file (atomic), return URL
  - split_style_from_html(...) — extract legacy <style> blocks

Where the files live and what URL they map to is NOT decided here.
The caller (the module that owns the CSS) passes `directory` and
`url_prefix` explicitly — so each module keeps its own namespace,
and this utility stays module-agnostic.

Legacy helper split_style_from_html() is used for pages saved before
CSS was split into a separate field (CSS embedded in HTML as <style>).
"""

import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import Optional, Tuple, Union


# Legacy <style> extraction.
_STYLE_RE = re.compile(r"<style[^>]*>([\s\S]*?)</style>", re.IGNORECASE)


def css_hash(css: Optional[str]) -> str:
    """
    Short stable hash of CSS content.
    Returns '' for empty CSS — caller must handle.

    Used as ?v= in <link>, NOT stored in DB.
    """
    if not css or not css.strip():
        return ""
    return hashlib.sha256(css.encode("utf-8")).hexdigest()[:8]


def ensure_css_file(
    page_id: int,
    css: Optional[str],
    directory: Union[str, Path],
    url_prefix: str,
) -> Optional[str]:
    """
    Write <directory>/<page_id>.css from css (if not already present
    with the same content), return "<url_prefix>/<page_id>.css?v=<hash>".

    Returns None if css is empty.

    Args:
        page_id:    numeric id used as the file name (e.g. Page.id).
        css:        CSS content. Empty/whitespace → None.
        directory:  filesystem directory where the file lives.
                    Created if missing (parents included).
        url_prefix: URL prefix that maps 1:1 to `directory`.
                    For example, directory="static/foo/bar" and
                    url_prefix="/static/foo/bar" — default Nginx
                    serves URL → filesystem without rewrites.

    Atomic write via temp file + os.replace — so concurrent readers
    never see a half-written file.

    The caller is responsible for passing a directory/url_prefix pair
    that actually corresponds (URL must resolve to the file on disk).
    """
    if not css or not css.strip():
        return None

    h = css_hash(css)
    dir_path = Path(directory)
    dir_path.mkdir(parents=True, exist_ok=True)

    path = dir_path / f"{page_id}.css"

    # Skip write if file already has the same content.
    need_write = True
    if path.exists():
        try:
            if path.read_text(encoding="utf-8") == css:
                need_write = False
        except OSError:
            need_write = True

    if need_write:
        fd, tmp_path = tempfile.mkstemp(
            dir=str(dir_path),
            prefix=f".{page_id}.",
            suffix=".css.tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(css)
            os.replace(tmp_path, path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    prefix = url_prefix.rstrip("/")
    return f"{prefix}/{page_id}.css?v={h}"


def split_style_from_html(html: str) -> Tuple[str, str]:
    """
    Extract all <style> blocks from HTML.

    Returns (css, html_without_style).

    Used as a fallback for legacy pages where CSS was embedded
    in Page.content as <style>...</style> (before the css field
    was introduced).
    """
    if not html:
        return "", ""

    styles = _STYLE_RE.findall(html)
    css = "\n".join(s.strip() for s in styles if s and s.strip())
    html_clean = _STYLE_RE.sub("", html)
    return css, html_clean