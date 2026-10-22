# core/engine/lib/llm/agents/_04_personal/effects.py

"""Effect catalog and random sampler for the effects stage."""

import random
from typing import List, Optional

from .constants import DEFAULT_N_EFFECTS, MIN_N_EFFECTS, MAX_N_EFFECTS

# ~60 base effects; generative variants are added with modifiers below.
_BASE: List[str] = [
    "hover:scale",
    "hover:lift",
    "hover:glow",
    "hover:border",
    "hover:underline",
    "hover:shine",
    "hover:slide",
    "hover:tilt",
    "hover:blur",
    "hover:grayscale",
    "shadow:soft",
    "shadow:hard",
    "shadow:inset",
    "shadow:colored",
    "shadow:long",
    "clip:circle",
    "clip:polygon",
    "clip:inset",
    "text:gradient",
    "text:outline",
    "text:shadow",
    "text:glitch",
    "text:typewriter",
    "text:highlight",
    "icon:rotate",
    "icon:pulse",
    "icon:bounce",
    "icon:flip",
    "icon:spin",
    "button:fill",
    "button:outline",
    "button:ripple",
    "button:arrow",
    "button:gradient",
    "bg:pattern",
    "bg:stripes",
    "bg:dots",
    "bg:grid",
    "bg:noise",
    "border:animated",
    "border:dashed",
    "border:gradient",
    "border:double",
    "transition:fade",
    "transition:slide",
    "transition:zoom",
    "transition:flip",
    "transition:blur",
    "cursor:pointer",
    "cursor:custom",
    "focus:ring",
    "focus:outline",
    "focus:glow",
    "filter:sepia",
    "filter:contrast",
    "filter:saturate",
    "filter:hue",
    "overlay:darken",
    "overlay:lighten",
]

# Modifiers expanded into generative variants (color / speed / shape).
_MODIFIERS: List[str] = [
    "slow",
    "fast",
    "reverse",
    "alternate",
    "soft",
    "bold",
]


def _build_catalog() -> List[str]:
    """Expand base effects with modifiers into a flat catalog."""
    out: List[str] = list(_BASE)
    for eff in _BASE:
        for mod in _MODIFIERS:
            out.append(f"{eff}:{mod}")
    return out


# Built once at module level — classmethod cannot see cls._BASE otherwise.
EFFECT_CATALOG: List[str] = _build_catalog()


def sample_effects(n: Optional[int] = None,
                   seed: Optional[int] = None) -> List[str]:
    """Pick n random effects from the catalog (default 4)."""
    count = n if n is not None else DEFAULT_N_EFFECTS
    count = max(MIN_N_EFFECTS, min(MAX_N_EFFECTS, count))
    rnd = random.Random(seed)
    return rnd.sample(EFFECT_CATALOG, count)