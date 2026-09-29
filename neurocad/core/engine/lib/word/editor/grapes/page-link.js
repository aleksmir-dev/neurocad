// app/core/engine/lib/word/editor/grapes/page-link.js

/**
 * page-link trait — select + input для href.
 *
 * Регистрирует кастомный trait-тип `page-link` в TraitManager.
 * Используется в `link.js` для поля «Ссылка (href)»:
 *
 *     {
 *         type: 'page-link',
 *         name: 'href',
 *         label: 'Ссылка (href)',
 *     }
 *
 * Что делает
 * ----------
 *   Гибридный контрол из двух элементов:
 *
 *     <select>  — список страниц текущего пользователя.
 *                 Каждая опция: "<title> — <url>".
 *                 При выборе URL подставляется в <input>.
 *
 *     <input>   — ручной ввод URL (внешние ссылки, якоря и т.п.).
 *                 При вводе обновляет href компонента.
 *
 *   Приоритет при обновлении href:
 *     1. Если <select> имеет выбранное значение — берётся оно.
 *     2. Иначе — значение <input>.
 *     3. Если оба пусты — href удаляется.
 *
 *   При открытии трейта (onUpdate) <input> заполняется текущим
 *   href компонента, а <select> — предвыбирается, если href
 *   совпадает с одной из загруженных страниц.
 *
 * Источник списка страниц
 * -----------------------
 *   GET /core/engine/lib/pages/my-list
 *
 *   Ответ:
 *     {
 *       "success": true,
 *       "data": [
 *         { "id": 1, "title": "Главная", "url": "/page/1/20260927/084000" },
 *         ...
 *       ]
 *     }
 *
 *   Фильтр на бэкенде: только активные, неудалённые, не-шаблонные
 *   страницы всех nav текущего пользователя.
 *
 * Кэширование
 * -----------
 *   Список загружается лениво — при первом вызове createInput()
 *   и кэшируется в замыкании на время жизни GrapesLoader-инстанса.
 *   Все trait-инпуты переиспользуют один и тот же массив pages.
 *
 * HTTP
 * ----
 *   Через window.coreEngine.fetchJson (тот же паттерн, что в
 *   balance.js) — сам разбирается с cookie, JSON и ошибками.
 *
 * NOTE: no static imports of other grapes/*.js files here —
 * otherwise static versioning breaks.
 */

/**
 * Зарегистрировать trait-тип `page-link`.
 *
 * Идемпотентно: если тип уже зарегистрирован — второй вызов
 * игнорируется (TraitManager.getType возвращает существующий).
 *
 * @param {Object} instance — GrapesJS instance
 */
export function registerPageLinkTrait(instance) {
    try {
        const tm = instance.TraitManager;
        if (!tm) {
            console.warn('[GrapesLoader] TraitManager not available — page-link trait not registered');
            return;
        }

        // Идемпотентность — если тип уже есть, ничего не делаем.
        if (tm.getType('page-link')) {
            return;
        }

        // ----------------------------------------------------------
        // Кэш списка страниц (замыкание на инстанс GrapesLoader).
        //
        //   loaded  — список уже загружен (успешно или нет);
        //   loading — запрос в полёте (защита от параллельных fetch);
        //   pages   — массив { id, title, url }.
        // ----------------------------------------------------------
        const state = {
            loaded: false,
            loading: false,
            pages: [],
        };

        /**
         * Ленивая загрузка списка страниц.
         * Вызывается один раз — из первого createInput().
         */
        const fetchPages = async () => {
            if (state.loaded || state.loading) return;
            state.loading = true;

            try {
                const fetchJson = window.coreEngine?.fetchJson;
                if (!fetchJson) {
                    console.warn('[page-link] coreEngine.fetchJson not available');
                    return;
                }

                const json = await fetchJson('/core/engine/lib/pages/my-list');
                state.pages = Array.isArray(json?.data) ? json.data : [];
                state.loaded = true;

                console.log('[page-link] loaded pages:', state.pages.length);
            } catch (e) {
                // Не критично — <input> всё равно доступен для ручного ввода.
                console.warn('[page-link] failed to load pages:', e);
            } finally {
                state.loading = false;
            }
        };

        // ----------------------------------------------------------
        // Регистрация типа.
        // ----------------------------------------------------------
        tm.addType('page-link', {
            /**
             * Построить DOM контрола: <select> + <input>.
             *
             * Список страниц грузится асинхронно. После загрузки
             * <select> наполняется опциями, и если текущий href
             * (уже проставленный в <input> через onUpdate) совпадает
             * с одной из страниц — эта страница предвыбирается.
             */
            createInput({ trait }) {
                const wrap = document.createElement('div');
                wrap.className = 'page-link-trait';

                const select = document.createElement('select');
                select.className = 'page-link-trait__select';

                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = '— Выбрать страницу —';
                select.appendChild(placeholder);

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'page-link-trait__input';
                input.placeholder = '/page/... или https://...';

                wrap.appendChild(select);
                wrap.appendChild(input);

                // Ленивая загрузка списка — один раз на инстанс.
                fetchPages().then(() => {
                    for (const p of state.pages) {
                        const o = document.createElement('option');
                        o.value = p.url;
                        o.textContent = `${p.title} — ${p.url}`;
                        select.appendChild(o);
                    }

                    // Если текущий href уже есть в списке — предвыбрать.
                    const current = input.value;
                    if (current) {
                        const hit = state.pages.find((p) => p.url === current);
                        if (hit) select.value = hit.url;
                    }
                });

                return wrap;
            },

            /**
             * Обработка изменения значения контрола.
             *
             * Приоритет:
             *   1. select.value (если не пусто) — выбранная страница.
             *   2. input.value — ручной ввод.
             *   3. Ничего — href удаляется.
             */
            onEvent({ elInput, component }) {
                const select = elInput.querySelector('.page-link-trait__select');
                const input = elInput.querySelector('.page-link-trait__input');

                const value = select.value || input.value || '';

                if (value) {
                    component.addAttributes({ href: value });
                } else {
                    component.removeAttributes('href');
                }
            },

            /**
             * Обновление контрола при выборе компонента.
             *
             *   - <input> заполняется текущим href.
             *   - <select> предвыбирает страницу, если href ей совпадает.
             */
            onUpdate({ elInput, component }) {
                const select = elInput.querySelector('.page-link-trait__select');
                const input = elInput.querySelector('.page-link-trait__input');

                const href = component.getAttributes().href || '';
                input.value = href;

                if (href && state.pages.length) {
                    const hit = state.pages.find((p) => p.url === href);
                    select.value = hit ? hit.url : '';
                } else {
                    select.value = '';
                }
            },
        });

        console.log('[GrapesLoader] page-link trait registered');
    } catch (err) {
        console.warn('[GrapesLoader] failed to register page-link trait:', err);
    }
}