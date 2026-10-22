# core/engine/lib/llm/agents/_04_personal/prompts/_03_effects.py

import random


class CoreEngineLibLlmAgentsPersonalPromptsEffects:

    # ---------------------------------------------------------------- #
    # Базовые ручные эффекты (реально разные приёмы)
    # ---------------------------------------------------------------- #
    _BASE = [
        # Движение фона
        "Движущиеся пятна (radial-gradient + @keyframes translate/scale).",
        "Параллакс-сдвиг фона при hover (background-position).",
        "Медленный дрейф градиента (background-position 0% → 100%, infinite).",
        "Волновая линия под заголовком (SVG path или ::after с animation).",
        "Мерцающие точки на фоне (opacity keyframes, как звёзды).",
        "Пульсирующий радиальный градиент в углу (scale + opacity).",
        "Наклонный световой блик по фону (linear-gradient + translateX).",
        "Шум/текстура поверх фона (SVG feTurbulence в background-image).",

        # Частицы
        "Летающие частицы вверх (translateY, opacity fade).",
        "Падающие частицы вниз (translateY + rotate).",
        "Орбитальные частицы вокруг элемента (rotate + translate).",
        "Разлетающиеся при hover частицы (::before/::after, scale + fade).",
        "Пульсирующие точки (scale 1 → 1.5, infinite).",

        # Текст
        "Градиентный текст с анимацией background-position (shine).",
        "Подчёркивание текста при hover (scaleX 0 → 1).",
        "Наклон текста при hover (skew / rotate).",
        "Расфокус и возврат текста (filter: blur keyframes).",
        "Цветовой сдвиг текста (hue-rotate при hover).",
        "Появление текста по буквам (clip-path inset).",
        "Магнитный hover текста (translate к курсору через transform).",
        "Двойной текст с offset (text-shadow дублируется).",

        # Карточки
        "Эффект «стекла» (backdrop-filter: blur + полупрозрачный фон).",
        "3D-hover карточки (perspective + rotateX/rotateY).",
        "Магнитный hover карточки (сдвиг к курсору).",
        "Стеклянная карточка с бликом (::after linear-gradient, translateX).",
        "Пульсирующая обводка (box-shadow расширяется и затухает).",
        "Появление при hover: clip-path или mask (раскрытие).",
        "Плавающая тень (filter: drop-shadow с анимацией).",
        "Качание карточки (rotate ±2deg, ease-in-out infinite).",
        "Подъём карточки с усилением тени (translateY + box-shadow).",
        "Градиентная рамка через border-image или ::before.",

        # Иконки
        "Вращение иконки (rotate 360deg infinite).",
        "Мягкое свечение вокруг иконки (box-shadow + scale).",
        "Подпрыгивание иконки при hover (translateY bounce).",
        "Пульсация иконки (scale 1 → 1.1, infinite).",
        "Смена цвета иконки при hover (color transition).",
        "Иконка «выпрыгивает» из карточки (translateZ при hover).",

        # Ссылки
        "Плавное подчёркивание ссылок (scaleX от 0 до 1).",
        "Ссылка с бегущим градиентом подчёркивания (background-position).",
        "Ссылка с выезжающей полосой слева (translateX).",
        "Ссылка с точкой-индикатором при hover (::before scale).",

        # Кнопки
        "Кнопка с заливкой слева направо при hover (::before width 0 → 100%).",
        "Кнопка с ripple-волной при hover (radial-gradient scale).",
        "Кнопка с 3D-нажатием (translateZ + box-shadow).",
        "Кнопка с обводкой, бегущей по периметру (conic-gradient + rotate).",

        # Разное
        "Счётчик/полоса прогресса с анимацией ширины.",
        "Волновой пульс (box-shadow расширяется и затухает).",
        "Стеклянный разделитель с бликом.",
        "Плавное появление секции при загрузке (fade + translateY).",
        "Лёгкое дыхание всей секции (scale 1 → 1.01, infinite).",
        "Сдвиг фона при скролле через animation-timeline (если поддерживается).",
        "Курсор-«прожектор» (radial-gradient следует за мышью через CSS-переменную).",
        "Маска-раскрытие контента по hover (clip-path circle).",
        "Тиснение текста (text-shadow inset-эффект).",
        "Неоновое свечение текста (text-shadow multiple + pulse).",
        "Хроматическая аберрация текста (text-shadow red/blue).",
        "Раздвоение текста при hover (::before/::after offset).",
        "Шахматный фон (repeating-conic-gradient).",
        "Полосы-сканлайны (repeating-linear-gradient + animation).",
        "Точечный фон (radial-gradient repeated).",
        "Сетка-фон (linear-gradient repeated).",
        "Зигзаг-разделитель (clip-path polygon).",
        "Лента-акцент (::before skew + gradient).",
    ]

    # ---------------------------------------------------------------- #
    # Генеративные варианты: базовый приём × модификатор
    # ---------------------------------------------------------------- #
    _MOTION_MODIFIERS = [
        "плавно (ease-in-out, 4s)",
        "быстро (ease-out, 0.3s)",
        "с задержкой (animation-delay 0.2s)",
        "пружинно (cubic-bezier(0.34, 1.56, 0.64, 1))",
        "бесконечно (infinite)",
        "только при hover",
        "только при focus-within",
        "с обратным направлением (reverse)",
    ]

    _BASE_FOR_VARIANTS = [
        "Движущиеся пятна (radial-gradient + @keyframes translate/scale).",
        "Летающие частицы (animation: translateY/translateX).",
        "Пульсирующая обводка (box-shadow с расширением и затуханием).",
        "Градиентный текст с анимацией background-position (shine).",
        "Стеклянная карточка с бликом (::after linear-gradient).",
        "3D-hover с perspective + rotateX/rotateY.",
        "Магнитный hover (сдвиг к курсору через transform).",
        "Мягкое свечение вокруг иконки (box-shadow + scale).",
        "Волновая линия под заголовком (::after с animation).",
        "Ссылка с бегущим градиентом подчёркивания.",
        "Кнопка с ripple-волной (radial-gradient scale).",
        "Лёгкое дыхание секции (scale 1 → 1.01).",
    ]

    # Объявляем пустой список, заполним его чуть ниже
    EFFECT_CATALOG = []

    @classmethod
    def _build_catalog(cls) -> list[str]:
        catalog = list(cls._BASE)
        for base in cls._BASE_FOR_VARIANTS:
            for mod in cls._MOTION_MODIFIERS:
                catalog.append(f"{base} Модификатор: {mod}.")
        
        seen = set()
        result = []
        for item in catalog:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    @classmethod
    def build(
        cls,
        target_section: str,
        current_html: str = "",
        current_css: str = "",
        color_hint: str = "",
        seed: int | None = None,
        n_effects: int = 4,
    ) -> str:
        html_context = current_html.strip() or "(пусто)"
        css_context = current_css.strip() or "(пусто)"

        rng = random.Random(seed)
        picked = rng.sample(cls.EFFECT_CATALOG, k=min(n_effects, len(cls.EFFECT_CATALOG)))
        effects_list = "\n".join(f"- {e}" for e in picked)

        color_block = ""
        if color_hint.strip():
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
  "css": ".{target_section} .class-name {{ ... }}"
}}

