// neurocad/core/engine/lib/word/editor/creative.js

/**
 * Creative block patcher.
 *
 * Заполняет блок «Креатив» (core-creative, см. blocks/ready.js)
 * данными ТОГО креатива, который УЖЕ выбран в свойствах страницы
 * (select «Креатив» в каталоге статей → creative_id страницы).
 *
 * МОДАЛКИ НЕТ — по замыслу.
 * -------------------------
 * Раньше при drop блока открывалась модалка «Выбрать креатив», и
 * пользователь выбирал креатив ЗАНОВО. Это дублировало выбор,
 * который он уже сделал в свойствах страницы, и путало:
 *
 *   - в форме страницы выбираешь креатив A — сохраняешь;
 *   - перетаскиваешь блок «Креатив» — модалка спрашивает ещё раз;
 *   - выбираешь B — теперь на странице ВИЗУАЛЬНО B, а в placement
 *     по-прежнему A. Рассинхрон.
 *
 * Теперь блок берёт creative_id из pageData — страница уже несёт
 * его из бэка (см. pages/service.py → _to_dict → "creative_id"
 * и pages/schema.py → CoreEngineLibPagesItemListItem.creative_id).
 * Никаких лишних вопросов.
 *
 * ЕСЛИ КРЕАТИВ НЕ ВЫБРАН
 * ----------------------
 * Если в свойствах страницы креатив не выбран (creative_id = null),
 * блок остаётся с заглушками. Никакой модалки, никакого запроса —
 * просто плейсхолдеры, которые редактор может править вручную.
 *
 * ЕСЛИ ПОТРЕБУЕТСЯ ОБНОВИТЬ
 * -------------------------
 * Чтобы блок «подхватил» нового креатива после смены в свойствах
 * страницы — просто перетащи блок заново. Старый блок удали,
 * новый drop → свежий creative_id → свежие данные.
 *
 * Автоматическое обновление существующих блоков при загрузке
 * страницы — отдельная задача (аналог DataLoader._applyFooterBrand).
 *
 * WHEN IT FIRES — только на drop, никогда при загрузке
 * -----------------------------------------------------
 * Подписка на `canvas:drop`. Логика 1:1 повторяет brand.js:
 *
 *   - `component:add` фетчит И drag-and-drop, И загрузку проекта.
 *     Если бы мы подписались на него, блок перетирался бы при
 *     каждом открытии страницы. Это недопустимо — редактор мог
 *     править блок вручную.
 *
 *   - `block:drag:stop` не работает с nativeDnd (GrapesJS issue #765).
 *
 *   - `canvas:drop` срабатывает ТОЛЬКО когда пользователь тащит
 *     блок из панели. Загрузка проекта идёт через setComponents /
 *     loadProjectData — там canvas:drop не срабатывает вовсе.
 *
 * ПОЧЕМУ МАРКЕР data-creative-block — НА ВЛОЖЕННОМ <div>
 * ------------------------------------------------------
 * Точка входа — canvas:drop. В обработчик приходит `model` — это
 * тот компонент, который GrapesJS добавил в canvas. У нас это
 * корень блока, <section data-block="core-creative">.
 *
 * GrapesJS: model.find(selector) ищет ТОЛЬКО среди дочерних
 * компонентов. Сам model в результаты НЕ попадает. Значит если
 * маркер стоит на корне <section>, model.find() его не найдёт —
 * и автоподстановка не сработает.
 *
 * Поэтому маркер data-creative-block стоит на ВЛОЖЕННОМ
 * <div class="container creative-block__inner">. find() его
 * найдёт — как brand.js находит data-footer-brand (тоже
 * вложенный <div> внутри <footer>).
 *
 * ПОЧЕМУ ЧЕРЕЗ МОДЕЛЬ, А НЕ ЧЕРЕЗ DOM
 * ----------------------------------
 * GrapesJS при сохранении берёт HTML из СВОЕЙ МОДЕЛИ компонентов
 * (editor.getHtml() / getComponents()), а не из DOM iframe.
 *
 * Если менять только DOM (root.querySelector('.foo').textContent = ...),
 * визуально в редакторе всё обновится, но при сохранении на бэк
 * уйдёт СТАРЫЙ HTML — тот, что лежал в модели с момента drop.
 * Симптом: «в редакторе красиво, на публикации — заглушки».
 *
 * Поэтому мы правим МОДЕЛЬ через component.components()/set(),
 * а DOM обновится сам — GrapesJS-View перерисует iframe.
 *
 * Пустые поля:
 *   Если у креатива не заполнено поле — соответствующий span в блоке
 *   скрывается (display: none). Юридическая строка автоматически
 *   становится короче. Так соблюдается закон: что есть — показано;
 *   чего нет — не показано.
 *
 * Загружается динамически с ?v= — см. editor.js → _init().
 * Никаких статических импортов.
 */

