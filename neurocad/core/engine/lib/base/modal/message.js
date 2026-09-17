// app/core/engine/lib/base/modal/message.js

export class BaseModalMessage {
    constructor() {
        this.container = null;
        this.onOk = null;

        // Загружаем CSS при создании объекта
        this._loadCSS();

        this._createDOM();
        this._bindEvents();
    }

    /**
     * Загрузить CSS для модалки
     */
    _loadCSS() {
        if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
            window.coreEngine.loadCSS('core/engine/lib/base/modal/message.css');
        }
    }

    _createDOM() {
        const existing = document.querySelector('.core-engine-lib-base-modal-message');
        if (existing) {
            this.container = existing;
            this._cacheElements();
            return;
        }

        const container = document.createElement('div');
        container.className = 'core-engine-lib-base-modal-message';
        container.innerHTML = `
            <div class="window">
                <div class="title-bar">
                    <div class="title-bar-text">Сообщение</div>
                    <div class="title-bar-controls">
                        <span class="close-btn">✕</span>
                    </div>
                </div>
                <div class="content">
                    <div class="message-body">
                        <div class="message-text"></div>
                    </div>
                    <div class="actions-bar">
                        <button class="btn btn-white ok-btn">Продолжить</button>
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
        this.messageText = this.container.querySelector('.message-text');
        this.okBtn = this.container.querySelector('.ok-btn');
        this.closeBtn = this.container.querySelector('.close-btn');
    }

    _bindEvents() {
        this.okBtn.addEventListener('click', () => {
            if (this.onOk) {
                this.onOk();
            }
            this.close();
        });

        this.closeBtn.addEventListener('click', () => {
            this.close();
        });

        this.container.addEventListener('click', (e) => {
            if (e.target === this.container) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this.close();
            }
        });
    }

    open(text, title, okButtonText) {
        this.messageText.textContent = text || '';
        this.titleBarText.textContent = title || 'Сообщение';
        this.okBtn.textContent = okButtonText || 'Продолжить';
        this.container.classList.add('active');
    }

    close() {
        this.container.classList.remove('active');
    }

    setOnOk(callback) {
        this.onOk = callback;
    }

    destroy() {
        if (this.container) {
            this.container.remove();
        }
    }

}