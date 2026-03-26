const Permissions = {
    roleOrder: {
        viewer: 0,
        operator: 1,
        editor: 2,
        admin: 3
    },
    rules: {
        'inventory.write': 'editor',
        'maintenance.write': 'operator',
        'network.write': 'operator',
        'settings.write': 'admin',
        'rbac.write': 'admin',
        'backup.write': 'admin',
        'import.write': 'editor'
    },
    getCurrentRole() {
        if (!window.currentUser) return 'admin';
        return window.currentUser.role || 'viewer';
    },
    can(action) {
        const requiredRole = this.rules[action] || 'viewer';
        return (this.roleOrder[this.getCurrentRole()] ?? 0) >= (this.roleOrder[requiredRole] ?? 0);
    },
    require(action, message) {
        if (this.can(action)) return true;
        showToast(message || `Your role cannot perform this action`, 'error');
        return false;
    }
};
