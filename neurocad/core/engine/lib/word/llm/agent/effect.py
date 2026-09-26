# neurocad/core/engine/lib/word/llm/agent/effect.py

"""
Agent: effect.

Two responsibilities, chosen by the user's request:

  EFFECT MODE (default)
    Add visual effects to ONE selected element on the canvas:
    backgrounds, gradients, animations, shadows, hover states. Any
    visual change that lives in a <style> block goes here — static
    background and animation alike.

  IMAGE MODE (triggered by "нарисуй картинку" / "сгенерируй иллюстрацию")
    Replace a placeholder <img> inside the selected element with a
    generated inline <svg>. One LLM request, up to three attempts.
    The <img>'s class and alt are transferred onto the generated svg,
    so existing CSS keeps applying. If the selection itself is the
    <img> (the marker is on it), the marker is transferred to the
    new <svg>.

The selected element is whatever the user clicked in the editor — a
whole block (<section>) or any inner node (<div>, <h1>, <a>, <img>).

Returns:
    {
        "selector":     "sel-abc12345",   # the marker from selection
        "element_html": "<section ...>...</section>",
        "message":      "Эффект добавлен." | "Иллюстрация создана.",
    }

The client replaces the element with `data-selected-id="sel-abc12345"`
by the new HTML.

Marker integrity:
  The selection marker `data-selected-id="sel-..."` is the ONLY way
  the client can find the element back on the canvas. The model is
  asked to preserve it verbatim (rule 2 in EFFECT_SYSTEM_PROMPT), but
  models drift — they drop the attribute, change its value, move it
  to another tag, or insert extra whitespace.

  To defend against that, this agent does TWO things after parsing:

    1. If the expected marker is missing from the parsed HTML, the
       whole response is REJECTED (selector=None) — the client skips
       the update, the page is not damaged.

    2. If a `data-selected-id` attribute is present but its value is
       NOT the expected selector, the response is also REJECTED.
       Silent substitution is worse than a clear error: if we rewrote
       the value, the client would replace a DIFFERENT element than
       the one the user had selected.

  IMAGE MODE has the same guarantees: after the <img> → <svg>
  replacement we re-check the marker. If the marker was on the <img>
  itself, it is moved onto the new <svg>; if it was on an ancestor,
  it must still be there unchanged.

Intermediate events: a single `step` event is emitted at the start,
then the LLM answer is returned via the standard result shape.

Safety:
  If the model returns something that does not look like HTML (an
  error message, an explanation, an empty string, a bare JSON object
  without the "html" field), the agent returns selector=None and
  element_html=None. The client will then skip the update entirely,
  so the page is not damaged by a bad response.
"""

import json
import re
from typing import Any, Dict, Optional, Tuple

from .base import CoreEngineLibWordLlmAgentBase
from ..prompts.svg import build_svg_illustration_prompt


#: Matches `data-selected-id="<value>"` in either single or double
#: quotes. The value can contain latin letters, digits, dashes and
#: underscores — everything we generate as a marker.
_SELECTED_ID_RE = re.compile(
    r"""data-selected-id\s*=\s*(?:"([^"]*)"|'([^']*)')""",
    re.IGNORECASE,
)

#: Matches a full `<img ...>` tag (self-closing or not).
_IMG_TAG_RE = re.compile(
    r"<img\b[^>]*?>",
    re.IGNORECASE | re.DOTALL,
)

#: Attribute extractor inside a raw tag string.
_ATTR_RE = re.compile(
    r"""\b(?P<name>[a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"(?P<dq>[^"]*)"|'(?P<sq>[^']*)')""",
    re.DOTALL,
)

#: Max attempts for one image.
_MAX_SVG_ATTEMPTS = 3

#: Default viewBox if the model did not provide one.
_DEFAULT_VIEWBOX = "0 0 800 600"

