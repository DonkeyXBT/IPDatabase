let compactView = false;
let ipamCompactView = false;
let currentSort = { field: 'vm_name', direction: 'asc' };
let selectedHosts = new Set();
let selectedIPs = new Set();
let hostColumnSettings = {
    checkbox: true,
    vmName: true,
    hostType: true,
    company: true,
    os: true,
    state: true,
    node: true,
    resources: true,
    ipAddresses: true,
    serialNumber: false,
    description: false,
    actions: true
};
let visibleColumns = {
    company: true,
    os: true,
    state: true,
    memory: true,
    disk: true,
    cpu: true,
    ips: true,
    node: true,
    type: true
};

document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate before loading data
    if (typeof Auth !== 'undefined') {
        const authenticated = await Auth.init();
        if (!authenticated) {
            // Not logged in — the server will serve the login page on next navigation
            // but if we got here, let DB.init() proceed (it will handle 401s)
        }
    }

    await DB.init();

    // Load persisted UI settings from DB
    const settings = DB.get(DB.KEYS.SETTINGS);
    compactView = settings.compactView || false;
    if (settings.hostColumns) hostColumnSettings = settings.hostColumns;

    const compactBtn = document.getElementById('compactViewBtn');
    if (compactBtn && compactView) {
        compactBtn.classList.add('active');
    }

    const isDarkMode = Settings.get('darkMode');
    applyDarkMode(isDarkMode);

    // Load max audit log entries from settings
    const maxLogs = Settings.get('maxLogEntries');
    if (maxLogs) AuditLog.MAX_ENTRIES = parseInt(maxLogs) || 500;

    KeyboardShortcuts.init();
    ContextMenu.init();
    initGlobalSearch();
    const initialPage = getPageForRoute(window.location.pathname);
    navigateTo(initialPage, { updateHistory: false, replaceHistory: true });
    refreshConflictsPanel();
    console.log('OpenIPAM v7.0 initialized (SQLite)');
});

window.addEventListener('popstate', () => {
    navigateTo(getPageForRoute(window.location.pathname), { updateHistory: false });
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
});
