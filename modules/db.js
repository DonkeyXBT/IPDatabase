const DB = {
    KEYS: {
        COMPANIES: 'ipdb_companies',
        SUBNETS: 'ipdb_subnets',
        HOSTS: 'ipdb_hosts',
        IPS: 'ipdb_ips',
        VLANS: 'ipdb_vlans',
        IP_RANGES: 'ipdb_ip_ranges',
        SUBNET_TEMPLATES: 'ipdb_subnet_templates',
        RESERVATIONS: 'ipdb_reservations',
        AUDIT_LOG: 'ipdb_audit_log',
        SETTINGS: 'ipdb_settings',
        IP_HISTORY: 'ipdb_ip_history',
        MAINTENANCE_WINDOWS: 'ipdb_maintenance_windows',
        LOCATIONS: 'ipdb_locations',
        SAVED_FILTERS: 'ipdb_saved_filters',
        DHCP_SCOPES: 'ipdb_dhcp_scopes',
        DHCP_OPTIONS: 'ipdb_dhcp_options',
        DHCP_LEASES: 'ipdb_dhcp_leases',
        DHCP_RESERVATIONS: 'ipdb_dhcp_reservations'
    },

    _db: null,
    _saveTimer: null,
    _migrating: false,
    _idbName: 'NetManagerDB',
    _pendingSave: false,
    _storageBackend: 'none', // 'sqlite+idb', 'sqlite+localstorage', 'localstorage'
    _backendAvailable: false,
    _refreshTimer: null,
    _syncing: false,

    _tableMap: {
        'ipdb_companies': 'companies',
        'ipdb_subnets': 'subnets',
        'ipdb_hosts': 'hosts',
        'ipdb_ips': 'ips',
        'ipdb_vlans': 'vlans',
        'ipdb_ip_ranges': 'ip_ranges',
        'ipdb_subnet_templates': 'subnet_templates',
        'ipdb_reservations': 'reservations',
        'ipdb_audit_log': 'audit_log',
        'ipdb_ip_history': 'ip_history',
        'ipdb_maintenance_windows': 'maintenance_windows',
        'ipdb_locations': 'locations',
        'ipdb_saved_filters': 'saved_filters',
        'ipdb_dhcp_scopes': 'dhcp_scopes',
        'ipdb_dhcp_options': 'dhcp_options',
        'ipdb_dhcp_leases': 'dhcp_leases',
        'ipdb_dhcp_reservations': 'dhcp_reservations'
    },

    _jsonColumns: {
        'subnet_templates': ['ranges', 'reservations'],
        'hosts': ['ipv6Addresses', 'tags', 'customFields', 'dependencies'],
        'maintenance_windows': ['hostIds', 'subnetIds'],
        'saved_filters': ['filters'],
        'audit_log': ['oldValue', 'newValue']
    },

    _blobTables: new Set(['reservations']),

    // Maps DB.KEYS -> backend sync table name
    _apiTableMap: {
        'ipdb_companies': 'companies',
        'ipdb_subnets': 'subnets',
        'ipdb_hosts': 'hosts',
        'ipdb_ips': 'ips',
        'ipdb_vlans': 'vlans',
        'ipdb_ip_ranges': 'ip_ranges',
        'ipdb_subnet_templates': 'subnet_templates',
        'ipdb_reservations': 'reservations',
        'ipdb_audit_log': 'audit_log',
        'ipdb_ip_history': 'ip_history',
        'ipdb_maintenance_windows': 'maintenance_windows',
        'ipdb_locations': 'locations',
        'ipdb_saved_filters': 'saved_filters',
        'ipdb_dhcp_scopes': 'dhcp_scopes',
        'ipdb_dhcp_options': 'dhcp_options',
        'ipdb_dhcp_leases': 'dhcp_leases',
        'ipdb_dhcp_reservations': 'dhcp_reservations'
    },

    // Maps backup JSON keys -> DB.KEYS
    _backupKeyMap: {
        'companies': 'ipdb_companies',
        'subnets': 'ipdb_subnets',
        'hosts': 'ipdb_hosts',
        'ips': 'ipdb_ips',
        'vlans': 'ipdb_vlans',
        'ipRanges': 'ipdb_ip_ranges',
        'subnetTemplates': 'ipdb_subnet_templates',
        'reservations': 'ipdb_reservations',
        'auditLog': 'ipdb_audit_log',
        'ipHistory': 'ipdb_ip_history',
        'maintenanceWindows': 'ipdb_maintenance_windows',
        'locations': 'ipdb_locations',
        'savedFilters': 'ipdb_saved_filters',
        'dhcpScopes': 'ipdb_dhcp_scopes',
        'dhcpOptions': 'ipdb_dhcp_options',
        'dhcpLeases': 'ipdb_dhcp_leases',
        'dhcpReservations': 'ipdb_dhcp_reservations'
    },

    _createTableSQL: [
        `CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            name TEXT,
            code TEXT,
            contact TEXT,
            email TEXT,
            color TEXT,
            notes TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS subnets (
            id TEXT PRIMARY KEY,
            companyId TEXT,
            network TEXT,
            cidr INTEGER,
            name TEXT,
            description TEXT,
            vlanId TEXT,
            gateway TEXT,
            dnsServers TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS hosts (
            id TEXT PRIMARY KEY,
            companyId TEXT,
            vmName TEXT,
            hostType TEXT DEFAULT 'vm',
            description TEXT,
            serialNumber TEXT,
            operatingSystem TEXT,
            memoryUsedGB REAL,
            memoryAvailableGB REAL,
            memoryTotalGB REAL,
            node TEXT,
            diskSizeGB REAL,
            diskUsedGB REAL,
            state TEXT,
            cpuCount INTEGER,
            favorite INTEGER DEFAULT 0,
            purchaseDate TEXT,
            warrantyExpiry TEXT,
            eolDate TEXT,
            lifecycleStatus TEXT,
            vendor TEXT,
            model TEXT,
            assetTag TEXT,
            location TEXT,
            locationId TEXT,
            uPosition INTEGER,
            uHeight INTEGER,
            serviceName TEXT,
            ipv6Addresses TEXT,
            tags TEXT,
            customFields TEXT,
            dependencies TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ips (
            id TEXT PRIMARY KEY,
            ipAddress TEXT,
            subnetId TEXT,
            hostId TEXT,
            status TEXT DEFAULT 'available',
            reservationType TEXT,
            reservationDescription TEXT,
            dnsName TEXT,
            macAddress TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS vlans (
            id TEXT PRIMARY KEY,
            vlanId INTEGER,
            name TEXT,
            description TEXT,
            type TEXT,
            companyId TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ip_ranges (
            id TEXT PRIMARY KEY,
            subnetId TEXT,
            startIP TEXT,
            endIP TEXT,
            purpose TEXT,
            name TEXT,
            description TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS subnet_templates (
            id TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            cidr INTEGER,
            vlanType TEXT,
            ranges TEXT,
            reservations TEXT,
            isBuiltIn INTEGER DEFAULT 0,
            isCustom INTEGER DEFAULT 0,
            createdAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS reservations (
            id TEXT PRIMARY KEY,
            json TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS maintenance_windows (
            id TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            type TEXT,
            status TEXT DEFAULT 'scheduled',
            startTime TEXT,
            endTime TEXT,
            hostIds TEXT,
            subnetIds TEXT,
            impact TEXT,
            notifyBefore INTEGER,
            recurring INTEGER DEFAULT 0,
            recurringPattern TEXT,
            notes TEXT,
            createdAt TEXT,
            createdBy TEXT,
            statusNotes TEXT,
            statusUpdatedAt TEXT,
            completedAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            type TEXT DEFAULT 'rack',
            name TEXT,
            datacenter TEXT,
            building TEXT,
            room TEXT,
            rackUnits INTEGER DEFAULT 42,
            description TEXT,
            address TEXT,
            contactName TEXT,
            contactPhone TEXT,
            contactEmail TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            action TEXT,
            entityType TEXT,
            entityId TEXT,
            details TEXT,
            oldValue TEXT,
            newValue TEXT,
            userId TEXT,
            userName TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS ip_history (
            id TEXT PRIMARY KEY,
            ipAddress TEXT,
            action TEXT,
            timestamp TEXT,
            hostId TEXT,
            hostName TEXT,
            subnetId TEXT,
            previousHostId TEXT,
            previousHostName TEXT,
            dnsName TEXT,
            macAddress TEXT,
            notes TEXT,
            userId TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS saved_filters (
            id TEXT PRIMARY KEY,
            name TEXT,
            page TEXT,
            filters TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS dhcp_scopes (
            id TEXT PRIMARY KEY,
            name TEXT,
            subnetId TEXT,
            startIP TEXT,
            endIP TEXT,
            leaseTime INTEGER DEFAULT 86400,
            dns TEXT,
            gateway TEXT,
            domain TEXT,
            enabled INTEGER DEFAULT 1,
            notes TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS dhcp_options (
            id TEXT PRIMARY KEY,
            scopeId TEXT,
            optionCode INTEGER,
            optionName TEXT,
            optionValue TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS dhcp_leases (
            id TEXT PRIMARY KEY,
            scopeId TEXT,
            ipAddress TEXT,
            macAddress TEXT,
            hostname TEXT,
            status TEXT DEFAULT 'active',
            startTime TEXT,
            endTime TEXT,
            notes TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`,
        `CREATE TABLE IF NOT EXISTS dhcp_reservations (
            id TEXT PRIMARY KEY,
            scopeId TEXT,
            ipAddress TEXT,
            macAddress TEXT,
            hostname TEXT,
            description TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )`
    ],

    async init() {
        try {
            // Load custom DB name from localStorage (settings aren't available yet)
            try {
                const raw = localStorage.getItem('ipdb_settings');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed.dbStorageName) this._idbName = parsed.dbStorageName;
                }
            } catch(e) {}
            // Also check if already migrated to SQLite - read from IDB settings
            const storedName = localStorage.getItem('ipdb_dbStorageName');
            if (storedName) this._idbName = storedName;

            const SQL = await initSqlJs({
                locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist/${file}`
            });

            // Test IndexedDB availability
            const idbAvailable = await this._testIDB();

            const savedData = idbAvailable ? await this._loadFromIDB() : null;
            if (savedData) {
                this._db = new SQL.Database(savedData);
                this._createTables();
                this._runMigrations();
                this._storageBackend = 'sqlite+idb';
                console.log('OpenIPAM: SQLite loaded from IndexedDB');
            } else {
                this._db = new SQL.Database();
                this._createTables();
                this._runMigrations();
                this._storageBackend = idbAvailable ? 'sqlite+idb' : 'sqlite+localstorage';
                const migrated = this._migrateFromLocalStorage();
                if (migrated) {
                    await this._persist();
                }
                console.log('OpenIPAM: SQLite initialized' + (migrated ? ' (migrated from localStorage)' : ''));
                if (!idbAvailable) {
                    console.warn('OpenIPAM: IndexedDB unavailable, SQLite will persist to localStorage (limited to ~5MB)');
                }
            }

            // Register beforeunload handler to flush pending saves
            window.addEventListener('beforeunload', (e) => {
                if (this._pendingSave && this._db) {
                    this._flushSync();
                }
            });

            // Also persist on visibility change (covers mobile tab switching, etc.)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden' && this._pendingSave && this._db) {
                    this._persist();
                }
            });

            // Check for backend availability and load server data
            if (typeof API !== 'undefined' && API.checkHealth) {
                try {
                    this._backendAvailable = await API.checkHealth();
                    if (this._backendAvailable) {
                        console.log('OpenIPAM: Backend API detected, loading server data...');
                        await this._loadFromBackend();
                        this._startAutoRefresh();
                    }
                } catch(e) {
                    this._backendAvailable = false;
                }
            }

        } catch (e) {
            console.error('OpenIPAM: SQLite init failed, using localStorage fallback', e);
            this._db = null;
            this._storageBackend = 'localstorage';
            if (localStorage.getItem('ipdb_sqlite_migrated') === 'true') {
                console.warn('OpenIPAM: Data was previously migrated to SQLite. localStorage data may be outdated.');
            }
            this._showStorageWarning('SQLite/WebAssembly failed to load. Data is being stored in localStorage which has limited capacity (~5MB). Ensure your Apache server serves .wasm files with the correct MIME type (application/wasm).');
        }
    },

    // Test whether IndexedDB is available and writable
    _testIDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('_idb_test', 1);
                request.onsuccess = (e) => {
                    e.target.result.close();
                    indexedDB.deleteDatabase('_idb_test');
                    resolve(true);
                };
                request.onerror = () => resolve(false);
                setTimeout(() => resolve(false), 2000);
            } catch(e) {
                resolve(false);
            }
        });
    },

    // Synchronous flush for beforeunload - uses localStorage as fallback
    _flushSync() {
        if (!this._db) return;
        try {
            const data = this._db.export();
            const buffer = new Uint8Array(data);
            // In beforeunload, we can't await IDB, so save to localStorage as a safety net
            const blob = this._uint8ToBase64(buffer);
            localStorage.setItem('ipdb_sqlite_backup', blob);
            // Also attempt an async IDB save (browser may or may not complete it)
            this._saveToIDB(buffer).catch(() => {});
            this._pendingSave = false;
        } catch(e) {
            console.error('OpenIPAM: Sync flush failed:', e);
        }
    },

    _uint8ToBase64(uint8) {
        let binary = '';
        const len = uint8.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = uint8.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    },

    _base64ToUint8(base64) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    _showStorageWarning(message) {
        // Show a non-blocking warning banner at the top of the page
        const existing = document.getElementById('db-storage-warning');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.id = 'db-storage-warning';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#d32f2f;color:#fff;padding:10px 16px;font-size:14px;text-align:center;font-family:sans-serif;';
        banner.innerHTML = `&#9888; ${message} <button onclick="this.parentElement.remove()" style="margin-left:16px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:2px 10px;cursor:pointer;border-radius:3px;">Dismiss</button>`;
        document.body.appendChild(banner);
    },

    getStorageBackend() {
        return this._storageBackend;
    },

    useBackend() {
        return this._backendAvailable;
    },

    _createTables() {
        for (const sql of this._createTableSQL) {
            this._db.run(sql);
        }
    },

    _runMigrations() {
        this._ensureColumn('hosts', 'serviceName', 'TEXT');
        this._ensureColumn('hosts', 'ipv6Addresses', 'TEXT');
        this._ensureColumn('hosts', 'tags', 'TEXT');
        this._ensureColumn('hosts', 'customFields', 'TEXT');
        this._ensureColumn('hosts', 'dependencies', 'TEXT');
    },

    _ensureColumn(table, columnName, columnType) {
        try {
            const results = this._db.exec(`PRAGMA table_info(${table})`);
            const columns = results[0]?.values.map(row => row[1]) || [];
            if (!columns.includes(columnName)) {
                this._db.run(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnType}`);
            }
        } catch (e) {
            console.error(`DB migration failed for ${table}.${columnName}:`, e);
        }
    },

    get(key) {
        if (!this._db) {
            const data = localStorage.getItem(key);
            if (key === this.KEYS.SETTINGS) {
                return data ? JSON.parse(data) : {};
            }
            return data ? JSON.parse(data) : [];
        }

        if (key === this.KEYS.SETTINGS) {
            return this._getSettings();
        }

        const table = this._tableMap[key];
        if (!table) return [];

        if (this._blobTables.has(table)) {
            return this._getBlobTable(table);
        }

        try {
            const results = this._db.exec(`SELECT * FROM ${table}`);
            if (!results.length) return [];

            const columns = results[0].columns;
            const jsonCols = this._jsonColumns[table] || [];

            return results[0].values.map(row => {
                const obj = {};
                columns.forEach((col, i) => {
                    let val = row[i];
                    if (val !== null && jsonCols.includes(col)) {
                        try { val = JSON.parse(val); } catch(e) {}
                    }
                    obj[col] = val;
                });
                return obj;
            });
        } catch (e) {
            console.error(`DB.get error for ${key}:`, e);
            return [];
        }
    },

    set(key, data) {
        if (!this._db) {
            localStorage.setItem(key, JSON.stringify(data));
            return;
        }

        if (key === this.KEYS.SETTINGS) {
            this._setSettings(data);
            return;
        }

        const table = this._tableMap[key];
        if (!table) return;

        if (this._blobTables.has(table)) {
            this._setBlobTable(table, data);
            if (this._backendAvailable) {
                this._pushToBackend(table, data);
            }
            return;
        }

        const jsonCols = this._jsonColumns[table] || [];

        try {
            this._db.run('BEGIN TRANSACTION');
            this._db.run(`DELETE FROM ${table}`);

            if (Array.isArray(data) && data.length > 0) {
                const tableInfo = this._db.exec(`PRAGMA table_info(${table})`);
                const validColumns = tableInfo[0].values.map(r => r[1]);

                for (const item of data) {
                    const cols = [];
                    const vals = [];
                    const placeholders = [];

                    for (const col of validColumns) {
                        if (col in item) {
                            cols.push(col);
                            let val = item[col];
                            if (val != null && jsonCols.includes(col)) {
                                val = JSON.stringify(val);
                            }
                            vals.push(val ?? null);
                            placeholders.push('?');
                        }
                    }

                    if (cols.length > 0) {
                        this._db.run(
                            `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`,
                            vals
                        );
                    }
                }
            }

            this._db.run('COMMIT');
            this._scheduleSave();
            // Push to backend (fire-and-forget)
            if (this._backendAvailable) {
                this._pushToBackend(this._apiTableMap[key], data);
            }
        } catch (e) {
            try { this._db.run('ROLLBACK'); } catch(re) {}
            console.error(`DB.set error for ${key}:`, e);
        }
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    clearAll() {
        if (!this._db) {
            Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
            return;
        }
        for (const table of Object.values(this._tableMap)) {
            try { this._db.run(`DELETE FROM ${table}`); } catch(e) {}
        }
        try { this._db.run('DELETE FROM settings'); } catch(e) {}
        this._scheduleSave();
    },

    getStorageSize() {
        if (!this._db) {
            let total = 0;
            Object.values(this.KEYS).forEach(key => {
                const item = localStorage.getItem(key);
                if (item) total += item.length * 2;
            });
            return total;
        }
        try {
            const data = this._db.export();
            return data.length;
        } catch(e) {
            return 0;
        }
    },

    // --- Settings (key-value store) ---

    _getSettings() {
        try {
            const results = this._db.exec('SELECT key, value FROM settings');
            if (!results.length) return {};
            const obj = {};
            for (const row of results[0].values) {
                try { obj[row[0]] = JSON.parse(row[1]); }
                catch(e) { obj[row[0]] = row[1]; }
            }
            return obj;
        } catch(e) {
            return {};
        }
    },

    _setSettings(data) {
        if (!data || typeof data !== 'object') return;
        try {
            this._db.run('BEGIN TRANSACTION');
            this._db.run('DELETE FROM settings');
            for (const [key, value] of Object.entries(data)) {
                this._db.run('INSERT INTO settings (key, value) VALUES (?, ?)',
                    [key, JSON.stringify(value)]);
            }
            this._db.run('COMMIT');
            this._scheduleSave();
            // Push settings to backend
            if (this._backendAvailable) {
                this._pushToBackend('settings', data);
            }
        } catch(e) {
            try { this._db.run('ROLLBACK'); } catch(re) {}
            console.error('DB._setSettings error:', e);
        }
    },

    // --- Blob tables (flexible schema, e.g. reservations) ---

    _getBlobTable(table) {
        try {
            const results = this._db.exec(`SELECT json FROM ${table}`);
            if (!results.length) return [];
            return results[0].values.map(row => {
                try { return JSON.parse(row[0]); }
                catch(e) { return {}; }
            });
        } catch(e) {
            return [];
        }
    },

    _setBlobTable(table, data) {
        try {
            this._db.run('BEGIN TRANSACTION');
            this._db.run(`DELETE FROM ${table}`);
            if (Array.isArray(data)) {
                for (const item of data) {
                    this._db.run(`INSERT INTO ${table} (id, json) VALUES (?, ?)`,
                        [item.id || this.generateId(), JSON.stringify(item)]);
                }
            }
            this._db.run('COMMIT');
            this._scheduleSave();
        } catch(e) {
            try { this._db.run('ROLLBACK'); } catch(re) {}
            console.error(`DB._setBlobTable error for ${table}:`, e);
        }
    },

    // --- IndexedDB persistence ---

    _scheduleSave() {
        if (this._migrating) return;
        this._pendingSave = true;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._persist(), 500);
    },

    _persist() {
        if (!this._db) return Promise.resolve();
        try {
            const data = this._db.export();
            const buffer = new Uint8Array(data);

            if (this._storageBackend === 'sqlite+localstorage') {
                // IndexedDB not available — persist via localStorage
                try {
                    const blob = this._uint8ToBase64(buffer);
                    localStorage.setItem('ipdb_sqlite_backup', blob);
                    this._pendingSave = false;
                } catch(e) {
                    console.error('OpenIPAM: localStorage save failed (likely quota exceeded):', e);
                    this._showStorageWarning('Storage quota exceeded. Please export your data (Settings > Backup) to avoid data loss.');
                }
                return Promise.resolve();
            }

            return this._saveToIDB(buffer).then(() => {
                this._pendingSave = false;
                // Clear any emergency localStorage backup after successful IDB save
                localStorage.removeItem('ipdb_sqlite_backup');
            }).catch(e => {
                console.error('OpenIPAM: IndexedDB save failed, falling back to localStorage:', e);
                try {
                    const blob = this._uint8ToBase64(buffer);
                    localStorage.setItem('ipdb_sqlite_backup', blob);
                    this._pendingSave = false;
                } catch(lsErr) {
                    console.error('OpenIPAM: All persistence failed:', lsErr);
                    this._showStorageWarning('Failed to save data. Please export your data immediately (Settings > Backup).');
                }
            });
        } catch(e) {
            console.error('Failed to export SQLite DB:', e);
            return Promise.resolve();
        }
    },

    _loadFromIDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(this._idbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('sqliteDb')) {
                        db.createObjectStore('sqliteDb');
                    }
                };
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('sqliteDb', 'readonly');
                    const store = tx.objectStore('sqliteDb');
                    const getReq = store.get('db');
                    getReq.onsuccess = () => {
                        db.close();
                        if (getReq.result) {
                            // Clear any emergency backup since IDB has data
                            localStorage.removeItem('ipdb_sqlite_backup');
                            resolve(getReq.result);
                        } else {
                            // Try to recover from localStorage backup
                            resolve(this._loadFromLocalStorageBackup());
                        }
                    };
                    getReq.onerror = () => {
                        db.close();
                        resolve(this._loadFromLocalStorageBackup());
                    };
                };
                request.onerror = () => resolve(this._loadFromLocalStorageBackup());
            } catch(e) {
                resolve(this._loadFromLocalStorageBackup());
            }
        });
    },

    _loadFromLocalStorageBackup() {
        try {
            const backup = localStorage.getItem('ipdb_sqlite_backup');
            if (backup) {
                console.log('OpenIPAM: Recovering SQLite database from localStorage backup');
                return this._base64ToUint8(backup);
            }
        } catch(e) {
            console.warn('OpenIPAM: Failed to load localStorage backup:', e);
        }
        return null;
    },

    _saveToIDB(data) {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this._idbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('sqliteDb')) {
                        db.createObjectStore('sqliteDb');
                    }
                };
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('sqliteDb', 'readwrite');
                    const store = tx.objectStore('sqliteDb');
                    store.put(data, 'db');
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => { db.close(); reject(tx.error); };
                };
                request.onerror = () => reject(request.error);
            } catch(e) {
                reject(e);
            }
        });
    },

    // --- Migration from localStorage ---

    _migrateFromLocalStorage() {
        this._migrating = true;
        let migrated = false;

        for (const lsKey of Object.values(this.KEYS)) {
            const raw = localStorage.getItem(lsKey);
            if (!raw) continue;

            try {
                const data = JSON.parse(raw);
                if (lsKey === this.KEYS.SETTINGS) {
                    if (typeof data === 'object' && !Array.isArray(data)) {
                        this._setSettings(data);
                        migrated = true;
                    }
                } else if (Array.isArray(data) && data.length > 0) {
                    this.set(lsKey, data);
                    migrated = true;
                }
            } catch(e) {
                console.warn(`Migration failed for ${lsKey}:`, e);
            }
        }

        // Migrate UI settings stored outside DB.KEYS
        const compactView = localStorage.getItem('ipdb_compactView');
        const hostColumns = localStorage.getItem('ipdb_hostColumns');
        if (compactView !== null || hostColumns !== null) {
            const settings = this._getSettings();
            if (compactView !== null) settings.compactView = compactView === 'true';
            if (hostColumns !== null) {
                try { settings.hostColumns = JSON.parse(hostColumns); } catch(e) {}
            }
            this._setSettings(settings);
            migrated = true;
        }

        this._migrating = false;

        if (migrated) {
            localStorage.setItem('ipdb_sqlite_migrated', 'true');
            console.log('OpenIPAM: Data migrated from localStorage to SQLite');
        }

        return migrated;
    },

    // --- Backend sync methods ---

    async _loadFromBackend() {
        try {
            const res = await fetch('/api/v1/backup');
            if (res.status === 401) {
                window.location.href = '/auth/saml/login';
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const backup = await res.json();
            this._applyBackupToLocal(backup);
            console.log('OpenIPAM: Server data loaded into local cache');
        } catch(e) {
            console.warn('OpenIPAM: Failed to load from backend, using local data:', e);
        }
    },

    _applyBackupToLocal(backup) {
        // Temporarily disable migration flag to allow _setSettings calls
        const wasMigrating = this._migrating;
        this._migrating = true; // prevent _scheduleSave during bulk load

        try {
            for (const [backupKey, dbKey] of Object.entries(this._backupKeyMap)) {
                const items = backup[backupKey];
                if (!Array.isArray(items)) continue;
                const table = this._tableMap[dbKey];
                if (!table) continue;

                if (this._blobTables.has(table)) {
                    this._setBlobTable(table, items);
                } else {
                    const jsonCols = this._jsonColumns[table] || [];
                    try {
                        this._db.run('BEGIN TRANSACTION');
                        this._db.run(`DELETE FROM ${table}`);
                        const tableInfo = this._db.exec(`PRAGMA table_info(${table})`);
                        const validColumns = tableInfo[0].values.map(r => r[1]);

                        for (const item of items) {
                            const cols = [];
                            const vals = [];
                            const placeholders = [];
                            for (const col of validColumns) {
                                if (col in item) {
                                    cols.push(col);
                                    let val = item[col];
                                    if (val != null && jsonCols.includes(col) && typeof val !== 'string') {
                                        val = JSON.stringify(val);
                                    }
                                    vals.push(val ?? null);
                                    placeholders.push('?');
                                }
                            }
                            if (cols.length > 0) {
                                this._db.run(
                                    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`,
                                    vals
                                );
                            }
                        }
                        this._db.run('COMMIT');
                    } catch(e) {
                        try { this._db.run('ROLLBACK'); } catch(re) {}
                        console.error(`Failed to load ${backupKey} from backend:`, e);
                    }
                }
            }

            // Settings
            if (backup.settings && typeof backup.settings === 'object') {
                try {
                    this._db.run('BEGIN TRANSACTION');
                    this._db.run('DELETE FROM settings');
                    for (const [key, value] of Object.entries(backup.settings)) {
                        this._db.run('INSERT INTO settings (key, value) VALUES (?, ?)',
                            [key, JSON.stringify(value)]);
                    }
                    this._db.run('COMMIT');
                } catch(e) {
                    try { this._db.run('ROLLBACK'); } catch(re) {}
                    console.error('Failed to load settings from backend:', e);
                }
            }
        } finally {
            this._migrating = wasMigrating;
        }

        // Persist the updated local DB
        this._persist();
    },

    async _refreshFromBackend() {
        if (!this._backendAvailable || this._syncing) return;
        this._syncing = true;
        try {
            const res = await fetch('/api/v1/backup');
            if (res.status === 401) {
                window.location.href = '/auth/saml/login';
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const backup = await res.json();
            this._applyBackupToLocal(backup);
            // Re-render current page to show updated data
            if (typeof refreshCurrentPage === 'function') {
                refreshCurrentPage();
            }
        } catch(e) {
            console.warn('OpenIPAM: Background refresh failed:', e);
        } finally {
            this._syncing = false;
        }
    },

    _startAutoRefresh() {
        // Poll every 30 seconds
        this._refreshTimer = setInterval(() => this._refreshFromBackend(), 30000);
        // Also refresh on window focus
        window.addEventListener('focus', () => this._refreshFromBackend());
    },

    _pushToBackend(tableName, data) {
        if (!tableName) return;
        const body = { data: data };
        fetch(`/api/v1/sync/${tableName}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(e => {
            console.warn(`OpenIPAM: Failed to push ${tableName} to backend:`, e);
        });
    }
};
