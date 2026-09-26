# neurocad/core/engine/lib/word/editor/images/store.py

"""
Thin helpers for saving generated images from Python code (step.py).

Wraps CoreEngineLibWordImagesService so callers do not have to think
about HTTPException, tree paths, or the registry format.

Usage (from llm/step.py after a successful SVG generation):

    from ...images.store import save_generated_svg

    save_generated_svg(svg=svg, alt=alt, source="llm")

Returns the created image id, or None if the save failed (the caller
does NOT abort the run — the SVG stays in the page HTML, it just is
not added to the palette).
"""

import traceback

from .service import CoreEngineLibWordImagesService


def save_generated_svg(svg: str, alt: str = "", source: str = "llm") -> str | None:
    """
    Save an SVG to the images registry.

    - Returns the new image id on success.
    - Returns None on failure (validation error, IO error, etc.).
      Never raises — a failed save must not break the LLM run.
    """
    if not svg or "<svg" not in svg.lower():
        return None

    try:
        result = CoreEngineLibWordImagesService.create_image(
            svg=svg,
            alt=alt or "",
            source=source,
        )
        return result.get("id")
    except Exception as e:
        print(f"[ImageStore] save_generated_svg failed: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        return None