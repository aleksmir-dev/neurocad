# neurocad/core/engine/lib/word/editor/images/service.py

"""
CoreEngineLibWordImagesService — read / write generated SVG files
and the images registry.

Two mirrored roots, same pattern as the effects service:

  MODEL_ROOT  — source of truth (the package tree):
      <MODEL_ROOT>/neurocad/core/engine/lib/word/editor/images/
          registry.json
          files/<id>.svg

  STATIC_ROOT — mirror served by the web server:
      <STATIC_ROOT>/core/engine/lib/word/editor/images/
          registry.json
          files/<id>.svg

Both are written on every POST/DELETE. Reads come from MODEL_ROOT.

The MODEL_ROOT path is derived from __file__ (it is the package
tree — one and the same for every running project). The STATIC_ROOT
path is derived from user_static_dir() in neurocad/utils/paths.py,
which is the single source of truth for the user's static directory
across the whole project. These two must NOT be computed the same
way: a package is shared, a project is not.

The path does NOT include the module name — images are shared across
all modules.

Namespace: CoreEngineLibWordImagesService
"""

import json
import os
import re
import tempfile
import uuid
from typing import List, Optional

from fastapi import HTTPException


# ============================================
# PATHS
# ============================================

IMAGES_PKG_SUBDIR = os.path.join(
    "neurocad", "core", "engine", "lib", "word", "editor", "images"
)
IMAGES_STATIC_SUBDIR = os.path.join(
    "core", "engine", "lib", "word", "editor", "images"
)
FILES_SUBDIR = "files"
REGISTRY_NAME = "registry.json"

#: Image id: img-<8 hex>.
IMAGE_ID_RE = re.compile(r"^img-[a-f0-9]{8,32}$")

#: Forbidden constructs in SVG (best-effort; same rules as step.py).
_FORBIDDEN_SVG = [
    re.compile(r"<script", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"\bon[a-z]+\s*=", re.IGNORECASE),
    re.compile(
        r"""(?:href|xlink:href)\s*=\s*['"]\s*(?:https?:)?//""",
        re.IGNORECASE,
    ),
]

#: Current registry schema version.
REGISTRY_VERSION = 1

#: File mode for every file this service writes (svg + registry).
#:
#: `tempfile.mkstemp()` creates a file with mode 0600 — only the
#: owner (root) can read it. That is fine for a private temp file,
#: but after `os.replace()` the mode carries over to the published
#: file, and the web server (running as nginx / www-data) gets
#: Permission denied → the browser shows a broken image.
#:
#: 0o644 = rw- r-- r-- : owner can write, everyone can read.
_FILE_MODE = 0o644


