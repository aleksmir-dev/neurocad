// app/core/engine/lib/base/demo.js

/**
 * Демо-класс для заполнения блоков тестовым содержимым
 * Добавляет виджеты в колонки и панель управления
 * Мобильным меню не управляет — это задача Mobile
 */
export class BaseDemo {
    constructor(base) {
        this.base = base;
        this.init();
    }

    init() {
        this.createWidgets();
        this.addControls();
        this.fillHeader();
        this.fillFooter();
    }

    createWidgets() {
        this.createWidgetIn('.core-engine-lib-base-area-left', 'Левая панель', 1);
        this.createWidgetIn('.core-engine-lib-base-area-left', 'Левая панель', 2);
        this.createWidgetIn('.core-engine-lib-base-area-center', 'Страница', 1);
        this.createWidgetIn('.core-engine-lib-base-area-center', 'Поиск', 2);
        this.createWidgetIn('.core-engine-lib-base-area-right', 'Правая панель', 1);
        this.createWidgetIn('.core-engine-lib-base-area-right', 'Правая панель', 2);
    }

    createWidgetIn(containerSelector, title, number) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const widget = document.createElement('div');
        widget.className = 'core-engine-lib-base-widget';

        let contentHtml = '<p>Это демонстрационный текст для виджета.</p>';
        if (number === 2) {
            contentHtml = '';
            for (let i = 1; i <= 20; i++) {
                contentHtml += `<p>Абзац ${i}: Демонстрационный текст для проверки прокрутки в виджете. Содержимое должно помещаться в пределах видимой области.</p>`;
            }
        }

        widget.innerHTML = `
            <div class="core-engine-lib-base-widget-titlebar">
                <span>${title} ${number}</span>
                <span class="core-engine-lib-base-widget-toggle" data-widget="${containerSelector}-${number}" title="Скрыть/Показать содержимое">👁️</span>
            </div>
            <div class="core-engine-lib-base-widget-toolbar">
                <span class="core-engine-lib-base-toolbar-icon" data-action="action1" title="Действие 1">📝</span>
                <span class="core-engine-lib-base-toolbar-icon" data-action="action2" title="Действие 2">🗑️</span>
                <span class="core-engine-lib-base-toolbar-icon" data-action="menu" title="Меню">☰</span>
            </div>
            <div class="core-engine-lib-base-widget-content">
                ${contentHtml}
            </div>
            <div class="core-engine-lib-base-widget-statusbar">Статус: готов</div>
        `;

        container.appendChild(widget);

