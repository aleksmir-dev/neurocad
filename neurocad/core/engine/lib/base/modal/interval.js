// app/core/engine/lib/base/modal/interval.js

export class BaseModalInterval {
  constructor(years = null) {
    this.container = null;
    this.startDate = null;
    this.endDate = null;
    this.onOk = null;
    this.onCancel = null;

    this.years = years || [];
    this.minYear = this.years.length > 0 ? this.years[0] : 2000;
    this.maxYear = this.years.length > 0 ? this.years[this.years.length - 1] : 2030;

    this.minDate = new Date(this.minYear, 0, 1);
    this.maxDate = new Date(this.maxYear, 11, 31);
    this.minDate.setHours(0, 0, 0, 0);
    this.maxDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let defaultStart = today;
    let defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + 7);

    if (defaultStart < this.minDate) {
      defaultStart = new Date(this.minDate);
    } else if (defaultStart > this.maxDate) {
      defaultStart = new Date(this.maxDate);
    }

    if (defaultEnd < this.minDate) {
      defaultEnd = new Date(this.minDate);
    } else if (defaultEnd > this.maxDate) {
      defaultEnd = new Date(this.maxDate);
    }

    // Временные даты для левого и правого календарей
    this.tempStartDate = new Date(defaultStart);
    this.tempEndDate = new Date(defaultEnd);
    this.tempStartMonth = defaultStart.getMonth();
    this.tempStartYear = defaultStart.getFullYear();
    this.tempEndMonth = defaultEnd.getMonth();
    this.tempEndYear = defaultEnd.getFullYear();

    // Загружаем CSS при создании объекта
    this._loadCSS();

