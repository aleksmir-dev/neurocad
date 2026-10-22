# core/engine/lib/llm/agents/_04_personal/state.py

"""PageState — single mutable state for the _04_personal agent."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .constants import SECTION_NAMES


@dataclass
class PageState:
    """HTML + CSS-by-section + dialog history for one page generation."""

    html: str = ""
    css_by_section: Dict[str, str] = field(default_factory=dict)
    color_hint: Optional[str] = None
    history: List[dict] = field(default_factory=list)

    def ensure_sections(self) -> None:
        """Make sure css_by_section has a key for every known section."""
        for name in SECTION_NAMES:
            self.css_by_section.setdefault(name, "")

    def to_dict(self) -> dict:
        """Serialize for the API response / DB."""
        return {
            "html": self.html,
            "css_by_section": dict(self.css_by_section),
            "color_hint": self.color_hint,
            "history": list(self.history),
        }

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> "PageState":
        """Build from a dict (request.state or DB); never raises on None."""
        if not data:
            return cls()
        return cls(
            html=data.get("html") or "",
            css_by_section=dict(data.get("css_by_section") or {}),
            color_hint=data.get("color_hint"),
            history=list(data.get("history") or []),
        )