#: Keywords that select IMAGE MODE instead of EFFECT MODE.
#: Case-insensitive substring match against the user message.
_IMAGE_INTENT_KEYWORDS = (
    "нарисуй",
    "нарисовать",
    "сгенерируй картинку",
    "сгенерируй изображение",
    "сгенерируй иллюстрацию",
    "сделай картинку",
    "сделай изображение",
    "сделай иллюстрацию",
    "картинку",
    "изображение",
    "иллюстрацию",
    "иллюстрация",
    "svg",
)


class CoreEngineLibWordLlmAgentEffect(CoreEngineLibWordLlmAgentBase):
    """Add visual effects OR generate an SVG for one selected element."""

    name = "effect"

    # ============================================
    # EFFECT MODE — system prompt
    # ============================================

    EFFECT_SYSTEM_PROMPT = """Ты — дизайнер для CMS NeuroCad.

Тебе дают ОДИН HTML-элемент (это может быть секция, div, заголовок,
кнопка — любой узел) и запрос пользователя.
Ты добавляешь к нему визуальные эффекты.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "selector": "sel-abc12345",
  "html": "<section ...>...</section>\\n<style>.effect-xxxx { ... }</style>"
}

ПРАВИЛА:
1. НЕ меняй структуру HTML и классы. Только добавляй эффекты.
2. Корневой тег и все его атрибуты — СОХРАНИ как есть, включая
   `data-selected-id`. ЗНАЧЕНИЕ `data-selected-id` ДОЛЖНО остаться
   РОВНО таким, как во входе, символ в символ.
3. Для эффектов используй <style>-блок:
   - сгенерируй уникальный префикс, например effect-a3f7;
   - добавь его как класс к корневому элементу;
   - в конце блока вставь <style>, каждое правило начинается
     с этого префикса.
4. Внутри <style> используй var(--theme-*) для цветов.
5. Можно: @keyframes, linear-gradient, radial-gradient, conic-gradient,
   transform, box-shadow, transition, filter, backdrop-filter, mask.
6. Не добавляй inline-стили (style="...").
7. Поле "selector" — ровно то, что было во входе.
8. Поле "html" — ТОЛЬКО HTML этого элемента + <style>.
9. Не добавляй пояснения до или после JSON.
10. Не оборачивай в markdown.

ГЛАВНОЕ ПРАВИЛО — ДЕЛАЙ РОВНО ТО, ЧТО ПРОСЯТ:
11. Не расширяй задачу. «Закрась жёлтым» = ОДНО правило
    background-color: <жёлтый>. НЕ градиент, НЕ анимация,
    НЕ ::before, НЕ box-shadow, НЕ hover.
12. «Сделай градиент» = linear-gradient или radial-gradient,
    и точка. Без анимации, без свечения.
13. «Добавь анимацию» = @keyframes + animation. Без смены фона,
    без hover.
14. Если пользователь не сказал «сделай красиво», «добавь эффектов»,
    «укрась» — НЕ добавляй больше ОДНОГО визуального приёма.
15. Простой цвет — это background-color: #xxxxxx.
    НЕ background-image. НЕ градиент.
16. Если не уверен — сделай минимальный вариант.
"""

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

        selection = selection or {}
        selector = selection.get("selector")
        target_html = selection.get("outer_html")

        # ---- IMAGE MODE ----
        # If the user asked for a picture and there is a selection,
        # we go straight into SVG generation. No <style> prompt, no
        # effects.
        if self._is_image_intent(user_message):
            if emit:
                await emit({
                    "type": "step",
                    "step": "image",
                    "message": "Рисую иллюстрацию...",
                })

            if not selector or not target_html:
                return {
                    "message": "Сначала выделите картинку или блок с картинкой.",
                    "html": None,
                    "selector": None,
                    "element_html": None,
                }

            return await self._run_image_mode(
                provider=provider,
                user_message=user_message,
                selector=selector,
                target_html=target_html,
                history=history,
                run_id=run_id,
                agent_name="effect-image",
            )

        # ---- EFFECT MODE (default) ----
        if emit:
            await emit({
                "type": "step",
                "step": "effect",
                "message": "Добавляю эффекты...",
            })

        if not selector or not target_html:
            return {
                "message": "Не выделен элемент. Кликните по элементу на странице и повторите.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        user_content = (
            f"Запрос пользователя: {user_message}\n\n"
            f"selector: {selector}\n\n"
            f"HTML элемента:\n{target_html}"
        )

        # ---- dump prompt ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="effect",
                system_prompt=self.EFFECT_SYSTEM_PROMPT,
                user_content=user_content,
                history=history,
            )
        except Exception as e:
            print(f"[effect] dump request failed: {e}", flush=True)

        # ---- build messages ----
        messages = [{"role": "system", "content": self.EFFECT_SYSTEM_PROMPT}]
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
            print(f"[effect] LLM error: {e}", flush=True)
            return {
                "message": f"⚠️ Ошибка LLM: {e}",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="effect",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[effect] dump response failed: {e}", flush=True)

        # ---- parse ----
        new_html = self._parse(raw, expected_selector=selector)

        # ---- safety: html must look like html AND keep the marker ----
        if not self._looks_like_html(new_html):
            print(
                f"[effect] model returned a non-html answer: "
                f"{new_html[:120]!r}",
                flush=True,
            )
            return {
                "message": "⚠️ Модель вернула некорректный ответ. Попробуйте ещё раз.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- safety: the marker must be EXACTLY the expected one ----
        marker_ok, found_marker = self._check_marker(new_html, selector)
        if not marker_ok:
            print(
                f"[effect] marker mismatch: expected {selector!r}, "
                f"found {found_marker!r} — refusing to send element_update",
                flush=True,
            )
            return {
                "message": (
                    "⚠️ Модель потеряла маркер выделенного элемента. "
                    "Попробуйте ещё раз или выделите элемент заново."
                ),
                "html": None,
                "selector": None,
                "element_html": None,
            }

        return {
            "message": "Эффект добавлен.",
            "html": None,
            "selector": selector,
            "element_html": new_html,
        }

    # ============================================
    # IMAGE MODE
    # ============================================

    async def _run_image_mode(
        self,
        *,
        provider,
        user_message: str,
        selector: str,
        target_html: str,
        history: Optional[list],
        run_id: Any,
        agent_name: str,
    ) -> Dict[str, Any]:
        """
        Replace a placeholder <img> inside the selected element with
        a generated inline <svg>.

        Handles two shapes of the selection:
          - the selection IS the <img> (marker on the img) — the
            marker is moved onto the new <svg>;
          - the selection is an ancestor (marker on the section) —
            the first <img> inside is replaced, marker stays where it
            is.

        On failure (no <img> in the selection, or all attempts fail),
        the original HTML is returned untouched and the message
        explains what happened.
        """
        # ---- find the first <img> in the selected html ----
        img_match = _IMG_TAG_RE.search(target_html)
        if not img_match:
            return {
                "message": "В выделенном элементе нет картинки для замены.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        img_tag = img_match.group(0)
        alt = self._attr(img_tag, "alt") or user_message or "иллюстрация"
        css_class = self._attr(img_tag, "class") or ""

        # Does the marker live ON the <img> itself?
        marker_on_img = self._check_marker(img_tag, selector)[0]

        # ---- attempt up to N times ----
        svg = None
        last_reason = ""
        for attempt in range(1, _MAX_SVG_ATTEMPTS + 1):
            svg, reason = await self._try_generate_svg(
                provider=provider,
                user_message=user_message,
                alt=alt,
                history=history,
                run_id=run_id,
                agent_name=agent_name,
                attempt=attempt,
            )
            if svg:
                break
            last_reason = reason or "invalid response"

        if not svg:
            print(
                f"[effect-image] gave up after {_MAX_SVG_ATTEMPTS} attempts: "
                f"{last_reason}",
                flush=True,
            )
            return {
                "message": "⚠️ Не удалось нарисовать иллюстрацию. Попробуйте ещё раз.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- merge class/alt/marker onto the svg ----
        svg = self._merge_attrs_into_svg(
            svg,
            alt=alt,
            css_class=css_class,
            marker=selector if marker_on_img else "",
        )

        # ---- build the new element html ----
        # Replace ONLY the first <img> occurrence.
        new_html = (
            target_html[:img_match.start()]
            + svg
            + target_html[img_match.end():]
        )

        # ---- safety: the marker must survive ----
        marker_ok, found_marker = self._check_marker(new_html, selector)
        if not marker_ok:
            print(
                f"[effect-image] marker mismatch: expected {selector!r}, "
                f"found {found_marker!r} — refusing to send element_update",
                flush=True,
            )
            return {
                "message": (
                    "⚠️ Потерян маркер выделенного элемента. "
                    "Попробуйте ещё раз или выделите элемент заново."
                ),
                "html": None,
                "selector": None,
                "element_html": None,
            }

        return {
            "message": "Иллюстрация создана.",
            "html": None,
            "selector": selector,
            "element_html": new_html,
        }

    async def _try_generate_svg(
        self,
        *,
        provider,
        user_message: str,
        alt: str,
        history: Optional[list],
        run_id: Any,
        agent_name: str,
        attempt: int,
    ) -> Tuple[Optional[str], str]:
        """
        One attempt: ask the LLM for an SVG for this alt text.

        Returns (svg, reason). `svg` is a cleaned `<svg>...</svg>`
        string, or None. `reason` explains why on failure (empty on
        success).
        """
        system_prompt = build_svg_illustration_prompt()
        user_content = (
            f"Общий запрос страницы: {user_message}\n\n"
            f"Alt изображения: {alt}\n\n"
            f"Попытка: {attempt}"
        )

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": user_content})

        # ---- dump ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name=agent_name,
                system_prompt=system_prompt,
                user_content=user_content,
                history=history,
            )
        except Exception:
            pass

        # ---- call ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            print(f"[effect-image] LLM error: {e}", flush=True)
            return (None, f"LLM error: {e}")

        # ---- dump ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name=agent_name,
                raw_response=raw,
            )
        except Exception:
            pass

        # ---- extract + validate ----
        svg = self._extract_svg(raw)
        if not svg:
            return (None, "no <svg> in response")

        ok, reason = self._validate_svg(svg)
        if not ok:
            return (None, reason)

        return (svg, "")

    # ============================================
    # INTENT
    # ============================================

    @staticmethod
    def _is_image_intent(user_message: str) -> bool:
        """
        True if the user's request looks like "generate a picture".

        The check is a case-insensitive substring match against a
        short keyword list. If the user writes both "эффект" and
        "картинка" — we treat it as an image request, because the
        word "картинка" is far more specific than "эффект".
        """
        if not user_message:
            return False
        low = user_message.lower()
        return any(k in low for k in _IMAGE_INTENT_KEYWORDS)

    # ============================================
    # PARSE
    # ============================================

    @staticmethod
    def _parse(text: str, expected_selector: str = "") -> str:
        """
        Extract the `html` field from the model response.

        Tolerates markdown wrappers and surrounding text. If the model
        returned JSON without `html`, falls back to the whole text.

        `expected_selector` is currently unused here — the marker
        integrity check happens later in `_check_marker`. The arg is
        kept for symmetry and future use.
        """
        if not text:
            return ""

        s = text.strip()

        # strip markdown fence
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # try the whole string
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                html = data.get("html", "")
                if html:
                    return str(html).strip()
        except Exception:
            pass

        # try the first {...} block
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(s[start:end + 1])
                if isinstance(data, dict):
                    html = data.get("html", "")
                    if html:
                        return str(html).strip()
            except Exception:
                pass

        # fallback: treat the whole response as HTML
        return s

    # ============================================
    # SVG HELPERS
    # ============================================

    @staticmethod
    def _extract_svg(text: str) -> Optional[str]:
        """
        Pull the first `<svg>...</svg>` out of the model response.

        Tolerates markdown fences and surrounding prose. If the
        response is JSON with an "svg" field, that is preferred.
        """
        if not text:
            return None

        s = text.strip()

        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
            if s.endswith("```"):
                s = s[:-3]
            s = s.strip()

        # JSON with an "svg" field.
        data = CoreEngineLibWordLlmAgentEffect._extract_json(s)
        if isinstance(data, dict):
            svg_field = data.get("svg")
            if isinstance(svg_field, str) and svg_field.strip():
                return svg_field.strip()

        start = s.lower().find("<svg")
        if start == -1:
            return None
        end = s.lower().rfind("</svg>")
        if end == -1 or end <= start:
            return None
        return s[start:end + len("</svg>")].strip()

    @staticmethod
    def _validate_svg(svg: str) -> Tuple[bool, str]:
        """
        Cheap sanity check on the extracted SVG.
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

    @staticmethod
    def _merge_attrs_into_svg(
        svg: str,
        *,
        alt: str,
        css_class: str,
        marker: str,
    ) -> str:
        """
        Put `class`, `alt` (as aria-label) and — if the marker was on
        the replaced <img> — the `data-selected-id` marker onto the
        root <svg>.
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
            attrs = f' viewBox="{_DEFAULT_VIEWBOX}"' + attrs

        if css_class and "class" not in attrs.lower():
            attrs += f' class="{css_class}"'

        if "role=" not in attrs.lower():
            attrs += ' role="img"'
        if alt and "aria-label=" not in attrs.lower():
            safe_alt = alt.replace('"', "&quot;")
            attrs += f' aria-label="{safe_alt}"'

        if marker and "data-selected-id=" not in attrs.lower():
            attrs += f' data-selected-id="{marker}"'

        return f"{head}{attrs}{close}{rest}"

    @staticmethod
    def _attr(tag: str, name: str) -> Optional[str]:
        """
        Extract an attribute value from a raw tag string. Case-
        insensitive, handles double- and single-quoted values.
        """
        if not tag:
            return None
        target = name.lower()
        for m in _ATTR_RE.finditer(tag):
            if m.group("name").lower() == target:
                return m.group("dq") if m.group("dq") is not None else m.group("sq")
        return None

    @staticmethod
    def _extract_json(text: str) -> Optional[dict]:
        if not text:
            return None
        s = text.strip()
        if s.startswith("```"):
            nl = s.find("\n")
            if nl != -1:
                s = s[nl + 1:]
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

    # ============================================
    # SAFETY
    # ============================================

    @staticmethod
    def _looks_like_html(text: str) -> bool:
        """
        Cheap sanity check that the model returned actual HTML and not
        an error message, an explanation, or an empty string.
        """
        if not text:
            return False
        s = str(text).strip()
        if not s:
            return False
        if s.startswith("⚠️"):
            return False
        if not s.startswith("<"):
            return False
        if ">" not in s:
            return False
        head = s[:60].lower()
        for bad in ("ошибка", "error", "ошибк", "превышено"):
            if bad in head:
                return False
        if "data-selected-id" not in s:
            return False
        return True

    @staticmethod
    def _check_marker(html: str, expected: str) -> Tuple[bool, Optional[str]]:
        """
        Verify that `data-selected-id` in `html` equals `expected`.
        """
        if not html or not expected:
            return (False, None)

        matches = _SELECTED_ID_RE.findall(html)
        if not matches:
            return (False, None)

        found_values = [(a or b).strip() for (a, b) in matches]
        first = found_values[0] if found_values else None

        for v in found_values:
            if v == expected:
                return (True, v)

        return (False, first)