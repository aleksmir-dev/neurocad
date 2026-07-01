// app/core/main/cards/card/module/module.js

class CoreMainCardsCardModule {
    constructor(cardInstance) {
        this.card = cardInstance;
        this.container = document.querySelector('.core-main-cards-card-module');
        this.selectedModule = null;
        
        if (!this.container) return;
        
        const moduleItems = this.container.querySelectorAll('.module-item');
        
        moduleItems.forEach(item => {
            const radio = item.querySelector('input[type="radio"]');
            
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    if (radio) radio.checked = true;
                    this.updateSelection(item);
                }
            });
            
            if (radio) {
                radio.addEventListener('change', () => {
                    if (radio.checked) {
                        this.updateSelection(item);
                    }
                });
            }
        });
        
        this.container.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.selectedModule) {
                e.preventDefault();
                const createBtn = document.querySelector('.modal-btn-create');
                if (createBtn) createBtn.click();
            }
        });
    }
    
    getCurrentSection() {
        return this.card.cards.index.getCurrentSection();
    }
    
    updateSelection(selectedItem) {
        if (!this.container) return;
        
        this.container.querySelectorAll('.module-item').forEach(item => {
            item.classList.remove('selected');
        });
        selectedItem.classList.add('selected');
        this.selectedModule = {
            id: parseInt(selectedItem.dataset.moduleId),
            name: selectedItem.dataset.moduleName,
            key: selectedItem.dataset.moduleKey,
            config: selectedItem.dataset.moduleConfig ? JSON.parse(selectedItem.dataset.moduleConfig) : null
        };
        this.card.clearError();
    }
    
    getData() {
        if (!this.selectedModule) {
            return null;
        }
        
        return {
            name: this.selectedModule.name,
            module_id: this.selectedModule.id,
            module_key: this.selectedModule.key,
            module_name: this.selectedModule.name,
            module_config: this.selectedModule.config ? JSON.stringify(this.selectedModule.config) : null,
            description: 'Выгрузка актов из отчетов по выпуску за день'
        };
    }
    
    validate() {
        if (!this.selectedModule) {
            this.card.showError('Выберите модуль');
            return false;
        }
        return true;
    }
    
    resetForm() {
        if (!this.container) return;
        
        const radios = this.container.querySelectorAll('input[name="module"]');
        radios.forEach(radio => radio.checked = false);
        
        this.container.querySelectorAll('.module-item').forEach(item => {
            item.classList.remove('selected');
        });
        this.selectedModule = null;
        this.card.clearError();
    }
}
