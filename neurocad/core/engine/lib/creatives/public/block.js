// neurocad/core/engine/lib/creatives/public/block.js

/**
 * Creative block — public patcher.
 *
 * Находит все блоки креатива на странице (core-creative), тянет
 * актуальные данные через GET /creatives/public/item/{id} и
 * заполняет / скрывает их.
 *
 * Заодно отправляет хиты (показ / клик) в POST /creatives/hit —
 * для отчёта в админке (вкладка «Отчёт» на странице креативов).
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
 *    data-creative-id="N" data-placement-id="P">, где N — непустой id.
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
 * 5. После успешного заполнения — отправляет ХИТ ПОКАЗА на
 *    /creatives/hit с data-placement-id. На клик по ссылке
 *    (.creative-block__link) — отправляет ХИТ КЛИКА.
 *
 * ТРЕКИНГ
 * -------
 * POST /core/engine/lib/creatives/hit
 *   body: { placement_id: <int>, hit_type: "show" | "click" }
 *
 * Трекинг отправляется через navigator.sendBeacon, а не fetch:
 *   - при показе: не блокирует основной поток, не мешает рендеру;
 *   - при клике: пользователь начинает навигацию на target_url,
 *     и обычный fetch был бы отменён. sendBeacon гарантирует
 *     доставку даже при переходе на другую страницу.
 *
 * Fallback: если sendBeacon недоступен (старый браузер) —
 * fetch с keepalive: true, который делает то же самое.
 *
 * Если data-placement-id пуст (креатив привязан к странице, но
 * активного размещения нет) — хит не отправляется. Счётчика
 * для такого блока не существует.
 *
 * ОШИБКИ ТРЕКИНГА ГЛОТАЮТСЯ МОЛЧА — счётчик не должен ломать
 * рендер страницы. Если хит не ушёл (сеть, 500), пользователь
 * этого не заметит; в отчёте просто не будет одной записи.
 *
 * ПОЧЕМУ ТОЛЬКО ССЫЛКА, А НЕ ДАННЫЕ
 * ---------------------------------
 * В HTML блока хранится ТОЛЬКО data-creative-id (и, после
 * рендера публичного роута, data-placement-id). Сами данные
 * подтягиваются динамически при каждом просмотре. Правка
 * креатива в админке видна сразу — без пересохранения страниц.
 *
 * КЭШ
 * ---
 * HTTP-запрос к /public/item/{id} кэшируется браузером на
 * 5 минут (Cache-Control: max-age=300, см. бэкенд). За это
 * время повторные загрузки страницы не дёргают сервер.
 *
 * POST /creatives/hit — без кэша (это запись, а не чтение).
 * Никаких заголовков не требуется: браузер не кэширует POST.
 *
 * ЗАВИСИМОСТИ
 * -----------
 * Никаких. Только fetch() и DOM API. Относительные URL'ы
 * резолвятся по текущему origin — один и тот же и для
 * demo.neurocad-dev.ru, и для custom domain.
 */

// URL публичного роута. Относительный — резолвится по origin
// текущей страницы (пользовательский поддомен или custom domain).
const API_BASE = '/core/engine/lib/creatives/public/item/';

// URL трекинга. Тот же origin, тот же префикс модуля.
const HIT_URL = '/core/engine/lib/creatives/hit';


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
 *
 * После заполнения — отправить хит показа и повесить обработчик
 * клика на ссылку.
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

    // ---- Трекинг ----
    // Блок реально показан (не скрыт, есть контент). Считаем показ.
    // Если data-placement-id пуст — счётчика для этого блока нет,
    // trackHit сам это проверит и молча выйдет.
    const placementId = section.getAttribute('data-placement-id');
    trackHit(placementId, 'show');

    // Клик по ссылке. Обработчик добавляется один раз на секцию:
    // section не пересоздаётся между вызовами (мы её не клонируем),
    // а loadCreative вызывается для каждой секции один раз при
    // patchCreativeBlocks. Повторный вызов apply() для той же
    // секции в рамках одной загрузки страницы не происходит —
    // но на всякий случай помечаем через dataset.
    if (link && placementId) {
        if (!link.dataset.trackBound) {
            link.dataset.trackBound = '1';
            link.addEventListener('click', () => {
                trackHit(placementId, 'click');
            });
        }
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


// ============================================
// TRACKING
// ============================================

/**
 * Отправить хит в /creatives/hit.
 *
 * placement_id — id размещения (из data-placement-id).
 * hit_type     — "show" | "click".
 *
 * Пустой/нулевой placement_id → тихий выход: либо креатив не
 * привязан к странице, либо активного размещения нет. Счётчика
 * для такого блока не существует.
 *
 * sendBeacon не блокирует навигацию: при клике по ссылке браузер
 * сразу начинает переход на target_url, и обычный fetch был бы
 * отменён. sendBeacon доставляется. При показе — не блокирует
 * основной поток.
 *
 * Blob с явным content-type: FastAPI-эндпоинт объявлен как
 * HitRequest (Pydantic) и ожидает application/json. Если
 * отправить строку, content-type будет text/plain, и Pydantic
 * вернёт 422. Blob({type: 'application/json'}) решает это.
 *
 * Любая ошибка отправки глотается молча — счётчик не должен
 * ломать рендер страницы. Если хит не ушёл (сеть, 500), в
 * отчёте просто не будет одной записи.
 */
function trackHit(placementId, hitType) {
    if (!placementId) return;
    const pid = Number(placementId);
    if (!pid || !Number.isFinite(pid)) return;

    const body = JSON.stringify({
        placement_id: pid,
        hit_type: hitType,
    });

    try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            const ok = navigator.sendBeacon(HIT_URL, blob);
            if (ok) return;
            // sendBeacon вернул false — очередь переполнена или
            // браузер отказал. Падаем в fetch-фоллбэк ниже.
        }
    } catch (e) {
        // sendBeacon может бросить в необычных окружениях
        // (file://, ограничения приватного режима). Не мешаем —
        // пробуем fetch.
    }

    // Fallback — fetch с keepalive. keepalive сохраняет запрос
    // живым при навигации (клик по ссылке ведёт на другой URL).
    try {
        fetch(HIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => {});
    } catch (e) {
        // Совсем нет возможности отправить — молча выходим.
    }
}