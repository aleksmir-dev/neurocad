// app/core/engine/lib/base/cards/toolbar.js

/**
 * Панель инструментов для Cards
 * Управляет кнопками, фильтрацией и состоянием
 */
export class BaseCardsToolbar {
    constructor(container, props = {}) {
        this.container = container;
        this.props = props;

        // Версия для сброса кэша
        this.version = window.coreEngine?.static_version || Date.now();
        this.iconPath = '/static/core/engine/lib/base/images';

        // Настройки
        this.entityType = props.entityType || 'items';
        this.statusField = props.statusField || 'status';
        this.statuses = props.statuses || {};
        this.showSearch = props.showSearch !== false;
        this.showStatusFilter = props.showStatusFilter !== false;
        this.showAddButton = props.showAddButton !== false;
        this.showEditButton = props.showEditButton !== false;
        this.showDeleteButton = props.showDeleteButton !== false;
        this.showRestoreButton = props.showRestoreButton !== false;
        this.showTrashButton = props.showTrashButton !== false;

        // Состояние
        this.isDeletedMode = false;
        this.selectedCount = 0;
        this.currentFilter = '';
        this.currentStatusFilter = 'all';
        this.isLoading = false;

        // ID первого выделенного (для кнопки "Редактировать")
        this._firstSelectedId = null;

        // Callbacks
        this.onAdd = props.onAdd || null;
        this.onEdit = props.onEdit || null;
        this.onDelete = props.onDelete || null;
        this.onRestore = props.onRestore || null;
        this.onToggleTrash = props.onToggleTrash || null;
        this.onSearch = props.onSearch || null;
        this.onStatusFilter = props.onStatusFilter || null;
        this.onSelectAll = props.onSelectAll || null;

        // Ссылки на глобальные обработчики (для destroy)
        this._onKeyDown = null;

        // Создаём DOM
        this._createDOM();
        this._bindEvents();
        this._updateUI();
    }

    /**
     * Получить путь к иконке
     */
    _icon(name) {
        return `${this.iconPath}/${name}.svg?v=${this.version}`;
    }

