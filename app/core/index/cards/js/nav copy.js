// app/core/node/index/cards/js/nav.js

class CoreNodeIndexCardsJsNav {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
    }
    
   
    addUpCard(data) {
        const upCard = document.createElement('div');
        upCard.className = 'card up-card';
        upCard.innerHTML = `
            <div class="card-content-center">
                <div class="up-arrow">..</div>
            </div>
        `;
        
        upCard.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentIdToLoad = data.parent_info?.id || null;
            this.cards.loadNodes(parentIdToLoad);
        });
        
        this.cards.container.appendChild(upCard);
    }
    
    refreshNodes() {
        this.cards.loadNodes(this.cards.currentParentId);
    }
}