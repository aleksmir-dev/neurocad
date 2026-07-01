// app/core/main/cards/js/edit.js

class CoreMainCardsJsEdit {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        console.log(this.cards.index.toolbar.btnEdit);
        if (this.cards.index.toolbar.btnEdit) {
            this.cards.index.toolbar.btnEdit.addEventListener('click', () => {
                console.log('btnEdit Click');
                if (this.cards.selectedNodeId) {
                    const selectedCard = this.cards.container.querySelector('.card.selected');
                    const nodeType = selectedCard?.dataset.nodeType;
                    if (nodeType) {
                        this.cards.card.openEdit(nodeType, this.cards.selectedNodeId);
                    }
                }            
            });         
        }
    }

    async updateNodeCard(nodeId, name, description, section) {
        const card = this.cards.container.querySelector(`.card[data-node-id="${nodeId}"]`);
        if (!card) return false;
        
        // Обновляем заголовок
        const titleEl = card.querySelector('h2');
        if (titleEl) titleEl.textContent = name;
        
        // Обновляем описание
        const descEl = card.querySelector('p');
        if (descEl) {
            if (description) {
                descEl.textContent = description;
            } else {
                descEl.remove();
            }
        } else if (description) {
            const newDesc = document.createElement('p');
            newDesc.textContent = description;
            card.appendChild(newDesc);
        }
        
        return true;
    }

    async saveNode(nodeId, data) {
        const section = this.cards.index.toolbar.getCurrentSection();
        
        try {
            const response = await fetch(`/core/main/cards/node/${nodeId}?section=${section}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
                await this.updateNodeCard(nodeId, data.name, data.description, section);
                this.cards.index.showMessage('Сохранено');
                return true;
            } else {
                this.cards.card.showError(result.detail || 'Ошибка при сохранении');
                return false;
            }
        } catch (error) {
            console.error('Error:', error);
            this.cards.card.showError('Ошибка при сохранении');
            return false;
        }
    }

}