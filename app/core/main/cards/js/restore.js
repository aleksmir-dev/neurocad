// app/core/main/cards/js/restore.js

class CoreMainCardsJsRestore {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
    }
    
    async restoreNode(nodeId, onSuccess) {
        try {
            const section = this.cards.getCurrentSection();
            const response = await fetch(`/core/main/cards/node/${nodeId}/restore`, {
                method: 'POST',
                headers: { 'X-Section': section }
            });
            const result = await response.json();
            
            if (result.success) {
                if (onSuccess) onSuccess(nodeId);
                this.cards.showMessage('Элемент восстановлен');
            } else {
                this.cards.showError('Ошибка при восстановлении');
            }
        } catch (error) {
            console.error('Error:', error);
            this.cards.showError('Ошибка при восстановлении');
        }
    }
}
