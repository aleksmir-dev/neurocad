// app/core/main/cards/cards.js

class CoreMainCards {
    constructor(indexInstance) {
        this.index = indexInstance;
        this.container = document.querySelector('.core-node-index-cards');        
        this.list = new CoreMainCardsJsList(this);        
        this.create = new CoreMainCardsJsCreate(this);        
        this.events = new CoreMainCardsJsEvents(this);
        this.delete = new CoreMainCardsJsDelete(this);
        this.edit = new CoreMainCardsJsEdit(this);
        this.restores = new CoreMainCardsJsRestores(this);
        this.restore = new CoreMainCardsJsRestore(this);
        this.card = new CoreMainCardsCard(this);
        this.currentParentId = null
        this.list.loadNodes();
    }
}