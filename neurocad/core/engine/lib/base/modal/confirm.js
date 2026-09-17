// app/core/engine/lib/base/modal/confirm.js

export class BaseModalConfirm {
  constructor() {
    this.container = null;
    this.onOk = null;
    this.onCancel = null;
    this.onNo = null;
    this.threeButtonsMode = false;

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
      window.coreEngine.loadCSS('core/engine/lib/base/modal/confirm.css');
    }
  }

  _createDOM() {
    const existing = document.querySelector('.core-engine-lib-base-modal-confirm');
    if (existing) {
      this.container = existing;
      this._cacheElements();
      return;
    }

    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-modal-confirm';
    container.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text">Подтверждение</div>
          <div class="title-bar-controls">
            <span class="close-btn">✕</span>
          </div>
        </div>
        <div class="content">
          <div class="confirm-body">
            <div class="confirm-text"></div>
          </div>
          <div class="actions-bar">
            <button class="core-engine-base-btn core-engine-base-btn-white cancel-btn">Отмена</button>
            <button class="core-engine-base-btn core-engine-base-btn-white no-btn">Нет</button>
            <button class="core-engine-base-btn core-engine-base-btn-white ok-btn">ОК</button>
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
    this.confirmText = this.container.querySelector('.confirm-text');
    this.okBtn = this.container.querySelector('.ok-btn');
    this.cancelBtn = this.container.querySelector('.cancel-btn');
    this.noBtn = this.container.querySelector('.no-btn');
    this.closeBtn = this.container.querySelector('.close-btn');
  }

  _bindEvents() {
    // === ОК ===
    this.okBtn.addEventListener('click', () => {
      if (this.onOk) {
        this.onOk(true);
      }
      this.close();
    });

    // === Отмена ===
    this.cancelBtn.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel(false);
      }
      this.close();
    });

    // === Нет ===
    this.noBtn.addEventListener('click', () => {
      if (this.onNo) {
        this.onNo();
      }
      this.close();
    });

    // === Закрытие ===
    this.closeBtn.addEventListener('click', () => {
      if (this.threeButtonsMode) {
        if (this.onNo) {
          this.onNo();
        }
      } else {
        if (this.onCancel) {
          this.onCancel(false);
        }
      }
      this.close();
    });

    // === Закрытие по клику на оверлей ===
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        if (this.threeButtonsMode) {
          if (this.onNo) {
            this.onNo();
          }
        } else {
          if (this.onCancel) {
            this.onCancel(false);
          }
        }
        this.close();
      }
    });

    // === Закрытие по Escape ===
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) {
        if (this.threeButtonsMode) {
          if (this.onNo) {
            this.onNo();
          }
        } else {
          if (this.onCancel) {
            this.onCancel(false);
          }
        }
        this.close();
      }
    });
  }

  // ========== Публичные методы ==========

  open(text, title, okButtonText, cancelButtonText, noButtonText) {
    this.confirmText.textContent = text || '';
    this.titleBarText.textContent = title || 'Подтверждение';
    this.okBtn.textContent = okButtonText || 'ОК';
    this.cancelBtn.textContent = cancelButtonText || 'Отмена';

    if (noButtonText) {
      this.threeButtonsMode = true;
      this.noBtn.textContent = noButtonText;
      this.noBtn.classList.add('active');
      this.noBtn.style.display = 'flex';
    } else {
      this.threeButtonsMode = false;
      this.noBtn.classList.remove('active');
      this.noBtn.style.display = 'none';
    }

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

  setOnNo(callback) {
    this.onNo = callback;
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