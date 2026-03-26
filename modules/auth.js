const Auth = {
    _user: null,

    async init() {
        try {
            const res = await fetch('/auth/user');
            if (res.ok) {
                this._user = await res.json();
                window.currentUser = this._user;
                this._updateUI();
                return true;
            }
        } catch (e) {
            console.warn('Auth: Failed to fetch user', e);
        }
        window.currentUser = null;
        return false;
    },

    getUser() {
        return this._user;
    },

    isAuthenticated() {
        return !!this._user;
    },

    _updateUI() {
        if (!this._user) return;
        // Show user name in sidebar below logo
        const logo = document.querySelector('.logo');
        if (logo) {
            let badge = document.getElementById('auth-user-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'auth-user-badge';
                badge.style.cssText = 'padding:4px 12px 8px;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                logo.parentNode.insertBefore(badge, logo.nextSibling);
            }
            badge.textContent = `${this._user.displayName || this._user.email} (${this._user.role || 'viewer'})`;
            badge.title = this._user.email;
        }
    },

    logout() {
        window.location.href = '/auth/saml/logout';
    }
};
