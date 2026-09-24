#!/bin/bash
# release.sh — build and publish neurocad to PyPI + GitHub
# Usage: ./release.sh

set -e  # stop on any error

VERSION="0.1.20"
TAG="v${VERSION}"

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
# Annotated tag — standard for releases
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