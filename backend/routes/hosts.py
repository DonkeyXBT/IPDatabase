import uuid
import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from database import get_db

bp = Blueprint('hosts', __name__)


def _decode_host(row):
    host = dict(row)
    for field, fallback in (('ipv6Addresses', []), ('tags', []), ('customFields', {}), ('dependencies', [])):
        if host.get(field):
            try:
                host[field] = json.loads(host[field])
            except (json.JSONDecodeError, TypeError):
                host[field] = fallback
        else:
            host[field] = fallback
    return host

@bp.route('/hosts', methods=['GET'])
def list_hosts():
    db = get_db()
    rows = db.execute('SELECT * FROM hosts').fetchall()
    return jsonify([_decode_host(r) for r in rows])

@bp.route('/hosts/<id>', methods=['GET'])
def get_host(id):
    db = get_db()
    row = db.execute('SELECT * FROM hosts WHERE id = ?', (id,)).fetchone()
    if not row:
        return jsonify({'error': 'Host not found'}), 404
    return jsonify(_decode_host(row))

@bp.route('/hosts', methods=['POST'])
def create_host():
    data = request.get_json()
    db = get_db()
    new_id = uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat() + 'Z'
    ipv6_addresses = json.dumps(data.get('ipv6Addresses', []))
    tags = json.dumps(data.get('tags', []))
    custom_fields = json.dumps(data.get('customFields', {}))
    dependencies = json.dumps(data.get('dependencies', []))
    db.execute(
        '''INSERT INTO hosts (id, companyId, vmName, hostType, description, serialNumber, operatingSystem,
           memoryUsedGB, memoryAvailableGB, memoryTotalGB, node, diskSizeGB, diskUsedGB, state, cpuCount,
           favorite, purchaseDate, warrantyExpiry, eolDate, lifecycleStatus, vendor, model, assetTag,
           location, locationId, uPosition, uHeight, serviceName, ipv6Addresses, tags, customFields, dependencies, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (new_id, data.get('companyId'), data.get('vmName'), data.get('hostType', 'vm'),
         data.get('description'), data.get('serialNumber'), data.get('operatingSystem'),
         data.get('memoryUsedGB'), data.get('memoryAvailableGB'), data.get('memoryTotalGB'),
         data.get('node'), data.get('diskSizeGB'), data.get('diskUsedGB'), data.get('state'),
         data.get('cpuCount'), data.get('favorite', 0), data.get('purchaseDate'),
         data.get('warrantyExpiry'), data.get('eolDate'), data.get('lifecycleStatus'),
         data.get('vendor'), data.get('model'), data.get('assetTag'), data.get('location'),
         data.get('locationId'), data.get('uPosition'), data.get('uHeight'), data.get('serviceName'),
         ipv6_addresses, tags, custom_fields, dependencies, now, now)
    )
    db.commit()
    return jsonify({'success': True, 'id': new_id, 'message': 'Host created'}), 201

@bp.route('/hosts/<id>', methods=['PUT'])
def update_host(id):
    data = request.get_json()
    db = get_db()
    now = datetime.utcnow().isoformat() + 'Z'
    fields = ['companyId', 'vmName', 'hostType', 'description', 'serialNumber', 'operatingSystem',
              'memoryUsedGB', 'memoryAvailableGB', 'memoryTotalGB', 'node', 'diskSizeGB', 'diskUsedGB',
              'state', 'cpuCount', 'favorite', 'purchaseDate', 'warrantyExpiry', 'eolDate',
              'lifecycleStatus', 'vendor', 'model', 'assetTag', 'location', 'locationId',
              'uPosition', 'uHeight', 'serviceName', 'ipv6Addresses', 'tags', 'customFields', 'dependencies']
    if 'tags' in data:
        data['tags'] = json.dumps(data['tags'])
    if 'ipv6Addresses' in data:
        data['ipv6Addresses'] = json.dumps(data['ipv6Addresses'])
    if 'customFields' in data:
        data['customFields'] = json.dumps(data['customFields'])
    if 'dependencies' in data:
        data['dependencies'] = json.dumps(data['dependencies'])
    set_clauses = ', '.join(f'{f}=?' for f in fields if f in data)
    values = [data[f] for f in fields if f in data]
    if not set_clauses:
        return jsonify({'success': True, 'message': 'Nothing to update'})
    set_clauses += ', updatedAt=?'
    values.extend([now, id])
    db.execute(f'UPDATE hosts SET {set_clauses} WHERE id=?', values)
    db.commit()
    return jsonify({'success': True, 'message': 'Host updated'})

@bp.route('/hosts/<id>', methods=['DELETE'])
def delete_host(id):
    db = get_db()
    db.execute('DELETE FROM hosts WHERE id = ?', (id,))
    db.commit()
    return jsonify({'success': True, 'message': 'Host deleted'})
