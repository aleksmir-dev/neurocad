// app/core/engine/lib/base/modal/date.js

export class BaseModalDate {
  constructor(years = null) {
    this.container = null;
    this.selectedDate = null;
    this.onOk = null;

    this.years = years || [];
    this.minYear = this.years.length > 0 ? this.years[0] : 2000;
    this.maxYear = this.years.length > 0 ? this.years[this.years.length - 1] : 2030;

    this.minDate = new Date(this.minYear, 0, 1);
    this.maxDate = new Date(this.maxYear, 11, 31);
    this.minDate.setHours(0, 0, 0, 0);
    this.maxDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let defaultDate = today;
    if (today < this.minDate) {
      defaultDate = new Date(this.minDate);
    } else if (today > this.maxDate) {
      defaultDate = new Date(this.maxDate);
    }

    this.tempDate = new Date(defaultDate);
    this.currentMonth = defaultDate.getMonth();
    this.currentYear = defaultDate.getFullYear();

    // Загружаем CSS при создании объекта
    this._loadCSS();

    this._createDOM();
    this._populateYearSelect();
    this._bindEvents();
    this._render();
  }

  /**
   * Загрузить CSS для модалки
   */
  _loadCSS() {
    if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
      window.coreEngine.loadCSS('core/engine/lib/base/modal/date.css');
    }
  }

  _createDOM() {
    const existing = document.querySelector('.core-engine-lib-base-modal-date');
    if (existing) {
      this.container = existing;
      this._cacheElements();
      return;
    }

    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-modal-date';
    container.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text">Выбор даты</div>
          <div class="title-bar-controls">
            <span class="close-btn">✕</span>
          </div>
        </div>
        <div class="content">
          <div class="calendar-container">
            <div class="calendar-pane">
              <div class="select-row">
                <select class="select-month"></select>
                <select class="select-year"></select>
              </div>
              <div class="calendar-grid"></div>
            </div>
          </div>
          <div class="nav-bar">
            <div class="nav-group today-group">
              <div class="nav-label today-label">Сегодня</div>
            </div>
            <div class="nav-group month-group">
              <button class="nav-btn" data-nav="month-prev">‹</button>
              <div class="nav-label month-label"></div>
              <button class="nav-btn" data-nav="month-next">›</button>
            </div>
            <div class="nav-group year-group">
              <button class="nav-btn" data-nav="year-prev">‹</button>
              <div class="nav-label year-label"></div>
              <button class="nav-btn" data-nav="year-next">›</button>
            </div>
          </div>
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
    this.grid = this.container.querySelector('.calendar-grid');
    this.monthSelect = this.container.querySelector('.select-month');
    this.yearSelect = this.container.querySelector('.select-year');
    this.todayLabel = this.container.querySelector('.today-label');
    this.monthLabel = this.container.querySelector('.month-label');
    this.yearLabel = this.container.querySelector('.year-label');
    this.todayGroup = this.container.querySelector('.today-group');
    this.monthGroup = this.container.querySelector('.month-group');
    this.yearGroup = this.container.querySelector('.year-group');
    this.cancelBtn = this.container.querySelector('.cancel-btn');
    this.okBtn = this.container.querySelector('.ok-btn');
    this.closeBtn = this.container.querySelector('.close-btn');
  }

  _populateYearSelect() {
    if (this.years.length === 0) {
      for (let i = 2000; i <= 2030; i++) {
        this.years.push(i);
      }
      this.minYear = 2000;
      this.maxYear = 2030;
      this.minDate = new Date(2000, 0, 1);
      this.maxDate = new Date(2030, 11, 31);
      this.minDate.setHours(0, 0, 0, 0);
      this.maxDate.setHours(0, 0, 0, 0);
    }

    this.yearSelect.innerHTML = '';
    this.years.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      this.yearSelect.appendChild(option);
    });
  }

  _getMonthName(month) {
    return ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][month];
  }

  _isDateInRange(date) {
    if (!date) return false;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d >= this.minDate && d <= this.maxDate;
  }

  _render() {
    this._renderMonth(this.grid, this.currentMonth, this.currentYear);
    this._updateLabels();
    this._updateSelects();
  }

  _renderMonth(grid, month, year) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const totalCells = 42;
    const nextMonthDays = totalCells - startOffset - daysInMonth;

    let html = '';

    for (let i = 0; i < startOffset; i++) {
      const day = prevMonthLastDay - startOffset + i + 1;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      const dateObj = new Date(y, m, day);
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isInRange = this._isDateInRange(dateObj);
      const classes = `cell blue-bg ${isInRange ? '' : 'disabled'}`;
      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}">${day}</div>`;
    }

    for (let i = 0; i < daysInMonth; i++) {
      const day = i + 1;
      const dateObj = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let classes = 'cell';
      const isInRange = this._isDateInRange(dateObj);
      const isSelected = this.tempDate && dateObj.getTime() === this.tempDate.getTime();

      if (!isInRange) classes += ' disabled';
      if (isSelected && isInRange) classes += ' selected';

      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}">${day}</div>`;
    }

    for (let i = 0; i < nextMonthDays; i++) {
      const day = i + 1;
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      const dateObj = new Date(y, m, day);
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isInRange = this._isDateInRange(dateObj);
      const classes = `cell blue-bg ${isInRange ? '' : 'disabled'}`;
      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}">${day}</div>`;
    }

    grid.innerHTML = html;

    Array.from(grid.children).forEach((cell) => {
      const isDisabled = cell.dataset.disabled === 'true';
      cell.addEventListener('click', () => {
        if (isDisabled) return;
        const dateStr = cell.dataset.date;
        if (!dateStr) return;
        const parts = dateStr.split('-').map(Number);
        const clickedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        clickedDate.setHours(0, 0, 0, 0);
        this._handleDayClick(clickedDate);
      });

      cell.addEventListener('dblclick', () => {
        if (isDisabled) return;
        const dateStr = cell.dataset.date;
        if (!dateStr) return;
        const parts = dateStr.split('-').map(Number);
        const clickedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        clickedDate.setHours(0, 0, 0, 0);
        if (!this._isDateInRange(clickedDate)) return;
        this.selectedDate = new Date(clickedDate);
        this.tempDate = new Date(clickedDate);
        this.currentMonth = this.tempDate.getMonth();
        this.currentYear = this.tempDate.getFullYear();
        this._render();
        if (this.onOk) this.onOk(clickedDate);
        this.close();
      });
    });
  }

  _updateLabels() {
    this.todayLabel.textContent = 'Сегодня';
    const month = String(this.tempDate.getMonth() + 1).padStart(2, '0');
    this.monthLabel.textContent = month;
    this.yearLabel.textContent = `${this.currentYear}`;
  }

  _updateSelects() {
    this.monthSelect.value = this.currentMonth;
    this.yearSelect.value = this.currentYear;
  }

  _handleDayClick(clickedDate) {
    if (!this._isDateInRange(clickedDate)) return;
    this.tempDate = new Date(clickedDate);
    this.currentMonth = this.tempDate.getMonth();
    this.currentYear = this.tempDate.getFullYear();
    this._render();
  }

  _navigateMonth(direction) {
    let newMonth = this.currentMonth + direction;
    let newYear = this.currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newYear < this.minYear || newYear > this.maxYear) return;
    this.currentMonth = newMonth;
    this.currentYear = newYear;
    const day = this.tempDate.getDate();
    const maxDay = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const newDay = Math.min(day, maxDay);
    this.tempDate = new Date(this.currentYear, this.currentMonth, newDay);
    this._render();
  }

  _navigateYear(direction) {
    let newYear = this.currentYear + direction;
    if (newYear < this.minYear || newYear > this.maxYear) return;
    this.currentYear = newYear;
    const day = this.tempDate.getDate();
    const month = this.tempDate.getMonth();
    const maxDay = new Date(this.currentYear, month + 1, 0).getDate();
    const newDay = Math.min(day, maxDay);
    this.tempDate = new Date(this.currentYear, month, newDay);
    this._render();
  }

  _selectToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!this._isDateInRange(today)) {
      this.tempDate = new Date(this.minDate);
      this.currentMonth = this.minDate.getMonth();
      this.currentYear = this.minDate.getFullYear();
    } else {
      this.tempDate = new Date(today);
      this.currentMonth = today.getMonth();
      this.currentYear = today.getFullYear();
    }
    this._render();
  }

  _selectMonth(month, year) {
    const date = new Date(year, month, 1);
    date.setHours(0, 0, 0, 0);
    this.tempDate = date;
    this.currentMonth = month;
    this.currentYear = year;
    this._render();
  }

  _selectYear(year) {
    const date = new Date(year, 0, 1);
    date.setHours(0, 0, 0, 0);
    this.tempDate = date;
    this.currentMonth = 0;
    this.currentYear = year;
    this._render();
  }

  _bindEvents() {
    this.closeBtn.addEventListener('click', () => {
      if (this.selectedDate) {
        this.tempDate = new Date(this.selectedDate);
        this.currentMonth = this.tempDate.getMonth();
        this.currentYear = this.tempDate.getFullYear();
      } else {
        const defaultDate = this._isDateInRange(new Date()) ? new Date() : new Date(this.minDate);
        defaultDate.setHours(0, 0, 0, 0);
        this.tempDate = new Date(defaultDate);
        this.currentMonth = this.tempDate.getMonth();
        this.currentYear = this.tempDate.getFullYear();
      }
      this._render();
      this.close();
    });

    this.container.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.nav;
        if (action === 'month-prev') this._navigateMonth(-1);
        else if (action === 'month-next') this._navigateMonth(1);
        else if (action === 'year-prev') this._navigateYear(-1);
        else if (action === 'year-next') this._navigateYear(1);
      });
    });

    this.todayGroup.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav-btn')) return;
      this._selectToday();
    });

    this.monthGroup.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav-btn')) return;
      this._selectMonth(this.currentMonth, this.currentYear);
    });

    this.yearGroup.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav-btn')) return;
      this._selectYear(this.currentYear);
    });

    this.monthSelect.addEventListener('change', () => {
      const newMonth = parseInt(this.monthSelect.value);
      const newYear = parseInt(this.yearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.monthSelect.value = this.currentMonth;
        this.yearSelect.value = this.currentYear;
        return;
      }
      this.currentMonth = newMonth;
      this.currentYear = newYear;
      const day = this.tempDate.getDate();
      const maxDay = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempDate = new Date(this.currentYear, this.currentMonth, newDay);
      this._render();
    });

    this.yearSelect.addEventListener('change', () => {
      const newYear = parseInt(this.yearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.yearSelect.value = this.currentYear;
        return;
      }
      this.currentYear = newYear;
      const day = this.tempDate.getDate();
      const month = this.tempDate.getMonth();
      const maxDay = new Date(this.currentYear, month + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempDate = new Date(this.currentYear, month, newDay);
      this._render();
    });

    this.cancelBtn.addEventListener('click', () => {
      if (this.selectedDate) {
        this.tempDate = new Date(this.selectedDate);
        this.currentMonth = this.tempDate.getMonth();
        this.currentYear = this.tempDate.getFullYear();
      } else {
        const defaultDate = this._isDateInRange(new Date()) ? new Date() : new Date(this.minDate);
        defaultDate.setHours(0, 0, 0, 0);
        this.tempDate = new Date(defaultDate);
        this.currentMonth = this.tempDate.getMonth();
        this.currentYear = this.tempDate.getFullYear();
      }
      this._render();
      this.close();
    });

    this.okBtn.addEventListener('click', () => {
      if (this.tempDate && this._isDateInRange(this.tempDate)) {
        this.selectedDate = new Date(this.tempDate);
        if (this.onOk) this.onOk(this.selectedDate);
      }
      this.close();
    });

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.container.classList.contains('active')) this.close();
    });
  }

  open() {
    this.container.classList.add('active');
    if (this.selectedDate && this._isDateInRange(this.selectedDate)) {
      this.tempDate = new Date(this.selectedDate);
      this.currentMonth = this.tempDate.getMonth();
      this.currentYear = this.tempDate.getFullYear();
    } else {
      const defaultDate = this._isDateInRange(new Date()) ? new Date() : new Date(this.minDate);
      defaultDate.setHours(0, 0, 0, 0);
      this.tempDate = new Date(defaultDate);
      this.currentMonth = this.tempDate.getMonth();
      this.currentYear = this.tempDate.getFullYear();
    }
    this._render();
  }

  close() {
    this.container.classList.remove('active');
  }

  getDate() {
    return this.selectedDate ? new Date(this.selectedDate) : null;
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