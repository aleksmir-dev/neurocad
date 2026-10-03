# neurocad/core/engine/lib/word/editor/io/media.py

"""
Media extraction for the editor's import/save pipeline.

Six entry points:

  extract_from_html(html, nav_id, *, force=False) -> (new_html, mapping)
      Scan `html` for `data:...;base64,...` URIs. For each URI above
      THRESHOLD_BYTES (or for all of them, if `force=True`), save the
      decoded bytes to `media/<nav_id>/<uuid>.<ext>` and replace the URI
      with `/media/<nav_id>/<uuid>.<ext>`.

      If `force=False`, a URI is extracted only when BOTH conditions are
      met:
        - the URI's decoded size > THRESHOLD_BYTES, OR
        - the total decoded size of all URIs in the document > TOTAL_BYTES.

      This is the "smart" save-time policy: small icons stay inline;
      pages that accumulate many small URIs get cleaned up too.

  extract_from_css(css, nav_id, base_url, *, force=False) -> (new_css, mapping)
      Scan `css` for `url(...)` references (fonts, background images,
      etc.), download each one with `base_url` as the resolver, save it
      to `media/<nav_id>/<uuid>.<ext>`, and rewrite the CSS to point at
      the local copy.

      Skips:
        - `data:` URIs (handled by extract_from_html)
        - `/media/...` paths (already local)
        - `#fragment`, `mailto:`, `tel:`, `javascript:` URLs

  extract_inline_svg(html, nav_id) -> (new_html, mapping)
      DISABLED — see the function's own docstring.
      Historically this moved every inline <svg> into media/<nav_id>/
      and replaced the markup with <img src="...">. That broke the
      visual design: the original CSS classes were dropped, and
      `currentColor` / `viewBox`-based sizing stopped working.
      Now it is a no-op: inline SVG stays inline.

  strip_lazy_attrs(html) -> (new_html, mapping)
      Normalize Tilda-style lazy-load <img> tags.

      Tilda (and many lazy-load plugins) put a 1×1 placeholder into
      `src` and the real URL into `data-original` / `data-src` /
      `data-lazy-src`. We have no such JS, so:

        1. If `src` is empty, a data-URI, or anything that is NOT a
           local `/media/...` path — copy the lazy URL into `src`.
        2. If `src` already points at `/media/...`, keep it — our
           import pipeline has already fetched the real image.
        3. Remove every lazy attribute regardless, so no Tilda CSS
           rule can hide the image.

      Step 1 is what makes images visible even when the import step
      was skipped (e.g. the page was rolled back from an old snapshot
      that still had data-original pointing at tildacdn.com).

  fix_cover_bg(html) -> (new_html, mapping)
      Convert Tilda's `data-content-cover-bg="URL"` into a real inline
      `style="background-image: url(URL); ..."`. Without Tilda-JS the
      background never gets applied — the cover stays empty.

  extract_from_json(content_json, nav_id, *, force=False) -> (new_json, mapping)
      Same as extract_from_html, but for GrapesJS project JSON. Walks
      the structure recursively, finds every string that starts with
      `data:`, and replaces it.

All functions return the number of extracted files in `mapping` so
the caller can log it.

All files go under `media/<nav_id>/` — the same namespace used by the
word editor and the media library.

Never raises on a single broken URI — it is skipped and reported in
the mapping as `None`.

Circular import note
--------------------
MEDIA_URL lives in `word/constants.py`, NOT in `word/service.py`.
This module is imported by `word/service.py` itself, so importing
MEDIA_URL from `service` would create a cycle. `constants` has no
dependencies of its own — safe to import from anywhere.

Namespace: CoreEngineLibWordEditorIoMedia
"""

import base64
import json
import mimetypes
import re
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# Constants — MEDIA_URL lives in a dedicated module to avoid a
# circular import through word/service.py (which imports THIS file).
from ...constants import MEDIA_URL

# Shared file-permission helper.
from neurocad.utils.css import _apply_file_mode


# ============================================
# CONFIG
# ============================================

#: A single data-URI larger than this (after decode) is always extracted.
THRESHOLD_BYTES = 50 * 1024            # 50 KB

#: If the SUM of all data-URIs in the document exceeds this (after
#: decode), every one of them is extracted — even the small ones.
TOTAL_BYTES = 1024 * 1024              # 1 MB

#: Timeout for fetching CSS-referenced resources (fonts, images).
CSS_FETCH_TIMEOUT = 15                 # seconds

