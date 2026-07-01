// app/main/main.js

class CoreMain {
    constructor(baseInstance) {
        this.base = baseInstance;
        this.toolbar = new CoreMainToolbar(this);
        this.cards = new CoreMainCards(this);
    }

    async openModules() {
        // Динамически загружаем CSS модуля
        if (!document.querySelector('link[data-module="modules"]')) {
            const cssUrl = `/static/core/main/modules/modules.css?v=${window.APP_VERSION}`
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            link.setAttribute('data-module', 'modules');
            document.head.appendChild(link);
        }
        
        // Динамически загружаем JS модуля 
        try {
            const jsUrl = `/static/core/main/modules/modules.js?v=${window.APP_VERSION}`
            await import(jsUrl);
            const modulesModal = new CoreMainModules({
                onSave: async (data) => {
                    console.log('Модули сохранены:', data);
                }
            });
            modulesModal.show();
        } catch (error) {
            console.error('Ошибка загрузки модуля:', error);
            this.showError('Ошибка загрузки модуля управления');
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }
    
    showMessage(message, type = 'success') {
        // Находим или создаём контейнер для сообщений под subheader
        let container = document.querySelector('.core-base-messages');
        
        if (!container) {
            const subheader = document.querySelector('.core-base-subheader');
            if (!subheader) return;
            
            container = document.createElement('div');
            container.className = 'core-base-messages';
            container.style.cssText = 'padding: 12px 20px; margin: 0 10px 10px 10px; border-radius: 8px; display: none; font-size: 16px;';
            subheader.insertAdjacentElement('afterend', container);
        }
        
        const colors = {
            error: { bg: '#fee2e2', text: '#c33', border: '#fcc' },
            success: { bg: '#e6f4ea', text: '#2e7d32', border: '#b7e0b7' },
            info: { bg: '#e8f0fe', text: '#1a73e8', border: '#b8d4f8' }
        };
        
        const style = colors[type] || colors.info;
        
        container.style.display = 'block';
        container.style.backgroundColor = style.bg;
        container.style.color = style.text;
        container.style.border = `1px solid ${style.border}`;
        container.innerHTML = message;
        
        // Плавное исчезновение
        setTimeout(() => {
            container.style.transition = 'opacity 0.3s';
            container.style.opacity = '0';
            setTimeout(() => {
                container.style.display = 'none';
                container.style.opacity = '1';
            }, 300);
        }, 3000);
    }    
    
}

document.addEventListener('DOMContentLoaded', () => {
    new CoreMain(window.coreBase);
});
