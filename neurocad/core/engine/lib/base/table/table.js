// app/core/engine/lib/base/table/table.js

/**
 * Универсальный компонент таблицы
 * Рендерит таблицу с данными, выделением строк, адаптивностью
 */
export class Table {
    /**
     * @param {HTMLElement} container - контейнер для таблицы
     * @param {Object} props - свойства таблицы
     * @param {Array} props.columns - массив колонок [{ field, label, width?, type? }]
     * @param {Array} props.data - массив объектов с данными
     * @param {Array} props.actions - массив действий [{ label, action, class? }]
     * @param {boolean} props.selectable - возможность выделения строк (по умолчанию true)
     * @param {Function} props.onSelect - колбэк при выделении строки
     * @param {Function} props.onDblClick - колбэк при двойном клике
     * @param {string} props.apiUrl - URL для загрузки данных с сервера
     * @param {Object} props.apiParams - параметры запроса
     */
    constructor(container, props = {}) {
        console.log('[Table] Конструктор вызван');
        this.container = container;
        this.props = props;
        this.selectedId = null;
        this.data = props.data || [];
        this.columns = props.columns || [];
        this.actions = props.actions || [];
        this.selectable = props.selectable !== false;
        this.onSelect = props.onSelect || null;
        this.onDblClick = props.onDblClick || null;
        this.apiUrl = props.apiUrl || null;
        this.apiParams = props.apiParams || {};
        this.isLoading = false;
        this.error = null;

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Загружаем CSS
        this._loadCSS();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();
    }