#: User-Agent for CSS-referenced resource fetches.
CSS_FETCH_UA = "Mozilla/5.0 (compatible; NeuroCad/1.0)"

#: Prefix of local media paths. Kept as a constant so the lazy-load
#: cleanup can decide whether a src is already "local".
_MEDIA_PREFIX = "/media/"


# ============================================
# PARSING
# ============================================

#: `data:image/png;base64,XXXX` or `data:application/octet-stream;base64,XXXX`
#: (also accepts missing mime — defaults to application/octet-stream)
_DATA_URI_RE = re.compile(
    r"data:(?P<mime>[^;,]*)?(?:;charset=[^;,]+)?;base64,(?P<b64>[A-Za-z0-9+/=\s]+)",
    re.DOTALL,
)

#: `url(...)` in CSS — quoted or unquoted.
_CSS_URL_RE = re.compile(
    r"""url\(\s*(?P<quote>['"]?)(?P<url>[^'")]+)(?P=quote)\s*\)""",
    re.IGNORECASE,
)

#: `<img ...>` opening tag (no nested >).
_IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)

#: Lazy-load attributes used by Tilda and similar builders.
_LAZY_ATTRS = ("data-original", "data-src", "data-lazy-src")

#: Any opening tag carrying data-content-cover-bg (usually <div>).
_COVER_TAG_RE = re.compile(
    r'<[a-zA-Z][^>]*\bdata-content-cover-bg="[^"]*"[^>]*>',
    re.IGNORECASE,
)


def _decode_data_uri(mime: str, b64: str) -> Optional[bytes]:
    """
    Base64-decode the payload. Returns None if the URI is malformed.
    """
    try:
        # Strip whitespace — some HTML minifiers split long base64 lines.
        raw = base64.b64decode(re.sub(r"\s+", "", b64), validate=False)
    except Exception:
        return None
    return raw


def _ext_for_mime(mime: str, data: bytes = b"") -> str:
    """
    Extension (with dot) for the given MIME type.

    Falls back to magic-byte detection when the MIME is missing or
    unrecognized (e.g. `application/octet-stream` for an SVG).
    """
    mime = (mime or "application/octet-stream").strip()
    ext = mimetypes.guess_extension(mime) or ""
    if ext:
        return ext

    # Fallback: magic bytes.
    head = data[:16] if data else b""
    low = head.lower()

    if low.startswith(b"<svg") or low.startswith(b"<?xml"):
        return ".svg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return ".gif"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return ".webp"
    if head.startswith(b"wOFF"):
        return ".woff"
    if head.startswith(b"wOF2"):
        return ".woff2"
    if head.startswith(b"\x00\x01\x00\x00") or head.startswith(b"true"):
        return ".ttf"
    if head.startswith(b"OTTO"):
        return ".otf"
    if head.startswith(b"%PDF"):
        return ".pdf"

    return ".bin"


