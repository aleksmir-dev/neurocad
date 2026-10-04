#!/bin/bash
# Сбор ВСЕГО исходного кода NeuroCad для депонирования в Роспатент

ROOT="/root/projects/aleksmir-dev/neurocad/neurocad"
OUT="/root/projects/aleksmir-dev/neurocad/neurocad_deposit.txt"

> "$OUT"

# Титульный лист
cat >> "$OUT" << 'EOF'
================================================================================
ПРОГРАММА ДЛЯ ЭВМ
================================================================================
Название: Нейрокад
Правообладатель: Смирнов Алексей Владимирович, ИНН 233501934139
Автор: Смирнов Алексей Владимирович
Год создания: 2026
Язык программирования: Python, JavaScript, CSS, HTML
================================================================================

EOF

add_file() {
    local f="$1"
    if [ -f "$f" ]; then
        echo "" >> "$OUT"
        echo "================================================================================" >> "$OUT"
        echo "FILE: ${f#$ROOT/}" >> "$OUT"
        echo "================================================================================" >> "$OUT"
        cat "$f" >> "$OUT"
        echo "" >> "$OUT"
    fi
}

# Собираем ВСЕ файлы рекурсивно, кроме:
# - __pycache__ (кэш)
# - static (сборка)
# - картинок: .svg, .ico, .png, .jpg, .jpeg, .gif, .webp
# - .ipynb (ноутбуки)
# - БД: .db, .sqlite, .sqlite3
# - логов
find "$ROOT" -type f \
  -not -path "*/__pycache__/*" \
  -not -path "*/static/*" \
  -not -name "*.svg" \
  -not -name "*.ico" \
  -not -name "*.png" \
  -not -name "*.jpg" \
  -not -name "*.jpeg" \
  -not -name "*.gif" \
  -not -name "*.webp" \
  -not -name "*.ipynb" \
  -not -name "*.db" \
  -not -name "*.sqlite" \
  -not -name "*.sqlite3" \
  -not -name "*.log" \
  | sort | while read -r f; do
    add_file "$f"
done

echo ""
echo "Готово: $OUT"
ls -lh "$OUT"