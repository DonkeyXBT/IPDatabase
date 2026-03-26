const API = {
    _baseUrl: '/api/v1',
    _available: false,
    _checked: false,

    async checkHealth() {
        if (this._checked) return this._available;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${this._baseUrl}/health`, { signal: controller.signal });
            clearTimeout(timeout);
            this._available = res.ok;
        } catch (e) {
            this._available = false;
        }
        this._checked = true;
        return this._available;
    },

    isAvailable() {
        return this._available;
    },

    async _request(method, path, data = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data && (method === 'POST' || method === 'PUT')) {
            opts.body = JSON.stringify(data);
        }
        const res = await fetch(`${this._baseUrl}${path}`, opts);
        if (res.status === 401) {
            window.location.href = '/auth/saml/login';
            throw new Error('Authentication required');
        }
        if (res.status === 403) {
            const err = await res.json().catch(() => ({ error: 'Insufficient permissions' }));
            throw new Error(err.error || 'Insufficient permissions');
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.message || 'API request failed');
        }
        if (res.status === 204) return null;
        return res.json();
    },

    async getAll(entity) {
        return this._request('GET', `/${entity}`);
    },

    async getById(entity, id) {
        return this._request('GET', `/${entity}/${id}`);
    },

    async create(entity, data) {
        return this._request('POST', `/${entity}`, data);
    },

    async update(entity, id, data) {
        return this._request('PUT', `/${entity}/${id}`, data);
    },

    async remove(entity, id) {
        return this._request('DELETE', `/${entity}/${id}`);
    },

    async getDashboard() {
        return this._request('GET', '/dashboard');
    },

    async search(q) {
        return this._request('GET', `/search?q=${encodeURIComponent(q)}`);
    },

    async exportBackup() {
        return this._request('GET', '/backup');
    },

    async importBackup(data) {
        return this._request('POST', '/backup', data);
    }
};