def _media_dir(nav_id: int) -> Path:
    """Directory `media/<nav_id>/` — created if missing."""
    path = Path("media") / str(nav_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_file(nav_id: int, data: bytes, mime: str) -> str:
    """
    Write `data` to `media/<nav_id>/<uuid><ext>` and return the public URL.
    """
    ext = _ext_for_mime(mime, data)
    name = f"{uuid.uuid4().hex}{ext}"
    path = _media_dir(nav_id) / name

    path.write_bytes(data)
    _apply_file_mode(path)

    return f"{MEDIA_URL}/{nav_id}/{name}"


def _fetch_url(url: str) -> Tuple[Optional[bytes], str]:
    """
    Download a URL. Returns (data | None, mime).

    mime — Content-Type without parameters; empty string on failure.
    Never raises.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": CSS_FETCH_UA})
        with urllib.request.urlopen(req, timeout=CSS_FETCH_TIMEOUT) as resp:
            data = resp.read()
            mime = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
            return data, mime
    except Exception:
        return None, ""


# ============================================
# HTML EXTRACTION
# ============================================

def extract_from_html(
    html: str,
    nav_id: int,
    *,
    force: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    """
    Extract data-URIs from HTML.

    See module docstring for the threshold policy.

    Returns (new_html, mapping) where mapping = {
        "extracted": int,
        "skipped": int,
        "errors": int,
        "replaced": {old_uri: new_url | None},
    }
    """
    mapping: Dict[str, Any] = {
        "extracted": 0,
        "skipped": 0,
        "errors": 0,
        "replaced": {},
    }

    if not html or "data:" not in html:
        return html, mapping

    # ---- 1. Collect every data-URI and its decoded size ----
    matches = list(_DATA_URI_RE.finditer(html))
    if not matches:
        return html, mapping

    total_size = 0
    entries = []   # (uri_full, mime, decoded_bytes, size)
    for m in matches:
        uri_full = m.group(0)
        mime = (m.group("mime") or "").strip() or "application/octet-stream"
        b64 = m.group("b64") or ""
        data = _decode_data_uri(mime, b64)
        if data is None:
            mapping["errors"] += 1
            entries.append((uri_full, mime, None, 0))
            continue
        entries.append((uri_full, mime, data, len(data)))
        total_size += len(data)

    # ---- 2. Decide which ones to extract ----
    page_over_limit = total_size > TOTAL_BYTES

    for uri_full, mime, data, size in entries:
        if data is None:
            continue

        should_extract = force or page_over_limit or size > THRESHOLD_BYTES

        if not should_extract:
            mapping["skipped"] += 1
            continue

        try:
            url = _write_file(nav_id, data, mime)
        except Exception:
            mapping["errors"] += 1
            mapping["replaced"][uri_full] = None
            continue

        mapping["extracted"] += 1
        mapping["replaced"][uri_full] = url

    # ---- 3. Replace in HTML (longest URIs first — safest) ----
    new_html = html
    for old_uri, new_url in sorted(
        mapping["replaced"].items(),
        key=lambda kv: -len(kv[0]),
    ):
        if new_url is None:
            continue
        new_html = new_html.replace(old_uri, new_url)

    return new_html, mapping


# ============================================
# CSS EXTRACTION
# ============================================

def extract_from_css(
    css: str,
    nav_id: int,
    base_url: str,
    *,
    force: bool = False,
) -> Tuple[str, Dict[str, Any]]:
    """
    Download every `url(...)` referenced from CSS, store it under
    `media/<nav_id>/`, and replace the URL with the public path.

    Skips:
      - `data:` URIs (already handled by extract_from_html)
      - `/media/...` paths (already local)
      - `#fragment` URLs
      - `mailto:`, `tel:`, `javascript:`

    `base_url` — the URL of the page the CSS came from, used to
    resolve relative paths.

    `force` — kept for API symmetry; CSS URLs are always fetched
    (there's no "inline vs external" tradeoff — they're external
    references either way).

    Returns (new_css, mapping).
    """
    mapping: Dict[str, Any] = {
        "extracted": 0,
        "skipped": 0,
        "errors": 0,
        "replaced": {},
    }

    if not css or "url(" not in css.lower():
        return css, mapping

    def _replace(match: re.Match) -> str:
        raw_url = (match.group("url") or "").strip()
        quote = match.group("quote") or ""

        if not raw_url:
            mapping["skipped"] += 1
            return match.group(0)

        low = raw_url.lower()
        if (
            low.startswith("data:")
            or low.startswith(_MEDIA_PREFIX)
            or low.startswith("#")
            or low.startswith("mailto:")
            or low.startswith("tel:")
            or low.startswith("javascript:")
        ):
            mapping["skipped"] += 1
            return match.group(0)

        # Already handled — reuse.
        if raw_url in mapping["replaced"]:
            new = mapping["replaced"][raw_url]
            if new and new != raw_url:
                return f"url({quote}{new}{quote})"
            return match.group(0)

        full_url = urllib.parse.urljoin(base_url, raw_url)
        data, mime = _fetch_url(full_url)
        if data is None:
            mapping["errors"] += 1
            mapping["replaced"][raw_url] = raw_url  # keep original
            return match.group(0)

        try:
            new_url = _write_file(nav_id, data, mime)
        except Exception:
            mapping["errors"] += 1
            mapping["replaced"][raw_url] = raw_url
            return match.group(0)

        mapping["extracted"] += 1
        mapping["replaced"][raw_url] = new_url
        return f"url({quote}{new_url}{quote})"

    new_css = _CSS_URL_RE.sub(_replace, css)
    return new_css, mapping


# ============================================
# INLINE SVG EXTRACTION — DISABLED
# ============================================

def extract_inline_svg(
    html: str,
    nav_id: int,
) -> Tuple[str, Dict[str, Any]]:
    """
    DISABLED — inline SVG is kept as-is.

    Earlier this function extracted every inline `<svg>...</svg>`
    into a separate file under media/<nav_id>/ and replaced the
    markup with `<img src="...">`. That broke the visual design:

      - the original `class="featured__icon"` was replaced with
        `class="ti-svg"`, so all CSS rules targeting the original
        class stopped applying;
      - `stroke="currentColor"` / `fill="currentColor"` no longer
        worked, because `<img>` has no notion of the inherited
        text color;
      - `viewBox` sizing broke — with no CSS class the `<img>`
        fell back to its intrinsic pixel size.

    Inline SVG is part of the markup, not an external asset. It
    must be styled by the page CSS exactly like any other element.
    The editor and the LLM that generate these SVGs own them, so
    there is no IP reason to move them into media/.

    The function is kept (not deleted) so its import sites do not
    need to change; it simply returns the HTML unchanged.

    Returns (html, mapping) where mapping is always empty.
    """
    mapping: Dict[str, Any] = {
        "extracted": 0,
        "errors": 0,
    }
    return html, mapping


# ============================================
# LAZY-LOAD ATTRIBUTES (Tilda compatibility)
# ============================================

def strip_lazy_attrs(html: str) -> Tuple[str, Dict[str, Any]]:
    """
    Normalize Tilda-style lazy-load <img> tags.

    Tilda stores the real image URL in `data-original="https://..."`,
    `data-src="https://..."`, or `data-lazy-src="https://..."`, and
    leaves `src` either empty, a data-URI, or a 1×1 placeholder until
    its JS runs. We have no Tilda JS, so:

      1. If `src` is empty, a data-URI, or anything that is NOT a
         local `/media/...` path — copy the lazy URL into `src`.
      2. If `src` already points at `/media/...` — keep it. This
         matters because our import pipeline may have already written
         a `/media/...` URL there; the lazy attribute is then just
         noise.
      3. Remove `data-original`, `data-src`, `data-lazy-src` entirely
         so no Tilda CSS rule can hide the image.

    Step 1 is what makes images visible even when the import step was
    skipped (e.g. the page was rolled back from an old snapshot that
    still had data-original pointing at tildacdn.com).

    Returns (new_html, mapping) where mapping = {
        "fixed_src": int,
        "stripped": int,
        "errors": int,
    }
    """
    mapping: Dict[str, Any] = {
        "fixed_src": 0,
        "stripped": 0,
        "errors": 0,
    }

    if not html or "<img" not in html.lower():
        return html, mapping

    def _fix_img(match: re.Match) -> str:
        tag = match.group(0)

        # Find the lazy URL, if any (first match wins).
        lazy_url = None
        for attr in _LAZY_ATTRS:
            m = re.search(rf'\b{attr}="([^"]*)"', tag)
            if m and m.group(1).strip():
                lazy_url = m.group(1).strip()
                break

        # If we have a lazy URL and the current src is NOT a local
        # /media/... path — promote the lazy URL into src.
        #
        # Cases where we promote:
        #   - src missing entirely
        #   - src="" (empty)
        #   - src="data:..." (1×1 placeholder)
        #   - src="https://..." (not yet fetched, still remote)
        #
        # Cases where we do NOT promote:
        #   - src="/media/..." (already local — leave as-is)
        if lazy_url:
            m_src = re.search(r'\bsrc="([^"]*)"', tag)
            cur_src = m_src.group(1).strip() if m_src else ""

            if not cur_src or not cur_src.startswith(_MEDIA_PREFIX):
                if m_src:
                    tag = tag.replace(m_src.group(0), f'src="{lazy_url}"', 1)
                else:
                    # Insert just before the closing '>'.
                    tag = tag[:-1] + f' src="{lazy_url}">'
                mapping["fixed_src"] += 1

        # Drop lazy attributes regardless.
        for attr in _LAZY_ATTRS:
            pattern = rf'\s+{attr}="[^"]*"'
            tag, n = re.subn(pattern, "", tag)
            mapping["stripped"] += n

        return tag

    new_html = _IMG_TAG_RE.sub(_fix_img, html)
    return new_html, mapping


# ============================================
# COVER BACKGROUNDS (Tilda compatibility)
# ============================================

def fix_cover_bg(html: str) -> Tuple[str, Dict[str, Any]]:
    """
    Convert Tilda's `data-content-cover-bg="URL"` into a real inline
    `style="background-image: url(URL); ..."`.

    Without Tilda-JS, the background never gets applied — the cover
    section stays empty. This function materializes it.

    Existing `style` attributes are preserved and appended to.

    Returns (new_html, mapping) where mapping = {
        "converted": int,
        "errors": int,
    }
    """
    mapping: Dict[str, Any] = {
        "converted": 0,
        "errors": 0,
    }

    if not html or "data-content-cover-bg" not in html:
        return html, mapping

    def _fix_tag(match: re.Match) -> str:
        tag = match.group(0)

        m_bg = re.search(r'\bdata-content-cover-bg="([^"]*)"', tag)
        if not m_bg or not m_bg.group(1).strip():
            return tag

        url = m_bg.group(1).strip()

        extra = (
            f"background-image: url({url});"
            " background-size: cover;"
            " background-position: center;"
            " background-repeat: no-repeat;"
        )

        # If a style attribute already exists — append to it.
        m_style = re.search(r'\bstyle="([^"]*)"', tag)
        if m_style:
            old = m_style.group(1).rstrip()
            if old and not old.endswith(";"):
                old += ";"
            tag = tag.replace(
                m_style.group(0),
                f'style="{old} {extra}"'.replace("  ", " "),
                1,
            )
        else:
            # Insert before the closing '>'.
            tag = tag[:-1] + f' style="{extra}">'

        # Drop the data-content-cover-bg attribute itself.
        tag = re.sub(r'\s+data-content-cover-bg="[^"]*"', "", tag)

        mapping["converted"] += 1
        return tag

    new_html = _COVER_TAG_RE.sub(_fix_tag, html)
    return new_html, mapping


# ============================================
# JSON EXTRACTION
# ============================================

def extract_from_json(
    content_json: Optional[str],
    nav_id: int,
    *,
    force: bool = False,
) -> Tuple[Optional[str], Dict[str, Any]]:
    """
    Extract data-URIs from a GrapesJS project JSON.

    Walks the structure recursively and replaces every string that
    contains a `data:` URI. The same threshold policy as for HTML
    applies, unless force=True.

    Returns (new_json, mapping).
    """
    mapping: Dict[str, Any] = {
        "extracted": 0,
        "skipped": 0,
        "errors": 0,
        "replaced": {},
    }

    if not content_json or "data:" not in content_json:
        return content_json, mapping

    try:
        obj = json.loads(content_json)
    except (TypeError, ValueError):
        return content_json, mapping

    # ---- 1. Collect every data-URI (by walking) ----
    strings: list[Tuple[list, str]] = []   # (path, value) — for replacement later
    uris_seen: list[Tuple[str, str, Optional[bytes], int]] = []

    def walk(node: Any, path: list) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + [k])
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, path + [i])
        elif isinstance(node, str):
            if "data:" not in node:
                return
            strings.append((path, node))
            for m in _DATA_URI_RE.finditer(node):
                uri_full = m.group(0)
                mime = (m.group("mime") or "").strip() or "application/octet-stream"
                b64 = m.group("b64") or ""
                data = _decode_data_uri(mime, b64)
                uris_seen.append((uri_full, mime, data, len(data) if data else 0))

    walk(obj, [])

    if not uris_seen:
        return content_json, mapping

    total_size = sum(size for _, _, data, size in uris_seen if data is not None)
    page_over_limit = total_size > TOTAL_BYTES

    # ---- 2. Save the URIs that need extraction ----
    for uri_full, mime, data, size in uris_seen:
        if data is None:
            mapping["errors"] += 1
            continue

        should_extract = force or page_over_limit or size > THRESHOLD_BYTES
        if not should_extract:
            mapping["skipped"] += 1
            continue

        if uri_full in mapping["replaced"]:
            continue

        try:
            url = _write_file(nav_id, data, mime)
        except Exception:
            mapping["errors"] += 1
            mapping["replaced"][uri_full] = None
            continue

        mapping["extracted"] += 1
        mapping["replaced"][uri_full] = url

    # ---- 3. Replace in every collected string ----
    def replace_in_value(value: str) -> str:
        for old_uri, new_url in mapping["replaced"].items():
            if new_url is None:
                continue
            value = value.replace(old_uri, new_url)
        return value

    def walk_replace(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: walk_replace(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk_replace(v) for v in node]
        if isinstance(node, str) and "data:" in node:
            return replace_in_value(node)
        return node

    obj = walk_replace(obj)
    new_json = json.dumps(obj, ensure_ascii=False)

    return new_json, mapping