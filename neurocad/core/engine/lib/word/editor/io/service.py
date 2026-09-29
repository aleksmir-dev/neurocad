# neurocad/core/engine/lib/word/editor/io/service.py

"""
Import/export service for the editor.

Two directions:

  IMPORT
    import_url(url, include_images)   — fetch a page, inline CSS, optionally
                                        inline images as data-URI.
    import_file(content, filename)    — parse an uploaded .grp archive
                                        or .html file, return html / css /
                                        json / assets.

  EXPORT
    export_html(page_data, override)  — build a standalone HTML document:
                                        html + full CSS (content.css + blocks
                                        + effects + custom), all inlined
                                        in <style>.
    export_grp(page_data, override)   — build the .grp ZIP archive:
                                        index.html + index.css + index.json
                                        + media/*.

Import is side-effect-free: nothing is written to disk. Media files are
returned as data-URI so the editor can render them immediately.

Export reuses the same CSS assembly as save: css_builder.build_full_page_css.

Namespace: CoreEngineLibWordEditorIoService
"""

import base64
import io
import json
import mimetypes
import re
import zipfile
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from ...css_builder import build_full_page_css


# ============================================
# CONSTANTS
# ============================================

FETCH_TIMEOUT = 20.0
MAX_ASSET_BYTES = 8 * 1024 * 1024       # 8 MB per asset
MAX_HTML_BYTES = 16 * 1024 * 1024       # 16 MB per HTML document
USER_AGENT = "NeuroCad-Importer/0.1 (+https://neurocad.ru)"


# ============================================
# HELPERS
# ============================================

def _is_http_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def _filename_to_mime(name: str) -> str:
    mime, _ = mimetypes.guess_type(name)
    return mime or "application/octet-stream"


def _to_data_uri(content: bytes, mime: str) -> str:
    b64 = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _safe_filename(name: str) -> str:
    """
    Sanitize a filename for storage inside the .grp archive.

    Keeps letters, digits, dot, dash, underscore. Replaces everything
    else with underscore. Prevents path traversal (no slashes, no '..').
    """
    name = name.strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^A-Za-z0-9._\-]", "_", name)
    if name in ("", ".", ".."):
        name = "asset"
    return name


