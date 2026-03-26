const Settings = {
    defaults: {
        darkMode: false,
        compactView: false,
        showAuditLog: true,
        rbacEnabled: false,
        defaultUserRole: 'admin',
        rbacAssignments: {}
    },
    get(key) {
        const settings = this.getAll();
        return settings[key] !== undefined ? settings[key] : this.defaults[key];
    },
    set(key, value) {
        const settings = this.getAll();
        settings[key] = value;
        DB.set(DB.KEYS.SETTINGS, settings);
        // Persist DB storage name to localStorage so it's available before SQLite init
        if (key === 'dbStorageName') {
            localStorage.setItem('ipdb_dbStorageName', value);
        }
        AuditLog.log('update', 'settings', key, `Changed ${key} to ${value}`);
    },
    getAll() {
        const stored = DB.get(DB.KEYS.SETTINGS);
        return (stored && typeof stored === 'object' && !Array.isArray(stored))
            ? stored
            : { ...this.defaults };
    },
    reset() {
        DB.set(DB.KEYS.SETTINGS, this.defaults);
    }
};
