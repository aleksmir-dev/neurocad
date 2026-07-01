// app/core/main/cards/card/table/table.js

class CoreMainCardsCardTable {
    constructor(cardInstance) {
        this.card = cardInstance;
        this.container = document.querySelector('.core-main-cards-card-table');
        
        if (!this.container) return;
        
        const nameInput = this.container.querySelector('.table-name');
        if (nameInput) {
            nameInput.addEventListener('input', () => {
                this.clearFieldError(nameInput);
                this.card.clearError();
            });
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const createBtn = document.querySelector('.modal-btn-create');
                    if (createBtn) createBtn.click();
                }
            });
        }
    }
    
    getCurrentSection() {
        return this.card.cards.index.getCurrentSection();
    }
    
    getData() {
        const nameInput = this.container.querySelector('.table-name');
        const descInput = this.container.querySelector('.table-description');
        
        const name = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        
        return {
            name,
            description
        };
    }
    
    validate() {
        const nameInput = this.container.querySelector('.table-name');
        const name = nameInput ? nameInput.value.trim() : '';
        
        if (!name) {
            this.showFieldError(nameInput, 'Введите название таблицы');
            return false;
        }
        
        return true;
    }
    
    showFieldError(input, message) {
        if (!input) return;
        input.classList.add('field-error');
        
        let errorSpan = input.parentNode.querySelector('.field-error-message');
        if (!errorSpan) {
            errorSpan = document.createElement('span');
            errorSpan.className = 'field-error-message';
            errorSpan.style.cssText = 'color: #c33; font-size: 12px; margin-top: 4px; display: block;';
            input.parentNode.appendChild(errorSpan);
        }
        errorSpan.textContent = message;
    }
    
    clearFieldError(input) {
        if (!input) return;
        input.classList.remove('field-error');
        const errorSpan = input.parentNode.querySelector('.field-error-message');
        if (errorSpan) errorSpan.remove();
    }
    
    resetForm() {
        if (!this.container) return;
        
        const nameInput = this.container.querySelector('.table-name');
        const descInput = this.container.querySelector('.table-description');
        
        if (nameInput) {
            nameInput.value = '';
            this.clearFieldError(nameInput);
        }
        if (descInput) descInput.value = '';
        this.card.clearError();
    }
}