class CoreEngineLibWordImagesService:
    """Read / write image SVG files + registry in package + static trees."""

    # ============================================
    # PATH HELPERS
    # ============================================

    @staticmethod
    def _project_root() -> str:
        """
        Root of the PACKAGE checkout — the directory that contains
        the `neurocad/` Python package and a sibling `static/` tree.

        Derived from __file__: images → editor → word → lib →
        engine → core → neurocad → <package_root>.

        This is used only for the MODEL_ROOT (pkg) side — the tree
        that stores the source-of-truth SVG files and registry.json
        and ships with the package. It is the same for every running
        project that uses this checkout.

        Do NOT use this for the STATIC_ROOT side: a package is
        shared, a project is not. See _static_root() below.
        """
        here = os.path.abspath(__file__)
        return os.path.normpath(
            os.path.join(here, "..", "..", "..", "..", "..", "..", "..", "..")
        )

    @staticmethod
    def _static_root() -> str:
        """
        Static root — the tree served by the web server.

        Delegates to neurocad.utils.paths.user_static_dir(), which
        is the single source of truth for the user's static
        directory across the whole project. That helper returns
        Path("static") — resolved against the current working
        directory — which is exactly where uvicorn serves /static/
        from (cwd is the project root at runtime).

        Do NOT compute this from __file__: a package is shared, a
        project is not. Every running project (test, prod, CI) has
        its own static/ next to main.py. A previous version of this
        method hardcoded _project_root() / "test" / "static", which
        resolved to a package-relative path on prod, created a
        phantom "test" directory, and left every new SVG in a tree
        the web server never served.
        """
        from neurocad.utils.paths import user_static_dir
        return str(user_static_dir().resolve())

    @staticmethod
    def _pkg_images_dir() -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._project_root(),
            IMAGES_PKG_SUBDIR,
        )

    @staticmethod
    def _static_images_dir() -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._static_root(),
            IMAGES_STATIC_SUBDIR,
        )

    @staticmethod
    def _pkg_file_path(image_id: str) -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._pkg_images_dir(),
            FILES_SUBDIR,
            f"{image_id}.svg",
        )

    @staticmethod
    def _static_file_path(image_id: str) -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._static_images_dir(),
            FILES_SUBDIR,
            f"{image_id}.svg",
        )

    @staticmethod
    def _pkg_registry_path() -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._pkg_images_dir(),
            REGISTRY_NAME,
        )

    @staticmethod
    def _static_registry_path() -> str:
        return os.path.join(
            CoreEngineLibWordImagesService._static_images_dir(),
            REGISTRY_NAME,
        )

    # ============================================
    # VALIDATION
    # ============================================

    @staticmethod
    def _validate_image_id(image_id: str) -> None:
        if not image_id or not IMAGE_ID_RE.match(image_id):
            raise HTTPException(
                status_code=400,
                detail=f"Некорректный image_id: {image_id!r}",
            )

    @staticmethod
    def _sanitize_svg(svg: str) -> str:
        if not svg or not svg.strip():
            raise HTTPException(status_code=400, detail="Пустой SVG")

        low = svg.lower()
        if "<svg" not in low or "</svg>" not in low:
            raise HTTPException(
                status_code=400,
                detail="SVG должен содержать <svg>...</svg>",
            )

        for re_bad in _FORBIDDEN_SVG:
            if re_bad.search(svg):
                raise HTTPException(
                    status_code=400,
                    detail=f"SVG содержит запрещённую конструкцию: {re_bad.pattern}",
                )

        return svg

    # ============================================
    # REGISTRY — READ / WRITE
    # ============================================

    @staticmethod
    def _read_registry() -> dict:
        candidates = [
            CoreEngineLibWordImagesService._pkg_registry_path(),
            CoreEngineLibWordImagesService._static_registry_path(),
        ]

        for path in candidates:
            if os.path.isfile(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except (OSError, json.JSONDecodeError) as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Не удалось прочитать реестр {path}: {e}",
                    )

                if not isinstance(data, dict):
                    raise HTTPException(
                        status_code=500,
                        detail=f"Реестр {path} имеет неверный формат",
                    )

                if "images" not in data or not isinstance(data["images"], list):
                    data["images"] = []
                if "version" not in data:
                    data["version"] = REGISTRY_VERSION

                return data

        return {"version": REGISTRY_VERSION, "images": []}

    @staticmethod
    def _write_registry(registry: dict) -> None:
        payload = json.dumps(registry, ensure_ascii=False, indent=2)
        if not payload.endswith("\n"):
            payload += "\n"

        for path in (
            CoreEngineLibWordImagesService._pkg_registry_path(),
            CoreEngineLibWordImagesService._static_registry_path(),
        ):
            CoreEngineLibWordImagesService._write_atomic(path, payload)

    # ============================================
    # LIST
    # ============================================

    @staticmethod
    def list_images() -> List[dict]:
        """
        Return registered images sorted by `order`, then by `id`.

        Entries whose SVG file is missing in both trees are skipped.
        """
        registry = CoreEngineLibWordImagesService._read_registry()

        result: List[dict] = []
        for item in registry.get("images", []):
            image_id = item.get("id")
            if not image_id:
                continue

            pkg_path = CoreEngineLibWordImagesService._pkg_file_path(image_id)
            static_path = CoreEngineLibWordImagesService._static_file_path(image_id)
            if not os.path.isfile(pkg_path) and not os.path.isfile(static_path):
                continue

            result.append({
                "id": image_id,
                "alt": item.get("alt", ""),
                "file": item.get("file", f"{FILES_SUBDIR}/{image_id}.svg"),
                "source": item.get("source", "llm"),
                "builtin": bool(item.get("builtin", False)),
                "order": int(item.get("order", 100)),
            })

        result.sort(key=lambda e: (-e["order"], e["id"]))
        return result

    # ============================================
    # READ (one image)
    # ============================================

    @staticmethod
    def read_image(image_id: str) -> Optional[dict]:
        """
        Return the registry entry for the given image, or None.

        Does not return the SVG content itself — use read_image_svg
        for that (or fetch the file over HTTP).
        """
        CoreEngineLibWordImagesService._validate_image_id(image_id)

        registry = CoreEngineLibWordImagesService._read_registry()
        for item in registry.get("images", []):
            if item.get("id") == image_id:
                return item
        return None

    # ============================================
    # CREATE
    # ============================================

    @staticmethod
    def create_image(svg: str, alt: str = "", source: str = "llm") -> dict:
        """
        Create a new image:
          1. validate SVG (no script, no handlers, no external href);
          2. generate id (img-<8 hex>);
          3. write files/<id>.svg to package + static trees;
          4. append entry to the registry and write both trees.

        Returns {"id", "file", "bytes"}.
        """
        svg = CoreEngineLibWordImagesService._sanitize_svg(svg)

        # Generate a fresh id (8 hex chars — collision is astronomically
        # unlikely; retry if it somehow happens).
        for _ in range(5):
            image_id = f"img-{uuid.uuid4().hex[:8]}"
            if CoreEngineLibWordImagesService.read_image(image_id) is None:
                break
        else:
            raise HTTPException(
                status_code=500,
                detail="Не удалось сгенерировать уникальный image_id",
            )

        # ---- Write SVG to both trees ----
        pkg_path = CoreEngineLibWordImagesService._pkg_file_path(image_id)
        static_path = CoreEngineLibWordImagesService._static_file_path(image_id)
        for path in (pkg_path, static_path):
            CoreEngineLibWordImagesService._write_atomic(path, svg)

        # ---- Append to registry, write both trees ----
        registry = CoreEngineLibWordImagesService._read_registry()
        order = CoreEngineLibWordImagesService._next_order(registry)

        entry = {
            "id": image_id,
            "alt": (alt or "").strip(),
            "file": f"{FILES_SUBDIR}/{image_id}.svg",
            "source": (source or "llm").strip() or "llm",
            "builtin": False,
            "order": order,
        }
        registry.setdefault("images", []).append(entry)
        CoreEngineLibWordImagesService._write_registry(registry)

        return {
            "id": image_id,
            "file": entry["file"],
            "bytes": len(svg.encode("utf-8")),
        }

    # ============================================
    # DELETE
    # ============================================

    @staticmethod
    def delete_image(image_id: str) -> dict:
        """
        Delete an image:
          1. validate id;
          2. refuse if builtin=True (400);
          3. remove entry from registry;
          4. remove SVG from package + static trees;
          5. write registry to both trees.

        Returns {"id", "deleted_files"}.
        """
        CoreEngineLibWordImagesService._validate_image_id(image_id)

        registry = CoreEngineLibWordImagesService._read_registry()

        found_idx = -1
        found_item = None
        for idx, item in enumerate(registry.get("images", [])):
            if item.get("id") == image_id:
                found_idx = idx
                found_item = item
                break

        if found_idx < 0:
            raise HTTPException(
                status_code=404,
                detail=f"Изображение {image_id} не найдено",
            )

        if bool(found_item.get("builtin", False)):
            raise HTTPException(
                status_code=400,
                detail=f"Встроенное изображение {image_id} нельзя удалить",
            )

        registry["images"].pop(found_idx)
        CoreEngineLibWordImagesService._write_registry(registry)

        deleted = 0
        for path in (
            CoreEngineLibWordImagesService._pkg_file_path(image_id),
            CoreEngineLibWordImagesService._static_file_path(image_id),
        ):
            if os.path.isfile(path):
                try:
                    os.remove(path)
                    deleted += 1
                except OSError as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Не удалось удалить {path}: {e}",
                    )

        return {
            "id": image_id,
            "deleted_files": deleted,
        }

    # ============================================
    # INTERNAL
    # ============================================

    @staticmethod
    def _next_order(registry: dict) -> int:
        max_order = 0
        for item in registry.get("images", []):
            try:
                o = int(item.get("order", 0))
            except (TypeError, ValueError):
                o = 0
            if o > max_order:
                max_order = o
        return max_order + 10 if max_order else 10

    @staticmethod
    def _write_atomic(path: str, content: str) -> None:
        directory = os.path.dirname(path)
        os.makedirs(directory, exist_ok=True)

        tmp_fd, tmp_path = tempfile.mkstemp(
            prefix=os.path.basename(path) + ".",
            suffix=".tmp",
            dir=directory,
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(content)

            # mkstemp() creates the file with mode 0600 (owner-only).
            # Bump it to 0644 BEFORE the atomic replace, so the
            # published file is readable by the web server / nginx,
            # not only by root.
            os.chmod(tmp_path, _FILE_MODE)

            os.replace(tmp_path, path)
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise