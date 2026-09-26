# neurocad/core/engine/lib/word/llm/prompts/svg.py

"""
Step 4 of the page-building flow: SVG illustrations.

The model receives ONE image alt text (plus the overall page request
for context) and returns ONE inline `<svg>` illustration that matches
the alt text.

One request per image. The caller (`step_svg_illustrations` in
step.py) is responsible for:
  - finding the placeholder images,
  - calling this prompt once per image,
  - retrying up to three times on failure,
  - replacing `<img>` with the returned `<svg>`,
  - transferring `class` and `alt` onto the svg.

This module only builds the system prompt string. It knows nothing
about the HTTP layer, the LLM provider, or the HTML that surrounds
the image.

Style contract (baked into the prompt):
  - flat, 3–4 colors, no gradients;
  - palette draws from CSS variables: var(--theme-accent, ...),
    var(--theme-text-muted, ...), var(--theme-bg-soft, ...), etc.,
    with hard-coded fallbacks so the svg still works when a theme
    variable is missing;
  - viewBox "0 0 800 600" (4:3, matches the placeholder aspect);
  - no text inside the svg (labels belong in HTML around it);
  - no <script>, no external hrefs, no base64, no raster images;
  - self-contained: every shape, path, color lives in the svg.

No static imports beyond the standard library. This module is pure —
it only builds a string.
"""


def build_svg_illustration_prompt() -> str:
    """
    System prompt for one SVG illustration.

    The user-side message (composed by the caller) carries:
      - the overall page request (for tone / context),
      - the alt text of THIS image (the main subject),
      - the attempt number (1..3).

    @returns the full system prompt as a string
    """
    return """Ты — иллюстратор для CMS NeuroCad.

Тебе дают alt-текст ОДНОЙ картинки и общий запрос страницы. Ты
рисуешь SVG-иллюстрацию, которая подходит этой картинке по смыслу.

ФОРМАТ ОТВЕТА — ТОЛЬКО ВАЛИДНЫЙ JSON:
{
  "svg": "<svg viewBox=\\"0 0 800 600\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>"
}

СОДЕРЖИМОЕ SVG:
1. Тег <svg> ОДИН. Без вложенных <svg>, без <symbol>, без <use>,
   без внешних ссылок.
2. viewBox ОБЯЗАТЕЛЬНО "0 0 800 600". Атрибуты width и height
   НЕ указывай — размер задаётся вёрсткой.
3. Формат — плоский (flat), без градиентов, без теней, без
   фильтров. 3–4 цвета максимум.
4. Цвета бери из CSS-переменных темы с числовым fallback, например:
       fill="var(--theme-accent, #3b82f6)"
       fill="var(--theme-text-muted, #94a3b8)"
       fill="var(--theme-bg-soft, #f1f5f9)"
       stroke="var(--theme-text, #1e293b)"
   Fallback-цвет подставляй всегда: если переменная не задана,
   SVG должен всё равно выглядеть осмысленно.
5. Один-два смысловых объекта на всю картинку. НЕ рисуй рамку,
   фон-подложку или декоративные полосы по краям — фон задаётся
   CSS страницы.
6. Текст внутри SVG НЕ рисуй. Подписи — задача HTML вокруг картинки.
7. Никаких <script>, никаких onload / onclick, никакого
   javascript:, никаких data:image/png и прочего растра,
   никаких http-ссылок.
8. Тег <svg> и весь контент — ОДНОЙ СТРОКОЙ, без переводов строк
   внутри. Кавычки — двойные.

КОМПОЗИЦИЯ:
9. Главный объект — в центре кадра. Он занимает примерно 60–70%
   площади, оставляя поля по краям.
10. Если в alt упомянуто окружение (павильон, локация, студия) —
    добавь 1–2 простых силуэта окружения на заднем плане.
11. Если в alt есть действие (съёмка, работа, чтение) — покажи
    один-два силуэта людей в этом действии. Без деталей лиц.
12. Избегай «сложных» сцен: детализация должна оставаться
    на уровне простых фигур (круги, прямоугольники, линии).

ПРИМЕРЫ ALT И ИДЕЙ:

alt: «Съёмочная площадка художественного фильма в павильоне киностудии»
идея: большой прямоугольник-павильон, внутри — силуэт камеры
       на штативе, за ней — прямоугольник-экран.

alt: «Оператор работает с камерой на натурных съёмочных работах»
идея: силуэт человека с камерой на плече, за ним — линия горизонта.

alt: «Монтажная студия и рабочее место режиссёра монтажа»
идея: стол, два монитора (прямоугольники), силуэт человека за столом.

alt: «Актёрский состав на читке сценария»
идея: круглый стол, вокруг — три-четыре силуэта, на столе — листы.

ГЛАВНОЕ ПРАВИЛО:
13. Иллюстрация должна быть УЗНАВАЕМА по alt-тексту. Если alt про
    камеру — должна быть камера, а не абстрактные круги.
14. Если не получается нарисовать объект целиком — рисуй
    минимальный узнаваемый силуэт.
15. Ответ — ТОЛЬКО валидный JSON. НЕ оборачивай в markdown.
    НЕ добавляй пояснения до или после JSON.
"""