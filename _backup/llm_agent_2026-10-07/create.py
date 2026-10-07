# neurocad/core/engine/lib/word/llm/agent/create.py

"""
Agent: create.

Build a brand-new page from the block catalog. Runs the existing
multi-step flow: plan → fill → effects → svg. Returns the full page
HTML, which replaces the canvas.

This is the "default" behaviour of the editor: the user describes what
they want, the agent picks blocks, fills them, adds effects, and
finally draws SVG illustrations for every placeholder image.

Intermediate events (step, plan, fill_progress, svg_progress) are
forwarded to the client through the `emit` callback, so the user can
see each stage.

Step 3 (effects)
----------------
The effect catalog comes from the SAME source as the palette:
`CoreEngineLibWordEffectsService.list_effects()` reads
`word/editor/effects/registry.json` and returns every effect that is
really available in the editor. We pass that list into
`step_effects(effect_catalog=...)`, which forwards it into the
effects prompt. As a result, the model only ever sees effects that
actually exist — no more inventing `fx-*` classes that are not in
the registry.

Step 4 (svg illustrations)
--------------------------
`step_svg_illustrations` walks the assembled HTML and replaces every
`<img>` that still points at `placeholder.svg` with a generated
inline `<svg>`. One request per image, strictly sequential, up to
three attempts per image. On failure the placeholder is kept. The
image's class and alt are transferred onto the generated svg, so
existing CSS for `.image` / `.gallery__item` etc. still applies.

Element wrapping
----------------
Blocks from the "Элементы" category (headings, paragraphs, buttons,
images, …) arrive from step 2 as BARE elements (`<h2>…</h2>`,
`<p>…</p>`, `<a>…</a>`). If we dropped them into the page as-is,
they would sit directly in <body> with no section wrapper and no
spacing. So after assembling the page we scan the top-level nodes:
anything that is NOT a section-like container is wrapped in
`<section class="section">…</section>`. Section-like containers
(`section`, `article`, `header`, `footer`, `aside`, `main`, `nav`)
are left untouched.
"""

from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

from .base import CoreEngineLibWordLlmAgentBase


#: Top-level tags that already act as page sections. Anything with
#: one of these as its ROOT tag is left as-is; everything else is
#: wrapped in `<section class="section">…</section>`.
SECTION_TAGS = {
    "section",
    "article",
    "header",
    "footer",
    "aside",
    "main",
    "nav",
}

#: Wrapper used for bare elements. Matches `core-section` from the
#: block catalog, so styling (paddings, max-width, .container) works.
WRAPPER_TAG = "section"
WRAPPER_CLASS = "section"


