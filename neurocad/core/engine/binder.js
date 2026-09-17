// app/core/engine/binder.js

/**
 * Универсальный обработчик событий для фабрики
 * Навешивает события на элементы по описанию из JSON-конфига
 */
export class Binder {
    constructor() {
        // API будет загружен динамически
        this.api = null;
        this.handlers = {
            'click': {},
            'change': {},
            'input': {},
            'submit': {}
        };
    }

    /**
     * Привязать события к элементу
     */
    bind(element, events) {
        if (!events) return;

        Object.keys(events).forEach(eventType => {
            const handlers = events[eventType];
            if (!Array.isArray(handlers)) return;

            handlers.forEach(handler => {
                const action = handler.action;
                const params = handler.params || {};

                element.addEventListener(eventType, (e) => {
                    this.execute(action, params, e, element);
                });
            });
        });
    }

    /**
     * Привязать все события из конфига
     */
    bindAll(config) {
        if (config.events) {
            const events = Array.isArray(config.events) ? config.events : [config.events];
            events.forEach(eventConfig => {
                const { selector, event = 'click', action, params = {} } = eventConfig;
                if (!selector || !action) return;

                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    element.addEventListener(event, (e) => {
                        this.execute(action, params, e, element);
                    });
                });
            });
        }
    }

    /**
     * Выполнить действие
     */
    execute(action, params, event, element) {
        switch (action) {
            case 'log':
                console.log('[Binder] Log:', params.message || '');
                break;

            case 'alert':
                alert(params.message || '');
                break;

            case 'api':
                this.apiRequest(params);
                break;

            case 'navigate':
                window.location.href = params.url || '/';
                break;

            case 'custom':
                if (params.function && typeof window[params.function] === 'function') {
                    window[params.function](params, event, element);
                }
                break;

            default:
                console.warn('[Binder] Неизвестное действие:', action);
        }
    }

    /**
     * Запрос к API через API
     */
    async apiRequest(params) {
        try {
            if (!this.api) {
                const { API } = await import('./api.js');
                this.api = new API();
            }

            const data = await this.api.request(params.url, {
                method: params.method || 'GET',
                headers: params.headers || {},
                body: params.body
            });

            if (params.onSuccess) {
                if (typeof params.onSuccess === 'function') {
                    params.onSuccess(data);
                } else if (typeof window[params.onSuccess] === 'function') {
                    window[params.onSuccess](data);
                }
            }

            return data;
        } catch (error) {
            console.error('[Binder] API error:', error);
            if (params.onError) {
                if (typeof params.onError === 'function') {
                    params.onError(error);
                } else if (typeof window[params.onError] === 'function') {
                    window[params.onError](error);
                }
            }
        }
    }
}