export function bindCreative(editorInstance) {
    if (!editorInstance || !editorInstance.editor) return;

    const gjs = editorInstance.editor;

    gjs.on('canvas:drop', (dataTransfer, model) => {
        try {
            // Guard: не пользовательский drop — не наше дело.
            if (!dataTransfer) return;
            if (!model) return;

            // -----------------------------------------------------
            // Ищем ВЛОЖЕННЫЙ маркер data-creative-block — точно
            // так же, как brand.js ищет data-footer-brand.
            //
            // model.find(selector) не проверяет сам model — только
            // дочерние компоненты. Поэтому маркер стоит ВНУТРИ
            // секции (на <div class="container creative-block__inner">),
            // а не на её корне. Если бы он был на корне <section>,
            // find() вернул бы пусто, и автоподстановка бы не
            // сработала.
            //
            // У подвала (core-footer) маркер data-footer-brand
            // тоже стоит на вложенном <div class="footer__brand">.
            // Работает по той же причине.
            // -----------------------------------------------------
            const targets = model.find('[data-creative-block]');
            if (!targets || !targets.length) return;

            const root = targets[0];

            // setTimeout — даём GrapesJS отрисовать iframe.
            setTimeout(() => {
                applyCreativeFromPage(editorInstance, root);
            }, 50);
        } catch (e) {
            console.warn('[Creative] drop handler failed:', e);
        }
    });

    console.log('[Creative] bound (canvas:drop)');
}


/**
 * Взять creative_id из данных страницы и применить его к блоку.
 *
 * Источники (в порядке приоритета):
 *   1. editorInstance.pageData.creative_id — если бэк отдаёт его
 *      в pageData (мы это добавили в pages/service.py).
 *   2. fetchJson('/core/engine/lib/pages/item/{pageId}') —
 *      fallback, если pageData почему-то без creative_id.
 *
 * Если creative_id нет / null — блок остаётся с заглушками.
 *
 * @param {Object} editorInstance — Editor
 * @param {Object} rootComponent  — GrapesJS-компонент блока
 *                                  (<div class="container creative-block__inner">)
 */
async function applyCreativeFromPage(editorInstance, rootComponent) {
    // ---------------------------------------------------------
    // 1. creative_id из pageData.
    // ---------------------------------------------------------
    let creativeId = null;

    const pageData = editorInstance?.pageData;
    if (pageData && pageData.creative_id != null) {
        creativeId = pageData.creative_id;
    }

    // ---------------------------------------------------------
    // 2. Fallback — запрос к бэку по pageId. Нужен, если
    // pageData почему-то без creative_id (старые страницы,
    // кэш редактора и т.п.).
    // ---------------------------------------------------------
    if (creativeId == null && editorInstance?.pageId) {
        try {
            const json = await window.coreEngine.fetchJson(
                `/core/engine/lib/pages/item/${editorInstance.pageId}`
            );
            if (json?.success && json?.data) {
                creativeId = json.data.creative_id;
                // Кэшируем в pageData — чтобы следующий drop не
                // дёргал API повторно.
                if (editorInstance.pageData) {
                    editorInstance.pageData.creative_id = creativeId;
                }
            }
        } catch (e) {
            console.warn('[Creative] failed to load page data:', e);
        }
    }

    // ---------------------------------------------------------
    // 3. Нет creative_id — блок остаётся с заглушками.
    // Никакой модалки, никакого шума в консоли.
    // ---------------------------------------------------------
    if (creativeId == null) {
        console.log('[Creative] у страницы не выбран креатив — блок остаётся с заглушками');
        return;
    }

    // ---------------------------------------------------------
    // 4. Загружаем данные креатива по id.
    //
    // Список креативов — /creatives/list. Находим нужный. Если
    // бы хотелось брать конкретный креатив точечно — можно было
    // бы сделать /creatives/item/{id}, но такого роута пока нет;
    // список — небольшая и уже кэшируемая на сервере выборка.
    // ---------------------------------------------------------
    let creatives;

    try {
        const json = await window.coreEngine.fetchJson(
            '/core/engine/lib/creatives/list'
        );
        creatives = json?.data || [];
    } catch (e) {
        console.error('[Creative] list load failed:', e);
        return;
    }

    const chosen = creatives.find(
        (c) => String(c.id) === String(creativeId)
    );

    if (!chosen) {
        console.warn(
            `[Creative] креатив id=${creativeId} не найден в списке ` +
            `— блок остаётся с заглушками`
        );
        return;
    }

    // ---------------------------------------------------------
    // 5. Применяем данные креатива к блоку.
    // ---------------------------------------------------------
    applyCreative(rootComponent, chosen);
}


