// app/core/engine/lib/base/modal/textarea.js

export class BaseModalTextarea {
  constructor() {
    this.container = null;
    this.onOk = null;
    this.onCancel = null;

    this._loadCSS();
    this._createDOM();
    this._bindEvents();
  }

  _loadCSS() {
    if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
      window.coreEngine.loadCSS('core/engine/lib/base/modal/textarea.css');
    }
  }

  _createDOM() {
    const existing = document.querySelector('.core-engine-lib-base-modal-textarea');
    if (existing) {
      this.container = existing;
      this._cacheElements();
      return;
    }

    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-modal-textarea';
    container.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text">Текст</div>
          <div class="title-bar-controls">
            <span class="close-btn">✕</span>
          </div>
        </div>
        <div class="content">
          <div class="textarea-text"></div>
          <textarea class="textarea-field" rows="10" placeholder=""></textarea>
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
    this.textareaText = this.container.querySelector('.textarea-text');
    this.textareaField = this.container.querySelector('.textarea-field');
    this.okBtn = this.container.querySelector('.ok-btn');
    this.cancelBtn = this.container.querySelector('.cancel-btn');
    this.closeBtn = this.container.querySelector('.close-btn');
  }

  _bindEvents() {
    // ОК
    this.okBtn.addEventListener('click', () => {
      const value = this.textareaField.value;
      if (this.onOk) this.onOk(value);
      this.close();
    });

    // Отмена
    this.cancelBtn.addEventListener('click', () => {
      if (this.onCancel) this.onCancel(null);
      this.close();
    });

    // Крестик
    this.closeBtn.addEventListener('click', () => {
      if (this.onCancel) this.onCancel(null);
      this.close();
    });

    // Ctrl+Enter — применить
    this.textareaField.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const value = this.textareaField.value;
        if (this.onOk) this.onOk(value);
        this.close();
      }
    });

    // Клик по оверлею
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        if (this.onCancel) this.onCancel(null);
        this.close();
      }
    });

    // Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) {
        if (this.onCancel) this.onCancel(null);
        this.close();
      }
    });
  }

  open(text, title, placeholder, defaultValue) {
    this.textareaText.textContent = text || '';
    this.titleBarText.textContent = title || 'Текст';
    this.textareaField.placeholder = placeholder || '';
    this.textareaField.value = defaultValue || '';

    setTimeout(() => {
      this.textareaField.focus();
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