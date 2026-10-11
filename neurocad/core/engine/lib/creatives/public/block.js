// neurocad/core/engine/lib/creatives/public/block.js

/**
 * Creative block — public patcher.
 *
 * Находит все блоки креатива на странице (core-creative), тянет
 * актуальные данные через GET /creatives/public/item/{id} и
 * заполняет / скрывает их.
 *
 * ES-MODULE, БЕЗ AUTO-RUN
 * -----------------------
 * Этот файл — ES-модуль. Он экспортирует ОДНУ функцию —
 * patchCreativeBlocks. Auto-run в конце файла НЕТ: на публичной
 * странице скрипт подключается через динамический import()
 * (см. ниже), в админском просмотре — тоже через import() из
 * word.js, в превью истории — через import() внутри iframe.
 *
 * Каждый вызов import() возвращает объект модуля, из которого
 * берётся функция. Никакого window.__creativeBlockInit — глобальное
 * пространство не засоряется, функция живёт в модуле.
 *
 * ГДЕ РАБОТАЕТ
 * -----------
 * 1. Публичная страница — pages/public/public.html:
 *      <script>
 *        import('/static/.../block.js?v=...')
 *          .then(function (mod) { mod.patchCreativeBlocks(); });
 *      </script>
 *    <script> БЕЗ type="module", но внутри — динамический import().
 *    Соответствует правилу проекта «все импорты динамические».
 *
 * 2. Админский просмотр (Word) — word.js:
 *      const mod = await import('/static/.../block.js?v=...');
 *      mod.patchCreativeBlocks();
 *    Word рендерит HTML прямо в родительский DOM (не в iframe),
 *    поэтому тот же модуль видит те же блоки.
 *
 * 3. Превью модалки истории — word/editor/history.js:
 *    Внутри <iframe srcdoc>:
 *      <script>
 *        import('/static/.../block.js?v=...')
 *          .then(function (mod) { mod.patchCreativeBlocks(); });
 *      </script>
 *    Каждый снимок — новый iframe, поэтому auto-run не нужен,
 *    вызов происходит явно.
 *
 * ЧТО ДЕЛАЕТ
 * ----------
 * 1. Находит все <section data-block="core-creative"
 *    data-creative-id="N">, где N — непустой id.
 *
 * 2. Для каждого блока — fetch('/creatives/public/item/N').
 *
 * 3. Если is_active = 0 или 404 — СКРЫВАЕТ секцию
 *    (style.display = 'none'). Это механизм, который
 *    позволяет владельцу выключить креатив и не
 *    пересохранять все страницы: блок исчезает на лету.
 *
 * 4. Если is_active = 1 — заполняет поля блока свежими
 *    данными: text, button_text, brand, inn, erid, href.
 *    Пустые поля креатива → соответствующий span скрывается
 *    (display: none), юридическая строка становится короче.
 *
 * ПОЧЕМУ ТОЛЬКО ССЫЛКА, А НЕ ДАННЫЕ
 * ---------------------------------
 * В HTML блока хранится ТОЛЬКО data-creative-id. Сами данные
 * подтягиваются динамически при каждом просмотре. Правка
 * креатива в админке видна сразу — без пересохранения страниц.
 *
 * КЭШ
 * ---
 * HTTP-запрос к /public/item/{id} кэшируется браузером на
 * 5 минут (Cache-Control: max-age=300, см. бэкенд). За это
 * время повторные загрузки страницы не дёргают сервер.
 *
 * ЗАВИСИМОСТИ
 * -----------
 * Никаких. Только fetch() и DOM API. Относительный URL
 * /creatives/public/item/N резолвится по текущему origin —
 * один и тот же и для demo.neurocad-dev.ru, и для custom domain.
 */

// URL публичного роута. Относительный — резолвится по origin
// текущей страницы (пользовательский поддомен или custom domain).
const API_BASE = '/core/engine/lib/creatives/public/item/';


// ============================================
// PUBLIC API
// ============================================

/**
 * Найти все блоки креатива на странице и заполнить их данными
 * из /creatives/public/item/{id}.
 *
 * Вызывается снаружи — из word.js (динамический import) или из
 * <script> на публичной странице (тоже динамический import).
 * Auto-run в этом файле НЕТ.
 *
 * Если блоков нет — тихо выходит. Если у блока пустой
 * data-creative-id — пропускает этот блок (креатив не привязан).
 */
export function patchCreativeBlocks() {
    const blocks = document.querySelectorAll(
        'section[data-block="core-creative"][data-creative-id]'
    );

    if (!blocks || !blocks.length) return;

    blocks.forEach((section) => {
        const id = section.getAttribute('data-creative-id');
        if (!id) return;   // пустой id — блок без креатива, оставляем
        loadCreative(section, id);
    });
}


// ============================================
// INTERNAL
// ============================================

/**
 * Загрузить один креатив и применить его к секции.
 *
 * credentials: 'omit' — публичный роут, никаких куки.
 * Это чуть быстрее и не тянет сессионные куки на CDN-edge.
 */
function loadCreative(section, id) {
    fetch(API_BASE + encodeURIComponent(id), {
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
    })
        .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then((json) => {
            if (!json || !json.success || !json.data) {
                hide(section);
                return;
            }
            apply(section, json.data);
        })
        .catch(() => {
            // Креатив недоступен — 404 (удалён), 5xx, сетевая ошибка.
            // Скрываем блок, чтобы не показывать пустое место.
            hide(section);
        });
}


/**
 * Применить данные креатива к секции.
 *
 * is_active = 0 → скрыть блок целиком.
 * Иначе — заполнить поля. Пустые поля креатива → соответствующий
 * span скрывается (display: none).
 */
function apply(section, c) {
    // is_active = 0 → скрыть блок целиком.
    // Бэк отдаёт is_active как 0/1 (SQLite integer).
    if (c && (c.is_active === 0 || c.is_active === false)) {
        hide(section);
        return;
    }

    setText(section, '.creative-block__text', c.text);
    setText(section, '.creative-block__btn-text', c.button_text || 'Подробнее');
    setText(section, '.creative-block__brand', c.brand);
    setText(section, '.creative-block__inn', c.inn);
    setText(section, '.creative-block__erid', c.erid);

    const link = section.querySelector('.creative-block__link');
    if (link) {
        if (c.target_url) {
            link.setAttribute('href', c.target_url);
        } else {
            link.setAttribute('href', '#');
        }
        // target и rel уже стоят в HTML из ready.js,
        // дублировать не нужно.
    }
}


/**
 * Записать текст в элемент. Пустое значение → скрыть элемент.
 */
function setText(root, selector, value) {
    const el = root.querySelector(selector);
    if (!el) return;

    if (value !== null && value !== undefined && value !== '') {
        el.textContent = String(value);
        el.style.display = '';
    } else {
        el.textContent = '';
        el.style.display = 'none';
    }
}


/**
 * Скрыть секцию.
 */
function hide(section) {
    section.style.display = 'none';
}