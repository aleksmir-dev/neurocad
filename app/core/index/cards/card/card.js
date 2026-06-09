// app/core/node/index/cards/card/card.js

class CoreNodeIndexCardsCard {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        this.container = document.querySelector('.core-node-index-card');
        this.cancelBtn = this.container.querySelector('.modal-btn-cancel');
        this.saveBtn = this.container.querySelector('.modal-btn-save');
        this.tabs = this.container.querySelectorAll('.modal-tab');        
        this.folder = new CoreNodeIndexCardsCardFolder(this);
        this.table = new CoreNodeIndexCardsCardTable(this);
        this.module = new CoreNodeIndexCardsCardModule(this);
        this.currentType = null;
        this.currentNodeId = null;
        this.selectedNodeId = null;
        this.init();        
    }

    init() {
        this.cancelBtn.addEventListener('click', () => {
            this.container.classList.remove('active');
            this.resetForms();
            this.currentNodeId = null;
            this.currentType = null;
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.container.classList.contains('active')) {
                this.container.classList.remove('active');
                this.resetForms();
                this.currentNodeId = null;
                this.currentType = null;
            }
        });
        
        this.saveBtn.addEventListener('click', async () => {
            await this.save();
        });
        
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                this.tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const contents = this.container.querySelectorAll('.tab-content');
                contents.forEach(content => content.classList.remove('active'));
                const activeContent = this.container.querySelector(`.tab-${tabId}`);
                if (activeContent) activeContent.classList.add('active');
                this.currentType = tabId;
            });
        });
    }    

    openCreate(type = 'folder') {
        this.currentType = type;
        this.currentNodeId = null;
        this.resetForms();        
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === type) {
                tab.click();
            }
        });
        this.container.classList.add('active');
    }

    openEdit(type, nodeId) {
       
        this.currentType = type;
        this.currentNodeId = nodeId;
        
        const tabs = this.container.querySelectorAll('.modal-tab');
        tabs.forEach(tab => {
            if (tab.dataset.tab === type) {
                tab.click();
            }
        });
        
        this.loadNodeData(nodeId);
        
        this.container.classList.add('active');
    }       

    async loadNodeData(nodeId) {
        try {
            const section = this.cards.index.toolbar.getCurrentSection();
            const response = await fetch(`/core/node/index/cards/node/${nodeId}?section=${section}`);
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

    resetForms() {
        this.folder.resetForm();
        this.table.resetForm();
        this.module.resetForm();
    }    

    clearError() {
        const errorDiv = this.container.querySelector('.modal-error');
        if (errorDiv) errorDiv.style.display = 'none';
    }
    
    showError(message) {
        let errorDiv = this.container.querySelector('.modal-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'modal-error';
            errorDiv.style.cssText = 'background:#fee;border:1px solid #fcc;color:#c33;padding:10px;margin-bottom:15px;border-radius:8px;';
            const modalBody = this.container.querySelector('.modal-content');
            modalBody?.insertBefore(errorDiv, modalBody.firstChild);
        }
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 3000);
    }    

    getActiveForm() {
        if (this.currentType === 'folder') return this.folder;
        if (this.currentType === 'table') return this.table;
        if (this.currentType === 'module') return this.module;
        return null;
    }    

    hide() {
        this.container.classList.remove('active');
        this.resetForms();
        this.currentNodeId = null;
        this.currentType = null;
    }    

    async save() {
        const activeForm = this.getActiveForm();
        if (!activeForm.validate()) return;
        
        const data = activeForm.getData();
        const isEdit = this.currentNodeId !== null;
        
        let success = false;
        if (isEdit) {
            success = await this.cards.edit.saveNode(this.currentNodeId, data);
        } else {
            success = await this.cards.create.saveNode(data);
        }
        
        if (success) {
            this.hide();
        }
    }

}