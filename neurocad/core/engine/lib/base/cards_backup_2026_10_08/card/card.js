// neurocad/core/engine/lib/base/cards/card/card.js

/**
 * BaseCardsCard — одна карточка в сетке.
 *
 * Отвечает только за отображение ОДНОГО item'а и обработку кликов:
 *   - левый клик / тап      → onActivate(id, e)  (переход)
 *   - правый клик / long-press → onSelect(id, e) (выделение)
 *
 * Никаких API-запросов, никакой формы редактирования — только плитка.
 * Всё это — в родительском BaseCards (cards.js) и его модулях.
 */
export class BaseCardsCard {
    constructor(item, fields, statusField, listFields, options = {}) {
        this.item = item;
        this.fields = fields || [];
        this.statusField = statusField || 'status';
        this.listFields = listFields || [];

        this.renderContent = options.renderContent || null;
        this.renderIcon = options.renderIcon || null;
        this.customClass = options.customClass || null;

        this.element = null;
        this.isSelected = false;

        // Колбэки
        this.onSelect = null;        // выделение (правый клик / долгое нажатие)
        this.onActivate = null;      // переход (левый клик / тап)

        // Состояние long-press
        this._pressTimer = null;
        this._longPressFired = false;
        this._longPressThreshold = 500;   // мс

        // Для отмены при движении
        this._pressStartX = 0;
        this._pressStartY = 0;
    }

    getFieldValue(key) {
        return this.item[key] !== undefined ? this.item[key] : '';
    }

    getFieldLabel(key, value) {
        const field = this.fields.find(f => f.key === key);
        if (field && field.type === 'select' && field.options) {
            const option = field.options.find(o => o.value === value);
            return option ? option.label : value;
        }
        return value;
    }

    getStatusIcon() {
        const status = this.getFieldValue(this.statusField);
        const field = this.fields.find(f => f.key === this.statusField);
        if (field && field.type === 'select' && field.options) {
            const option = field.options.find(o => o.value === status);
            if (option && option.icon) {
                return option.icon;
            }
        }
        return '';
    }

    getStatusClass() {
        const status = this.getFieldValue(this.statusField);
        const field = this.fields.find(f => f.key === this.statusField);
        if (field && field.type === 'select' && field.options) {
            const option = field.options.find(o => o.value === status);
            if (option && option.class) {
                return option.class;
            }
        }
        return status;
    }

