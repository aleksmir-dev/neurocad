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
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, NavigableString

from ...css_builder import build_full_page_css


# ============================================
# CONSTANTS
# ============================================

FETCH_TIMEOUT = 20.0
MAX_ASSET_BYTES = 8 * 1024 * 1024       # 8 MB per asset
MAX_HTML_BYTES = 16 * 1024 * 1024       # 16 MB per HTML document
USER_AGENT = "NeuroCad-Importer/0.1 (+https://neurocad.ru)"

#: How deep to follow @import chains inside CSS.
MAX_CSS_IMPORT_DEPTH = 5

#: Lazy-load attributes to check when the real `src` is a placeholder.
#: Tilda, WordPress lazy plugins, and many custom themes put the real
#: URL in one of these and a tiny placeholder into `src`.
#:
#: NOTE: on `<img>` these hold an image URL; on `<div>` they hold a
#: background image URL (Tilda puts backgrounds into `data-original`
#: on a div with class `t-bgimg`). We handle both.
_LAZY_SRC_ATTRS = ("data-original", "data-src", "data-lazy-src", "data-lazy")

#: Hosts that serve *only* placeholder/thumbnail images. A `src` from
#: one of these is never the real image — always prefer a lazy attr.
_PLACEHOLDER_HOSTS = (
    "thb.tildacdn.com",     # Tilda thumbnail server
)

#: Path fragments that mark a URL as a placeholder or a server-side
#: resize — Tilda puts these into `src` for lazy-loaded images.
_PLACEHOLDER_PATH_MARKERS = (
    "/-/empty/",
    "/-/resize/",
)

#: `url(...)` inside CSS — quoted or unquoted.
_CSS_URL_RE = re.compile(
    r"""url\(\s*(?P<quote>['"]?)(?P<url>[^'")]+)(?P=quote)\s*\)""",
    re.IGNORECASE,
)

#: `@import url(...)` or `@import "..."` — with an optional media query tail.
_CSS_IMPORT_RE = re.compile(
    r"""@import\s+(?:url\(\s*['"]?(?P<url1>[^'")]+)['"]?\s*\)|['"](?P<url2>[^'"]+)['"])\s*(?P<media>[^;]*);""",
    re.IGNORECASE,
)


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


def _is_placeholder_src(src: str) -> bool:
    """
    True if `src` looks like a lazy-load placeholder, not a real image.
    """
    if not src:
        return True
    if src.startswith("data:"):
        return True

    low = src.lower()
    for host in _PLACEHOLDER_HOSTS:
        if host in low:
            return True
    for marker in _PLACEHOLDER_PATH_MARKERS:
        if marker in low:
            return True

    return False


def _pick_image_src(img) -> str:
    """
    Return the best URL to fetch for one <img> tag.

    Priority:

      1. A lazy attribute (data-original / data-src / ...) — IF the
         current `src` is a placeholder.
      2. `src` — if it is a real http(s) URL and NOT a placeholder.
      3. A lazy attribute — if `src` is missing, empty, or a data-URI.
      4. `src` — as a last resort.
    """
    try:
        src = (img.get("src") or "").strip()
    except Exception:
        src = ""

    # ---- 1. Collect the best lazy URL (if any) ----
    lazy_url = ""
    for attr in _LAZY_SRC_ATTRS:
        try:
            v = (img.get(attr) or "").strip()
        except Exception:
            v = ""
        if v and not v.startswith("data:"):
            lazy_url = v
            break

    # ---- 2. If src is a placeholder and we have a lazy URL — use lazy ----
    if lazy_url and _is_placeholder_src(src):
        return lazy_url

    # ---- 3. If src is a real http(s) URL — use it ----
    if src and not src.startswith("data:"):
        return src

    # ---- 4. If src is empty or data: and we have a lazy URL — use lazy ----
    if lazy_url:
        return lazy_url

    # ---- 5. Nothing better ----
    return src


def _drop_lazy_attrs(img) -> None:
    """
    Remove every lazy-load attribute from an <img> after we have used
    it.
    """
    for attr in _LAZY_SRC_ATTRS:
        try:
            if img.get(attr) is not None:
                del img[attr]
        except Exception:
            pass


