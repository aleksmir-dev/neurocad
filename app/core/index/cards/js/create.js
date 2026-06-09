// app/core/node/index/cards/js/create.js

class CoreNodeIndexCardsJsCreate {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        if (this.cards.index.toolbar.btnCreate) {
            this.cards.index.toolbar.btnCreate.addEventListener('click', () => {
                this.cards.card.openCreate();
            });        
        }
    }

    async saveNode(data) {
        const section = this.cards.index.toolbar.getCurrentSection();
        const parentId = this.cards.currentParentId;
        const type = this.cards.card.currentType;
        
        try {
            const response = await fetch(`/core/node/index/cards/node?section=${section}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: type,
                    name: data.name,
                    description: data.description,
                    parent_id: parentId,
                    module_id: data.module_id,
                    is_shared: data.is_shared
                })
            });
            const result = await response.json();
            
            if (result.success && result.node) {
                await this.cards.list.addNodeCard(result.node, section);
                this.cards.showMessage('Создано');
                return true;
            } else {
                this.cards.card.showError(result.detail || 'Ошибка при создании');
                return false;
            }
        } catch (error) {
            console.error('Error:', error);
            this.cards.card.showError('Ошибка при сохранении');
            return false;
        }
    }

}