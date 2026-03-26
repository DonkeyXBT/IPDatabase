import sqlite3
import os
from flask import g

DB_PATH = os.environ.get('OPENIPAM_DB_PATH', os.path.join(os.path.dirname(__file__), 'openipam.db'))

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
        g.db.execute('PRAGMA journal_mode = WAL')
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

CREATE_TABLES_SQL = [
    """CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT,
        code TEXT,
        contact TEXT,
        email TEXT,
        color TEXT,
        notes TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS subnets (
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
    )""",
    """CREATE TABLE IF NOT EXISTS hosts (
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
    )""",
    """CREATE TABLE IF NOT EXISTS ips (
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
    )""",
    """CREATE TABLE IF NOT EXISTS vlans (
        id TEXT PRIMARY KEY,
        vlanId INTEGER,
        name TEXT,
        description TEXT,
        type TEXT,
        companyId TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS ip_ranges (
        id TEXT PRIMARY KEY,
        subnetId TEXT,
        startIP TEXT,
        endIP TEXT,
        purpose TEXT,
        name TEXT,
        description TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS subnet_templates (
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
    )""",
    """CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        json TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS maintenance_windows (
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
    )""",
    """CREATE TABLE IF NOT EXISTS locations (
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
    )""",
    """CREATE TABLE IF NOT EXISTS audit_log (
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
    )""",
    """CREATE TABLE IF NOT EXISTS ip_history (
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
    )""",
    """CREATE TABLE IF NOT EXISTS saved_filters (
        id TEXT PRIMARY KEY,
        name TEXT,
        page TEXT,
        filters TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS dhcp_scopes (
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
    )""",
    """CREATE TABLE IF NOT EXISTS dhcp_options (
        id TEXT PRIMARY KEY,
        scopeId TEXT,
        optionCode INTEGER,
        optionName TEXT,
        optionValue TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS dhcp_leases (
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
    )""",
    """CREATE TABLE IF NOT EXISTS dhcp_reservations (
        id TEXT PRIMARY KEY,
        scopeId TEXT,
        ipAddress TEXT,
        macAddress TEXT,
        hostname TEXT,
        description TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )"""
]

def _run_migrations(db):
    """Add columns to existing tables if they don't exist yet."""
    # Check if audit_log has userId column
    cursor = db.execute("PRAGMA table_info(audit_log)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'userId' not in columns:
        db.execute('ALTER TABLE audit_log ADD COLUMN userId TEXT')
    if 'userName' not in columns:
        db.execute('ALTER TABLE audit_log ADD COLUMN userName TEXT')

    host_columns = [row[1] for row in db.execute("PRAGMA table_info(hosts)").fetchall()]
    if 'serviceName' not in host_columns:
        db.execute('ALTER TABLE hosts ADD COLUMN serviceName TEXT')
    if 'ipv6Addresses' not in host_columns:
        db.execute('ALTER TABLE hosts ADD COLUMN ipv6Addresses TEXT')
    if 'tags' not in host_columns:
        db.execute('ALTER TABLE hosts ADD COLUMN tags TEXT')
    if 'customFields' not in host_columns:
        db.execute('ALTER TABLE hosts ADD COLUMN customFields TEXT')
    if 'dependencies' not in host_columns:
        db.execute('ALTER TABLE hosts ADD COLUMN dependencies TEXT')


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    for sql in CREATE_TABLES_SQL:
        db.execute(sql)
    _run_migrations(db)
    db.commit()
    db.close()
