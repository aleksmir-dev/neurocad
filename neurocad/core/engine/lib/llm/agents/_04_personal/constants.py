# core/engine/lib/llm/agents/_04_personal/constants.py

"""Constants for the _04_personal agent."""

from typing import List

# Page sections in visual top-to-bottom order (name = CSS key, tag = HTML hint).
SECTIONS: List[dict] = [
    {"name": "hero",     "tag": "section"},
    {"name": "projects", "tag": "section"},
    {"name": "footer",   "tag": "footer"},
]

SECTION_NAMES: List[str] = [s["name"] for s in SECTIONS]

# Server-only CSS markers around the effects block inside a section CSS string.
FX_MARKER_START = "/* fx:{section}:start */"
FX_MARKER_END   = "/* fx:{section}:end */"

# Effect class/keyframe names must start with fx-{section}-.
FX_PREFIX = "fx"


def fx_name(section: str, suffix: str) -> str:
    """Build fx-{section}-{suffix}."""
    return f"{FX_PREFIX}-{section}-{suffix}"


def is_fx_name(name: str, section: str) -> bool:
    """Check name starts with fx-{section}-."""
    return name.startswith(f"{FX_PREFIX}-{section}-")


# "replace" removes old effect block, "append" inserts inside it.
DEFAULT_EFFECTS_MODE = "replace"
VALID_EFFECTS_MODES = ("replace", "append")

# How many effects to sample per effects generation.
DEFAULT_N_EFFECTS = 4
MIN_N_EFFECTS = 1
MAX_N_EFFECTS = 8

# Retry budget for JSON responses (base/effects).
DEFAULT_JSON_RETRIES = 3