# ============================================
# BACKGROUND IMAGES (div[data-original])
# ============================================

def _set_inline_background(div, data_uri: str) -> None:
    """
    Add `background-image: url(data_uri); ...` to a div's style,
    preserving whatever style was already there.

    Used for Tilda's `t-bgimg` divs: instead of an <img> tag, Tilda
    puts the real URL into `data-original` on a div, and its JS turns
    that into an inline background-image. Without the JS the div stays
    empty — which is exactly what happened before this fix.
    """
    try:
        old_style = (div.get("style") or "").strip()
    except Exception:
        old_style = ""

    if old_style and not old_style.endswith(";"):
        old_style += ";"

    extra = (
        f"background-image: url({data_uri});"
        " background-size: cover;"
        " background-position: center;"
        " background-repeat: no-repeat;"
    )

    try:
        div["style"] = f"{old_style} {extra}".strip()
    except Exception:
        pass


# ============================================
# CSS PIPELINE
# ============================================

def _strip_body_text_nodes(body) -> None:
    """
    Remove stray text nodes from a <body> element in-place.
    """
    for child in list(body.children):
        if isinstance(child, NavigableString):
            if str(child).strip():
                child.extract()


def _fetch_css(
    url: str,
    depth: int,
    visited: Set[str],
    warnings: List[str],
) -> str:
    """
    Fetch a CSS file, recursively expand @import, and return the
    combined text. Relative url(...) references are resolved against
    `url`.
    """
    if depth > MAX_CSS_IMPORT_DEPTH:
        warnings.append(f"CSS @import depth exceeded: {url!r}")
        return ""
    if url in visited:
        return ""
    visited.add(url)

    css_bytes, css_err = _fetch(url)
    if css_bytes is None:
        warnings.append(css_err or f"failed to fetch CSS: {url!r}")
        return ""

    css_text = css_bytes.decode("utf-8", errors="replace")

    # ---- 1. Expand @import recursively ----
    def _expand_import(match: re.Match) -> str:
        raw = match.group("url1") or match.group("url2") or ""
        media = (match.group("media") or "").strip()
        raw = raw.strip()
        if not raw:
            return ""
        abs_url = urljoin(url, raw)
        if not _is_http_url(abs_url):
            return ""
        nested = _fetch_css(abs_url, depth + 1, visited, warnings)
        if not nested:
            return ""
        if media:
            return f"@media {media} {{\n{nested}\n}}"
        return nested

    css_text = _CSS_IMPORT_RE.sub(_expand_import, css_text)

    # ---- 2. Resolve relative url(...) against the CSS URL ----
    def _resolve_url(match: re.Match) -> str:
        quote = match.group("quote") or ""
        raw = (match.group("url") or "").strip()
        if not raw:
            return match.group(0)
        low = raw.lower()
        if (
            low.startswith("data:")
            or low.startswith("http://")
            or low.startswith("https://")
            or low.startswith("//")
            or low.startswith("#")
        ):
            return match.group(0)
        abs_u = urljoin(url, raw)
        return f"url({quote}{abs_u}{quote})"

    css_text = _CSS_URL_RE.sub(_resolve_url, css_text)

    return f"/* === {url} === */\n{css_text}"