    formatValue(key, value) {
        const field = this.fields.find(f => f.key === key);
        if (!field) return value;

        switch (field.type) {
            case 'date':
                if (!value) return '';
                const d = new Date(value);
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}.${month}.${year}`;
            case 'time':
                if (!value) return '';
                return value.slice(0, 5);
            case 'select':
                return this.getFieldLabel(key, value);
            default:
                return value;
        }
    }

    /**
     * Отрендерить карточку.
     * @param {Function} onActivate — вызывается при левом клике / тапе: (id, e) => ...
     * @param {Function} onSelect   — вызывается при правом клике / долгом нажатии: (id, e) => ...
     */
    render(onActivate, onSelect) {
        console.log('[BaseCardsCard] render() для item:', this.item?.id, this.item?.name);

        this.onActivate = onActivate || null;
        this.onSelect = onSelect || null;

        this.element = document.createElement('div');
        this.element.className = 'core-engine-lib-base-cards-card';
        this.element.dataset.id = this.item.id;

        if (this.customClass) {
            this.element.classList.add(this.customClass);
        }

        if (!this.renderContent) {
            const statusClass = this.getStatusClass();
            if (statusClass) {
                this.element.classList.add('status-' + statusClass);
            }
        }

        const content = this._buildContent();
        this.element.appendChild(content);

        if (this.isSelected) {
            this.element.classList.add('selected');
        }

        this._bindEvents();

        return this.element;
    }

    _buildContent() {
        if (typeof this.renderContent === 'function') {
            const wrapper = document.createElement('div');
            wrapper.className = 'card-content card-content-custom';

            try {
                const html = this.renderContent(this.item);
                if (typeof html === 'string') {
                    wrapper.innerHTML = html;
                } else if (html instanceof HTMLElement) {
                    wrapper.appendChild(html);
                }
            } catch (error) {
                console.error('[BaseCardsCard] Ошибка кастомного рендера:', error);
                wrapper.textContent = this.item.name || this.item.title || 'Ошибка рендера';
            }

            return wrapper;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'card-content';

        const fieldsToShow = this.listFields.length > 0 ? this.listFields : ['title'];

        fieldsToShow.forEach((key, index) => {
            const field = this.fields.find(f => f.key === key);
            if (!field) return;

            const value = this.getFieldValue(key);
            const formatted = this.formatValue(key, value);

            if (!formatted && index > 0) return;

            if (key === this.statusField) {
                const statusEl = document.createElement('div');
                statusEl.className = 'card-status-badge';
                const icon = this.getStatusIcon();
                if (icon) {
                    statusEl.textContent = icon + ' ' + formatted;
                } else {
                    statusEl.textContent = formatted || '—';
                }
                wrapper.appendChild(statusEl);
                return;
            }

            const el = document.createElement('div');
            el.className = `card-field card-field-${key}`;

            if (index === 0) {
                el.className += ' card-field-title';
                el.textContent = formatted || 'Без названия';
            } else {
                el.textContent = formatted;
            }

            wrapper.appendChild(el);
        });

        return wrapper;
    }

    _bindEvents() {
        if (!this.element) return;

        console.log('[BaseCardsCard] _bindEvents() для item:', this.item?.id);

        // ===== ЛЕВЫЙ КЛИК / ТАП → переход =====
        this.element.addEventListener('click', (e) => {
            // Если только что сработал long-press — гасим click
            if (this._longPressFired) {
                this._longPressFired = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            this._handleActivate(e);
        });

        // ===== ПРАВЫЙ КЛИК МЫШЬЮ → выделение =====
        // contextmenu срабатывает и на мыши, и (иногда) на Android.
        // Системное меню подавляем, выделяем карточку.
        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleSelect(e);
        });

        // ===== ДОЛГОЕ НАЖАТИЕ НА ТАЧЕ → выделение =====
        this.element.addEventListener('pointerdown', (e) => {
            // Мышь игнорируем — у неё правый клик через contextmenu
            if (e.pointerType === 'mouse') return;

            // Запоминаем точку старта
            this._pressStartX = e.clientX;
            this._pressStartY = e.clientY;

            this._longPressFired = false;

            this._pressTimer = setTimeout(() => {
                this._longPressFired = true;
                this._handleSelect(e);

                // Вибро-отклик, если поддерживается
                if (navigator.vibrate) {
                    navigator.vibrate(20);
                }
            }, this._longPressThreshold);
        });

        // Отмена таймера при отпускании / уходе / отмене
        this.element.addEventListener('pointerup', () => {
            this._cancelPress();
        });

        this.element.addEventListener('pointerleave', () => {
            this._cancelPress();
        });

        this.element.addEventListener('pointercancel', () => {
            this._cancelPress();
        });

        // Отмена при заметном смещении (пользователь скроллит)
        this.element.addEventListener('pointermove', (e) => {
            if (!this._pressTimer) return;
            const dx = Math.abs(e.clientX - this._pressStartX);
            const dy = Math.abs(e.clientY - this._pressStartY);
            if (dx > 10 || dy > 10) {
                this._cancelPress();
            }
        });
    }

    _cancelPress() {
        if (this._pressTimer) {
            clearTimeout(this._pressTimer);
            this._pressTimer = null;
        }
    }

    _handleActivate(e) {
        console.log('[BaseCardsCard] _handleActivate() для item:', this.item?.id);
        if (this.onActivate) {
            this.onActivate(this.item.id, e);
        }
    }

    _handleSelect(e) {
        console.log('[BaseCardsCard] _handleSelect() для item:', this.item?.id);
        if (this.onSelect) {
            this.onSelect(this.item.id, e);
        } else {
            console.warn('[BaseCardsCard] onSelect НЕ привязан!');
        }
    }

    setSelected(selected) {
        this.isSelected = selected;
        if (this.element) {
            if (selected) {
                this.element.classList.add('selected');
            } else {
                this.element.classList.remove('selected');
            }
        }
    }

    toggleSelected() {
        this.setSelected(!this.isSelected);
    }

    updateItem(item) {
        this.item = item;
        if (this.element) {
            const newContent = this._buildContent();
            const oldContent = this.element.querySelector('.card-content');
            if (oldContent) {
                oldContent.replaceWith(newContent);
            }

            this.element.className = 'core-engine-lib-base-cards-card';
            if (this.customClass) {
                this.element.classList.add(this.customClass);
            }

            if (!this.renderContent) {
                const statusClass = this.getStatusClass();
                if (statusClass) {
                    this.element.classList.add('status-' + statusClass);
                }
            }

            if (this.isSelected) {
                this.element.classList.add('selected');
            }
        }
    }

    getId() {
        return this.item.id;
    }

    getData() {
        return this.item;
    }

    destroy() {
        this._cancelPress();
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }
}