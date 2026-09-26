# neurocad/core/engine/lib/word/css_builder.py

"""
Build the full CSS of a page at save time.

Source of truth:
  - effects/registry.json  — effects (id = class, file = CSS path)
  - blocks/manifest.json   — blocks (css = file, classes = root classes)

No CSS parsing. Files are taken WHOLE, filtered by class presence in
the page HTML.

Order (same as in the editor canvas and word.js):
    content.css → blocks/*.css → fx/*.css → custom page CSS
"""

import json
import re
from pathlib import Path
from typing import List, Set


# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------

# css_builder.py = .../word/css_builder.py
# editor/        = .../word/editor/
_WORD_DIR = Path(__file__).resolve().parent
_EDITOR_DIR = _WORD_DIR / "editor"

CONTENT_CSS = _EDITOR_DIR / "css" / "content.css"

EFFECTS_DIR = _EDITOR_DIR / "effects"
EFFECTS_REGISTRY = EFFECTS_DIR / "registry.json"

BLOCKS_DIR = _EDITOR_DIR / "blocks"
BLOCKS_MANIFEST = BLOCKS_DIR / "manifest.json"


# ------------------------------------------------------------------
# Manifest loading (cached in memory)
# ------------------------------------------------------------------

_effects_cache = None
_blocks_cache = None


def _load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _effects() -> List[dict]:
    global _effects_cache
    if _effects_cache is None:
        data = _load_json(EFFECTS_REGISTRY)
        _effects_cache = data.get("effects", [])
    return _effects_cache


def _blocks() -> List[dict]:
    global _blocks_cache
    if _blocks_cache is None:
        data = _load_json(BLOCKS_MANIFEST)
        _blocks_cache = data.get("blocks", [])
    return _blocks_cache


# ------------------------------------------------------------------
# Class extraction
# ------------------------------------------------------------------

_CLASS_RE = re.compile(r'class="([^"]+)"', re.IGNORECASE)


def extract_classes(html: str) -> Set[str]:
    """
    Collect all class names used in the HTML.

    Not CSS parsing — just attribute extraction.
    """
    if not html:
        return set()
    classes: Set[str] = set()
    for chunk in _CLASS_RE.findall(html):
        for name in chunk.split():
            if name:
                classes.add(name)
    return classes


# ------------------------------------------------------------------
# File reading
# ------------------------------------------------------------------

def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


# ------------------------------------------------------------------
# Build
# ------------------------------------------------------------------

def build_full_page_css(content: str, custom_css: str = "") -> str:
    """
    Assemble the full CSS for one page.

    content    — page HTML (used only to extract class names)
    custom_css — the page's own CSS from GrapesJS Style Manager

    Returns the combined CSS as a single string.
    """
    used = extract_classes(content or "")

    parts: List[str] = []

    # 1. content.css — always, in full (variables, base classes).
    parts.append(_read_text(CONTENT_CSS))

    # 2. Blocks — whole file if any of its root classes is used.
    #    Order: as in blocks/manifest.json.
    for b in _blocks():
        css_file = b.get("css")
        if not css_file:
            continue
        classes = b.get("classes") or []
        if any(c in used for c in classes):
            parts.append(_read_text(BLOCKS_DIR / css_file))

    # 3. Effects — one file per effect, by class match.
    #    Order: as in effects/registry.json.
    for e in _effects():
        effect_id = e.get("id")
        if not effect_id or effect_id not in used:
            continue
        css_file = e.get("file")
        if not css_file:
            continue
        parts.append(_read_text(EFFECTS_DIR / css_file))

    # 4. Custom page CSS — from GrapesJS.
    if custom_css and custom_css.strip():
        parts.append(custom_css)

    return "\n\n".join(p for p in parts if p and p.strip())