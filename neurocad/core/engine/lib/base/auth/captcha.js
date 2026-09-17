// app/core/engine/lib/base/auth/captcha.js

export class BaseAuthCaptcha {
    constructor(options = {}) {
        console.log('[BaseAuthCaptcha] Конструктор вызван');
        this.options = options;
        this.onRefresh = options.onRefresh || null;
        this.element = null;
        this.value = null;
        this.expected = null;
        this.operators = ['+', '−', '×'];

        // Состояние инициализации
        this._initialized = false;
        this._initPromise = null;

        // Загружаем CSS
        this._loadCSS();

        // Запускаем асинхронную инициализацию
        this._initPromise = this._init();

        // Генерируем первую капчу (после инициализации)
        // Но generate() вызывается в _init()
    }

    async _init() {
        console.log('[BaseAuthCaptcha] _init() START');
        try {
            // Генерируем капчу
            this.generate();
            this._initialized = true;
            console.log('[BaseAuthCaptcha] _init() COMPLETE');
        } catch (error) {
            console.error('[BaseAuthCaptcha] Ошибка инициализации:', error);
            this._initialized = false;
            throw error;
        }
    }

    /**
     * Загрузить CSS
     */
    _loadCSS() {
        console.log('[BaseAuthCaptcha] _loadCSS()');
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/auth/captcha.css');
        }
    }

    /**
     * Сгенерировать новый пример
     */
    generate() {
        console.log('[BaseAuthCaptcha] generate()');
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        const op = this.operators[Math.floor(Math.random() * this.operators.length)];

        let result;
        let displayOp;

        switch (op) {
            case '+':
                result = a + b;
                displayOp = '+';
                break;
            case '−':
                if (a < b) {
                    // Меняем местами
                    return this.generate();
                }
                result = a - b;
                displayOp = '−';
                break;
            case '×':
                if (a * b > 30) {
                    return this.generate();
                }
                result = a * b;
                displayOp = '×';
                break;
            default:
                result = a + b;
                displayOp = '+';
        }

        this.value = `${a} ${displayOp} ${b} = ?`;
        this.expected = result;
        this.display = `${a} ${displayOp} ${b} = ?`;

        // Обновляем UI
        this._updateUI();

        return this.value;
    }

    /**
     * Обновить UI с новым значением
     */
    _updateUI() {
        console.log('[BaseAuthCaptcha] _updateUI()');
        if (this.questionEl) {
            this.questionEl.textContent = this.value;
        }
        if (this.inputEl) {
            this.inputEl.value = '';
            // Не фокусируемся автоматически, чтобы не перехватывать фокус
            // this.inputEl.focus();
        }
        // Скрываем ошибку при обновлении
        this._hideError();
    }

    /**
     * Проверить ответ
     */
    validate() {
        console.log('[BaseAuthCaptcha] validate()');
        if (!this.inputEl) {
            return { valid: false, message: 'Капча не загружена' };
        }

        const answer = parseInt(this.inputEl.value.trim());
        if (isNaN(answer)) {
            return { valid: false, message: 'Введите число' };
        }

        if (answer === this.expected) {
            return { valid: true };
        } else {
            return { valid: false, message: 'Неверный ответ' };
        }
    }

    /**
     * Обновить капчу (принудительно)
     */
    refresh() {
        console.log('[BaseAuthCaptcha] refresh()');
        this.generate();
        if (this.onRefresh && typeof this.onRefresh === 'function') {
            this.onRefresh();
        }
    }

    /**
     * Рендеринг компонента
     */
    render() {
        console.log('[BaseAuthCaptcha] render()');
        const wrapper = document.createElement('div');
        wrapper.className = 'core-engine-lib-base-auth-captcha';
        wrapper.innerHTML = `
            <div class="captcha-container">
                <div class="captcha-question">
                    <span class="captcha-text" data-js="captcha-question">${this._escapeHtml(this.value)}</span>
                    <button type="button" class="captcha-refresh" data-js="captcha-refresh" title="Обновить капчу">🔄</button>
                </div>
                <input type="text" class="auth-input captcha-input" data-js="captcha-input" placeholder="Введите ответ" autocomplete="off">
                <div class="captcha-error" data-js="captcha-error" style="display:none;"></div>
            </div>
        `;
        this.element = wrapper;

        // Сохраняем ссылки на элементы
        this.questionEl = wrapper.querySelector('[data-js="captcha-question"]');
        this.inputEl = wrapper.querySelector('[data-js="captcha-input"]');
        this.errorEl = wrapper.querySelector('[data-js="captcha-error"]');
        this.refreshBtn = wrapper.querySelector('[data-js="captcha-refresh"]');

        return wrapper;
    }

    /**
     * Экранирование HTML
     */
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Привязка событий
     */
    bindEvents(container) {
        console.log('[BaseAuthCaptcha] bindEvents()');
        const root = container || this.element;

        // Обновляем ссылки, если контейнер другой
        if (container && container !== this.element) {
            this.questionEl = container.querySelector('[data-js="captcha-question"]') || this.questionEl;
            this.inputEl = container.querySelector('[data-js="captcha-input"]') || this.inputEl;
            this.errorEl = container.querySelector('[data-js="captcha-error"]') || this.errorEl;
            this.refreshBtn = container.querySelector('[data-js="captcha-refresh"]') || this.refreshBtn;
        }

        // Кнопка обновления
        if (this.refreshBtn) {
            // Удаляем старые обработчики, чтобы не было дублей
            const newRefreshBtn = this.refreshBtn.cloneNode(true);
            this.refreshBtn.parentNode.replaceChild(newRefreshBtn, this.refreshBtn);
            this.refreshBtn = newRefreshBtn;
            
            this.refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.refresh();
            });
        }

        // Ввод — очищаем ошибку при вводе
        if (this.inputEl) {
            // Удаляем старые обработчики
            const newInputEl = this.inputEl.cloneNode(true);
            this.inputEl.parentNode.replaceChild(newInputEl, this.inputEl);
            this.inputEl = newInputEl;

            this.inputEl.addEventListener('input', () => {
                this._hideError();
            });

            // Enter — можно обработать снаружи
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // Отправляем событие для формы
                    const event = new CustomEvent('captcha:submit');
                    document.dispatchEvent(event);
                }
            });
        }
    }

    /**
     * Показать ошибку
     */
    showError(message) {
        console.log('[BaseAuthCaptcha] showError()', message);
        if (this.errorEl) {
            this.errorEl.textContent = message || 'Неверный ответ';
            this.errorEl.style.display = 'block';
        }
        if (this.inputEl) {
            this.inputEl.classList.add('error');
        }
    }

    /**
     * Скрыть ошибку
     */
    _hideError() {
        if (this.errorEl) {
            this.errorEl.textContent = '';
            this.errorEl.style.display = 'none';
        }
        if (this.inputEl) {
            this.inputEl.classList.remove('error');
        }
    }

    /**
     * Получить текущий вопрос
     */
    getQuestion() {
        return this.value;
    }

    /**
     * Получить ожидаемый ответ (для отладки)
     */
    getExpected() {
        return this.expected;
    }

    /**
     * Очистить поле ввода
     */
    clear() {
        console.log('[BaseAuthCaptcha] clear()');
        if (this.inputEl) {
            this.inputEl.value = '';
        }
        this._hideError();
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
     * Уничтожить
     */
    destroy() {
        console.log('[BaseAuthCaptcha] destroy()');
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
        this.questionEl = null;
        this.inputEl = null;
        this.errorEl = null;
        this.refreshBtn = null;
        this._initialized = false;
        this._initPromise = null;
    }
}