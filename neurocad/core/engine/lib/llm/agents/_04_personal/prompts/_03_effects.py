# core/engine/lib/llm/agents/_04_personal/prompts/_03_effects.py

"""Effects-stage prompt: add visual effects to a single section."""

from typing import List, Optional


class CoreEngineLibLlmAgentsPersonalPromptsEffects:
    """Stage 3: effects for one target section."""

    @classmethod
    def build(
        cls,
        target_section: str,
        current_html: str = "",
        base_css: str = "",
        color_hint: Optional[str] = None,
        effects: Optional[List[str]] = None,
        seed: Optional[int] = None,
    ) -> str:
        html_context = (current_html or "").strip() or "(пусто)"
        css_context = (base_css or "").strip() or "(пусто)"

        picked = effects or []
        effects_list = "\n".join(f"- {e}" for e in picked) if picked else "- (выбери сам 3–4 уместных эффекта)"

        color_block = ""
        if (color_hint or "").strip():
            color_block = f"""
ЦВЕТА ПОЛЬЗОВАТЕЛЯ (ОБЯЗАТЕЛЬНО СОБЛЮДАТЬ):
{color_hint.strip()}

ЖЁСТКИЙ ЗАПРЕТ НА ЦВЕТА:
- НЕ используй фиолетовый, сиреневый, пурпурный, лиловый.
- Конкретно запрещены hex: #a855f7, #7c3aed, #8b5cf6, #a78bfa, #c084fc, #9333ea, #6d28d9, #7e22ce, #d946ef, #e879f9.
- Если пользователь просит голубой/синий — используй: #22d3ee, #06b6d4, #67e8f9, #38bdf8, #0ea5e9, #0284c7, #4f6ef7.
- Если сомневаешься между двумя оттенками — выбирай тот, что ближе к голубому/синему.
"""

        return f"""
Ты — экспертный креативный фронтенд-разработчик. Твоя задача — добавить ЯРКИЕ, ЗАМЕТНЫЕ визуальные эффекты и анимации к секции «{target_section}».
{color_block}
Ты ДОЛЖЕН вернуть ответ СТРОГО в формате JSON:
{{
  "html": "<section class='{target_section}'>...</section>",
  "css": ".{target_section} .fx-{target_section}-name {{ ... }}"
}}

КОНТЕКСТ (НЕ ВКЛЮЧАЙ ЕГО В ОТВЕТ ЦЕЛИКОМ, только используй для понимания структуры и стилей):

Текущий HTML секции «{target_section}»:
{html_context}

Текущий БАЗОВЫЙ CSS секции «{target_section}» (без эффектов — только для справки, какие классы и свойства уже есть):
{css_context}

ЭФФЕКТЫ ДЛЯ ЭТОЙ ИТЕРАЦИИ (реализуй именно их):
{effects_list}

ЧТО ВЕРНУТЬ:
1. "html" — ПОЛНЫЙ HTML секции «{target_section}» с добавленными элементами эффектов. Сохрани существующие классы и контент, добавь новые классы при необходимости. Тег должен быть один: `<section class='{target_section}'>...</section>` (или `<footer>` для footer).
2. "css" — ТОЛЬКО НОВЫЕ правила для секции «{target_section}». Не повторяй базовые правила из контекста. Если нужно переопределить базовое свойство — верни это правило целиком. `@keyframes` возвращай полностью.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ИЗОЛЯЦИИ СТИЛЕЙ:
1. **КАЖДЫЙ селектор в CSS ОБЯЗАН начинаться с `.{target_section}`** — либо сам `.{target_section}`, либо `.{target_section} ` (пробел + вложенный селектор). Пример: `.hero .fx-hero-shine {{ ... }}`.
2. **Имена новых классов и `@keyframes` ОБЯЗАНЫ начинаться с `fx-{target_section}-`** (например `fx-hero-shine`, `fx-hero-fade`). Это защищает от конфликтов имён между секциями и базой.
3. ЗАПРЕЩЕНО писать селекторы без префикса `.{target_section}`.
4. ЗАПРЕЩЕНО использовать `:root`, `body`, `html`, `*`, глобальные переменные и `@font-face`.
5. `@keyframes` разрешены, их имена ОБЯЗАНЫ начинаться с `fx-{target_section}-`.
6. Внутри `@keyframes` не должно быть глобальных селекторов.
7. Внутри HTML используй ТОЛЬКО одинарные кавычки для атрибутов (`class='hero'`).
8. НЕ используй комментарии /* ... */ в CSS-ответе — сервер сам обернёт блок в маркеры.

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""