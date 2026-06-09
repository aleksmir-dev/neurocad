// app/core/node/index/cards/cards.js

class CoreNodeIndexCards {
    constructor(indexInstance) {
        this.index = indexInstance;
        this.container = document.querySelector('.core-node-index-cards');        
        this.list = new CoreNodeIndexCardsJsList(this);        
        this.create = new CoreNodeIndexCardsJsCreate(this);        
        this.events = new CoreNodeIndexCardsJsEvents(this);
        this.delete = new CoreNodeIndexCardsJsDelete(this);
        this.edit = new CoreNodeIndexCardsJsEdit(this);
        this.restores = new CoreNodeIndexCardsJsRestores(this);
        this.restore = new CoreNodeIndexCardsJsRestore(this);
        this.card = new CoreNodeIndexCardsCard(this);
        this.currentParentId = null
        this.list.loadNodes();
    }

}