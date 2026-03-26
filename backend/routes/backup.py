import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from database import get_db

bp = Blueprint('backup', __name__)

TABLES = {
    'companies': 'companies',
    'subnets': 'subnets',
    'hosts': 'hosts',
    'ips': 'ips',
    'vlans': 'vlans',
    'ipRanges': 'ip_ranges',
    'subnetTemplates': 'subnet_templates',
    'reservations': 'reservations',
    'ipHistory': 'ip_history',
    'maintenanceWindows': 'maintenance_windows',
    'auditLog': 'audit_log',
    'locations': 'locations',
    'savedFilters': 'saved_filters',
    'dhcpScopes': 'dhcp_scopes',
    'dhcpOptions': 'dhcp_options',
    'dhcpLeases': 'dhcp_leases',
    'dhcpReservations': 'dhcp_reservations',
}

# Reverse map: SQL table name -> camelCase key (for sync endpoint)
TABLE_NAME_TO_KEY = {v: k for k, v in TABLES.items()}

JSON_FIELDS = {
    'subnet_templates': ['ranges', 'reservations'],
    'maintenance_windows': ['hostIds', 'subnetIds'],
    'hosts': ['ipv6Addresses', 'tags', 'customFields', 'dependencies'],
    'audit_log': ['oldValue', 'newValue'],
    'saved_filters': ['filters'],
}


@bp.route('/backup', methods=['GET'])
def export_backup():
    db = get_db()
    backup = {
        'version': 5,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }

    for key, table in TABLES.items():
        rows = db.execute(f'SELECT * FROM {table}').fetchall()
        json_cols = JSON_FIELDS.get(table, [])
        items = []
        for r in rows:
            d = dict(r)
            if table == 'reservations' and 'json' in d:
                try:
                    d = json.loads(d['json'])
                except (json.JSONDecodeError, TypeError):
                    pass
            else:
                for col in json_cols:
                    if d.get(col):
                        try:
                            d[col] = json.loads(d[col])
                        except (json.JSONDecodeError, TypeError):
                            pass
            items.append(d)
        backup[key] = items

    # Settings
    settings_rows = db.execute('SELECT key, value FROM settings').fetchall()
    settings = {}
    for r in settings_rows:
        try:
            settings[r['key']] = json.loads(r['value'])
        except (json.JSONDecodeError, TypeError):
            settings[r['key']] = r['value']
    backup['settings'] = settings

    return jsonify(backup)


@bp.route('/backup', methods=['POST'])
def import_backup():
    data = request.get_json()
    if not data or 'subnets' not in data or 'hosts' not in data:
        return jsonify({'error': 'Invalid backup file'}), 400

    db = get_db()

    for key, table in TABLES.items():
        items = data.get(key, [])
        db.execute(f'DELETE FROM {table}')

        if not items:
            continue

        if table == 'reservations':
            for item in items:
                item_id = item.get('id', '')
                db.execute('INSERT INTO reservations (id, json) VALUES (?, ?)',
                           (item_id, json.dumps(item)))
        else:
            json_cols = JSON_FIELDS.get(table, [])
            # Get column names
            info = db.execute(f'PRAGMA table_info({table})').fetchall()
            valid_cols = [r['name'] for r in info]

            for item in items:
                cols = []
                vals = []
                for col in valid_cols:
                    if col in item:
                        val = item[col]
                        if col in json_cols and val is not None and not isinstance(val, str):
                            val = json.dumps(val)
                        cols.append(col)
                        vals.append(val)
                if cols:
                    placeholders = ','.join(['?'] * len(cols))
                    db.execute(f'INSERT INTO {table} ({",".join(cols)}) VALUES ({placeholders})', vals)

    # Settings
    if 'settings' in data and isinstance(data['settings'], dict):
        db.execute('DELETE FROM settings')
        for k, v in data['settings'].items():
            db.execute('INSERT INTO settings (key, value) VALUES (?, ?)',
                       (k, json.dumps(v)))

    db.commit()
    return jsonify({'success': True, 'message': 'Backup imported successfully'})


# --- Allowed table names for the sync endpoint (whitelist for safety) ---
ALLOWED_SYNC_TABLES = set(TABLES.values()) | {'settings'}


@bp.route('/sync/<table_name>', methods=['PUT'])
def sync_table(table_name):
    """Replace all rows in a single table. Used by the frontend DB.set() to push changes."""
    if table_name not in ALLOWED_SYNC_TABLES:
        return jsonify({'error': f'Unknown table: {table_name}'}), 400

    body = request.get_json()
    if body is None:
        return jsonify({'error': 'Missing JSON body'}), 400

    db = get_db()

    # Handle settings table specially (key/value store)
    if table_name == 'settings':
        data = body.get('data', {})
        if not isinstance(data, dict):
            return jsonify({'error': 'Settings data must be an object'}), 400
        db.execute('DELETE FROM settings')
        for k, v in data.items():
            db.execute('INSERT INTO settings (key, value) VALUES (?, ?)',
                       (k, json.dumps(v)))
        db.commit()
        return jsonify({'success': True})

    items = body.get('data', [])
    if not isinstance(items, list):
        return jsonify({'error': 'data must be an array'}), 400

    db.execute(f'DELETE FROM {table_name}')

    if items:
        if table_name == 'reservations':
            for item in items:
                item_id = item.get('id', '')
                db.execute('INSERT INTO reservations (id, json) VALUES (?, ?)',
                           (item_id, json.dumps(item)))
        else:
            json_cols = JSON_FIELDS.get(table_name, [])
            info = db.execute(f'PRAGMA table_info({table_name})').fetchall()
            valid_cols = [r['name'] for r in info]

            for item in items:
                cols = []
                vals = []
                for col in valid_cols:
                    if col in item:
                        val = item[col]
                        if col in json_cols and val is not None and not isinstance(val, str):
                            val = json.dumps(val)
                        cols.append(col)
                        vals.append(val)
                if cols:
                    placeholders = ','.join(['?'] * len(cols))
                    db.execute(f'INSERT INTO {table_name} ({",".join(cols)}) VALUES ({placeholders})', vals)

    db.commit()
    return jsonify({'success': True})