class _TopLevelScanner(HTMLParser):
    """
    Split an HTML string into top-level node strings.

    The scanner tracks nesting depth. A node starts at the first
    opening tag when depth == 0, and ends when depth returns to 0.

    Text at the top level (whitespace, comments) is ignored — we
    only care about real elements. Anything unexpected (unbalanced
    tags, parse errors) is swallowed and the original string is
    kept intact by the caller.
    """

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self._parts: List[str] = []   # accumulated slices
        self._depth = 0
        self._node_start = -1          # index in the SOURCE string
        self._raw = ""                 # full source, set later
        self._void_tags = {
            "area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr",
        }

    def parse_string(self, html: str) -> List[str]:
        self._raw = html
        self._parts = []
        self._depth = 0
        self._node_start = -1
        try:
            self.feed(html)
            self.close()
        except Exception:
            # On any parser failure — return the whole string as a
            # single "node", so the caller wraps it as one piece.
            return [html] if html.strip() else []

        # Flush any trailing slice.
        if self._node_start != -1 and self._node_start < len(html):
            self._parts.append(html[self._node_start:])
        return self._parts

    # ---- parser callbacks ----

    def handle_starttag(self, tag, attrs):
        tag_l = tag.lower()
        if self._depth == 0 and self._node_start == -1:
            self._node_start = self.getpos_offset()
        if tag_l not in self._void_tags:
            self._depth += 1
        else:
            # Void element: if it is the only thing at top level, it
            # is a complete node by itself.
            if self._depth == 0:
                start = self._node_start if self._node_start != -1 else self.getpos_offset()
                end = self.getpos_offset() + self._raw_tag_len()
                self._parts.append(self._raw[start:end])
                self._node_start = -1

    def handle_startendtag(self, tag, attrs):
        # Self-closing syntax: `<img />`. Same logic as void tags.
        if self._depth == 0:
            start = self._node_start if self._node_start != -1 else self.getpos_offset()
            end = self.getpos_offset() + self._raw_tag_len()
            self._parts.append(self._raw[start:end])
            self._node_start = -1

    def handle_endtag(self, tag):
        tag_l = tag.lower()
        if tag_l in self._void_tags:
            return
        if self._depth > 0:
            self._depth -= 1
        if self._depth == 0 and self._node_start != -1:
            end = self.getpos_offset() + self._raw_tag_len()
            self._parts.append(self._raw[self._node_start:end])
            self._node_start = -1

    # ---- helpers ----

    def getpos_offset(self) -> int:
        """
        Convert the parser's (line, col) to a flat offset into the
        original string.
        """
        line, col = self.getpos()
        if line <= 1:
            return col
        # Sum lengths of previous lines + 1 char for the newline.
        offset = 0
        consumed = 0
        for i, ch in enumerate(self._raw):
            if consumed == line - 1:
                return i + col
            if ch == "\n":
                consumed += 1
        return len(self._raw)

    def _raw_tag_len(self) -> int:
        """
        Approximate the length of the tag currently being closed by
        scanning forward from the current position to the next `>`.
        """
        pos = self.getpos_offset()
        gt = self._raw.find(">", pos)
        return (gt - pos + 1) if gt != -1 else 1