    /**
     * Создать DOM структуру
     */
    _createDOM() {
        const existing = this.container.querySelector('.core-engine-lib-base-cards-toolbar');
        if (existing) {
            this.toolbar = existing;
            this._cacheElements();
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'core-engine-lib-base-cards-toolbar';
        toolbar.innerHTML = this._getTemplate();
        this.container.prepend(toolbar);
        this.toolbar = toolbar;
        this._cacheElements();
    }

    /**
     * Получить шаблон тулбара
     */
    _getTemplate() {
        const statusOptions = this._getStatusOptions();

        return `
            <div class="cards-toolbar-left">
                ${this.showAddButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-add" title="Добавить ${this.entityType}">
                        <img class="icon" src="${this._icon('add')}" alt="Добавить" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showEditButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-edit" title="Редактировать" disabled>
                        <img class="icon" src="${this._icon('edit')}" alt="Редактировать" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showDeleteButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-delete" title="Удалить" disabled>
                        <img class="icon" src="${this._icon('delete')}" alt="Удалить" width="20" height="20">
                    </button>
                ` : ''}

                ${this.showRestoreButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-restore" title="Восстановить" disabled style="display:none;">
                        <img class="icon" src="${this._icon('restore')}" alt="Восстановить" width="20" height="20">
                    </button>
                ` : ''}

                <span class="cards-toolbar-selected" data-js="selected-counter"></span>
            </div>

            <div class="cards-toolbar-right">
                ${this.showStatusFilter && statusOptions.length > 0 ? `
                    <select class="cards-toolbar-status-filter" data-js="status-filter">
                        <option value="all">Все статусы</option>
                        ${statusOptions.map(opt => `
                            <option value="${opt.value}">${opt.icon || ''} ${opt.label}</option>
                        `).join('')}
                    </select>
                ` : ''}

                ${this.showSearch ? `
                    <input class="cards-toolbar-search" type="text" placeholder="Поиск..." data-js="search-input">
                ` : ''}

                ${this.showTrashButton ? `
                    <button type="button" class="cards-toolbar-btn cards-toolbar-btn-trash" title="Корзина" data-js="trash-btn">
                        <img class="icon" src="${this._icon('eye')}" alt="Корзина" width="20" height="20">
                    </button>
                ` : ''}
            </div>
        `;
    }

    /**
     * Получить опции статусов
     */
    _getStatusOptions() {
        const options = [];
        if (this.statuses && typeof this.statuses === 'object') {
            for (const [key, value] of Object.entries(this.statuses)) {
                options.push({
                    value: key,
                    label: value.label || key,
                    icon: value.icon || ''
                });
            }
        }
        return options;
    }

    /**
     * Кешировать элементы
     */
    _cacheElements() {
        this.addBtn = this.toolbar.querySelector('.cards-toolbar-btn-add');
        this.editBtn = this.toolbar.querySelector('.cards-toolbar-btn-edit');
        this.deleteBtn = this.toolbar.querySelector('.cards-toolbar-btn-delete');
        this.restoreBtn = this.toolbar.querySelector('.cards-toolbar-btn-restore');
        this.trashBtn = this.toolbar.querySelector('[data-js="trash-btn"]');
        this.searchInput = this.toolbar.querySelector('[data-js="search-input"]');
        this.statusFilter = this.toolbar.querySelector('[data-js="status-filter"]');
        this.selectedCounter = this.toolbar.querySelector('[data-js="selected-counter"]');
    }

    /**
     * Привязать события
     */
    _bindEvents() {
        // Добавление
        if (this.addBtn) {
            this.addBtn.addEventListener('click', () => {
                if (this.onAdd) this.onAdd();
            });
        }

        // Редактирование
        if (this.editBtn) {
            this.editBtn.addEventListener('click', () => {
                if (this.onEdit && this.selectedCount > 0) {
                    this.onEdit(this.getFirstSelectedId());
                }
            });
        }

        // Удаление
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', () => {
                if (this.onDelete) this.onDelete();
            });
        }

        // Восстановление
        if (this.restoreBtn) {
            this.restoreBtn.addEventListener('click', () => {
                if (this.onRestore) this.onRestore();
            });
        }

        // Корзина
        if (this.trashBtn) {
            this.trashBtn.addEventListener('click', () => {
                this.isDeletedMode = !this.isDeletedMode;
                this.trashBtn.classList.toggle('active', this.isDeletedMode);
                if (this.onToggleTrash) {
                    this.onToggleTrash(this.isDeletedMode);
                }
                this._updateUI();
            });
        }

        // Поиск (с debounce)
        if (this.searchInput) {
            let timeout;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.currentFilter = e.target.value;
                    if (this.onSearch) {
                        this.onSearch(this.currentFilter);
                    }
                }, 300);
            });
        }

        // Фильтр по статусу
        if (this.statusFilter) {
            this.statusFilter.addEventListener('change', (e) => {
                this.currentStatusFilter = e.target.value;
                if (this.onStatusFilter) {
                    this.onStatusFilter(this.currentStatusFilter);
                }
            });
        }

        // Горячие клавиши — сохраняем ссылку, чтобы снять в destroy()
        this._onKeyDown = (e) => {
            // Ctrl+A — выделить всё, но только если фокус НЕ в поле ввода
            if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                const tag = e.target?.tagName;
                const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
                if (isEditable) return;

                if (this.onSelectAll) {
                    e.preventDefault();
                    this.onSelectAll();
                }
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    /**
     * Получить ID первого выделенного элемента
     */
    getFirstSelectedId() {
        return this._firstSelectedId || null;
    }

    /**
     * Установить ID первого выделенного (для кнопки "Редактировать")
     */
    setFirstSelectedId(id) {
        this._firstSelectedId = id;
        this._updateUI();
    }

    /**
     * Обновить состояние кнопок
     */
    _updateUI() {
        const selected = this.selectedCount;

        // Кнопка редактирования — активна только при ровно одном выделенном
        if (this.editBtn) {
            const disabled = selected !== 1 || this.isDeletedMode || !this._firstSelectedId;
            this.editBtn.disabled = disabled;
            this.editBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Кнопка удаления — активна при одном и более выделенных
        if (this.deleteBtn) {
            const disabled = selected === 0 || this.isDeletedMode;
            this.deleteBtn.disabled = disabled;
            this.deleteBtn.style.opacity = disabled ? '0.4' : '1';
        }

        // Кнопка восстановления — только в режиме корзины
        if (this.restoreBtn) {
            const disabled = selected === 0 || !this.isDeletedMode;
            this.restoreBtn.disabled = disabled;
            this.restoreBtn.style.opacity = disabled ? '0.4' : '1';
            this.restoreBtn.style.display = this.isDeletedMode ? 'inline-flex' : 'none';
        }

        // Счётчик выделенных
        if (this.selectedCounter) {
            if (selected > 0) {
                this.selectedCounter.textContent = `Выбрано: ${selected}`;
                this.selectedCounter.style.display = 'inline';
            } else {
                this.selectedCounter.textContent = '';
                this.selectedCounter.style.display = 'none';
            }
        }

        // Иконка корзины
        if (this.trashBtn) {
            const iconImg = this.trashBtn.querySelector('img.icon');
            if (iconImg) {
                iconImg.src = this.isDeletedMode
                    ? this._icon('eyec')
                    : this._icon('eye');
            }
            this.trashBtn.title = this.isDeletedMode ? 'Выйти из корзины' : 'Корзина';
        }
    }

    /**
     * Установить количество выделенных
     */
    setSelectedCount(count) {
        this.selectedCount = count;
        // Если выделение сброшено — обнуляем и firstSelectedId
        if (count === 0) {
            this._firstSelectedId = null;
        }
        this._updateUI();
    }

    /**
     * Установить режим загрузки
     */
    setLoading(loading) {
        this.isLoading = loading;
        if (this.addBtn) {
            this.addBtn.disabled = loading;
        }
    }

    /**
     * Сбросить фильтры
     */
    resetFilters() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this.currentFilter = '';
            if (this.onSearch) {
                this.onSearch('');
            }
        }
        if (this.statusFilter) {
            this.statusFilter.value = 'all';
            this.currentStatusFilter = 'all';
            if (this.onStatusFilter) {
                this.onStatusFilter('all');
            }
        }
    }

    /**
     * Установить состояние корзины
     */
    setTrashMode(enabled) {
        this.isDeletedMode = enabled;
        if (this.trashBtn) {
            this.trashBtn.classList.toggle('active', enabled);
        }
        this._updateUI();
    }

    /**
     * Получить состояние
     */
    getState() {
        return {
            isDeletedMode: this.isDeletedMode,
            filter: this.currentFilter,
            statusFilter: this.currentStatusFilter,
            selectedCount: this.selectedCount
        };
    }

    /**
     * Уничтожить
     */
    destroy() {
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
    }
}