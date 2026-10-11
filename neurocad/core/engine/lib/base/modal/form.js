// app/core/engine/lib/base/modal/form.js

/**
 * BaseModalForm — многофункциональная модалка-форма.
 *
 * В отличие от BaseModalInput (одно поле), умеет рендерить
 * произвольный набор полей и возвращать объект со значениями:
 *
 *   const modal = await createModal('form');
 *   modal.open({
 *       title: 'Редактировать креатив',
 *       okText: 'Сохранить',
 *       cancelText: 'Отмена',
 *       fields: [
 *           { name: 'name',       label: 'Название', type: 'text',     value: '' },
 *           { name: 'erid',       label: 'ERID',     type: 'text',     value: '' },
 *           { name: 'target_url', label: 'Ссылка',   type: 'url',      value: '' },
 *           { name: 'is_active',  label: 'Активен',  type: 'checkbox', value: true },
 *       ],
 *   });
 *
 *   modal.setOnOk(async (data) => {
 *       // data = { name, erid, target_url, is_active }
 *       await this._putCreative(id, data);
 *   });
 *
 * Поддерживаемые типы полей:
 *   - 'text'     → <input type="text">
 *   - 'url'      → <input type="url">
 *   - 'email'    → <input type="email">
 *   - 'number'   → <input type="number">
 *   - 'password' → <input type="password">
 *   - 'date'     → <input type="date">
 *   - 'checkbox' → <input type="checkbox"> (label справа)
 *   - 'textarea' → <textarea>
 *
 * CSS переиспользует input.css — окно, заголовок, кнопки те же.
 * Дополнительно подгружает form.css для полей и лейблов.
 *
 * Cache-busting / no static imports
 * ---------------------------------
 * Этот файл НЕ использует статических импортов — они запрещены
 * в проекте. Всё, что нужно, доступно через window:
 *   - window.coreEngine.loadCSS — подгрузка CSS;
 *   - DOM API                    — построение интерфейса.
 *
 * STALE CONTAINER
 * ---------------
 * Раньше _createDOM переиспользовал уже существующий в DOM
 * контейнер .core-engine-lib-base-modal-form, если он был найден.
 * Это приводило к серьёзному багу:
 *
 *   - На одном и том же DOM-узле накапливались слушатели от
 *     НЕСКОЛЬКИХ экземпляров BaseModalForm (каждый вызов
 *     createModal('form') создавал новый экземпляр и вешал свои
 *     обработчики поверх старых).
 *
 *   - При клике «ОК» срабатывали ВСЕ накопленные обработчики.
 *     Каждый вызывал свой _collectData() на своих _inputs.
 *     Старые экземпляры читали устаревшие (или уже detached)
 *     input-ы и возвращали пустые строки для тех полей, которые
 *     пользователь только что заполнил.
 *
 *   - На бэк уходил ПЕРВЫЙ результат — со старыми значениями.
 *     Симптом: «креатив создан, но text / button_text / brand
 *     пустые».
 *
 * Теперь _createDOM ВСЕГДА удаляет stale-контейнер перед
 * созданием нового. Дубли слушателей невозможны, потому что
 * старый DOM вместе со своими слушателями просто исчезает.
 */
