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

VERSION="0.1.21"
TAG="v${VERSION}"

# Папки, которые не должны лежать в корне проекта.
# Скрипт НЕ удаляет их "вслепую" — только после подтверждения.
UNWANTED_DIRS=(
    "app"
    "base"
    "core"
    "media"
    "mid"
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
echo "=== 1. Clean old dist ==="
rm -rf dist/

echo "=== 2. Build package ==="
python -m build

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