        const toggle = widget.querySelector('.core-engine-lib-base-widget-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const content = widget.querySelector('.core-engine-lib-base-widget-content');
                if (content.style.display === 'none') {
                    content.style.display = '';
                    toggle.textContent = '👁️';
                    toggle.title = 'Скрыть содержимое';
                } else {
                    content.style.display = 'none';
                    toggle.textContent = '👁️‍🗨️';
                    toggle.title = 'Показать содержимое';
                }
            });
        }

        widget.querySelectorAll('.core-engine-lib-base-toolbar-icon').forEach(icon => {
            icon.addEventListener('click', () => {
                const action = icon.dataset.action;
                if (action === 'menu') {
                    this.toggleDropdown(icon);
                }
            });
        });
    }

    fillHeader() {
        const logo = document.querySelector('.core-engine-lib-base-logo');
        if (logo) {
            logo.textContent = '⚡ Ассистент';
        }

        const title = document.querySelector('.core-engine-lib-base-title');
        if (title) {
            title.textContent = 'Главная страница';
        }

        const actions = document.querySelector('.core-engine-lib-base-actions');
        if (actions) {
            const username = actions.querySelector('.core-engine-lib-base-username');
            if (username) {
                username.textContent = 'Гость';
            }

            const authIcon = actions.querySelector('.core-engine-lib-base-action-icon[data-action="auth"]');
            if (authIcon) {
                authIcon.textContent = '🔓';
            }
        }
    }

    fillFooter() {
        const footer = document.querySelector('.core-engine-lib-base-footer');
        if (footer) {
            footer.textContent = '© 2026 Ассистент. Все права защищены.';
            footer.style.textAlign = 'left';
        }
    }

    addControls() {
        const firstWidget = document.querySelector('.core-engine-lib-base-area-center .core-engine-lib-base-widget');
        if (!firstWidget) return;

        const toolbar = firstWidget.querySelector('.core-engine-lib-base-widget-toolbar');
        if (!toolbar) return;

        toolbar.innerHTML = '';

        const controls = document.createElement('span');
        controls.className = 'demo-controls';
        controls.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        `;

        const icons = [
            { id: 'header', icon: '🏠', label: 'Header' },
            { id: 'footer', icon: '📄', label: 'Footer' },
            { id: 'area-left', icon: '⬅️', label: 'Left' },
            { id: 'area-right', icon: '➡️', label: 'Right' },
        ];

        icons.forEach(item => {
            const icon = document.createElement('span');
            icon.className = 'core-engine-lib-base-control-icon';
            icon.dataset.block = item.id;
            icon.textContent = item.icon;
            icon.title = item.label;
            icon.style.cssText = `
                font-size: 1.1rem;
                cursor: pointer;
                padding: 0.15rem 0.3rem;
                border-radius: 3px;
                transition: all 0.2s;
                opacity: 0.6;
                display: inline-block;
                line-height: 1;
            `;
            icon.addEventListener('click', () => this.toggleBlock(item.id, icon));
            controls.appendChild(icon);
        });

        const sep = document.createElement('span');
        sep.textContent = '|';
        sep.style.cssText = 'color: #ccc; font-size: 1.1rem;';
        controls.appendChild(sep);

        const resetIcon = document.createElement('span');
        resetIcon.className = 'core-engine-lib-base-control-icon';
        resetIcon.textContent = '🔄';
        resetIcon.title = 'Сбросить все';
        resetIcon.style.cssText = `
            font-size: 1.1rem;
            cursor: pointer;
            padding: 0.15rem 0.3rem;
            border-radius: 3px;
            transition: all 0.2s;
            opacity: 0.6;
            display: inline-block;
            line-height: 1;
        `;
        resetIcon.addEventListener('click', () => this.resetAll());
        controls.appendChild(resetIcon);

        toolbar.appendChild(controls);

        this.addModalButtons();
    }

    addModalButtons() {
        const secondWidget = document.querySelector('.core-engine-lib-base-area-center .core-engine-lib-base-widget:last-child');
        if (!secondWidget) return;

        const toolbar = secondWidget.querySelector('.core-engine-lib-base-widget-toolbar');
        if (!toolbar) return;

        toolbar.innerHTML = '';

        const modalIcons = [
            { type: 'message', icon: '💬', label: 'Сообщение' },
            { type: 'confirm', icon: '❓', label: 'Подтверждение' },
            { type: 'input', icon: '✏️', label: 'Ввод' },
            { type: 'date', icon: '📅', label: 'Дата' },
            { type: 'interval', icon: '📆', label: 'Интервал' },
        ];

        const container = document.createElement('span');
        container.className = 'demo-modal-buttons';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        `;

        modalIcons.forEach(item => {
            const icon = document.createElement('span');
            icon.className = 'core-engine-lib-base-toolbar-icon';
            icon.dataset.modal = item.type;
            icon.textContent = item.icon;
            icon.title = item.label;
            icon.style.cssText = `
                font-size: 1.1rem;
                cursor: pointer;
                padding: 0.15rem 0.3rem;
                border-radius: 3px;
                transition: all 0.2s;
                opacity: 0.7;
                display: inline-block;
                line-height: 1;
            `;
            icon.addEventListener('click', () => {
                this.openModal(item.type);
            });
            container.appendChild(icon);
        });

        toolbar.appendChild(container);
    }

    openModal(type) {
        this.base.openModal(type);
    }

    toggleDropdown(icon) {
        const existing = document.querySelector('.demo-dropdown');
        if (existing) {
            existing.remove();
            return;
        }

        const rect = icon.getBoundingClientRect();

        const dropdown = document.createElement('div');
        dropdown.className = 'demo-dropdown';
        dropdown.style.cssText = `
            position: fixed;
            top: ${rect.bottom + 4}px;
            left: ${rect.left}px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            min-width: 160px;
            z-index: 1000;
            padding: 4px 0;
        `;
        dropdown.innerHTML = `
            <a href="#" style="display:block;padding:8px 16px;color:#0f172a;text-decoration:none;font-size:0.875rem;">👤 Профиль</a>
            <a href="#" style="display:block;padding:8px 16px;color:#0f172a;text-decoration:none;font-size:0.875rem;">⚙️ Настройки</a>
            <hr style="margin:4px 8px;border-color:#f1f5f9;">
            <a href="#" style="display:block;padding:8px 16px;color:#dc2626;text-decoration:none;font-size:0.875rem;">🚪 Выйти</a>
        `;

        dropdown.querySelectorAll('a').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeDropdown();
            });
        });

        document.body.appendChild(dropdown);

        setTimeout(() => {
            document.addEventListener('click', this._closeDropdownHandler = () => {
                this.closeDropdown();
            });
        }, 10);
    }

    closeDropdown() {
        const dropdown = document.querySelector('.demo-dropdown');
        if (dropdown) {
            dropdown.remove();
        }
        if (this._closeDropdownHandler) {
            document.removeEventListener('click', this._closeDropdownHandler);
            this._closeDropdownHandler = null;
        }
    }

    toggleBlock(blockId, icon) {
        const selector = `.core-engine-lib-base-${blockId}`;
        const element = document.querySelector(selector);
        if (!element) return;

        const isHidden = element.style.display === 'none';
        element.style.display = isHidden ? '' : 'none';
        icon.style.opacity = isHidden ? '1' : '0.3';
    }

    resetAll() {
        const allSelectors = [
            '.core-engine-lib-base-header',
            '.core-engine-lib-base-footer',
            '.core-engine-lib-base-area-left',
            '.core-engine-lib-base-area-right',
        ];

        allSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.style.display = '';
            });
        });

        document.querySelectorAll('.core-engine-lib-base-control-icon').forEach(icon => {
            icon.style.opacity = '0.6';
        });

        this.closeDropdown();
    }

    destroy() {
        document.querySelectorAll('.core-engine-lib-base-widget').forEach(el => el.remove());
        this.closeDropdown();
    }
}