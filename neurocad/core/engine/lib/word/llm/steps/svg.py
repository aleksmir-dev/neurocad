# neurocad/core/engine/lib/word/llm/steps/svg.py

"""
Step 4 of the multi-step LLM flow: SVG ILLUSTRATIONS.

Walks the assembled HTML, finds every `<img>` that still points at
`placeholder.svg`, and asks the LLM to produce an inline `<svg>` for
each of them — one request per image, strictly sequentially, up to
three attempts per image.

Every successfully generated SVG is ALSO saved to the images registry
(editor/images/), so it appears in the "Изображения" palette in the
editor. The save is best-effort: if it fails, the SVG still goes into
the page HTML.

Namespace: CoreEngineLibWordLlmSteps
"""

import asyncio
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from ..prompts.svg import build_svg_illustration_prompt
from ..dumper import CoreEngineLibWordLlmDumper
from .common import (
    INTER_IMAGE_DELAY_S,
    IMG_PLACEHOLDER_RE,
    MAX_SVG_ATTEMPTS,
    RETRY_DELAY_S,
    build_messages,
    extract_svg,
    img_attr,
    is_retryable_error,
    log,
    merge_attrs_into_svg,
    validate_svg,
)


async def step_svg_illustrations(
    user_message: str,
    assembled_html: str,
    provider,
    history: Optional[List[Dict[str, str]]] = None,
    run_id: Any = None,
    agent_name: str = "create",
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Step 4: replace placeholder images with generated inline SVGs.

    See the module docstring for the full description.
    """
    # ---- Collect placeholder images ----
    matches = list(IMG_PLACEHOLDER_RE.finditer(assembled_html))
    total = len(matches)

    log(
        provider, "info",
        f"svg start: agent={agent_name} run={run_id!r} "
        f"placeholders={total}",
    )

    if total == 0:
        # Nothing to do — return the html untouched.
        yield {"type": "result", "html": assembled_html}
        return

    yield {
        "type": "step",
        "step": "svg",
        "message": f"Рисую иллюстрации: {total}...",
    }

    # We rebuild the html piece by piece, replacing each match.
    # `cursor` tracks our position in the original string.
    parts: List[str] = []
    cursor = 0

    for idx, m in enumerate(matches, start=1):
        img_tag = m.group(0)
        alt = img_attr(img_tag, "alt") or ""
        cls = img_attr(img_tag, "class") or ""

        yield {
            "type": "svg_progress",
            "current": idx,
            "total": total,
            "alt": alt,
        }

        # ---- Append the untouched prefix before this match ----
        parts.append(assembled_html[cursor:m.start()])
        cursor = m.end()

        # ---- Attempt up to N times ----
        svg = None
        for attempt in range(1, MAX_SVG_ATTEMPTS + 1):
            svg, err = await _try_generate_svg(
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

            # ---- Decide whether to retry ----
            if is_retryable_error(err):
                if attempt < MAX_SVG_ATTEMPTS:
                    log(
                        provider, "info",
                        f"svg retry {attempt + 1}/{MAX_SVG_ATTEMPTS} "
                        f"after {RETRY_DELAY_S}s for alt={alt!r}",
                    )
                    await asyncio.sleep(RETRY_DELAY_S)
                    continue
                log(
                    provider, "warning",
                    f"svg attempt {attempt}/{MAX_SVG_ATTEMPTS} failed "
                    f"for alt={alt!r}",
                )
                continue
            else:
                log(
                    provider, "warning",
                    f"svg non-retryable error for alt={alt!r}: {err}",
                )
                break

        if svg:
            # Transfer class and alt from the <img> onto the <svg>.
            svg = merge_attrs_into_svg(svg, alt=alt, css_class=cls)

            # Save the generated SVG into the images registry, so
            # it appears in the "Изображения" palette. Non-fatal:
            # if the save fails, the SVG still goes into the page
            # HTML — we just do not add it to the palette.
            try:
                from ...editor.images.store import save_generated_svg
                image_id = save_generated_svg(
                    svg=svg, alt=alt, source="llm",
                )
                if image_id:
                    log(
                        provider, "info",
                        f"svg saved to registry: {image_id}",
                    )
                else:
                    log(
                        provider, "warning",
                        f"svg save failed for alt={alt!r}",
                    )
            except Exception as e:
                log(
                    provider, "warning",
                    f"save_generated_svg raised: {e}",
                )

            parts.append(svg)
            log(provider, "info", f"svg ok for alt={alt!r}")
        else:
            # Leave the placeholder untouched.
            parts.append(img_tag)
            log(
                provider, "warning",
                f"svg gave up for alt={alt!r} — placeholder kept",
            )

        # ---- Pause between images (but not after the last one) ----
        if idx < total and INTER_IMAGE_DELAY_S > 0:
            await asyncio.sleep(INTER_IMAGE_DELAY_S)

    # ---- Append the tail ----
    parts.append(assembled_html[cursor:])

    yield {"type": "result", "html": "".join(parts)}


async def _try_generate_svg(
    *,
    provider,
    user_message: str,
    alt: str,
    history: Optional[List[Dict[str, str]]],
    run_id: Any,
    agent_name: str,
    attempt: int,
) -> Tuple[Optional[str], str]:
    """
    One attempt: ask the LLM for an SVG for this alt text.

    Returns (svg, err):
      - on success: (svg_string, "")
      - on failure: (None, reason_string)
    """
    system_prompt = build_svg_illustration_prompt()
    user_content = (
        f"Общий запрос страницы: {user_message}\n\n"
        f"Alt изображения: {alt}\n\n"
        f"Попытка: {attempt}"
    )

    messages = build_messages(system_prompt, user_content, history)

    # ---- dump prompt ----
    try:
        CoreEngineLibWordLlmDumper.dump_step(
            run_id=run_id,
            agent_name=f"{agent_name}-svg",
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
        log(provider, "error", f"svg LLM error: {e}")
        return (None, f"LLM error: {e}")

    # ---- dump response ----
    try:
        CoreEngineLibWordLlmDumper.dump_response(
            run_id=run_id,
            agent_name=f"{agent_name}-svg",
            raw_response=raw,
        )
    except Exception:
        pass

    # ---- extract and validate ----
    svg = extract_svg(raw)
    if not svg:
        return (None, "no <svg> found in response")

    ok, reason = validate_svg(svg)
    if not ok:
        log(provider, "warning", f"svg rejected: {reason}")
        return (None, f"validation failed: {reason}")

    return (svg, "")