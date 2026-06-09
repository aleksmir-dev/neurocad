// app/core/node/index/cards/card/card.js

class CoreNodeIndexCardsCard {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        this.folder = new CoreNodeIndexCardsCardFolder(this);
        this.table = new CoreNodeIndexCardsCardTable(this);
        this.module = new CoreNodeIndexCardsCardModule(this);
        this.currentType = null;      // 'folder', 'table', 'module'
        this.currentNodeId = null;    // для редактирования
        this.init();
    }
        
    async loadNodeData(nodeId) {
        try {
            const section = this.cards.getCurrentSection();
            const response = await fetch(`/core/node/index/cards/node/${nodeId}`, {
                headers: { 'X-Section': section }
            });
            const node = await response.json();
            
            if (this.currentType === 'folder') {
                const nameInput = document.querySelector('.core-node-index-cards-card-folder .folder-name');
                const descInput = document.querySelector('.core-node-index-cards-card-folder .folder-description');
                const sharedCheckbox = document.querySelector('.core-node-index-cards-card-folder .folder-is-shared');
                
                if (nameInput) nameInput.value = node.name;
                if (descInput) descInput.value = node.description || '';
                
                if (sharedCheckbox && node.is_shared !== undefined) {
                    sharedCheckbox.checked = node.is_shared;
                }
            } else if (this.currentType === 'table') {
                const nameInput = document.querySelector('.core-node-index-cards-card-table .table-name');
                const descInput = document.querySelector('.core-node-index-cards-card-table .table-description');
                if (nameInput) nameInput.value = node.name;
                if (descInput) descInput.value = node.description || '';
            }
        } catch (error) {
            console.error('Error loading node:', error);
            this.showError('Ошибка загрузки данных');
        }
    }
        
}