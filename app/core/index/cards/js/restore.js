// app/core/node/index/cards/js/restore.js

class CoreNodeIndexCardsJsRestore {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
    }
    
    async restoreNode(nodeId, onSuccess) {
        try {
            const section = this.cards.getCurrentSection();
            const response = await fetch(`/core/node/index/cards/node/${nodeId}/restore`, {
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