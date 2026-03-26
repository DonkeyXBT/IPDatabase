import os
import json
from datetime import timedelta
from flask import Flask, send_from_directory, jsonify, request, session, g
from flask_cors import CORS
from database import init_db, close_db, get_db

app = Flask(__name__, static_folder=None)
CORS(app, supports_credentials=True)

# Session / secret key configuration
app.secret_key = os.environ.get('FLASK_SECRET_KEY', os.urandom(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)

# Parent directory has the frontend files
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Initialize database on startup
init_db()

# Register teardown
app.teardown_appcontext(close_db)

# --- Import and register route blueprints ---
from routes.companies import bp as companies_bp
from routes.subnets import bp as subnets_bp
from routes.hosts import bp as hosts_bp
from routes.ips import bp as ips_bp
from routes.vlans import bp as vlans_bp
from routes.ip_ranges import bp as ip_ranges_bp
from routes.dhcp import bp as dhcp_bp
from routes.locations import bp as locations_bp
from routes.maintenance import bp as maintenance_bp
from routes.templates import bp as templates_bp
from routes.audit_log import bp as audit_log_bp
from routes.settings import bp as settings_bp
from routes.backup import bp as backup_bp
from routes.saved_filters import bp as saved_filters_bp
from routes.ip_history import bp as ip_history_bp
from routes.auth import bp as auth_bp

app.register_blueprint(companies_bp, url_prefix='/api/v1')
app.register_blueprint(subnets_bp, url_prefix='/api/v1')
app.register_blueprint(hosts_bp, url_prefix='/api/v1')
app.register_blueprint(ips_bp, url_prefix='/api/v1')
app.register_blueprint(vlans_bp, url_prefix='/api/v1')
app.register_blueprint(ip_ranges_bp, url_prefix='/api/v1')
app.register_blueprint(dhcp_bp, url_prefix='/api/v1')
app.register_blueprint(locations_bp, url_prefix='/api/v1')
app.register_blueprint(maintenance_bp, url_prefix='/api/v1')
app.register_blueprint(templates_bp, url_prefix='/api/v1')
app.register_blueprint(audit_log_bp, url_prefix='/api/v1')
app.register_blueprint(settings_bp, url_prefix='/api/v1')
app.register_blueprint(backup_bp, url_prefix='/api/v1')
app.register_blueprint(saved_filters_bp, url_prefix='/api/v1')
app.register_blueprint(ip_history_bp, url_prefix='/api/v1')
app.register_blueprint(auth_bp, url_prefix='/auth')


# --- Authentication gate ---
OPEN_PREFIXES = ('/auth/', '/api/v1/health')
STATIC_EXTENSIONS = ('.css', '.js', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.wasm')
ROLE_ORDER = {'viewer': 0, 'operator': 1, 'editor': 2, 'admin': 3}
ADMIN_PATH_PREFIXES = ('/api/v1/settings', '/api/v1/backup')
OPERATOR_PATH_PREFIXES = ('/api/v1/dhcp', '/api/v1/ips', '/api/v1/maintenance')
EDITOR_PATH_PREFIXES = ('/api/v1/companies', '/api/v1/subnets', '/api/v1/hosts', '/api/v1/vlans', '/api/v1/ip_ranges', '/api/v1/locations', '/api/v1/templates', '/api/v1/saved_filters')


def _load_rbac_settings():
    db = get_db()
    rows = db.execute('SELECT key, value FROM settings WHERE key IN (?, ?, ?)', ('rbacEnabled', 'rbacAssignments', 'defaultUserRole')).fetchall()
    settings = {'rbacEnabled': False, 'rbacAssignments': {}, 'defaultUserRole': 'admin'}
    for row in rows:
        try:
            settings[row['key']] = json.loads(row['value'])
        except (json.JSONDecodeError, TypeError):
            settings[row['key']] = row['value']
    return settings


def _get_role_for_user(user):
    if not user:
        return 'viewer'
    settings = _load_rbac_settings()
    if not settings.get('rbacEnabled'):
        return 'admin'
    assignments = settings.get('rbacAssignments') or {}
    email = (user.get('email') or '').lower()
    return assignments.get(email, settings.get('defaultUserRole') or 'viewer')


def _required_role_for_request(path, method):
    if method in ('GET', 'HEAD', 'OPTIONS'):
        return 'viewer'
    if any(path.startswith(prefix) for prefix in ADMIN_PATH_PREFIXES):
        return 'admin'
    if path == '/api/v1/audit_log' and method == 'DELETE':
        return 'admin'
    if any(path.startswith(prefix) for prefix in OPERATOR_PATH_PREFIXES):
        return 'operator'
    if any(path.startswith(prefix) for prefix in EDITOR_PATH_PREFIXES):
        return 'editor'
    return 'viewer'

@app.before_request
def require_login():
    path = request.path
    # Allow auth routes and health check through
    if any(path.startswith(p) for p in OPEN_PREFIXES):
        return None
    # Allow login.html and its static assets
    if path == '/login.html':
        return None
    # Set current user on g for downstream use
    g.current_user = session.get('user')
    g.current_role = _get_role_for_user(g.current_user)
    # Allow static file requests through (fonts, css, js needed by login page)
    if any(path.endswith(ext) for ext in STATIC_EXTENSIONS):
        return None
    # Check authentication
    if not session.get('user'):
        # API requests get 401
        if path.startswith('/api/'):
            return jsonify({'error': 'Authentication required'}), 401
        # Page requests get login page
        return send_from_directory(FRONTEND_DIR, 'login.html')
    if path.startswith('/api/'):
        required_role = _required_role_for_request(path, request.method)
        if ROLE_ORDER.get(g.current_role, 0) < ROLE_ORDER.get(required_role, 0):
            return jsonify({'error': 'Insufficient permissions', 'requiredRole': required_role, 'currentRole': g.current_role}), 403
    return None


# --- Health endpoint ---
@app.route('/api/v1/health')
def health():
    return jsonify({'status': 'ok', 'version': '1.0.0'})


# --- Dashboard endpoint ---
@app.route('/api/v1/dashboard')
def dashboard():
    db = get_db()
    stats = {
        'companies': db.execute('SELECT COUNT(*) as c FROM companies').fetchone()['c'],
        'subnets': db.execute('SELECT COUNT(*) as c FROM subnets').fetchone()['c'],
        'hosts': db.execute('SELECT COUNT(*) as c FROM hosts').fetchone()['c'],
        'ips': db.execute('SELECT COUNT(*) as c FROM ips').fetchone()['c'],
        'vlans': db.execute('SELECT COUNT(*) as c FROM vlans').fetchone()['c'],
        'dhcpScopes': db.execute('SELECT COUNT(*) as c FROM dhcp_scopes').fetchone()['c'],
        'dhcpLeases': db.execute('SELECT COUNT(*) as c FROM dhcp_leases WHERE status = "active"').fetchone()['c'],
        'runningHosts': db.execute('SELECT COUNT(*) as c FROM hosts WHERE LOWER(state) = "running"').fetchone()['c'],
    }
    return jsonify(stats)


# --- Search endpoint ---
@app.route('/api/v1/search')
def search():
    q = request.args.get('q', '').lower().strip()
    if len(q) < 2:
        return jsonify([])
    db = get_db()
    results = []
    pattern = f'%{q}%'

    for row in db.execute('SELECT id, vmName, operatingSystem, hostType FROM hosts WHERE vmName LIKE ? OR operatingSystem LIKE ? OR description LIKE ? OR serialNumber LIKE ? LIMIT 5', (pattern, pattern, pattern, pattern)):
        results.append({'type': 'host', 'id': row['id'], 'title': row['vmName'], 'subtitle': row['operatingSystem'] or row['hostType'], 'icon': '\U0001f4bb', 'page': 'hosts'})

    for row in db.execute('SELECT id, ipAddress, dnsName FROM ips WHERE ipAddress LIKE ? OR dnsName LIKE ? LIMIT 5', (pattern, pattern)):
        results.append({'type': 'ip', 'id': row['id'], 'title': row['ipAddress'], 'subtitle': row['dnsName'] or '', 'icon': '\U0001f310', 'page': 'ipam'})

    for row in db.execute('SELECT id, network, cidr, name FROM subnets WHERE network LIKE ? OR name LIKE ? LIMIT 5', (pattern, pattern)):
        results.append({'type': 'subnet', 'id': row['id'], 'title': f"{row['network']}/{row['cidr']}", 'subtitle': row['name'] or '', 'icon': '\U0001f517', 'page': 'subnets'})

    for row in db.execute('SELECT id, name, startIP, endIP FROM dhcp_scopes WHERE name LIKE ? OR startIP LIKE ? OR endIP LIKE ? LIMIT 5', (pattern, pattern, pattern)):
        results.append({'type': 'dhcp_scope', 'id': row['id'], 'title': row['name'] or f"{row['startIP']} - {row['endIP']}", 'subtitle': f"{row['startIP']} - {row['endIP']}", 'icon': '\U0001f4cb', 'page': 'dhcp'})

    return jsonify(results[:20])


# --- Serve frontend static files ---
@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/styles.css')
def serve_css():
    return send_from_directory(FRONTEND_DIR, 'styles.css')

@app.route('/modules/<path:filename>')
def serve_modules(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, 'modules'), filename)

@app.route('/<path:filename>')
def serve_static(filename):
    filepath = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(filepath):
        return send_from_directory(FRONTEND_DIR, filename)
    return send_from_directory(FRONTEND_DIR, 'index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
