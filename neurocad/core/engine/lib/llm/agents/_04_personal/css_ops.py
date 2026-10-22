# core/engine/lib/llm/agents/_04_personal/css_ops.py

"""CSS helpers: marker-based effect blocks, strip, collect."""

import re
from typing import Dict

from .constants import (
    FX_MARKER_START,
    FX_MARKER_END,
    SECTION_NAMES,
)


def _start(section: str) -> str:
    """Render the start marker for a section."""
    return FX_MARKER_START.format(section=section)


def _end(section: str) -> str:
    """Render the end marker for a section."""
    return FX_MARKER_END.format(section=section)


def _block_re(section: str) -> re.Pattern:
    """Regex matching the whole effects block of a section."""
    s = re.escape(section)
    return re.compile(
        rf"/\* fx:{s}:start \*/.*?/\* fx:{s}:end \*/",
        re.DOTALL,
    )


def upsert_effects(css: str, section: str, new_css: str,
                   mode: str = "replace") -> str:
    """Insert or replace the effects block for a section."""
    current = css or ""
    new_css = (new_css or "").strip()
    start, end = _start(section), _end(section)

    if start in current:
        if mode == "replace":
            block = f"{start}\n{new_css}\n{end}"
            return _block_re(section).sub(block, current, count=1)
        # append — insert inside the existing block, before :end
        return current.replace(end, f"{new_css}\n{end}", 1)

    block = f"{start}\n{new_css}\n{end}"
    if not current.strip():
        return block
    return current.rstrip() + "\n\n" + block


def strip_effects(css: str) -> str:
    """Return section CSS without any effects blocks (base only)."""
    if not css:
        return ""
    return re.sub(
        r"/\* fx:[\w-]+:start \*/.*?/\* fx:[\w-]+:end \*/",
        "",
        css,
        flags=re.DOTALL,
    ).strip()


def collect_css(css_by_section: Dict[str, str]) -> str:
    """Join per-section CSS into one string, in section order."""
    parts = []
    for name in SECTION_NAMES:
        chunk = (css_by_section or {}).get(name, "")
        if chunk and chunk.strip():
            parts.append(chunk.strip())
    return "\n\n".join(parts)