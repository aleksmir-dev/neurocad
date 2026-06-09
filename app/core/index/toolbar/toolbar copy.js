// app/core/node/index/toolbar/toolbar.js

class CoreNodeIndexToolbar {
    constructor(indexInstance) {   
        this.index = indexInstance;
        this.container = document.querySelector('.core-node-index-toolbar');
        
        // Сохраняем ссылки на кнопки
        this.btnCreate = this.container.querySelector('.core-node-index-toolbar .createBtn');
        this.btnEdit = this.container.querySelector('.core-node-index-toolbar .editBtn');
        this.btnDelete = this.container.querySelector('.core-node-index-toolbar .deleteBtn');
        this.btnRestore = this.container.querySelector('.core-node-index-toolbar .restoreBtn');
        this.btnModules = this.container.querySelector('.core-node-index-toolbar .modulesBtn');
        this.btnPermissions = this.container.querySelector('.core-node-index-toolbar .permissionsBtn');

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
    
    // Обновление состояния кнопок при выделении карточки
    updateButtonsForSelectedCard(nodeType, isSuperAdmin) {
        // Кнопка "Права доступа" доступна только для модулей
        if (this.btnPermissions) {
            this.btnPermissions.disabled = !(nodeType === 'module');
        }
    }
}