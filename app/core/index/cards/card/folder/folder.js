// app/core/node/index/cards/card/folder/folder.js

class CoreNodeIndexCardsCardFolder {
    constructor(cardInstance) {
        this.card = cardInstance;
        this.container = document.querySelector('.core-node-index-cards-card-folder');        
        const nameInput = this.container.querySelector('.folder-name');
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
        const nameInput = this.container.querySelector('.folder-name');
        const descInput = this.container.querySelector('.folder-description');
        const sharedCheckbox = this.container.querySelector('.folder-is-shared');
        
        const name = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const isShared = sharedCheckbox ? sharedCheckbox.checked : false;  
        
        return {
            name,
            description,
            is_shared: isShared
        };
    }
    
    validate() {
        const nameInput = this.container.querySelector('.folder-name');
        const name = nameInput ? nameInput.value.trim() : '';
        
        if (!name) {
            this.showFieldError(nameInput, 'Введите название папки');
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
        
        const nameInput = this.container.querySelector('.folder-name');
        const descInput = this.container.querySelector('.folder-description');
        const sharedCheckbox = this.container.querySelector('.folder-is-shared');
        
        if (nameInput) {
            nameInput.value = '';
            this.clearFieldError(nameInput);
        }
        if (descInput) descInput.value = '';
        if (sharedCheckbox) sharedCheckbox.checked = false;
        this.card.clearError();
    }
}