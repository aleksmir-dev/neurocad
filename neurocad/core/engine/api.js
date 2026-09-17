// app/core/engine/api.js

/**
 * Универсальный API-клиент для работы с бэкендом
 * Используется фабрикой для CRUD-операций
 */
export class API {
    constructor(baseUrl = '/core/engine') {
        this.baseUrl = baseUrl;
    }

    /**
     * Выполнить запрос к API
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Ошибка API');
            }

            return data;
        } catch (error) {
            console.error('[API] Error:', error);
            throw error;
        }
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, { method: 'POST', body: data });
    }

    async put(endpoint, data) {
        return this.request(endpoint, { method: 'PUT', body: data });
    }

    async patch(endpoint, data) {
        return this.request(endpoint, { method: 'PATCH', body: data });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}