/**
 * Подставить данные креатива в блок — через МОДЕЛЬ GrapesJS.
 *
 * Находит нужные компоненты по атрибуту class (они зафиксированы
 * в ready.js — не переименовывать!) и меняет их содержимое через
 * component.set('content', ...) / components().reset().
 *
 * DOM обновится сам: GrapesJS-View перерисует iframe после
 * изменения модели. Дополнительно синхронизируем href у ссылки —
 * там атрибут, а не контент.
 *
 * Если поле креатива пустое — соответствующий узел скрывается
 * (style.display = 'none'), чтобы не показывать прочерки.
 *
 * @param {Object} rootComponent — GrapesJS-компонент блока
 *                                  (<div class="container creative-block__inner">)
 * @param {Object} c             — объект креатива из API
 */
function applyCreative(rootComponent, c) {
    if (!rootComponent) {
        console.warn('[Creative] component is null');
        return;
    }

    // ---------------------------------------------------------
    // 1. Текстовые поля — через МОДЕЛЬ.
    //
    // Для текстовых компонентов GrapesJS хранит видимый текст
    // в дочернем компоненте (textnode). Поэтому:
    //   - обнуляем детей: comps.reset()
    //   - и ставим новый текст через set('content', value)
    //
    // find(selector) ищет среди потомков. Если selector матчит
    // сам rootComponent — он тоже попадёт в результат (см.
    // graphene docs: `component.find(selector)`).
    // ---------------------------------------------------------

    const setText = (selector, value) => {
        const comps = rootComponent.find(selector);
        if (!comps || !comps.length) return;

        const comp = comps[0];
        const children = typeof comp.components === 'function'
            ? comp.components()
            : null;

        if (children && typeof children.reset === 'function') {
            children.reset();
        }

        const hasValue =
            value !== null && value !== undefined && value !== '';

        if (hasValue) {
            comp.set('content', String(value));
            // Снимаем возможный ранее выставленный display: none.
            const style = comp.getStyle() || {};
            delete style.display;
            comp.setStyle(style);
        } else {
            // Скрываем узел, чтобы не показывать пустое место.
            comp.set('content', '');
            comp.setStyle({ ...(comp.getStyle() || {}), display: 'none' });
        }
    };

    setText('.creative-block__text',     c.text);
    setText('.creative-block__btn-text', c.button_text || 'Подробнее');
    setText('.creative-block__brand',    c.brand);
    setText('.creative-block__inn',      c.inn);
    setText('.creative-block__erid',     c.erid);

    // ---------------------------------------------------------
    // 2. Ссылка — через МОДЕЛЬ (атрибут href).
    // ---------------------------------------------------------
    const links = rootComponent.find('.creative-block__link');
    if (links && links.length) {
        const linkComp = links[0];

        // href — атрибут, не контент.
        if (c.target_url) {
            linkComp.addAttributes({ href: c.target_url });
        } else {
            linkComp.addAttributes({ href: '#' });
        }

        // target="_blank" и rel="... sponsored" уже стоят в HTML
        // из ready.js. Если их почему-то нет — можно добавить:
        const attrs = linkComp.getAttributes() || {};
        if (attrs.target !== '_blank') {
            linkComp.addAttributes({ target: '_blank' });
        }
        if (!attrs.rel) {
            linkComp.addAttributes({
                rel: 'noopener noreferrer nofollow sponsored',
            });
        }
    }

    console.log('[Creative] applied:', {
        id: c.id,
        name: c.name,
        href: c.target_url,
    });
}