def _collect_css_from_links(
    soup: BeautifulSoup,
    page_url: str,
    warnings: List[str],
) -> List[str]:
    """
    Walk every <link rel="stylesheet">, fetch the CSS, inline it as a
    <style> element in the soup, and return the list of combined CSS
    chunks.
    """
    collected: List[str] = []
    visited: Set[str] = set()

    for link in soup.find_all("link"):
        rel = link.get("rel")
        rels = rel if isinstance(rel, list) else [rel] if rel else []
        if "stylesheet" not in [r.lower() for r in rels if r]:
            continue

        href = link.get("href")
        if not href:
            continue

        abs_href = urljoin(page_url, href)
        if not _is_http_url(abs_href):
            warnings.append(f"skipped non-http stylesheet: {href!r}")
            continue

        css_text = _fetch_css(abs_href, depth=0, visited=visited, warnings=warnings)
        if not css_text.strip():
            continue

        collected.append(css_text)

        style_tag = soup.new_tag("style")
        style_tag.string = css_text
        link.replace_with(style_tag)

    return collected


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
           - expand @import recursively;
           - resolve relative url(...) against the CSS URL;
           - replace the <link> with a <style> element.
      3. If include_images=True:
           - for each <img>, pick the best source URL (src, or a lazy
             attribute if src is a placeholder) and fetch it;
           - replace the tag's `src` with a data-URI;
           - drop every lazy attribute.
           - for each <div data-original="..."> (Tilda `t-bgimg`),
             fetch the URL and set an inline `background-image`;
             remove the lazy attribute.
      4. Return {html, css, warnings}.
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
    collected_css = _collect_css_from_links(soup, url, warnings)

    # ---- 3. <img> → data-URI ----
    if include_images:
        for img in soup.find_all("img"):
            src = _pick_image_src(img)
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
            _drop_lazy_attrs(img)

    # ---- 3b. <div data-original="..."> → inline background ----
    #
    # Tilda uses this form for background images: the div carries
    # `data-original="https://static.tildacdn.com/..."` and its JS
    # turns that into an inline `background-image: url(...)`. Without
    # the JS the div renders empty — the background never appears.
    #
    # We fetch the URL and set the inline background ourselves. The
    # data-URI we insert here is later picked up by extract_from_html
    # (which scans the whole HTML, not just <img> tags) and replaced
    # with a `/media/<nav_id>/...` URL.
    if include_images:
        for div in soup.find_all(attrs={"data-original": True}):
            lazy = (div.get("data-original") or "").strip()
            if not lazy or lazy.startswith("data:"):
                continue

            abs_src = urljoin(url, lazy)
            if not _is_http_url(abs_src):
                continue

            img_bytes, img_err = _fetch(abs_src)
            if img_bytes is None or len(img_bytes) > MAX_ASSET_BYTES:
                warnings.append(img_err or f"background too large: {abs_src!r}")
                continue

            mime = _filename_to_mime(abs_src)
            data_uri = _to_data_uri(img_bytes, mime)
            _set_inline_background(div, data_uri)
            _drop_lazy_attrs(div)

    # ---- 4. Build clean HTML — keep only <body> content ----
    body = soup.find("body")
    if body is not None:
        _strip_body_text_nodes(body)
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
    """
    name = (filename or "").lower()

    if name.endswith(".grp") or name.endswith(".zip"):
        return _import_grp(content)

    try:
        text = content.decode("utf-8", errors="replace")
    except Exception:
        text = content.decode("latin-1", errors="replace")

    return _import_html_text(text)


def _import_html_text(text: str) -> Dict[str, Any]:
    """Parse a raw HTML string: split <style> blocks into `css`."""
    warnings: List[str] = []
    soup = BeautifulSoup(text, "lxml")

    css_chunks: List[str] = []
    for st in soup.find_all("style"):
        if st.string:
            css_chunks.append(st.string.strip())

    css = "\n\n".join(c for c in css_chunks if c)

    body = soup.find("body")
    if body is not None:
        _strip_body_text_nodes(body)
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

        if "index.json" in names:
            try:
                project_json = zf.read("index.json").decode("utf-8")
            except Exception as e:
                warnings.append(f"index.json unreadable: {e}")

        if "index.html" in names:
            try:
                html = zf.read("index.html").decode("utf-8", errors="replace")
            except Exception as e:
                warnings.append(f"index.html unreadable: {e}")

        if "index.css" in names:
            try:
                css = zf.read("index.css").decode("utf-8", errors="replace")
            except Exception as e:
                warnings.append(f"index.css unreadable: {e}")

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

    media_files = _collect_media_from_html(html)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", html or "")
        zf.writestr("index.css", custom_css or "")
        if project_json:
            zf.writestr("index.json", project_json)
        for name, data in media_files.items():
            zf.writestr(f"media/{name}", data)

    return buf.getvalue()


def _collect_media_from_html(html: str) -> Dict[str, bytes]:
    """
    Scan HTML for media references and return {filename: bytes}.
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

        tail = src.split("/media/", 1)[-1].lstrip("/")
        name = _safe_filename(tail)
        if name in result:
            continue

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