КОНТЕКСТ (НЕ ВКЛЮЧАЙ ЕГО В ОТВЕТ ЦЕЛИКОМ, только используй для понимания структуры и стилей):

Текущий HTML секции «{target_section}»:
{html_context}

Текущий CSS секции «{target_section}» (только для справки — какие классы и свойства уже есть):
{css_context}

ЭФФЕКТЫ ДЛЯ ЭТОЙ ИТЕРАЦИИ (выбери 3–4 из списка, реализуй именно их):
{effects_list}

Выбери из списка выше 3–4 эффекта, которые лучше всего подходят секции. Реализуй ИМЕННО ИХ. Не добавляй плавающие шарики и градиенты, если их нет в выбранном списке.

ЧТО ВЕРНУТЬ:
1. "html" — ПОЛНЫЙ HTML секции «{target_section}» с добавленными элементами эффектов. Сохрани существующие классы и контент, добавь новые классы при необходимости. Тег должен быть один: `<section class='{target_section}'>...</section>` (или `<footer>` для footer).
2. "css" — ТОЛЬКО НОВЫЕ правила для секции «{target_section}». Не повторяй базовые правила из контекста. Если нужно переопределить базовое свойство — верни это правило целиком. `@keyframes` возвращай полностью.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ИЗОЛЯЦИИ СТИЛЕЙ:
1. **КАЖДЫЙ селектор в CSS ОБЯЗАН начинаться с `.{target_section}`** — либо сам `.{target_section}`, либо `.{target_section} ` (пробел + вложенный селектор). Пример: `.hero .hero__title {{ ... }}`.
2. ЗАПРЕЩЕНО писать селекторы без префикса `.{target_section}`.
3. ЗАПРЕЩЕНО использовать `:root`, `body`, `html`, `*`, глобальные переменные и `@font-face`.
4. `@keyframes` разрешены, но их имена ОБЯЗАНЫ начинаться с `{target_section}-`.
5. Внутри `@keyframes` не должно быть глобальных селекторов.
6. Внутри HTML используй ТОЛЬКО одинарные кавычки для атрибутов (`class='hero'`).

Верни ОДИН JSON-объект. Начни с {{ и закончи }}.
"""

# Заполняем каталог ПОСЛЕ того, как класс полностью создан
CoreEngineLibLlmAgentsPersonalPromptsEffects.EFFECT_CATALOG = (
    CoreEngineLibLlmAgentsPersonalPromptsEffects._build_catalog()
)