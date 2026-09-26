# neurocad/core/engine/lib/word/llm/steps/common.py

"""
Common helpers for the multi-step LLM flow (plan / fill / effects / svg).

Namespace: CoreEngineLibWordLlmSteps

This module contains only pure helpers — no side effects, no state.
Every step module (plan.py, fill.py, effects.py, svg.py) imports from
here instead of duplicating the same code.

NOT INTENDED to be imported from outside the `steps/` package.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple


# ============================================
# CONSTANTS
# ============================================

#: Fallback viewBox if the model does not provide one.
DEFAULT_VIEWBOX = "0 0 800 600"

#: Max attempts per image (step 4).
MAX_SVG_ATTEMPTS = 3

#: Pause between two consecutive images (seconds).
INTER_IMAGE_DELAY_S = 1.0

#: Pause between two retry attempts of the SAME image (seconds).
RETRY_DELAY_S = 0.5

#: Substrings that mark an LLM error as "do not retry" — retrying
#: immediately would only make the rate limit / network problem worse.
NON_RETRYABLE_MARKERS = (
    "rate limit",
    "rate-limit",
    "ratelimit",
    "too many requests",
    "429",
    "timeout",
    "timed out",
    "connection reset",
    "connection refused",
    "connection aborted",
    "connection error",
    "read timeout",
    "gateway timeout",
    "504",
)

#: Matches an `<img ...>` tag whose src still points to placeholder.svg.
#: We only touch placeholder images — real photos inserted by the user
#: must never be replaced.
IMG_PLACEHOLDER_RE = re.compile(
    r"<img\b[^>]*?\bsrc\s*=\s*(?:\"[^\"]*placeholder\.svg[^\"]*\"|'[^']*placeholder\.svg[^']*')[^>]*?>",
    re.IGNORECASE | re.DOTALL,
)

#: Attribute extractor for a raw `<img ...>` tag string.
IMG_ATTR_RE = re.compile(
    r"""\b(?P<name>[a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"(?P<dq>[^"]*)"|'(?P<sq>[^']*)')""",
    re.DOTALL,
)


# ============================================
# LOGGING
# ============================================

def log(provider, level: str, message: str) -> None:
    """Write through provider.log if available, else silently."""
    log_obj = getattr(provider, "log", None)
    if log_obj is None:
        return
    fn = getattr(log_obj, f"log_{level}_sync", None)
    if fn is None:
        return
    try:
        fn(target="step", message=message)
    except Exception:
        pass


# ============================================
# MESSAGES BUILDER
# ============================================

