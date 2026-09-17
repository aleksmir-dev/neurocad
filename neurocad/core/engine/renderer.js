// app/core/engine/renderer.js

/**
 * Универсальный рендерер для фабрики
 * Создаёт DOM-элементы по описанию из JSON
 */
export class Renderer {
    constructor() {
        console.log('[Renderer] Конструктор вызван');
        this._instances = [];
    }

    async render(config, components = {}) {
        console.log('[Renderer] render() вызван');
        console.log('[Renderer] config:', config);
        console.log('[Renderer] components:', Object.keys(components));

        this.components = components;

        const container = document.body;
        if (!container) {
            console.error('[Renderer] Контейнер body не найден');
            return;
        }

        console.log('[Renderer] Очистка body');
        container.innerHTML = '';

        console.log('[Renderer] Вызов renderToContainer');
        await this.renderToContainer(config, container);
        console.log('[Renderer] render() завершен');
    }

    async renderToContainer(config, container) {
        console.log('[Renderer] renderToContainer() вызван');
        console.log('[Renderer] config:', config);
        console.log('[Renderer] container:', container);

        if (!container) {
            console.error('[Renderer] Контейнер не указан');
            return;
        }

        if (config.component) {
            console.log('[Renderer] Одиночный компонент:', config.component);
            const element = await this.renderComponent(config, container);
            if (element) {
                console.log('[Renderer] Элемент создан и добавлен в контейнер');
            } else {
                console.warn('[Renderer] Элемент не создан');
            }
            return;
        }

        if (config.components && Array.isArray(config.components)) {
            console.log('[Renderer] Массив компонентов:', config.components.length);

            const renderPromises = config.components.map(async (component, index) => {
                console.log(`[Renderer] Обработка компонента ${index}:`, component.component);
                const element = await this.renderComponent(component, container);
                if (element) {
                    console.log(`[Renderer] Элемент ${component.component} создан и добавлен`);
                } else {
                    console.warn(`[Renderer] Элемент ${component.component} не создан`);
                }
            });

            await Promise.all(renderPromises);
            console.log('[Renderer] Все компоненты загружены');
        } else {
            console.warn('[Renderer] Нет config.component и нет config.components');
        }
    }

    async renderComponent(block, parentContainer) {
        console.log('[Renderer] renderComponent() вызван для:', block);
        console.log('[Renderer] parentContainer:', parentContainer);

        const componentName = block.component;
        console.log('[Renderer] Имя компонента:', componentName);

        const ComponentClass = this.components[componentName];
        console.log('[Renderer] Класс компонента:', ComponentClass);

        if (!ComponentClass) {
            console.error(`[Renderer] Компонент ${componentName} не найден`);
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `⚠️ Компонент ${componentName} не найден`;
            errorDiv.style.color = '#dc2626';
            errorDiv.style.padding = '10px';
            errorDiv.style.border = '1px solid #dc2626';
            errorDiv.style.borderRadius = '4px';
            if (parentContainer) {
                parentContainer.appendChild(errorDiv);
                return errorDiv;
            }
            return errorDiv;
        }

        const props = { ...block };
        delete props.component;
        console.log('[Renderer] Пропсы для компонента:', props);

        // ===== БЕЗ ВРАППЕРА! =====
        // Передаем parentContainer напрямую в компонент
        // Компонент сам создает свой DOM внутри parentContainer
        console.log(`[Renderer] Создание экземпляра ${componentName} напрямую в parentContainer...`);
        const instance = new ComponentClass(parentContainer, props);
        console.log(`[Renderer] Экземпляр ${componentName}:`, instance);
        console.log(`[Renderer] Container в экземпляре:`, instance.container);
        console.log(`[Renderer] container === parentContainer?`, instance.container === parentContainer);

        // Сохраняем экземпляр в массиве
        this._instances.push(instance);
        console.log(`[Renderer] Экземпляр сохранен, всего экземпляров:`, this._instances.length);

        // ===== УНИВЕРСАЛЬНОЕ ОЖИДАНИЕ _initPromise =====
        // Если у компонента есть _initPromise — ждём его завершения.
        // Никаких спец-случаев по имени компонента.
        if (instance._initPromise && typeof instance._initPromise.then === 'function') {
            console.log(`[Renderer] Ожидание _initPromise для ${componentName}...`);
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(
                        () => reject(new Error(`Таймаут инициализации ${componentName} (5 секунд)`)),
                        5000
                    );
                });

                await Promise.race([instance._initPromise, timeoutPromise]);
                console.log(`[Renderer] ${componentName} инициализирован успешно`);
            } catch (error) {
                console.error(`[Renderer] Ошибка инициализации ${componentName}:`, error);
            }
        } else {
            console.log(`[Renderer] ${componentName}._initPromise не найден, ожидание пропущено`);
        }

        // Получаем корневой элемент компонента (последний добавленный child в parentContainer)
        // или сам parentContainer, если компонент ничего не добавил
        let rootElement = parentContainer.lastChild;

        // Если компонент ничего не добавил (например, вернул ошибку), используем parentContainer
        if (!rootElement) {
            console.warn(`[Renderer] Компонент ${componentName} не добавил элементов в parentContainer`);
            rootElement = parentContainer;
        }

        console.log(`[Renderer] Корневой элемент компонента ${componentName}:`, rootElement);
        console.log(`[Renderer] renderComponent() для ${componentName} завершен`);

        return rootElement;
    }

    /**
     * Получить все созданные экземпляры компонентов
     */
    getInstances() {
        return this._instances;
    }

    /**
     * Получить экземпляр компонента по индексу
     */
    getInstance(index) {
        return this._instances[index];
    }

    /**
     * Найти экземпляр по типу компонента
     */
    findInstancesByType(componentName) {
        return this._instances.filter(instance => {
            return instance.constructor.name.toLowerCase() === componentName.toLowerCase();
        });
    }

    updateElement(selector, content) {
        console.log('[Renderer] updateElement() вызван:', selector, content);

        const element = document.querySelector(selector);
        if (!element) return;

        if (typeof content === 'string') {
            element.textContent = content;
        } else if (content instanceof HTMLElement) {
            element.innerHTML = '';
            element.appendChild(content);
        } else if (content && typeof content === 'object') {
            Object.keys(content).forEach(key => {
                if (key === 'text') {
                    element.textContent = content[key];
                } else if (key === 'html') {
                    element.innerHTML = content[key];
                } else if (key === 'style') {
                    Object.assign(element.style, content[key]);
                } else if (key === 'class') {
                    element.className = content[key];
                } else if (key === 'attrs') {
                    Object.keys(content[key]).forEach(attr => {
                        element.setAttribute(attr, content[key][attr]);
                    });
                }
            });
        }
    }
}