export class BaseModalForm {
    constructor() {
        this.container = null;
        this.onOk = null;
        this.onCancel = null;
        this._fields = [];
        this._inputs = {};   // name → input element

        this._loadCSS();
        this._createDOM();
        this._bindEvents();
    }

    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/input.css');
            window.coreEngine.loadCSS('core/engine/lib/base/modal/form.css');
        }
    }

    _createDOM() {
        // Remove any stale modal-form container before creating a
        // new one.
        //
        // WHY: reusing an existing container (as the old code did)
        // kept OLD listeners (bound in a previous BaseModalForm
        // instance) attached to the same nodes. When the user
        // clicked OK, ALL of those listeners fired — each one
        // called its own onOk with its own _collectData(), and the
        // old instances returned stale (or empty) values for the
        // inputs the user just filled in. The server then received
        // empty values for exactly the fields the user typed into.
        //
        // Fix: always destroy the stale container and create a
        // fresh one. The cost is negligible (one DOM node) and the
        // bug is gone for good.
        const stale = document.querySelector('.core-engine-lib-base-modal-form');
        if (stale) {
            stale.remove();
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-form';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Форма</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="form-fields"></div>
                    <div class="actions-bar">
                        <button class="btn btn-white cancel-btn">Отмена</button>
                        <button class="btn btn-white ok-btn">ОК</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.container = container;
        this._cacheElements();
    }

    _cacheElements() {
        this.titleBarText = this.container.querySelector('.title-bar-text');
        this.fieldsEl = this.container.querySelector('.form-fields');
        this.okBtn = this.container.querySelector('.ok-btn');
        this.cancelBtn = this.container.querySelector('.cancel-btn');
        this.closeBtn = this.container.querySelector('.close-btn');
    }

    _bindEvents() {
        // === ОК ===
        this.okBtn.addEventListener('click', () => {
            const data = this._collectData();
            if (this.onOk) {
                this.onOk(data);
            }
            this.close();
        });

        // === Отмена ===
        this.cancelBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel(null);
            }
            this.close();
        });

        // === Крестик ===
        this.closeBtn.addEventListener('click', () => {
            if (this.onCancel) {
                this.onCancel(null);
            }
            this.close();
        });

        // === Оверлей ===
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                if (this.onCancel) {
                    this.onCancel(null);
                }
                this.close();
            }
        });

        // === Escape ===
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                if (this.onCancel) {
                    this.onCancel(null);
                }
                this.close();
            }
        });

        // === Enter внутри текстового поля ===
        // Подтверждаем только если фокус в input[type=text|url|email|number|password]
        this.container.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const el = e.target;
            if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
                e.preventDefault();
                const data = this._collectData();
                if (this.onOk) {
                    this.onOk(data);
                }
                this.close();
            }
        });
    }

    /**
     * Построить DOM полей по схеме, переданной в open().
     */
    _renderFields(fields) {
        this.fieldsEl.innerHTML = '';
        this._inputs = {};

        for (const f of fields) {
            const name  = f.name;
            const label = f.label || name;
            const type  = f.type || 'text';
            const value = f.value ?? '';

            const row = document.createElement('div');
            row.className = 'form-row';

            if (type === 'checkbox') {
                row.classList.add('form-row-checkbox');

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = name;
                input.className = 'form-checkbox';
                input.checked = !!value;

                const lbl = document.createElement('label');
                lbl.className = 'form-label form-label-checkbox';
                lbl.textContent = label;

                row.appendChild(input);
                row.appendChild(lbl);

                this._inputs[name] = input;
            } else {
                const lbl = document.createElement('label');
                lbl.className = 'form-label';
                lbl.textContent = label;
                lbl.setAttribute('for', `modal-form-${name}`);

                let input;
                if (type === 'textarea') {
                    input = document.createElement('textarea');
                    input.rows = f.rows || 3;
                    input.className = 'form-input form-textarea';
                } else {
                    input = document.createElement('input');
                    input.type = type;
                    input.className = 'form-input';
                }
                input.id = `modal-form-${name}`;
                input.name = name;
                input.value = value;
                if (f.placeholder) input.placeholder = f.placeholder;
                if (f.min != null) input.min = f.min;
                if (f.max != null) input.max = f.max;
                if (f.step != null) input.step = f.step;

                row.appendChild(lbl);
                row.appendChild(input);

                this._inputs[name] = input;
            }

            this.fieldsEl.appendChild(row);
        }
    }

    /**
     * Собрать значения всех полей в объект.
     * checkbox → boolean; пустые строки → '' (не undefined).
     */
    _collectData() {
        const data = {};
        for (const [name, el] of Object.entries(this._inputs)) {
            if (el.type === 'checkbox') {
                data[name] = el.checked;
            } else {
                data[name] = String(el.value ?? '').trim();
            }
        }
        return data;
    }

    // ========== Публичные методы ==========

    /**
     * Открыть модалку.
     *
     * @param {object} opts
     * @param {string}   opts.title        — заголовок окна
     * @param {Array}    opts.fields       — схема полей (см. docstring)
     * @param {string}   [opts.okText]     — текст кнопки OK (default 'ОК')
     * @param {string}   [opts.cancelText] — текст кнопки Отмена (default 'Отмена')
     * @param {Function} [opts.onOk]       — колбэк (data) => void, если не задан через setOnOk
     * @param {Function} [opts.onCancel]   — колбэк, если не задан через setOnCancel
     */
    open(opts = {}) {
        const {
            title = 'Форма',
            fields = [],
            okText = 'ОК',
            cancelText = 'Отмена',
            onOk = null,
            onCancel = null,
        } = opts;

        this.titleBarText.textContent = title;
        this.okBtn.textContent = okText;
        this.cancelBtn.textContent = cancelText;

        this._fields = fields;
        this._renderFields(fields);

        if (onOk) this.onOk = onOk;
        if (onCancel) this.onCancel = onCancel;

        // Фокус на первое не-checkbox поле
        setTimeout(() => {
            for (const f of fields) {
                if (f.type === 'checkbox') continue;
                const el = this._inputs[f.name];
                if (el) { el.focus(); el.select?.(); break; }
            }
        }, 100);

        this.container.classList.add('active');
    }

    close() {
        this.container.classList.remove('active');
    }

    setOnOk(callback) {
        this.onOk = callback;
    }

    setOnCancel(callback) {
        this.onCancel = callback;
    }

    destroy() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}