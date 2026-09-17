// app/core/engine/lib/base/mobile.js

/**
 * Мобильный класс для управления бургер-меню
 * Отвечает за открытие/закрытие мобильного меню
 */
export class BaseMobile {
    constructor() {
        this.isOpen = false;
        this.menu = null;
        this.overlay = null;
        this.burger = document.querySelector('.core-engine-lib-base-burger');

        if (!this.burger) {
            console.warn('[BaseMobile] Бургер не найден');
            return;
        }

        this.init();
    }

    init() {
        // Создаём оверлей
        this.overlay = document.createElement('div');
        this.overlay.className = 'core-engine-lib-base-mobile-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.6);
            z-index: 999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(this.overlay);

        // Создаём меню
        this.menu = document.createElement('div');
        this.menu.className = 'core-engine-lib-base-mobile-menu';
        this.menu.style.cssText = `
            position: fixed;
            top: 0;
            right: -280px;
            bottom: 0;
            width: 280px;
            background: #ffffff;
            z-index: 1000;
            padding: 1.5rem;
            box-shadow: -10px 0 30px rgba(0, 0, 0, 0.15);
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        `;
        this.menu.innerHTML = `
            <div class="core-engine-lib-base-mobile-header">
                <span class="core-engine-lib-base-mobile-title">Меню</span>
                <button class="core-engine-lib-base-mobile-close">✕</button>
            </div>
            <a href="#" class="core-engine-lib-base-mobile-item">Дашборд</a>
            <a href="#" class="core-engine-lib-base-mobile-item">Задачи</a>
            <a href="#" class="core-engine-lib-base-mobile-item">Отчёты</a>
            <a href="#" class="core-engine-lib-base-mobile-item">Настройки</a>
            <div class="core-engine-lib-base-mobile-user">
                <span class="core-engine-lib-base-mobile-username">👤 Гость</span>
                <span class="core-engine-lib-base-mobile-auth">🔓 Вход</span>
            </div>
        `;
        document.body.appendChild(this.menu);

        // Обработчики
        this.burger.addEventListener('click', () => this.toggle());

        const closeBtn = this.menu.querySelector('.core-engine-lib-base-mobile-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        this.overlay.addEventListener('click', () => this.close());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.menu.style.right = '0';
        this.overlay.style.opacity = '1';
        this.overlay.style.pointerEvents = 'auto';
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.isOpen = false;
        this.menu.style.right = '-280px';
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        document.body.style.overflow = '';
    }

    destroy() {
        if (this.overlay) {
            this.overlay.remove();
        }
        if (this.menu) {
            this.menu.remove();
        }
        document.body.style.overflow = '';
    }
}