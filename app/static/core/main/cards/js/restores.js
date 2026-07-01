// app/core/main/cards/js/restores.js

class CoreNodeIndexCardsJsRestores {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
    }
    
    async showDeletedNodes() {
        try {
            const section = this.cards.getCurrentSection();
            const response = await fetch('/core/main/cards/deleted', {
                headers: { 'X-Section': section }
            });
            const data = await response.json();
            
            if (!data.nodes || data.nodes.length === 0) {
                this.cards.showError('Нет удалённых элементов');
                return;
            }
            
            let message = 'Удалённые элементы:\n\n';
            data.nodes.forEach((node, index) => {
                message += `${index + 1}. ${node.name} (${node.node_type})\n`;
            });
            message += '\nВведите номер элемента для восстановления:';
            
            const input = prompt(message);
            if (input === null) return;
            
            const nodeIndex = parseInt(input) - 1;
            if (isNaN(nodeIndex) || nodeIndex < 0 || nodeIndex >= data.nodes.length) {
                this.cards.showError('Неверный номер');
                return;
            }
            
            const nodeToRestore = data.nodes[nodeIndex];
            await this.cards.restore.restoreNode(nodeToRestore.id, (nodeId) => {
                this.cards.refreshNodes();
            });
            
        } catch (error) {
            console.error('Error:', error);
            this.cards.showError('Ошибка загрузки списка удалённых');
        }
    }
}