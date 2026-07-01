// app/core/base/toolbar/toolbar.js

class CoreBaseToolbar {
    constructor(indexInstance) {   
        this.index = indexInstance;
        this.container = document.querySelector('.core-node-index-toolbar');
        this.btnCreate = this.container.querySelector('.btn-create');
        this.btnEdit = this.container.querySelector('.btn-edit');
        this.btnDelete = this.container.querySelector('.btn-delete');
        this.btnRestore = this.container.querySelector('.btn-restore');
        this.btnModules = this.container.querySelector('.btn-modules');
        this.btnPermissions = this.container.querySelector('.btn-permissions');    

        // Обработка нажатия "Модули"
        if (this.btnModules) {
            this.btnModules.addEventListener('click', () => {
                this.index.openModules();
            });      
        }

        // Выбор раздела     
        const sectionOptions = this.container.querySelectorAll('.section-option');
        sectionOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                const sectionId = e.currentTarget.dataset.sectionId;
                const urlParams = new URLSearchParams(window.location.search);
                urlParams.set('section', sectionId);
                window.location.search = urlParams.toString();
            });
        });                       
    }
    
    getCurrentSection() {
        const activeSection = this.container.querySelector('.section-option.active');
        return activeSection ? activeSection.dataset.sectionId : '2';
    }    
}