def build_messages(
    system_prompt: str,
    user_content: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    """
    Build the messages array for the LLM.

    Order:
      - system prompt
      - previous dialogue turns (if any)
      - current user message
    """
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if history:
        for m in history:
            role = m.get("role")
            content = m.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": str(content)})

    messages.append({"role": "user", "content": user_content})
    return messages


# ============================================
# JSON / SVG EXTRACTION
# ============================================

def extract_json(text: str) -> Optional[dict]:
    """
    Pull a JSON object out of the model response.

    Tolerates markdown fences and surrounding prose. Returns the first
    valid JSON object found, or None.
    """
    if not text:
        return None

    s = text.strip()
    if s.startswith("```"):
        first_nl = s.find("\n")
        if first_nl != -1:
            s = s[first_nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()

    try:
        data = json.loads(s)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(s[start:end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    return None


def extract_svg(text: str) -> Optional[str]:
    """
    Pull the first `<svg>...</svg>` out of the model response.

    Tolerates markdown fences and surrounding prose. If the response
    is JSON with an "svg" field, that is preferred.
    """
    if not text:
        return None

    s = text.strip()

    # Strip a single markdown fence.
    if s.startswith("```"):
        nl = s.find("\n")
        if nl != -1:
            s = s[nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()

    # JSON with an "svg" field.
    data = extract_json(s)
    if isinstance(data, dict):
        svg_field = data.get("svg")
        if isinstance(svg_field, str) and svg_field.strip():
            return svg_field.strip()

    # First <svg ...> ... </svg> in the response.
    start = s.lower().find("<svg")
    if start == -1:
        return None
    end = s.lower().rfind("</svg>")
    if end == -1 or end <= start:
        return None
    return s[start:end + len("</svg>")].strip()


def validate_svg(svg: str) -> Tuple[bool, str]:
    """
    Cheap sanity check on the extracted SVG.

    Rules:
      - non-empty;
      - starts with `<svg`;
      - contains `</svg>`;
      - does NOT contain `<script`;
      - does NOT contain `on\\w+=` (event handlers);
      - does NOT contain `javascript:`;
      - does NOT contain `href="http` (external references).
    """
    if not svg:
        return (False, "empty")

    low = svg.lower()

    if not low.startswith("<svg"):
        return (False, "does not start with <svg")

    if "</svg>" not in low:
        return (False, "no closing </svg>")

    if "<script" in low:
        return (False, "contains <script>")

    if "javascript:" in low:
        return (False, "contains javascript:")

    if re.search(r"\bon[a-z]+\s*=", low):
        return (False, "contains event handler")

    if re.search(r"""(?:href|xlink:href)\s*=\s*['"]\s*(?:https?:)?//""", low):
        return (False, "contains external href")

    return (True, "")


def merge_attrs_into_svg(svg: str, *, alt: str, css_class: str) -> str:
    """
    Put `class` and `alt` (as `aria-label`) onto the root `<svg>`.

    The original `<img class="image gallery__item" alt="...">`
    becomes `<svg class="image gallery__item" aria-label="..."
    role="img" viewBox="...">`. That way the existing CSS for
    `.image` / `.gallery__item` still applies.
    """
    if not svg:
        return svg

    m = re.match(r"(<svg\b)([^>]*?)(>|/>)", svg, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return svg

    head = m.group(1)
    attrs = m.group(2) or ""
    close = m.group(3) or ">"
    rest = svg[m.end():]

    if "viewBox" not in attrs and "viewbox" not in attrs.lower():
        attrs = f' viewBox="{DEFAULT_VIEWBOX}"' + attrs

    if css_class and "class" not in attrs.lower():
        attrs += f' class="{css_class}"'

    if "role=" not in attrs.lower():
        attrs += ' role="img"'
    if alt and "aria-label=" not in attrs.lower():
        safe_alt = alt.replace('"', "&quot;")
        attrs += f' aria-label="{safe_alt}"'

    return f"{head}{attrs}{close}{rest}"


def img_attr(img_tag: str, name: str) -> Optional[str]:
    """
    Extract an attribute value from a raw `<img ...>` tag string.

    Returns the value or None. Case-insensitive on the attribute
    name. Handles both double- and single-quoted values.
    """
    if not img_tag:
        return None

    target = name.lower()
    for m in IMG_ATTR_RE.finditer(img_tag):
        if m.group("name").lower() == target:
            return m.group("dq") if m.group("dq") is not None else m.group("sq")
    return None


# ============================================
# RETRY / CHUNKING
# ============================================

def is_retryable_error(err: Optional[str]) -> bool:
    """
    True if the given error string should be retried, False if
    retrying would only make things worse.

    Non-retryable: rate limit, timeout, connection problems.
    Everything else is considered retryable.
    """
    if not err:
        return True

    low = err.lower()
    for marker in NON_RETRYABLE_MARKERS:
        if marker in low:
            return False
    return True


def split_into_chunks(
    ordered_ids: List[str],
    html_by_id: Dict[str, str],
    limit: int,
) -> List[List[str]]:
    """Split a list of block ids into chunks whose total HTML size <= limit."""
    chunks: List[List[str]] = []
    current: List[str] = []
    current_size = 0

    for bid in ordered_ids:
        size = len(html_by_id.get(bid, ""))

        if size > limit:
            if current:
                chunks.append(current)
                current = []
                current_size = 0
            chunks.append([bid])
            continue

        if current and current_size + size > limit:
            chunks.append(current)
            current = []
            current_size = 0

        current.append(bid)
        current_size += size

    if current:
        chunks.append(current)

    return chunks