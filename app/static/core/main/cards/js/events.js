// app/core/main/cards/js/events.js

class CoreMainCardsJsEvents {
    constructor(cardsInstance) {
        this.cards = cardsInstance;
        this.init();
    }
    
    init() {
        
        // Снятие выделения при клике на пустое место
        this.cards.container.addEventListener('click', (e) => {
            if (e.target === this.cards.container) {
                this.cards.events.clearSelection();
            }
        });
        
        // Обработка клика на карточках
        this.cards.container.addEventListener('click', (e) => {
            const card = e.target.closest('.card');
            if (!card) return;
            
            const nodeType = card.dataset.nodeType;
            const nodeId = parseInt(card.dataset.nodeId);
            
            if (nodeType === 'folder') {
                // Проваливаемся в папку
                this.openFolder(nodeId);
            } else if (nodeType === 'module') {
                // Переход по URL из конфига модуля
                this.openModule(card);
            } else {
                // Для других типов (table и т.д.) - просто выделяем
                this.selectCard(card, nodeId);
            }
        });
        
        // Обработка кнопки "Права доступа" в тулбаре (если кнопка существует)
        if (this.cards.index.toolbar.btnPermissions) {
            this.cards.index.toolbar.btnPermissions.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openPermissions();
            });
        }
    }
    
    openModule(card) {
        const moduleId = card.dataset.moduleId;
        console.log('card:', card);
        console.log('moduleId:', moduleId);
        console.log('dataset:', card.dataset);
        
        if (moduleId) {
            fetch(`/core/main/modules/module/${moduleId}`)
                .then(response => {
                    console.log('Response status:', response.status);
                    return response.json();
                })
                .then(data => {
                    console.log('Module data:', data);
                    if (data.module && data.module.url) {
                        window.location.href = data.module.url;
                    } else {
                        console.error('No url in module:', data);
                        this.cards.showError('Ошибка: не указан URL модуля');
                    }
                })
                .catch(error => {
                    console.error('Fetch error:', error);
                    this.cards.showError('Ошибка загрузки модуля: ' + error.message);
                });
        } else {
            console.error('No moduleId found on card:', card);
            console.log('Card classes:', card.className);
            console.log('Card dataset:', card.dataset);
            this.cards.showError('Ошибка: идентификатор модуля не найден');
        }
    }
    
    openFolder(nodeId) {
        // Переход внутрь папки
        this.cards.list.loadNodes(nodeId);
    }
    
    selectCard(card, nodeId) {
        this.cards.container.querySelectorAll('.card').forEach(c => {
            c.classList.remove('selected');
        });
        card.classList.add('selected');
        this.cards.selectedNodeId = nodeId;
        
        if (this.cards.index.toolbar.btnEdit) this.cards.index.toolbar.btnEdit.disabled = false;
        if (this.cards.index.toolbar.btnDelete) this.cards.index.toolbar.btnDelete.disabled = false;
        
        // Активируем кнопку "Права доступа" только для модулей (если кнопка существует)
        if (this.cards.index.toolbar.btnPermissions) {
            const nodeType = card.dataset.nodeType;
            this.cards.index.toolbar.btnPermissions.disabled = (nodeType !== 'module');
        }
    }
    
    clearSelection() {
        this.cards.selectedNodeId = null;
        this.cards.container.querySelectorAll('.card').forEach(c => {
            c.classList.remove('selected');
        });
        if (this.cards.index.toolbar.btnEdit) this.cards.index.toolbar.btnEdit.disabled = true;
        if (this.cards.index.toolbar.btnDelete) this.cards.index.toolbar.btnDelete.disabled = true;
        
        // Деактивируем кнопку "Права доступа" (если кнопка существует)
        if (this.cards.index.toolbar.btnPermissions) {
            this.cards.index.toolbar.btnPermissions.disabled = true;
        }
    }
    
    async openPermissions() {
        if (!this.cards.selectedNodeId) return;
        
        // Получаем информацию о выбранном узле
        const selectedCard = document.querySelector('.core-node-index-cards .card.selected');
        if (!selectedCard) return;
        
        const nodeName = selectedCard.querySelector('.card-header h2')?.textContent || 'Узел';
        const nodeType = selectedCard.dataset.nodeType;
        const moduleKey = selectedCard.dataset.moduleKey;
        
        if (nodeType !== 'module') {
            this.cards.showError('Права доступа можно настроить только для модулей');
            return;
        }
        
        // Импортируем класс модального окна
        const { CoreNodeIndexPermissions } = await import('/static/app/core/main/permissions/permissions.js');
        
        // Создаём и показываем модальное окно
        const permissionsModal = new CoreNodeIndexPermissions({
            nodeName: nodeName,
            nodeType: nodeType,
            moduleKey: moduleKey,
            onApply: async (result) => {
                console.log('Права сохранены:', result);
                this.cards.showMessage('Права доступа сохранены');
            }
        });
    }
}