    this._createDOM();
    this._populateYearSelects();
    this._bindEvents();
    this._render();
  }

  /**
   * Загрузить CSS для модалки
   */
  _loadCSS() {
    if (window.coreEngine && typeof window.coreEngine.loadCSS === 'function') {
      window.coreEngine.loadCSS('core/engine/lib/base/modal/interval.css');
    }
  }

  _createDOM() {
    const existing = document.querySelector('.core-engine-lib-base-modal-interval');
    if (existing) {
      this.container = existing;
      this._cacheElements();
      return;
    }

    const container = document.createElement('div');
    container.className = 'core-engine-lib-base-modal-interval';
    container.innerHTML = `
      <div class="window">
        <div class="title-bar">
          <div class="title-bar-text">Выбор интервала</div>
          <div class="title-bar-controls">
            <span class="close-btn">✕</span>
          </div>
        </div>
        <div class="content">
          <div class="calendars-container">
            <div class="calendar-pane calendar-start">
              <div class="select-row">
                <select class="select-month start-month"></select>
                <select class="select-year start-year"></select>
              </div>
              <div class="calendar-grid start-grid"></div>
            </div>
            <div class="calendar-pane calendar-end">
              <div class="select-row">
                <select class="select-month end-month"></select>
                <select class="select-year end-year"></select>
              </div>
              <div class="calendar-grid end-grid"></div>
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
    this.startGrid = this.container.querySelector('.start-grid');
    this.endGrid = this.container.querySelector('.end-grid');
    this.startMonthSelect = this.container.querySelector('.start-month');
    this.startYearSelect = this.container.querySelector('.start-year');
    this.endMonthSelect = this.container.querySelector('.end-month');
    this.endYearSelect = this.container.querySelector('.end-year');
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

  _populateYearSelects() {
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

    [this.startYearSelect, this.endYearSelect].forEach(select => {
      select.innerHTML = '';
      this.years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
      });
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
    this._renderMonth(this.startGrid, this.tempStartMonth, this.tempStartYear, 'start');
    this._renderMonth(this.endGrid, this.tempEndMonth, this.tempEndYear, 'end');
    this._updateLabels();
    this._updateSelects();
  }

  _renderMonth(grid, month, year, type) {
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
      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}" data-type="${type}">${day}</div>`;
    }

    for (let i = 0; i < daysInMonth; i++) {
      const day = i + 1;
      const dateObj = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let classes = 'cell';
      const isInRange = this._isDateInRange(dateObj);
      const isStartSelected = this.tempStartDate && dateObj.getTime() === this.tempStartDate.getTime();
      const isEndSelected = this.tempEndDate && dateObj.getTime() === this.tempEndDate.getTime();
      const isSelected = isStartSelected || isEndSelected;

      if (!isInRange) classes += ' disabled';
      if (isSelected && isInRange) classes += ' selected';

      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}" data-type="${type}">${day}</div>`;
    }

    for (let i = 0; i < nextMonthDays; i++) {
      const day = i + 1;
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      const dateObj = new Date(y, m, day);
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isInRange = this._isDateInRange(dateObj);
      const classes = `cell blue-bg ${isInRange ? '' : 'disabled'}`;
      html += `<div class="${classes}" data-date="${dateStr}" data-disabled="${!isInRange}" data-type="${type}">${day}</div>`;
    }

    grid.innerHTML = html;

    Array.from(grid.children).forEach((cell) => {
      const isDisabled = cell.dataset.disabled === 'true';
      const cellType = cell.dataset.type;

      cell.addEventListener('click', () => {
        if (isDisabled) return;
        const dateStr = cell.dataset.date;
        if (!dateStr) return;
        const parts = dateStr.split('-').map(Number);
        const clickedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        clickedDate.setHours(0, 0, 0, 0);
        this._handleDayClick(clickedDate, cellType);
      });

      cell.addEventListener('dblclick', () => {
        if (isDisabled) return;
        const dateStr = cell.dataset.date;
        if (!dateStr) return;
        const parts = dateStr.split('-').map(Number);
        const clickedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        clickedDate.setHours(0, 0, 0, 0);
        if (!this._isDateInRange(clickedDate)) return;
        this.startDate = new Date(clickedDate);
        this.endDate = new Date(clickedDate);
        this.tempStartDate = new Date(clickedDate);
        this.tempEndDate = new Date(clickedDate);
        this.tempStartMonth = clickedDate.getMonth();
        this.tempStartYear = clickedDate.getFullYear();
        this.tempEndMonth = clickedDate.getMonth();
        this.tempEndYear = clickedDate.getFullYear();
        this._render();
        if (this.onOk) this.onOk({ start: clickedDate, end: clickedDate });
        this.close();
      });
    });
  }

  _updateLabels() {
    this.todayLabel.textContent = 'Сегодня';
    const month = String(this.tempStartDate.getMonth() + 1).padStart(2, '0');
    this.monthLabel.textContent = month;
    this.yearLabel.textContent = `${this.tempStartYear}`;
  }

  _updateSelects() {
    this.startMonthSelect.value = this.tempStartMonth;
    this.startYearSelect.value = this.tempStartYear;
    this.endMonthSelect.value = this.tempEndMonth;
    this.endYearSelect.value = this.tempEndYear;
  }

  _handleDayClick(clickedDate, type) {
    if (!this._isDateInRange(clickedDate)) return;

    if (type === 'start') {
      this.tempStartDate = new Date(clickedDate);
      this.tempStartMonth = clickedDate.getMonth();
      this.tempStartYear = clickedDate.getFullYear();
    } else {
      this.tempEndDate = new Date(clickedDate);
      this.tempEndMonth = clickedDate.getMonth();
      this.tempEndYear = clickedDate.getFullYear();
    }

    // Проверка: начальная дата не должна быть позже конечной
    if (this.tempStartDate > this.tempEndDate) {
      if (type === 'start') {
        this.tempEndDate = new Date(this.tempStartDate);
        this.tempEndMonth = this.tempEndDate.getMonth();
        this.tempEndYear = this.tempEndDate.getFullYear();
      } else {
        this.tempStartDate = new Date(this.tempEndDate);
        this.tempStartMonth = this.tempStartDate.getMonth();
        this.tempStartYear = this.tempStartDate.getFullYear();
      }
    }

    this._render();
  }

  _navigateMonth(direction) {
    let newMonth = this.tempStartMonth + direction;
    let newYear = this.tempStartYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newYear < this.minYear || newYear > this.maxYear) return;
    this.tempStartMonth = newMonth;
    this.tempStartYear = newYear;
    this.tempEndMonth = newMonth;
    this.tempEndYear = newYear;

    const day = this.tempStartDate.getDate();
    const maxDay = new Date(this.tempStartYear, this.tempStartMonth + 1, 0).getDate();
    const newDay = Math.min(day, maxDay);
    this.tempStartDate = new Date(this.tempStartYear, this.tempStartMonth, newDay);
    this.tempEndDate = new Date(this.tempStartDate);
    this._render();
  }

  _navigateYear(direction) {
    let newYear = this.tempStartYear + direction;
    if (newYear < this.minYear || newYear > this.maxYear) return;
    this.tempStartYear = newYear;
    this.tempEndYear = newYear;
    const day = this.tempStartDate.getDate();
    const month = this.tempStartDate.getMonth();
    const maxDay = new Date(this.tempStartYear, month + 1, 0).getDate();
    const newDay = Math.min(day, maxDay);
    this.tempStartDate = new Date(this.tempStartYear, month, newDay);
    this.tempEndDate = new Date(this.tempStartDate);
    this._render();
  }

  _selectToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!this._isDateInRange(today)) {
      this.tempStartDate = new Date(this.minDate);
      this.tempStartMonth = this.minDate.getMonth();
      this.tempStartYear = this.minDate.getFullYear();
      this.tempEndDate = new Date(this.minDate);
      this.tempEndMonth = this.minDate.getMonth();
      this.tempEndYear = this.minDate.getFullYear();
    } else {
      this.tempStartDate = new Date(today);
      this.tempStartMonth = today.getMonth();
      this.tempStartYear = today.getFullYear();
      this.tempEndDate = new Date(today);
      this.tempEndMonth = today.getMonth();
      this.tempEndYear = today.getFullYear();
    }
    this._render();
  }

  _selectMonth(month, year) {
    const date = new Date(year, month, 1);
    date.setHours(0, 0, 0, 0);
    this.tempStartDate = date;
    this.tempStartMonth = month;
    this.tempStartYear = year;
    this.tempEndDate = new Date(date);
    this.tempEndMonth = month;
    this.tempEndYear = year;
    this._render();
  }

  _selectYear(year) {
    const date = new Date(year, 0, 1);
    date.setHours(0, 0, 0, 0);
    this.tempStartDate = date;
    this.tempStartMonth = 0;
    this.tempStartYear = year;
    this.tempEndDate = new Date(date);
    this.tempEndMonth = 0;
    this.tempEndYear = year;
    this._render();
  }

  _bindEvents() {
    this.closeBtn.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel(null);
      }
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
      this._selectMonth(this.tempStartMonth, this.tempStartYear);
    });

    this.yearGroup.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav-btn')) return;
      this._selectYear(this.tempStartYear);
    });

    this.startMonthSelect.addEventListener('change', () => {
      const newMonth = parseInt(this.startMonthSelect.value);
      const newYear = parseInt(this.startYearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.startMonthSelect.value = this.tempStartMonth;
        this.startYearSelect.value = this.tempStartYear;
        return;
      }
      this.tempStartMonth = newMonth;
      this.tempStartYear = newYear;
      const day = this.tempStartDate.getDate();
      const maxDay = new Date(this.tempStartYear, this.tempStartMonth + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempStartDate = new Date(this.tempStartYear, this.tempStartMonth, newDay);
      this.tempEndDate = new Date(this.tempStartDate);
      this.tempEndMonth = newMonth;
      this.tempEndYear = newYear;
      this._render();
    });

    this.startYearSelect.addEventListener('change', () => {
      const newYear = parseInt(this.startYearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.startYearSelect.value = this.tempStartYear;
        return;
      }
      this.tempStartYear = newYear;
      this.tempEndYear = newYear;
      const day = this.tempStartDate.getDate();
      const month = this.tempStartDate.getMonth();
      const maxDay = new Date(this.tempStartYear, month + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempStartDate = new Date(this.tempStartYear, month, newDay);
      this.tempEndDate = new Date(this.tempStartDate);
      this._render();
    });

    this.endMonthSelect.addEventListener('change', () => {
      const newMonth = parseInt(this.endMonthSelect.value);
      const newYear = parseInt(this.endYearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.endMonthSelect.value = this.tempEndMonth;
        this.endYearSelect.value = this.tempEndYear;
        return;
      }
      this.tempEndMonth = newMonth;
      this.tempEndYear = newYear;
      const day = this.tempEndDate.getDate();
      const maxDay = new Date(this.tempEndYear, this.tempEndMonth + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempEndDate = new Date(this.tempEndYear, this.tempEndMonth, newDay);
      if (this.tempStartDate > this.tempEndDate) {
        this.tempStartDate = new Date(this.tempEndDate);
        this.tempStartMonth = this.tempEndMonth;
        this.tempStartYear = this.tempEndYear;
      }
      this._render();
    });

    this.endYearSelect.addEventListener('change', () => {
      const newYear = parseInt(this.endYearSelect.value);
      if (newYear < this.minYear || newYear > this.maxYear) {
        this.endYearSelect.value = this.tempEndYear;
        return;
      }
      this.tempEndYear = newYear;
      const day = this.tempEndDate.getDate();
      const month = this.tempEndDate.getMonth();
      const maxDay = new Date(this.tempEndYear, month + 1, 0).getDate();
      const newDay = Math.min(day, maxDay);
      this.tempEndDate = new Date(this.tempEndYear, month, newDay);
      if (this.tempStartDate > this.tempEndDate) {
        this.tempStartDate = new Date(this.tempEndDate);
        this.tempStartMonth = month;
        this.tempStartYear = newYear;
      }
      this._render();
    });

    this.cancelBtn.addEventListener('click', () => {
      if (this.onCancel) {
        this.onCancel(null);
      }
      this.close();
    });

    this.okBtn.addEventListener('click', () => {
      if (this.tempStartDate && this.tempEndDate &&
          this._isDateInRange(this.tempStartDate) && this._isDateInRange(this.tempEndDate)) {
        this.startDate = new Date(this.tempStartDate);
        this.endDate = new Date(this.tempEndDate);
        if (this.onOk) {
          this.onOk({
            start: this.startDate,
            end: this.endDate
          });
        }
      }
      this.close();
    });

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        if (this.onCancel) {
          this.onCancel(null);
        }
        this.close();
      }
    });

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

  open(initialStartDate, initialEndDate) {
    if (initialStartDate && this._isDateInRange(initialStartDate)) {
      this.tempStartDate = new Date(initialStartDate);
      this.tempStartMonth = initialStartDate.getMonth();
      this.tempStartYear = initialStartDate.getFullYear();
    }

    if (initialEndDate && this._isDateInRange(initialEndDate)) {
      this.tempEndDate = new Date(initialEndDate);
      this.tempEndMonth = initialEndDate.getMonth();
      this.tempEndYear = initialEndDate.getFullYear();
    }

    // Убеждаемся, что start <= end
    if (this.tempStartDate > this.tempEndDate) {
      this.tempEndDate = new Date(this.tempStartDate);
      this.tempEndMonth = this.tempStartDate.getMonth();
      this.tempEndYear = this.tempStartDate.getFullYear();
    }

    this._render();
    this.container.classList.add('active');
  }

  close() {
    this.container.classList.remove('active');
  }

  getInterval() {
    if (this.startDate && this.endDate) {
      return {
        start: new Date(this.startDate),
        end: new Date(this.endDate)
      };
    }
    return null;
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