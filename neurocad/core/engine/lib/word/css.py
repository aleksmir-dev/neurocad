# neurocad/core/engine/lib/word/css.py

"""
Page-CSS-file writer.

The public page loads the page's CSS from a static file:

    /static/core/engine/lib/pages/public/pages/<id>.css?v=<hash>

The file is written on every save (and on rollback) by
`write_page_css_file`. It contains the frozen CSS assembled at
save time — content.css + used blocks/*.css + used fx/*.css +
custom page CSS.

This module owns the writing side. The corresponding URL prefix
(`PAGES_CSS_DIR` / `PAGES_CSS_URL`) lives in
`pages/public/service.py` — the same constants are used by
`pages/public/route.py` to serve the file.

Non-fatal on failure: if the write fails (permissions, disk full),
the DB save is still valid — the public page will simply miss the
CSS until the next save. Callers should not abort the save on a
write failure here.

Namespace: CoreEngineLibWordCss*
"""

from typing import Optional

from ..pages.public.service import PAGES_CSS_DIR, PAGES_CSS_URL
from .....utils.css import ensure_css_file


def write_page_css_file(page_id: int, css: Optional[str]) -> None:
    """
    Write the page's CSS to a static file under PAGES_CSS_DIR.

    Empty CSS → no file written. Existing file is left on disk; it
    will simply not be requested by the public page (view.js falls
    back to the embedded <style> path).

    Non-fatal: any exception is caught and printed. The DB save
    that triggered this call stays valid.
    """
    if not css or not css.strip():
        return
    try:
        url = ensure_css_file(
            page_id=page_id,
            css=css,
            directory=PAGES_CSS_DIR,
            url_prefix=PAGES_CSS_URL,
        )
        if url:
            print(f"[Word] page CSS file written: {url}", flush=True)
    except Exception as e:
        print(f"[Word] failed to write page CSS file for page {page_id}: {e}", flush=True)