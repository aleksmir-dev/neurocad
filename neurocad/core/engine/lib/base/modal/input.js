// app/core/engine/lib/base/modal/input.js

export class BaseModalInput {
  constructor() {
    this.container = null;
    this.onOk = null;
    this.onCancel = null;

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
      window.coreEngine.loadCSS('core/engine/lib/base/modal/input.css');
    }
  }

  _createDOM() {
    const existing = document.querySelector('.core-engine-lib-base-modal-input');
    if (existing) {
      this.container = existing;
      this._cacheElements();
      return;
    }

    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-modal-input';
    container.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text">Ввод</div>
          <div class="title-bar-controls">
            <span class="close-btn">✕</span>
          </div>
        </div>
        <div class="content">
          <div class="input-text"></div>
          <input type="text" class="input-field" placeholder="">
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
    this.inputText = this.container.querySelector('.input-text');
    this.inputField = this.container.querySelector('.input-field');
    this.okBtn = this.container.querySelector('.ok-btn');
    this.cancelBtn = this.container.querySelector('.cancel-btn');
    this.closeBtn = this.container.querySelector('.close-btn');
  }

  _bindEvents() {
    // === ОК ===
    this.okBtn.addEventListener('click', () => {
      const value = this.inputField.value.trim();
      if (this.onOk) {
        this.onOk(value);
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

    // === Закрытие ===
    this.closeBtn.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel(null);
      }
      this.close();
    });

    // === Enter ===
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const value = this.inputField.value.trim();
        if (this.onOk) {
          this.onOk(value);
        }
        this.close();
      }
    });

    // === Закрытие по клику на оверлей ===
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        if (this.onCancel) {
          this.onCancel(null);
        }
        this.close();
      }
    });

    // === Закрытие по Escape ===
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) {
        if (this.onCancel) {
          this.onCancel(null);
        }
        this.close();
      }
    });
  }

  // ========== Публичные методы ==========

  open(text, title, placeholder, defaultValue) {
    this.inputText.textContent = text || '';
    this.titleBarText.textContent = title || 'Ввод';
    this.inputField.placeholder = placeholder || '';
    this.inputField.value = defaultValue || '';

    setTimeout(() => {
      this.inputField.focus();
      this.inputField.select();
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

  setOnResult(callback) {
    this.onOk = callback;
    this.onCancel = callback;
  }

  destroy() {
      if (this.container) {
          this.container.remove();
      }
  }

}