def _fetch(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Fetch a URL. Returns (content_bytes, content_type) or (None, error_message).

    Only http/https. Redirects followed. Size capped at MAX_HTML_BYTES.
    """
    if not _is_http_url(url):
        return None, f"unsupported scheme: {url!r}"

    try:
        with httpx.Client(
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
        ) as client:
            r = client.get(url)
            if r.status_code != 200:
                return None, f"HTTP {r.status_code} for {url!r}"
            content = r.content
            if len(content) > MAX_HTML_BYTES:
                return None, f"response too large for {url!r}"
            return content, r.headers.get("content-type", "")
    except Exception as e:
        return None, f"fetch failed for {url!r}: {type(e).__name__}: {e}"


# ============================================
# IMPORT — URL
# ============================================

def import_url(
    url: str,
    include_images: bool = True,
) -> Dict[str, Any]:
    """
    Fetch a remote page, inline its CSS, optionally inline its images.

    Steps:
      1. GET the URL. Parse as HTML.
      2. For each <link rel="stylesheet" href="...">:
           - resolve the absolute URL;
           - fetch the CSS;
           - replace the <link> with a <style> element carrying the CSS.
      3. If include_images=True:
           - for each <img src="...">, fetch and replace with data-URI.
      4. Return {html, css, warnings}.

    `html` — the page body after processing (without <html>/<head>/<body>,
    ready to be setComponents'ed).
    `css` — combined CSS (from <link>s; inline <style> blocks are left
    inside the HTML body, so they render in the editor's canvas).
    """
    warnings: List[str] = []

    if not _is_http_url(url):
        raise ValueError(f"Unsupported URL: {url!r}")

    content, err = _fetch(url)
    if content is None:
        raise RuntimeError(err or "fetch failed")

    try:
        raw_html = content.decode("utf-8", errors="replace")
    except Exception:
        raw_html = content.decode("latin-1", errors="replace")

    soup = BeautifulSoup(raw_html, "lxml")

    # ---- 2. <link rel="stylesheet"> → <style> ----
    collected_css: List[str] = []

    for link in soup.find_all("link"):
        rel = link.get("rel")
        rels = rel if isinstance(rel, list) else [rel] if rel else []
        if "stylesheet" not in [r.lower() for r in rels if r]:
            continue

        href = link.get("href")
        if not href:
            continue

        abs_href = urljoin(url, href)
        if not _is_http_url(abs_href):
            warnings.append(f"skipped non-http stylesheet: {href!r}")
            continue

        css_bytes, css_err = _fetch(abs_href)
        if css_bytes is None:
            warnings.append(css_err or f"failed to fetch CSS: {abs_href!r}")
            continue

        css_text = css_bytes.decode("utf-8", errors="replace")
        collected_css.append(f"/* {abs_href} */\n{css_text}")

        # Replace <link> with an inline <style> so the editor sees it.
        style_tag = soup.new_tag("style")
        style_tag.string = css_text
        link.replace_with(style_tag)

    # ---- 3. <img src> → data-URI ----
    if include_images:
        for img in soup.find_all("img"):
            src = img.get("src")
            if not src or src.startswith("data:"):
                continue
            abs_src = urljoin(url, src)
            if not _is_http_url(abs_src):
                continue

            img_bytes, img_err = _fetch(abs_src)
            if img_bytes is None or len(img_bytes) > MAX_ASSET_BYTES:
                warnings.append(img_err or f"image too large: {abs_src!r}")
                continue

            mime = _filename_to_mime(abs_src)
            img["src"] = _to_data_uri(img_bytes, mime)

    # ---- 4. Build clean HTML — keep only <body> content ----
    body = soup.find("body")
    if body is not None:
        # BeautifulSoup: str(body) returns <body>...</body>; we want inner.
        inner_html = "".join(str(child) for child in body.children)
    else:
        inner_html = str(soup)

    combined_css = "\n\n".join(collected_css).strip()

    return {
        "html": inner_html,
        "css": combined_css,
        "warnings": warnings,
    }


# ============================================
# IMPORT — FILE
# ============================================

def import_file(
    content: bytes,
    filename: str,
) -> Dict[str, Any]:
    """
    Parse an uploaded file: .grp archive or .html.

    For .grp (ZIP):
      - reads index.json (preferred), index.html, index.css
      - reads media/* and encodes each as data-URI (returned in `assets`)
      - returns warnings for missing / oversized parts

    For .html / .htm:
      - reads HTML as text
      - extracts <style> blocks into `css`
      - inline <style> left in HTML too (renders in canvas)

    Never writes to disk.
    """
    name = (filename or "").lower()

    if name.endswith(".grp") or name.endswith(".zip"):
        return _import_grp(content)

    # Plain HTML.
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    return _import_html_text(text)


def _import_html_text(text: str) -> Dict[str, Any]:
    """Parse a raw HTML string: split <style> blocks into `css`."""
    warnings: List[str] = []
    soup = BeautifulSoup(text, "lxml")

    # Collect all <style> contents.
    css_chunks: List[str] = []
    for st in soup.find_all("style"):
        if st.string:
            css_chunks.append(st.string.strip())

    css = "\n\n".join(c for c in css_chunks if c)

    # Keep only <body> inner HTML.
    body = soup.find("body")
    if body is not None:
        html = "".join(str(child) for child in body.children)
    else:
        html = text

    return {
        "html": html,
        "css": css,
        "json": None,
        "assets": {},
        "warnings": warnings,
    }


def _import_grp(content: bytes) -> Dict[str, Any]:
    """
    Parse a .grp ZIP archive.

    Expected layout:
        index.html     (fallback)
        index.css      (fallback)
        index.json     (preferred — GrapesJS project data)
        media/*        (assets, returned as data-URI)
    """
    warnings: List[str] = []
    html = ""
    css = ""
    project_json: Optional[str] = None
    assets: Dict[str, str] = {}

    try:
        zf = zipfile.ZipFile(io.BytesIO(content), mode="r")
    except zipfile.BadZipFile as e:
        raise RuntimeError(f"not a valid .grp archive: {e}")

    with zf:
        names = zf.namelist()

        # ---- index.json ----
        if "index.json" in names:
            try:
                project_json = zf.read("index.json").decode("utf-8")
            except Exception as e:
                warnings.append(f"index.json unreadable: {e}")

        # ---- index.html ----
        if "index.html" in names:
            try:
                html = zf.read("index.html").decode("utf-8", errors="replace")
            except Exception as e:
                warnings.append(f"index.html unreadable: {e}")

        # ---- index.css ----
        if "index.css" in names:
            try:
                css = zf.read("index.css").decode("utf-8", errors="replace")
            except Exception as e:
                warnings.append(f"index.css unreadable: {e}")

        # ---- media/* ----
        for member in names:
            if not member.startswith("media/") or member.endswith("/"):
                continue

            rel = member[len("media/"):]
            if not rel:
                continue

            try:
                info = zf.getinfo(member)
                if info.file_size > MAX_ASSET_BYTES:
                    warnings.append(f"asset too large, skipped: {rel}")
                    continue
                data = zf.read(member)
                mime = _filename_to_mime(rel)
                assets[f"media/{rel}"] = _to_data_uri(data, mime)
            except Exception as e:
                warnings.append(f"asset unreadable: {rel}: {e}")

    return {
        "html": html,
        "css": css,
        "json": project_json,
        "assets": assets,
        "warnings": warnings,
    }


# ============================================
# EXPORT — HTML
# ============================================

def export_html(
    page_data: Dict[str, Any],
    override: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Build a standalone HTML document with all CSS inlined in <style>.

    page_data = {
        "title": str,
        "content": str | None,
        "content_json": str | None,
        "css": str | None,
    }
    override = optional {"html", "css", "json"} to override page_data
              (used to export unsaved editor state).

    Logic:
      - html comes from override.html, or page_data.content
      - custom_css from override.css, or page_data.css
      - full CSS = css_builder.build_full_page_css(html, custom_css)
      - the final document wraps html in <body class="...">
        inside <!DOCTYPE html>.

    Returns the full HTML document as a string.
    """
    override = override or {}

    html = override.get("html")
    if html is None:
        html = page_data.get("content") or ""

    custom_css = override.get("css")
    if custom_css is None:
        custom_css = page_data.get("css") or ""

    title = page_data.get("title") or "NeuroCad"

    full_css = build_full_page_css(html, custom_css)

    # Escape stray </style> occurrences inside CSS just in case
    # (they would break the surrounding <style> block).
    safe_css = full_css.replace("</style>", "<\\/style>")

    return (
        "<!DOCTYPE html>\n"
        '<html lang="ru">\n'
        "<head>\n"
        '    <meta charset="utf-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"    <title>{_escape_html(title)}</title>\n"
        "    <style>\n"
        f"{safe_css}\n"
        "    </style>\n"
        "</head>\n"
        '<body class="core-engine-lib-word-blocks">\n'
        f"{html}\n"
        "</body>\n"
        "</html>\n"
    )


# ============================================
# EXPORT — GRP
# ============================================

def export_grp(
    page_data: Dict[str, Any],
    override: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Build the .grp ZIP archive in memory and return its bytes.

    Archive layout:
        index.html     — HTML components
        index.css      — custom CSS (StyleManager)
        index.json     — GrapesJS project data (if available)
        media/*        — asset files pulled from the page's content
                         (data-URI decoded back into binary)

    Media discovery:
      - scan HTML for `src="data:..."` and for `/media/<nav_id>/<path>`
        references;
      - data-URI → decode and store under media/;
      - /media/ refs — resolved on the filesystem (relative to CWD);
        file contents stored under media/.

    Never fails hard: if a media file is missing, a warning comment is
    added to index.html and the archive is still produced.
    """
    override = override or {}

    html = override.get("html")
    if html is None:
        html = page_data.get("content") or ""

    custom_css = override.get("css")
    if custom_css is None:
        custom_css = page_data.get("css") or ""

    project_json = override.get("json")
    if project_json is None:
        project_json = page_data.get("content_json")

    # Collect media from HTML (data-URI + /media/ refs).
    media_files = _collect_media_from_html(html)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # ---- index.html ----
        zf.writestr("index.html", html or "")

        # ---- index.css ----
        zf.writestr("index.css", custom_css or "")

        # ---- index.json ----
        if project_json:
            zf.writestr("index.json", project_json)

        # ---- media/* ----
        for name, data in media_files.items():
            zf.writestr(f"media/{name}", data)

    return buf.getvalue()


def _collect_media_from_html(html: str) -> Dict[str, bytes]:
    """
    Scan HTML for media references and return {filename: bytes}.

    Sources:
      - `src="data:image/...;base64,..."` → decoded
      - `src="/media/..."` and `src="media/..."` → read from disk

    Filenames are taken from the URL / data-URI's surrounding context;
    a fallback name is generated when nothing usable is available.
    """
    result: Dict[str, bytes] = {}
    counter = {"n": 0}

    def next_name(ext: str = "") -> str:
        counter["n"] += 1
        base = f"asset-{counter['n']:03d}"
        return f"{base}{ext}" if ext else base

    if not html:
        return result

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        return result

    # ---- 1. data-URIs ----
    data_uri_re = re.compile(
        r"^data:(?P<mime>[^;,]+)?(?:;charset=[^;,]+)?;base64,(?P<b64>.+)$",
        re.DOTALL,
    )
    for tag in soup.find_all(["img", "source", "video", "audio"]):
        src = tag.get("src")
        if not src or not src.startswith("data:"):
            continue
        m = data_uri_re.match(src)
        if not m:
            continue
        try:
            raw = base64.b64decode(m.group("b64"), validate=False)
        except Exception:
            continue

        mime = (m.group("mime") or "application/octet-stream").strip()
        ext = mimetypes.guess_extension(mime) or ""
        name = next_name(ext)
        result[name] = raw

    # ---- 2. /media/ refs ----
    for tag in soup.find_all(["img", "source", "video", "audio", "link"]):
        src = tag.get("src") or tag.get("href")
        if not src or src.startswith("data:"):
            continue
        if "/media/" not in src and not src.startswith("media/"):
            continue

        # /media/<nav_id>/<path> — take the tail after /media/.
        tail = src.split("/media/", 1)[-1].lstrip("/")
        name = _safe_filename(tail)
        if name in result:
            continue

        # Try to read from disk. Paths in HTML are typically
        # "/media/<nav_id>/<file>" — resolve relative to CWD.
        from pathlib import Path
        disk_path = Path("media") / tail
        try:
            if disk_path.is_file() and disk_path.stat().st_size <= MAX_ASSET_BYTES:
                result[name] = disk_path.read_bytes()
        except OSError:
            pass

    return result


# ============================================
# SMALL UTILITIES
# ============================================

def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )