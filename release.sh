#!/bin/bash
# release.sh — build and publish neurocad to PyPI + GitHub
# Usage: ./release.sh
#
# Перед сборкой скрипт находит "лишние" папки, которые могли
# случайно оказаться в текущем каталоге (app, base, core, media,
# mid, static), показывает их полный путь и спрашивает подтверждение
# ПО КАЖДОЙ отдельно. Только после явного "y" папка удаляется.
# Ничего не удаляется автоматически.

set -e  # stop on any error

VERSION="1.0.7"
TAG="v${VERSION}"

# Папки, которые не должны лежать в корне проекта.
# Скрипт НЕ удаляет их "вслепую" — только после подтверждения.
UNWANTED_DIRS=(
    "app"
    "core"
    "media"
    "log"
    "mig"
    "static"
)

echo "=== 0. Sanity check: unwanted directories ==="
echo "Проверяю, нет ли в текущей папке лишних каталогов:"
echo "  ${UNWANTED_DIRS[*]}"
echo ""

REMOVED_ANY=0

for name in "${UNWANTED_DIRS[@]}"; do
    # Полный путь к кандидату в текущей рабочей директории.
    target="$(pwd)/${name}"

    # Проверяем, что это именно директория (а не файл/симлинк).
    if [ ! -e "${target}" ]; then
        continue
    fi
    if [ ! -d "${target}" ]; then
        echo "  [skip] ${target} — это не директория, пропускаю"
        continue
    fi

    # Дополнительная защита: не удаляем симлинки.
    if [ -L "${target}" ]; then
        echo "  [skip] ${target} — симлинк, пропускаю"
        continue
    fi

    # Показываем полный путь и спрашиваем.
    echo "----------------------------------------"
    echo "Найдена папка:"
    echo "  ${target}"
    echo ""
    echo "Что внутри (первые 10 записей):"
    ls -la "${target}" 2>/dev/null | head -n 12 | sed 's/^/    /'
    echo ""
    read -r -p "Удалить '${target}'? [y/N] " answer
    case "${answer}" in
        y|Y|yes|YES)
            rm -rf "${target}"
            echo "  → удалено: ${target}"
            REMOVED_ANY=1
            ;;
        *)
            echo "  → оставлено: ${target}"
            ;;
    esac
done

if [ "${REMOVED_ANY}" -eq 0 ]; then
    echo ""
    echo "Лишних папок не найдено — идём дальше."
fi

echo ""
echo "=== 0b. Sanity check: .env.example ==="
if [ ! -f ".env.example" ]; then
    echo "WARNING: .env.example not found in project root"
    echo "         It will not be included in the distribution."
fi

echo ""
echo "=== 0c. Sanity check: source DB ==="
SRC_DB="test/base/neurocad.db"
if [ ! -f "${SRC_DB}" ]; then
    echo "WARNING: source DB not found: ${SRC_DB}"
    echo "         demo export will create an empty base/demo/"
fi

echo ""
echo "=== 0d. Export demo data from test DB ==="
DEMO_OUT="base/demo"

if [ -f "${SRC_DB}" ]; then
    python -m neurocad.utils.dbsqlite.demo_export \
        --db "${SRC_DB}" \
        --out "${DEMO_OUT}"
else
    echo "Source DB not found — creating empty demo folder"
    mkdir -p "${DEMO_OUT}"
    cat > "${DEMO_OUT}/manifest.json" << 'EOF'
{
  "version": 1,
  "applied": false,
  "tables": []
}
EOF
fi

echo ""
echo "=== 1. Clean old dist ==="
rm -rf dist/

echo "=== 2. Build package ==="
python -m build

echo "=== 2b. Inspect wheel contents ==="
WHEEL=$(ls dist/*.whl 2>/dev/null | head -n 1)
if [ -n "${WHEEL}" ]; then
    echo "Wheel: ${WHEEL}"
    echo ""
    echo "Looking for .env.example ..."
    python -m zipfile -l "${WHEEL}" | grep "env\.example" || \
        echo "  (MISSING .env.example — check force-include)"
    echo ""
    echo "Looking for neurocad/base/demo/ ..."
    python -m zipfile -l "${WHEEL}" | grep "neurocad/base/demo/" | head -n 10 || \
        echo "  (MISSING neurocad/base/demo/ — check force-include)"
    echo ""
    echo "Looking for editor/images/files/*.svg ..."
    python -m zipfile -l "${WHEEL}" | grep "editor/images/files/.*\.svg" | head -n 5 || \
        echo "  (no SVG found — check exclude/force-include)"
    echo ""
    echo "Looking for the demo_import module ..."
    python -m zipfile -l "${WHEEL}" | grep "dbsqlite/demo_import" || \
        echo "  (MISSING dbsqlite/demo_import — check package tree)"
fi

echo "=== 3. Upload to PyPI (token will be requested) ==="
python -m twine upload dist/*

echo "=== 4. Commit and push changes to GitHub ==="
git add .
git commit -m "Release ${VERSION}" || echo "(nothing to commit)"
git push origin main

echo "=== 5. Create tag ${TAG} ==="
git tag -a "${TAG}" -m "Release ${VERSION}"
git push origin "${TAG}"

echo "=== 6. Create GitHub Release from RELEASE_NOTES.md ==="
if [ ! -f "RELEASE_NOTES.md" ]; then
    echo "RELEASE_NOTES.md not found — aborting GitHub Release step"
    exit 1
fi

gh release create "${TAG}" \
    --title "neurocad ${VERSION}" \
    --notes-file RELEASE_NOTES.md

echo ""
echo "=== Done ==="