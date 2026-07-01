// app/core/main/permissions/permissions.js

class CoreMainPermissions {
    constructor(options = {}) {
        this.nodeName = options.nodeName || null;
        this.nodeType = options.nodeType || null;
        this.moduleKey = options.moduleKey || null;
        this.onApply = options.onApply || null;
        
        this.users = [];           // список пользователей с правами
        this.originalPermissions = new Map(); // для отслеживания изменений
        
        this.modal = null;
        
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
        this.loadPermissions();
    }
    
    render() {
        this.modal = document.querySelector('.core-main-permissions');
        if (!this.modal) {
            fetch('/static/app/core/main/permissions/permissions.html')
                .then(response => response.text())
                .then(html => {
                    document.body.insertAdjacentHTML('beforeend', html);
                    this.afterRender();
                })
                .catch(() => {
                    console.error('Не удалось загрузить шаблон прав доступа');
                });
        } else {
            this.afterRender();
        }
    }
    
    afterRender() {
        this.modal = document.querySelector('.core-node-index-permissions');
        
        // Заполняем информацию об узле
        const nodeNameSpan = this.modal.querySelector('[data-field="nodeName"]');
        const nodeTypeSpan = this.modal.querySelector('[data-field="nodeType"]');
        if (nodeNameSpan) nodeNameSpan.textContent = this.nodeName || '—';
        if (nodeTypeSpan) nodeTypeSpan.textContent = this.getNodeTypeText() || '—';
        
        this.show();
    }
    
    bindEvents() {
        // Закрытие по кнопке
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // Отмена
        const cancelBtn = this.modal.querySelector('[data-action="cancel"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hide());
        }
        
        // Применить
        const applyBtn = this.modal.querySelector('[data-action="apply"]');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.apply());
        }
        
        // Закрытие по клику на оверлей
        const overlay = this.modal.querySelector('.overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.hide());
        }
        
        // Поиск
        const searchInput = this.modal.querySelector('[data-field="userSearch"]');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterUsers());
        }
        
        // ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && this.modal.style.display !== 'none') {
                this.hide();
            }
        });
    }
    
    async loadPermissions() {
        const usersList = this.modal.querySelector('[data-field="usersList"]');
        if (!usersList) return;
        
        usersList.innerHTML = '<div class="loading">Загрузка...</div>';
        
        try {
            // Загружаем права для модуля
            const response = await fetch(`/core/main/permissions/module/${this.moduleKey}`);
            const data = await response.json();
            
            this.users = data.users || [];
            this.renderUsersList(this.users);
            
            // Сохраняем оригинальные права для отслеживания изменений
            this.users.forEach(user => {
                this.originalPermissions.set(user.user_id, {
                    can_read: user.can_read,
                    can_write: user.can_write
                });
            });
            
        } catch (error) {
            console.error('Ошибка загрузки прав:', error);
            usersList.innerHTML = '<div class="loading">Ошибка загрузки</div>';
        }
    }
    
    renderUsersList(users) {
        const usersList = this.modal.querySelector('[data-field="usersList"]');
        if (!usersList) return;
        
        if (users.length === 0) {
            usersList.innerHTML = '<div class="loading">Пользователи не найдены</div>';
            return;
        }
        
        usersList.innerHTML = '';
        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'item';
            item.dataset.userId = user.user_id;
            item.innerHTML = `
                <span class="item-name">${this.escapeHtml(user.user_name)}</span>
                <div class="item-read">
                    <input type="checkbox" class="item-read-checkbox" data-field="can_read" ${user.can_read ? 'checked' : ''}>
                </div>
                <div class="item-write">
                    <input type="checkbox" class="item-write-checkbox" data-field="can_write" ${user.can_write ? 'checked' : ''}>
                </div>
            `;
            usersList.appendChild(item);
        });
    }
    
    filterUsers() {
        const searchInput = this.modal.querySelector('[data-field="userSearch"]');
        if (!searchInput) return;
        
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = this.users.filter(user => 
            user.user_name.toLowerCase().includes(searchTerm)
        );
        this.renderUsersList(filtered);
    }
    
    getPermissionsData() {
        const items = this.modal.querySelectorAll('.item');
        const permissions = [];
        
        items.forEach(item => {
            const userId = parseInt(item.dataset.userId);
            const canRead = item.querySelector('[data-field="can_read"]').checked;
            const canWrite = item.querySelector('[data-field="can_write"]').checked;
            
            permissions.push({
                user_id: userId,
                can_read: canRead,
                can_write: canWrite
            });
        });
        
        return permissions;
    }
    
    hasChanges() {
        const currentPermissions = this.getPermissionsData();
        
        for (const perm of currentPermissions) {
            const original = this.originalPermissions.get(perm.user_id);
            if (!original) return true;
            if (original.can_read !== perm.can_read) return true;
            if (original.can_write !== perm.can_write) return true;
        }
        
        return false;
    }
    
    async apply() {
        if (!this.hasChanges()) {
            this.hide();
            return;
        }
        
        const permissions = this.getPermissionsData();
        const data = {
            permissions: permissions
        };
        
        const applyBtn = this.modal.querySelector('[data-action="apply"]');
        const originalText = applyBtn.textContent;
        applyBtn.textContent = 'Сохранение...';
        applyBtn.disabled = true;
        
        try {
            const response = await fetch(`/core/main/permissions/module/${this.moduleKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                if (this.onApply) {
                    this.onApply(result);
                }
                this.hide();
            } else {
                console.error('Ошибка сохранения:', result);
                alert('Ошибка сохранения: ' + (result.detail || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка сохранения прав доступа');
        } finally {
            applyBtn.textContent = originalText;
            applyBtn.disabled = false;
        }
    }
    
    show() {
        if (this.modal) {
            this.modal.style.display = 'flex';
        }
    }
    
    hide() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
    
    getNodeTypeText() {
        const types = {
            'folder': 'Папка',
            'module': 'Модуль',
            'table': 'Таблица',
            'card': 'Карточка'
        };
        return types[this.nodeType] || this.nodeType || '—';
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
    
    destroy() {
        if (this.modal) {
            this.modal.remove();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CoreMainPermissions;
}
