// app/core/base/base.js

class CoreNodeBase {
    constructor() {
        this.container = document.querySelector('.core-base');
        this.nav = new CoreBaseNav(this);
        this.footer = new CoreBaseFooter(this);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    this.coreBase = new CoreBase();
});
