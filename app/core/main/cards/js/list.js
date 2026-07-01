// app/core/main/cards/js/list.js

class CoreMainCardsJsList {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
    }

    async addNodeCard(node, section) {
        // Создаём карточку из данных node, без запроса к серверу
        const card = document.createElement('div');
        card.className = `card ${node.node_type}`;
        card.setAttribute('data-node-id', node.id);
        card.setAttribute('data-node-type', node.node_type);
        
        if (node.module_id) {
            card.setAttribute('data-module-id', node.module_id);
        }
        
        if (node.node_type === 'module' && node.url) {
            card.setAttribute('data-module-url', node.url);
        }

        card.innerHTML = `
            <div class="card-header">
                <h2>${this.escapeHtml(node.name)}</h2>
            </div>
            ${node.description ? `<p>${this.escapeHtml(node.description)}</p>` : ''}
        `;

        if (node.node_type === 'folder') {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.cards.list.loadNodes(node.id);
            });
        }
        
        if (node.node_type === 'module' && node.url) {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.href = node.url;
            });
        }

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (card.classList.contains('selected')) {
                this.cards.events.clearSelection();
            } else {
                this.cards.events.selectCard(card, node.id);
            }
        });

        this.cards.container.appendChild(card);
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
            this.cards.list.loadNodes(parentIdToLoad);
        });
        
        this.cards.container.appendChild(upCard);
    }
    
    async loadNodes(parentId = null) {
        this.cards.currentParentId = parentId;       
        this.cards.container.innerHTML = '';
        const section = this.cards.index.toolbar.getCurrentSection();
        const params = new URLSearchParams();
        if (parentId) params.append('parent_id', parentId);
        params.append('section', section);
        const url = `/core/main/cards/nodes?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        this.cards.container.innerHTML = '';
        if (parentId) {
            this.addUpCard(data);
        }
        if (!data || data.length === 0) {
            this.cards.events.clearSelection();
            return;
        }
        for (const node of data) {
            await this.addNodeCard(node, section);
        }
    }

    refreshNodes() {
        this.cards.list.loadNodes(this.cards.currentParentId);
    }    

}