class CoreEngineLibWordLlmAgentCreate(CoreEngineLibWordLlmAgentBase):
    """Build a new page from the block catalog."""

    name = "create"

    async def run(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit=None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
    ) -> Dict[str, Any]:

        from ..step import CoreEngineLibWordLlmStep

        catalog = block_catalog or []
        history = history or []

        # ---- STEP 1: PLAN ----
        plan: list = []
        async for event in CoreEngineLibWordLlmStep.step_plan(
            user_message, catalog, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            etype = event.get("type")
            if etype == "error":
                return {
                    "message": f"⚠️ {event['message']}",
                    "html": None,
                    "selector": None,
                    "element_html": None,
                }
            if etype == "result":
                plan = event["plan"]

        if not plan:
            return {
                "message": "Не удалось построить план блоков.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- STEP 2: FILL ----
        filled: dict = {}
        async for event in CoreEngineLibWordLlmStep.step_fill(
            user_message, plan, catalog, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            etype = event.get("type")
            if etype == "error":
                return {
                    "message": f"⚠️ {event['message']}",
                    "html": None,
                    "selector": None,
                    "element_html": None,
                }
            if etype == "result":
                filled = event["filled"]

        # ---- Assemble ----
        parts = []
        for item in plan:
            html = filled.get(item["block_id"])
            if html:
                parts.append(html)
        assembled_html = "\n".join(parts)

        if not assembled_html:
            return {
                "message": "Не удалось заполнить блоки.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- Wrap bare elements in <section class="section"> ----
        # Blocks from the "Элементы" category (and any other source
        # that produced a bare tag) get a section wrapper here, so
        # nothing ends up floating in <body> without spacing.
        assembled_html = self._wrap_bare_elements(assembled_html)

        # ---- Load effect catalog (for step 3) ----
        effect_catalog = self._load_effect_catalog(provider)

        # ---- STEP 3: EFFECTS ----
        after_effects_html = assembled_html
        async for event in CoreEngineLibWordLlmStep.step_effects(
            user_message, assembled_html, provider,
            history=history,
            effect_catalog=effect_catalog,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            if event.get("type") == "result":
                after_effects_html = event["html"]

        # ---- STEP 4: SVG ILLUSTRATIONS ----
        # Replace placeholder images with generated inline SVGs —
        # one request per image, up to three attempts each. On
        # failure the placeholder stays. See step_svg_illustrations
        # for the full rules.
        final_html = after_effects_html
        async for event in CoreEngineLibWordLlmStep.step_svg_illustrations(
            user_message, after_effects_html, provider,
            history=history,
            run_id=run_id,
            agent_name="create",
        ):
            if emit:
                await emit(event)

            if event.get("type") == "result":
                final_html = event["html"]

        return {
            "message": f"Страница собрана из {len(plan)} блоков.",
            "html": final_html,
            "selector": None,
            "element_html": None,
        }

    # ============================================
    # ELEMENT WRAPPING
    # ============================================

    def _wrap_bare_elements(self, html: str) -> str:
        """
        Wrap every top-level node that is NOT already a section-like
        container in `<section class="section">…</section>`.

        Top-level nodes are found by depth-tracking in a small HTML
        parser. On any parse error we return the input unchanged —
        we would rather keep the page as-is than mangle it.

        @param html — assembled page HTML
        @returns html with bare elements wrapped
        """
        if not html or not html.strip():
            return html

        try:
            scanner = _TopLevelScanner()
            nodes = scanner.parse_string(html)
        except Exception:
            # Fallback: don't touch anything.
            return html

        if not nodes:
            return html

        wrapped: List[str] = []
        for node in nodes:
            if self._is_section_like(node):
                wrapped.append(node)
            else:
                stripped = node.strip()
                if not stripped:
                    continue
                wrapped.append(
                    f'<{WRAPPER_TAG} class="{WRAPPER_CLASS}">'
                    f"{stripped}"
                    f"</{WRAPPER_TAG}>"
                )

        return "\n".join(wrapped)

    @staticmethod
    def _is_section_like(node: str) -> bool:
        """
        True if the first tag of `node` is one of SECTION_TAGS.

        `node` may start with whitespace or comments; we skip them
        to find the first `<tag`.
        """
        if not node:
            return False
        s = node.lstrip()
        if not s.startswith("<"):
            return False
        # Skip `<!-- ... -->` comments.
        while s.startswith("<!--"):
            end = s.find("-->")
            if end == -1:
                return False
            s = s[end + 3:].lstrip()
            if not s.startswith("<"):
                return False
        # Extract tag name.
        i = 1
        while i < len(s) and (s[i].isalnum() or s[i] in "-_"):
            i += 1
        tag = s[1:i].lower()
        return tag in SECTION_TAGS

    # ============================================
    # EFFECT CATALOG
    # ============================================

    def _load_effect_catalog(self, provider) -> list:
        """
        Load the list of effects that are actually available in the
        palette.

        Source of truth: `word/editor/effects/registry.json`, read
        through `CoreEngineLibWordEffectsService.list_effects()`.
        Returns a list of dicts:

            [{id, label, hint, file, media, builtin, order}, ...]

        If anything fails (service unavailable, JSON parse error,
        file missing), returns an empty list — the effects prompt
        then falls back to its hard-coded set. The create flow is
        NOT aborted: a missing catalog is a soft error, not a fatal
        one.
        """
        try:
            from ...editor.effects.service import (
                CoreEngineLibWordEffectsService,
            )
        except Exception as e:
            self._log_catalog_error(provider, f"import failed: {e}")
            return []

        try:
            effects = CoreEngineLibWordEffectsService.list_effects()
        except Exception as e:
            self._log_catalog_error(provider, f"list_effects failed: {e}")
            return []

        if not isinstance(effects, list):
            self._log_catalog_error(provider, "list_effects returned non-list")
            return []

        return effects

    @staticmethod
    def _log_catalog_error(provider, message: str) -> None:
        """Best-effort logging — never raises."""
        try:
            log = getattr(provider, "log", None)
            if log is not None:
                fn = getattr(log, "log_warning_sync", None)
                if fn is not None:
                    fn(target="create", message=f"effect catalog: {message}")
                    return
        except Exception:
            pass
        # Fallback: stdout
        print(f"[create] effect catalog error: {message}", flush=True)