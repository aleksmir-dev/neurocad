# neurocad/core/engine/lib/word/llm/agent/create_page.py

"""
Agent: create_page.

Builds a full page in ONE LLM request — free-form HTML + CSS, split
into two separate strings. The model is not constrained to our ready
blocks (unlike the `create` agent), so the result can be more
varied and "alive".

This is the "one shot" page generator:

    user: "Сгенерируй крутую страницу о Боге"
    → LLM: {"html": "...", "css": "..."}
    → setComponents(html) + setStyle(css)

No plan / fill / effects / svg steps. No block catalog. One request,
one response. Faster than `create`, more creative, but the result
is less predictable — the model has full freedom over structure,
colors, fonts, and spacing.

Output shape
------------
The agent returns:
    {
        "message": str,
        "html":    str | None,   # page markup ONLY, without <style>
        "css":     str | None,   # all styles, WITHOUT the <style> tag
        "selector": None,
        "element_html": None,
    }

The `html` + `css` pair replaces the whole canvas. The frontend
applies them through two separate channels (`setComponents` /
`setStyle`), the same way the `create` agent does. Mixing <style>
into the HTML breaks GrapesJS — it silently drops the component
tree — so the split is not a stylistic choice, it is required.

Error handling
--------------
If the model returns something that does not look like HTML, the
agent returns html=None / css=None and a short error message. The
client leaves the canvas untouched.

Namespace: CoreEngineLibWordLlmAgentCreatePage
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.create_page import build_create_page_prompt


class CoreEngineLibWordLlmAgentCreatePage(CoreEngineLibWordLlmAgentBase):
    """Build a full page in one LLM request."""

    name = "create_page"

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

        # ---- emit: step at the start ----
        if emit:
            await emit({
                "type": "step",
                "step": "create_page",
                "message": "Генерирую страницу...",
            })

        system_prompt = build_create_page_prompt()

        # ---- user content ----
        # If the user is iterating on an existing page, pass the
        # current HTML as context so the model can revise it instead
        # of starting from scratch.
        user_parts = [user_message.strip()]
        if current_html and current_html.strip():
            trimmed = current_html.strip()
            if len(trimmed) > 8000:
                trimmed = trimmed[:8000] + "\n<!-- ... (сокращено) -->"
            user_parts.append("")
            user_parts.append("--- BEGIN CURRENT PAGE HTML ---")
            user_parts.append(trimmed)
            user_parts.append("--- END CURRENT PAGE HTML ---")
            user_parts.append("")
            user_parts.append(
                "Если пользователь просит поправить существующую страницу — "
                "отредактируй её согласно запросу и верни обновлённый JSON "
                "с полями html и css. Если просит сгенерировать с нуля — "
                "верни новую страницу."
            )
        user_content = "\n".join(user_parts)

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="create_page",
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[create_page] dump request failed: {e}", flush=True)

        # ---- build messages ----
        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": user_content})

        # ---- provider call ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            print(f"[create_page] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "html": None,
                "css": None,
                "selector": None,
                "element_html": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="create_page",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[create_page] dump response failed: {e}", flush=True)

        # ---- parse ----
        html, css = self._extract_html_and_css(raw)
        if not html:
            print(
                f"[create_page] model returned a non-html answer: "
                f"{str(raw)[:200]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз.",
                "html": None,
                "css": None,
                "selector": None,
                "element_html": None,
            }

        # ---- wrap in scope class if missing ----
        html = self._ensure_scope(html)

        return {
            "message": "Страница сгенерирована.",
            "html": html,
            "css": css,
            "selector": None,
            "element_html": None,
        }

    # ============================================
    # PARSING
    # ============================================

    @staticmethod
    def _extract_html_and_css(text: str) -> tuple[str, str]:
        """
        Pull HTML and CSS out of the model response.

        The model may return:
          - JSON {"html": "...", "css": "..."}   (preferred)
          - raw HTML with an inline <style>...</style> block
          - raw HTML without any CSS
          - a markdown fenced block ```...``` around any of the above

        Returns (html, css). Both may be empty strings.

        For the HTML+<style> path, every <style> block is REMOVED
        from html and its contents concatenated into css. This is
        required by GrapesJS: it cannot parse <style> mixed into
        components, and silently drops the whole tree when it sees
        one.
        """
        if not text:
            return "", ""

        s = text.strip()

        # ---- strip markdown fence ----
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # ---- 1. Try JSON with html / css fields ----
        try:
            import json
            data = json.loads(s)
            if isinstance(data, dict):
                html = data.get("html") or ""
                css = data.get("css") or ""
                if isinstance(html, str) and html.strip():
                    return html.strip(), (css or "").strip()
        except Exception:
            pass

        # ---- 2. Try the first {...} JSON block ----
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            head = s[start:start + 60]
            if '"html"' in head or '"html"' in s[start:end + 1][:200]:
                try:
                    import json
                    data = json.loads(s[start:end + 1])
                    if isinstance(data, dict):
                        html = data.get("html") or ""
                        css = data.get("css") or ""
                        if isinstance(html, str) and html.strip():
                            return html.strip(), (css or "").strip()
                except Exception:
                    pass

        # ---- 3. Fallback: extract <style> blocks from raw HTML ----
        import re
        style_re = re.compile(
            r"<style\b[^>]*>(.*?)</style>",
            re.DOTALL | re.IGNORECASE,
        )
        css_chunks = [m.group(1).strip() for m in style_re.finditer(s)]
        css = "\n\n".join(c for c in css_chunks if c)
        html = style_re.sub("", s).strip()

        if html.startswith("<") and ">" in html:
            return html, css

        return "", ""

    @staticmethod
    def _ensure_scope(html: str) -> str:
        """
        Make sure the generated HTML is wrapped in the standard
        scope class `.core-engine-lib-word-blocks`.

        The editor and the public page both apply that class to the
        wrapper; without it, our theme variables and reset rules do
        not kick in. The model sometimes emits its own wrapper — we
        only add ours if the standard class is not already present.

        Only the HTML is wrapped. The CSS is applied separately by
        the frontend, so it is not touched here.
        """
        if not html:
            return html
        if "core-engine-lib-word-blocks" in html[:2000]:
            return html

        return (
            '<div class="core-engine-lib-word-blocks">\n'
            f'{html}\n'
            '</div>'
        )