    async _init() {
        console.log('[Table] _init() START');
        try {
            // Если есть API URL - загружаем данные
            if (this.apiUrl) {
                await this._loadData();
            }
            this._initialized = true;
            console.log('[Table] _init() COMPLETE');
        } catch (error) {
            console.error('[Table] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    /**
     * Загрузить данные с сервера
     */
    async _loadData() {
        console.log('[Table] _loadData()', this.apiUrl);
        this.isLoading = true;
        this.error = null;

        try {
            const url = new URL(this.apiUrl, window.location.origin);
            
            // Добавляем параметры
            Object.keys(this.apiParams).forEach(key => {
                url.searchParams.append(key, this.apiParams[key]);
            });

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Ошибка загрузки данных: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.data = data.data || [];
                console.log('[Table] Данные загружены:', this.data.length);
            } else {
                throw new Error(data.message || 'Ошибка загрузки данных');
            }
        } catch (error) {
            console.error('[Table] Ошибка загрузки данных:', error);
            this.error = error.message;
            // Если есть данные в props, используем их
            if (this.props.data && this.props.data.length > 0) {
                this.data = this.props.data;
            } else {
                this.data = [];
            }
        } finally {
            this.isLoading = false;
            // Рендерим после загрузки
            this.render();
        }
    }

    /**
     * Загрузить CSS для таблицы
     */
    _loadCSS() {
        console.log('[Table] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/table/table.css');
        }
    }

    /**
     * Рендеринг таблицы
     */
    render() {
        console.log('[Table] render()');
        this.container.innerHTML = '';

        // Контейнер для всей таблицы
        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-table-wrapper';

        // Состояние загрузки
        if (this.isLoading) {
            const loading = document.createElement('div');
            loading.className = 'core-engine-lib-base-table-loading';
            loading.textContent = 'Загрузка...';
            wrapper.appendChild(loading);
            this.container.appendChild(wrapper);
            return;
        }

        // Состояние ошибки
        if (this.error) {
            const error = document.createElement('div');
            error.className = 'core-engine-lib-base-table-error';
            error.innerHTML = `
                <span>❌ ${this.error}</span>
                <button class="core-engine-lib-base-btn core-engine-lib-base-btn-sm" data-js="table-retry">Повторить</button>
            `;
            wrapper.appendChild(error);
            this.container.appendChild(wrapper);

            const retryBtn = error.querySelector('[data-js="table-retry"]');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this._loadData();
                });
            }
            return;
        }

        // Тулбар
        if (this.actions.length > 0) {
            const toolbar = this._renderToolbar();
            wrapper.appendChild(toolbar);
        }

        // Скролл-контейнер
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'core-engine-lib-base-table-scroll';

        // Таблица
        const table = document.createElement('table');
        table.className = 'core-engine-lib-base-table';

        // Заголовок
        const thead = this._renderHeader();
        table.appendChild(thead);

        // Тело
        const tbody = this._renderBody();
        table.appendChild(tbody);

        scrollContainer.appendChild(table);
        wrapper.appendChild(scrollContainer);

        this.container.appendChild(wrapper);

        // Сохраняем ссылку на tbody для обновлений
        this.tbody = tbody;
        this.scrollContainer = scrollContainer;

        // Восстанавливаем выделение
        if (this.selectedId) {
            this.selectRow(this.selectedId);
        }
    }

    /**
     * Рендеринг тулбара
     */
    _renderToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-table-toolbar';

        this.actions.forEach(action => {
            const btn = document.createElement('button');
            btn.className = `core-engine-lib-base-btn core-engine-lib-base-btn-sm ${action.class || ''}`;
            btn.innerHTML = action.label;
            btn.title = action.title || '';
            btn.addEventListener('click', () => {
                if (action.action) {
                    action.action(this.selectedId, this.getSelectedRow());
                }
            });
            toolbar.appendChild(btn);
        });

        return toolbar;
    }

    /**
     * Рендеринг заголовка таблицы
     */
    _renderHeader() {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');

        this.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.label || col.field;
            if (col.width) {
                th.style.width = col.width;
            }
            if (col.type === 'number') {
                th.style.textAlign = 'right';
            }
            tr.appendChild(th);
        });

        thead.appendChild(tr);
        return thead;
    }

    /**
     * Рендеринг тела таблицы
     */
    _renderBody() {
        const tbody = document.createElement('tbody');

        if (this.data.length === 0) {
            const tr = document.createElement('tr');
            tr.className = 'core-engine-lib-base-table-empty';
            const td = document.createElement('td');
            td.colSpan = this.columns.length;
            td.textContent = 'Нет данных';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return tbody;
        }

        this.data.forEach((item, index) => {
            const tr = document.createElement('tr');
            const itemId = item.id !== undefined ? item.id : index;
            tr.dataset.id = itemId;

            // Выделение строки
            if (this.selectable) {
                tr.addEventListener('click', () => {
                    const id = tr.dataset.id;
                    this.selectRow(id);
                });
            }

            // Двойной клик
            if (this.onDblClick) {
                tr.addEventListener('dblclick', () => {
                    this.onDblClick(tr.dataset.id, item);
                });
            }

            // Колонки
            this.columns.forEach(col => {
                const td = document.createElement('td');
                td.dataset.label = col.label || col.field;
                const value = this._getNestedValue(item, col.field);
                
                // Форматирование в зависимости от типа
                if (col.type === 'date' && value) {
                    td.textContent = new Date(value).toLocaleDateString();
                } else if (col.type === 'datetime' && value) {
                    td.textContent = new Date(value).toLocaleString();
                } else if (col.type === 'number' && value !== undefined && value !== null) {
                    td.textContent = typeof value === 'number' ? value : parseFloat(value);
                    td.style.textAlign = 'right';
                } else if (col.type === 'boolean') {
                    td.textContent = value ? '✅' : '❌';
                    td.style.textAlign = 'center';
                } else {
                    td.textContent = value !== undefined && value !== null ? value : '';
                }
                
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        return tbody;
    }

    /**
     * Получить значение из вложенного объекта по пути
     */
    _getNestedValue(obj, path) {
        if (!path) return obj;
        const keys = path.split('.');
        let result = obj;
        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return undefined;
            }
        }
        return result;
    }

    /**
     * Выделить строку по ID
     */
    selectRow(id) {
        if (!this.selectable) return;

        // Снимаем выделение с предыдущей строки
        if (this.selectedId !== null && this.selectedId !== undefined) {
            const prevRow = this.tbody?.querySelector(`tr[data-id="${this.selectedId}"]`);
            if (prevRow) {
                prevRow.classList.remove('selected');
            }
        }

        this.selectedId = id;

        // Выделяем новую строку
        const row = this.tbody?.querySelector(`tr[data-id="${id}"]`);
        if (row) {
            row.classList.add('selected');
            // Прокручиваем к выделенной строке
            row.scrollIntoView({ block: 'nearest' });
        }

        // Вызываем колбэк
        if (this.onSelect) {
            const data = this.data.find(item => {
                const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
                return itemId == id;
            });
            this.onSelect(id, data);
        }
    }

    /**
     * Получить выделенную строку
     */
    getSelectedRow() {
        if (this.selectedId === null || this.selectedId === undefined) return null;
        return this.data.find(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == this.selectedId;
        });
    }

    /**
     * Обновить данные таблицы
     */
    updateData(newData) {
        console.log('[Table] updateData()', newData?.length || 0);
        this.data = newData || [];
        this.selectedId = null;
        this.render();
    }

    /**
     * Перезагрузить данные с сервера
     */
    async reload() {
        console.log('[Table] reload()');
        if (this.apiUrl) {
            await this._loadData();
        } else {
            this.render();
        }
    }

    /**
     * Добавить строку
     */
    addRow(item) {
        console.log('[Table] addRow()', item);
        this.data.push(item);
        this.render();
        // Выделяем добавленную строку
        const id = item.id !== undefined ? item.id : this.data.length - 1;
        this.selectRow(id);
    }

    /**
     * Удалить строку по ID
     */
    removeRow(id) {
        console.log('[Table] removeRow()', id);
        const index = this.data.findIndex(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == id;
        });
        if (index !== -1) {
            this.data.splice(index, 1);
            this.selectedId = null;
            this.render();
            return true;
        }
        return false;
    }

    /**
     * Обновить строку по ID
     */
    updateRow(id, newData) {
        console.log('[Table] updateRow()', id, newData);
        const index = this.data.findIndex(item => {
            const itemId = item.id !== undefined ? item.id : this.data.indexOf(item);
            return itemId == id;
        });
        if (index !== -1) {
            this.data[index] = { ...this.data[index], ...newData };
            this.render();
            // Восстанавливаем выделение
            this.selectRow(id);
            return true;
        }
        return false;
    }

    /**
     * Проверяет, инициализирован ли компонент
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Ожидает завершения инициализации
     */
    async waitForInit() {
        if (this._initPromise) {
            await this._initPromise;
        }
        return this._initialized;
    }

    /**
     * Уничтожить компонент
     */
    destroy() {
        console.log('[Table] destroy()');
        this.container.innerHTML = '';
        this.selectedId = null;
        this.data = [];
        this._initialized = false;
        this._initPromise = null;
    }
}