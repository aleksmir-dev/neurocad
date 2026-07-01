// app/core/main/cards/js/delete.js

class CoreMainCardsJsDelete {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        if (this.cards.index.toolbar.btnDelete) {
            this.cards.index.toolbar.btnDelete.addEventListener('click', () => {
                this.deleteNode();
            });         
        }
    }
    
    async deleteNode() {
        if (!this.cards.selectedNodeId) {
            this.cards.showError('Выберите элемент (правой кнопкой мыши)');
            return;
        }
        
        if (!confirm('Удалить выбранный элемент?')) return;
        
        try {
            const section = this.cards.index.toolbar.getCurrentSection();
            const response = await fetch(`/core/main/cards/node/${this.cards.selectedNodeId}?section=${section}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                this.cards.list.refreshNodes();
            } else {
                this.cards.showError('Ошибка при удалении');
            }
        } catch (error) {
            console.error('Error:', error);
            this.cards.showError('Ошибка при удалении');
        }
    }
}
