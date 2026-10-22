# core/engine/lib/llm/agents/_04_personal/html_ops.py

"""HTML helpers: extract / replace a section by name."""

import re
from typing import Optional

from .constants import SECTIONS


def _section_tag(section: str) -> str:
    """Return the HTML tag hint for a section (default 'section')."""
    for s in SECTIONS:
        if s["name"] == section:
            return s["tag"]
    return "section"


def _open_tag_re(section: str, tag: str) -> re.Pattern:
    """Match an opening tag whose class attribute contains the section name.

    Handles single/double quotes, any attribute order, extra classes.
    """
    return re.compile(
        rf"<{tag}\b[^>]*\bclass\s*=\s*(['\"])(?:(?!\1).)*\b{re.escape(section)}\b(?:(?!\1).)*\1[^>]*>",
        re.IGNORECASE,
    )


def _tag_open_re(tag: str) -> re.Pattern:
    """Match any opening tag of the given name."""
    return re.compile(rf"<{tag}\b", re.IGNORECASE)


def _tag_close_re(tag: str) -> re.Pattern:
    """Match any closing tag of the given name."""
    return re.compile(rf"</{tag}\s*>", re.IGNORECASE)


def extract_section(html: str, section: str) -> Optional[str]:
    """Return outer HTML of the section (with its tag), or None."""
    if not html:
        return None

    tag = _section_tag(section)
    m = _open_tag_re(section, tag).search(html)
    if not m:
        return None

    open_re = _tag_open_re(tag)
    close_re = _tag_close_re(tag)

    depth = 1
    pos = m.end()
    while depth > 0:
        nxt_close = close_re.search(html, pos)
        if nxt_close is None:
            return None
        nxt_open = open_re.search(html, pos)
        if nxt_open is not None and nxt_open.start() < nxt_close.start():
            depth += 1
            pos = nxt_open.end()
        else:
            depth -= 1
            pos = nxt_close.end()
            if depth == 0:
                return html[m.start():pos]
    return None


def replace_section(html: str, section: str, new_html: str) -> str:
    """Replace the section in `html`; raise ValueError if not found."""
    old = extract_section(html, section)
    if old is None:
        raise ValueError(f"Секция '{section}' не найдена в текущем HTML")
    return html.replace(old, new_html, 1)