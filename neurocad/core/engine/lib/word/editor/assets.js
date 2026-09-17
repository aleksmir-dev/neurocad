// app/core/engine/lib/word/editor/assets.js

/**
 * AssetsManager — работа с медиатекой GrapesJS.
 *
 * Что делает:
 *   1. Подгружает список уже загруженных картинок с бэкенда
 *      GET /core/engine/lib/word/assets
 *      и добавляет их в editor.AssetManager.
 *
 *   2. Загрузка новых файлов идёт через сам GrapesJS AssetManager —
 *      в конфиге (grapes.js) указано:
 *        upload: '/core/engine/lib/word/assets/upload'
 *      GrapesJS сам обрабатывает drag&drop и кнопку «загрузить».
 *
 * Формат ответа бэкенда:
 *   { success: true, data: [{ src, name, type }, ...] }
 *
 * Особенности:
 *   - credentials: 'include' — чтобы cookie сессии уходили на сервер,
 *     поскольку эндпоинт требует авторизации.
 *   - Ошибки логируем, но не падаем — редактор должен открыться,
 *     даже если медиатека пустая или сервер недоступен.
 */
export class AssetsManager {
    constructor(editor) {
        this.editor = editor;              // родительский Editor
        this.api = editor._assetsApi;      // '/core/engine/lib/word/assets'
    }

    /**
     * Загрузить существующие ассеты и добавить их в AssetManager GrapesJS.
     */
    async load() {
        console.log('[AssetsManager] Загрузка списка ассетов:', this.api);

        try {
            const res = await fetch(this.api, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json' },
            });

            if (!res.ok) {
                console.warn('[AssetsManager] Ответ не OK:', res.status, res.statusText);
                return;
            }

            const json = await res.json();

            // Поддерживаем оба варианта ответа:
            //   { success: true, data: [...] }  — как у нас на бэке
            //   [...]                            — «сырой» массив
            const items = Array.isArray(json)
                ? json
                : (json && Array.isArray(json.data) ? json.data : []);

            if (items.length === 0) {
                console.log('[AssetsManager] Ассеты пусты');
                return;
            }

            // Инстанс GrapesJS лежит в editor.editor
            const gjs = this.editor.editor;
            if (!gjs) {
                console.warn('[AssetsManager] GrapesJS ещё не инициализирован');
                return;
            }

            gjs.AssetManager.add(items);
            console.log(`[AssetsManager] Добавлено ассетов: ${items.length}`);
        } catch (e) {
            console.warn('[AssetsManager] Не удалось загрузить ассеты:', e);
        }
    }
}