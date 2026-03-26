import os
import json
from flask import Blueprint, request, session, redirect, jsonify, make_response, g
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.utils import OneLogin_Saml2_Utils
from database import get_db

bp = Blueprint('auth', __name__)

SAML_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'saml')


def _prepare_flask_request():
    """Convert Flask request into the format python3-saml expects."""
    url_data = request.url.split('?')
    return {
        'https': 'on' if request.scheme == 'https' or request.headers.get('X-Forwarded-Proto') == 'https' else 'off',
        'http_host': request.headers.get('X-Forwarded-Host', request.host),
        'server_port': request.headers.get('X-Forwarded-Port', str(request.environ.get('SERVER_PORT', 443))),
        'script_name': request.path,
        'get_data': request.args.copy(),
        'post_data': request.form.copy(),
        'query_string': request.query_string.decode('utf-8'),
    }


def _load_saml_settings():
    """Load SAML settings from JSON files with env var overrides."""
    settings_file = os.path.join(SAML_PATH, 'settings.json')
    advanced_file = os.path.join(SAML_PATH, 'advanced_settings.json')

    with open(settings_file, 'r') as f:
        settings = json.load(f)
    with open(advanced_file, 'r') as f:
        advanced = json.load(f)

    # Apply environment variable overrides
    if os.environ.get('SAML_SP_ENTITY_ID'):
        settings['sp']['entityId'] = os.environ['SAML_SP_ENTITY_ID']
    if os.environ.get('SAML_SP_ACS_URL'):
        settings['sp']['assertionConsumerService']['url'] = os.environ['SAML_SP_ACS_URL']
    if os.environ.get('SAML_SP_SLO_URL'):
        settings['sp']['singleLogoutService']['url'] = os.environ['SAML_SP_SLO_URL']
    if os.environ.get('SAML_IDP_ENTITY_ID'):
        settings['idp']['entityId'] = os.environ['SAML_IDP_ENTITY_ID']
    if os.environ.get('SAML_IDP_SSO_URL'):
        settings['idp']['singleSignOnService']['url'] = os.environ['SAML_IDP_SSO_URL']
    if os.environ.get('SAML_IDP_SLO_URL'):
        settings['idp']['singleLogoutService']['url'] = os.environ['SAML_IDP_SLO_URL']
    if os.environ.get('SAML_IDP_CERT'):
        settings['idp']['x509cert'] = os.environ['SAML_IDP_CERT']

    # Merge advanced settings into settings
    settings.update(advanced)
    return settings


def _init_saml_auth():
    """Initialize a OneLogin SAML auth object."""
    req = _prepare_flask_request()
    settings = _load_saml_settings()
    return OneLogin_Saml2_Auth(req, settings)


def _get_role_for_email(email):
    if not email:
        return 'viewer'
    db = get_db()
    enabled_row = db.execute('SELECT value FROM settings WHERE key = ?', ('rbacEnabled',)).fetchone()
    if enabled_row:
        try:
            if not json.loads(enabled_row['value']):
                return 'admin'
        except (json.JSONDecodeError, TypeError):
            pass
    row = db.execute('SELECT value FROM settings WHERE key = ?', ('rbacAssignments',)).fetchone()
    assignments = {}
    if row:
        try:
            assignments = json.loads(row['value'])
        except (json.JSONDecodeError, TypeError):
            assignments = {}
    default_row = db.execute('SELECT value FROM settings WHERE key = ?', ('defaultUserRole',)).fetchone()
    default_role = 'admin'
    if default_row:
        try:
            default_role = json.loads(default_row['value'])
        except (json.JSONDecodeError, TypeError):
            default_role = default_row['value']
    return assignments.get(email.lower(), default_role or 'admin')


@bp.route('/saml/login')
def saml_login():
    """Initiate SAML login — redirect to Microsoft."""
    auth = _init_saml_auth()
    return redirect(auth.login())


@bp.route('/saml/acs', methods=['POST'])
def saml_acs():
    """Assertion Consumer Service — process SAML response from Microsoft."""
    auth = _init_saml_auth()
    auth.process_response()
    errors = auth.get_errors()

    if errors:
        error_reason = auth.get_last_error_reason()
        return jsonify({
            'error': 'SAML authentication failed',
            'details': errors,
            'reason': error_reason
        }), 400

    if not auth.is_authenticated():
        return jsonify({'error': 'Authentication failed'}), 401

    # Extract user attributes from SAML response
    attrs = auth.get_attributes()
    name_id = auth.get_nameid()

    session['user'] = {
        'email': name_id,
        'displayName': (
            attrs.get('http://schemas.microsoft.com/identity/claims/displayname', [None])[0]
            or attrs.get('displayname', [None])[0]
            or name_id
        ),
        'objectId': (
            attrs.get('http://schemas.microsoft.com/identity/claims/objectidentifier', [None])[0]
            or attrs.get('objectidentifier', [None])[0]
            or ''
        ),
        'nameId': name_id,
        'sessionIndex': auth.get_session_index(),
    }
    session.permanent = True

    # Redirect to the app
    relay_state = request.form.get('RelayState', '/')
    if relay_state and relay_state != request.url:
        return redirect(relay_state)
    return redirect('/')


@bp.route('/saml/logout')
def saml_logout():
    """Initiate SAML logout — redirect to Microsoft SLO."""
    auth = _init_saml_auth()
    user = session.get('user', {})
    name_id = user.get('nameId')
    session_index = user.get('sessionIndex')

    return redirect(auth.logout(
        name_id=name_id,
        session_index=session_index,
        return_to=request.host_url
    ))


@bp.route('/saml/sls')
def saml_sls():
    """Single Logout Service — process SLO response from Microsoft."""
    auth = _init_saml_auth()

    def _clear_session():
        session.clear()

    url = auth.process_slo(delete_session_cb=_clear_session)
    errors = auth.get_errors()

    if errors:
        return jsonify({'error': 'SLO failed', 'details': errors}), 400

    if url:
        return redirect(url)

    session.clear()
    return redirect('/')


@bp.route('/saml/metadata')
def saml_metadata():
    """Serve SP metadata XML for Azure app registration."""
    auth = _init_saml_auth()
    settings = auth.get_settings()
    metadata = settings.get_sp_metadata()
    errors = settings.validate_metadata(metadata)

    if errors:
        return jsonify({'error': 'Metadata validation failed', 'details': list(errors)}), 500

    resp = make_response(metadata, 200)
    resp.headers['Content-Type'] = 'text/xml'
    return resp


@bp.route('/user')
def get_user():
    """Return current session user as JSON, or 401 if not authenticated."""
    user = session.get('user')
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    user = dict(user)
    user['role'] = _get_role_for_email(user.get('email'))
    return jsonify(user)
