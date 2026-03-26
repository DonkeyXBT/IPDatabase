const CSVManager = {
    parseCSV(content) {
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];

        const parseRow = (row) => {
            const values = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < row.length; i++) {
                const char = row[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }

            values.push(current.trim());
            return values;
        };

        const headers = parseRow(lines[0]);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseRow(lines[i]);
            const row = {};
            headers.forEach((header, idx) => {
                row[header] = values[idx] || '';
            });
            data.push(row);
        }

        return data;
    },

    getImportDefinitions() {
        const rangePurposes = new Set(RANGE_PURPOSES.map(p => p.id));
        const vlanTypes = new Set(VLAN_TYPES.map(v => v.id));

        return {
            hosts: {
                label: 'Hosts',
                description: 'Import or update hosts and their IP assignments.',
                headers: [
                    'VM Name',
                    'Company',
                    'Host Type',
                    'Operating System',
                    'State',
                    'Node',
                    'CPU Count',
                    'Memory Used (GB)',
                    'Memory Available (GB)',
                    'Memory Total (GB)',
                    'Disk Size (GB)',
                    'Disk Used (GB)',
                    'IP Addresses',
                    'Fav'
                ],
                normalizeRow: (row, options) => {
                    const companyName = row['Company']?.trim();
                    const companyId = options.companyId || this._findCompanyId(companyName);
                    return {
                        vmName: row['VM Name']?.trim() || '',
                        companyName,
                        companyId,
                        hostType: row['Host Type']?.trim() || 'vm',
                        operatingSystem: row['Operating System']?.trim() || '',
                        state: row['State']?.trim() || 'running',
                        node: row['Node']?.trim() || '',
                        cpuCount: row['CPU Count']?.trim() || '',
                        memoryUsedGB: row['Memory Used (GB)']?.trim() || '',
                        memoryAvailableGB: row['Memory Available (GB)']?.trim() || '',
                        memoryTotalGB: row['Memory Total (GB)']?.trim() || '',
                        diskSizeGB: row['Disk Size (GB)']?.trim() || '',
                        diskUsedGB: row['Disk Used (GB)']?.trim() || '',
                        ipAddresses: row['IP Addresses']?.trim() || '',
                        favorite: row['Fav']?.trim() || '0'
                    };
                },
                validateRow: (data, options) => {
                    if (!data.vmName) {
                        return { action: 'invalid', messages: ['VM Name is required'] };
                    }
                    if (data.companyName && !data.companyId) {
                        return { action: 'invalid', messages: [`Unknown company "${data.companyName}"`] };
                    }

                    const invalidIPs = this._splitIPs(data.ipAddresses).filter(ip => !IPUtils.isValidIP(ip));
                    if (invalidIPs.length > 0) {
                        return { action: 'invalid', messages: [`Invalid IPs: ${invalidIPs.join(', ')}`] };
                    }

                    const existing = HostManager.getByVMName(data.vmName);
                    if (existing) {
                        return {
                            action: options.updateExisting ? 'update' : 'skip',
                            messages: [options.updateExisting ? 'Existing host will be updated' : 'Existing host would be skipped'],
                            existingId: existing.id
                        };
                    }

                    return { action: 'create', messages: ['New host will be created'] };
                },
                commit: (row) => this._commitHost(row)
            },
            companies: {
                label: 'Companies',
                description: 'Import or update companies.',
                headers: ['Name', 'Code', 'Contact', 'Email', 'Color', 'Notes'],
                normalizeRow: (row) => ({
                    name: row['Name']?.trim() || '',
                    code: row['Code']?.trim() || '',
                    contact: row['Contact']?.trim() || '',
                    email: row['Email']?.trim() || '',
                    color: row['Color']?.trim() || '',
                    notes: row['Notes']?.trim() || ''
                }),
                validateRow: (data) => {
                    if (!data.name) {
                        return { action: 'invalid', messages: ['Name is required'] };
                    }

                    const existing = CompanyManager.getAll().find(company =>
                        company.name.toLowerCase() === data.name.toLowerCase()
                    );

                    return existing
                        ? { action: 'update', messages: ['Existing company will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New company will be created'] };
                },
                commit: (row) => this._commitCompany(row)
            },
            subnets: {
                label: 'Subnets',
                description: 'Import or update subnet definitions.',
                headers: ['Network', 'CIDR', 'Name', 'Company', 'VLAN ID', 'Gateway', 'DNS Servers', 'Description'],
                normalizeRow: (row) => ({
                    network: row['Network']?.trim() || '',
                    cidr: row['CIDR']?.trim() || '',
                    name: row['Name']?.trim() || '',
                    companyName: row['Company']?.trim() || '',
                    companyId: this._findCompanyId(row['Company']?.trim()),
                    vlanId: row['VLAN ID']?.trim() || '',
                    gateway: row['Gateway']?.trim() || '',
                    dnsServers: row['DNS Servers']?.trim() || '',
                    description: row['Description']?.trim() || ''
                }),
                validateRow: (data) => {
                    const cidr = parseInt(data.cidr, 10);
                    if (!IPUtils.isValidIP(data.network)) {
                        return { action: 'invalid', messages: ['Network is not a valid IPv4 address'] };
                    }
                    if (Number.isNaN(cidr) || cidr < 0 || cidr > 32) {
                        return { action: 'invalid', messages: ['CIDR must be between 0 and 32'] };
                    }
                    if (data.companyName && !data.companyId) {
                        return { action: 'invalid', messages: [`Unknown company "${data.companyName}"`] };
                    }

                    const normalizedNetwork = IPUtils.getNetworkAddress(data.network, cidr);
                    const existing = SubnetManager.getAll().find(subnet =>
                        subnet.network === normalizedNetwork && subnet.cidr === cidr
                    );

                    return existing
                        ? { action: 'update', messages: ['Existing subnet will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New subnet will be created'] };
                },
                commit: (row) => this._commitSubnet(row)
            },
            vlans: {
                label: 'VLANs',
                description: 'Import or update VLAN records.',
                headers: ['VLAN ID', 'Name', 'Type', 'Company', 'Description'],
                normalizeRow: (row) => ({
                    vlanId: row['VLAN ID']?.trim() || '',
                    name: row['Name']?.trim() || '',
                    type: row['Type']?.trim() || 'data',
                    companyName: row['Company']?.trim() || '',
                    companyId: this._findCompanyId(row['Company']?.trim()),
                    description: row['Description']?.trim() || ''
                }),
                validateRow: (data) => {
                    const vlanId = parseInt(data.vlanId, 10);
                    if (Number.isNaN(vlanId)) {
                        return { action: 'invalid', messages: ['VLAN ID must be a number'] };
                    }
                    if (!data.name) {
                        return { action: 'invalid', messages: ['Name is required'] };
                    }
                    if (data.companyName && !data.companyId) {
                        return { action: 'invalid', messages: [`Unknown company "${data.companyName}"`] };
                    }
                    if (!vlanTypes.has(data.type)) {
                        return { action: 'invalid', messages: [`Unknown VLAN type "${data.type}"`] };
                    }

                    const existing = VLANManager.getByVlanId(vlanId);
                    return existing
                        ? { action: 'update', messages: ['Existing VLAN will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New VLAN will be created'] };
                },
                commit: (row) => this._commitVLAN(row)
            },
            locations: {
                label: 'Locations',
                description: 'Import or update datacenter locations and racks.',
                headers: ['Type', 'Name', 'Datacenter', 'Building', 'Room', 'Rack Units', 'Address', 'Contact Name', 'Contact Phone', 'Contact Email', 'Description'],
                normalizeRow: (row) => ({
                    type: row['Type']?.trim() || 'rack',
                    name: row['Name']?.trim() || '',
                    datacenter: row['Datacenter']?.trim() || '',
                    building: row['Building']?.trim() || '',
                    room: row['Room']?.trim() || '',
                    rackUnits: row['Rack Units']?.trim() || '42',
                    address: row['Address']?.trim() || '',
                    contactName: row['Contact Name']?.trim() || '',
                    contactPhone: row['Contact Phone']?.trim() || '',
                    contactEmail: row['Contact Email']?.trim() || '',
                    description: row['Description']?.trim() || ''
                }),
                validateRow: (data) => {
                    if (!data.name) {
                        return { action: 'invalid', messages: ['Name is required'] };
                    }

                    const existing = LocationManager.getAll().find(location =>
                        location.type === data.type && location.name.toLowerCase() === data.name.toLowerCase()
                    );

                    return existing
                        ? { action: 'update', messages: ['Existing location will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New location will be created'] };
                },
                commit: (row) => this._commitLocation(row)
            },
            dhcpScopes: {
                label: 'DHCP Scopes',
                description: 'Import or update DHCP scopes.',
                headers: ['Name', 'Subnet', 'Start IP', 'End IP', 'Lease Time', 'DNS', 'Gateway', 'Domain', 'Enabled', 'Notes'],
                normalizeRow: (row) => {
                    const subnetId = this._findSubnetId(row['Subnet']?.trim());
                    return {
                        name: row['Name']?.trim() || '',
                        subnetLabel: row['Subnet']?.trim() || '',
                        subnetId,
                        startIP: row['Start IP']?.trim() || '',
                        endIP: row['End IP']?.trim() || '',
                        leaseTime: row['Lease Time']?.trim() || '86400',
                        dns: row['DNS']?.trim() || '',
                        gateway: row['Gateway']?.trim() || '',
                        domain: row['Domain']?.trim() || '',
                        enabled: row['Enabled']?.trim() || 'true',
                        notes: row['Notes']?.trim() || ''
                    };
                },
                validateRow: (data) => {
                    if (!data.subnetId) {
                        return { action: 'invalid', messages: [`Unknown subnet "${data.subnetLabel}"`] };
                    }
                    if (!IPUtils.isValidIP(data.startIP) || !IPUtils.isValidIP(data.endIP)) {
                        return { action: 'invalid', messages: ['Start IP and End IP must be valid IPv4 addresses'] };
                    }
                    if (IPUtils.ipToInt(data.startIP) > IPUtils.ipToInt(data.endIP)) {
                        return { action: 'invalid', messages: ['Start IP must be before End IP'] };
                    }

                    const subnet = SubnetManager.getById(data.subnetId);
                    if (!subnet) {
                        return { action: 'invalid', messages: ['Referenced subnet was not found'] };
                    }

                    if (!IPUtils.isIPInSubnet(data.startIP, subnet.network, subnet.cidr) ||
                        !IPUtils.isIPInSubnet(data.endIP, subnet.network, subnet.cidr)) {
                        return { action: 'invalid', messages: ['Scope range must fit inside the referenced subnet'] };
                    }

                    const existing = DHCPManager.getAllScopes().find(scope =>
                        scope.subnetId === data.subnetId &&
                        scope.startIP === data.startIP &&
                        scope.endIP === data.endIP
                    );

                    return existing
                        ? { action: 'update', messages: ['Existing scope will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New scope will be created'] };
                },
                commit: (row) => this._commitDHCPScope(row)
            },
            ipRanges: {
                label: 'IP Ranges',
                description: 'Import or update IP range allocation blocks.',
                headers: ['Subnet', 'Start IP', 'End IP', 'Purpose', 'Name', 'Description'],
                normalizeRow: (row) => {
                    const subnetId = this._findSubnetId(row['Subnet']?.trim());
                    return {
                        subnetLabel: row['Subnet']?.trim() || '',
                        subnetId,
                        startIP: row['Start IP']?.trim() || '',
                        endIP: row['End IP']?.trim() || '',
                        purpose: row['Purpose']?.trim() || 'reserved',
                        name: row['Name']?.trim() || '',
                        description: row['Description']?.trim() || ''
                    };
                },
                validateRow: (data) => {
                    if (!data.subnetId) {
                        return { action: 'invalid', messages: [`Unknown subnet "${data.subnetLabel}"`] };
                    }
                    if (!IPUtils.isValidIP(data.startIP) || !IPUtils.isValidIP(data.endIP)) {
                        return { action: 'invalid', messages: ['Start IP and End IP must be valid IPv4 addresses'] };
                    }
                    if (IPUtils.ipToInt(data.startIP) > IPUtils.ipToInt(data.endIP)) {
                        return { action: 'invalid', messages: ['Start IP must be before End IP'] };
                    }
                    if (!rangePurposes.has(data.purpose)) {
                        return { action: 'invalid', messages: [`Unknown range purpose "${data.purpose}"`] };
                    }

                    const subnet = SubnetManager.getById(data.subnetId);
                    if (!subnet) {
                        return { action: 'invalid', messages: ['Referenced subnet was not found'] };
                    }

                    if (!IPUtils.isIPInSubnet(data.startIP, subnet.network, subnet.cidr) ||
                        !IPUtils.isIPInSubnet(data.endIP, subnet.network, subnet.cidr)) {
                        return { action: 'invalid', messages: ['Range must fit inside the referenced subnet'] };
                    }

                    const existing = IPRangeManager.getAll().find(range =>
                        range.subnetId === data.subnetId &&
                        range.startIP === data.startIP &&
                        range.endIP === data.endIP
                    );

                    return existing
                        ? { action: 'update', messages: ['Existing range will be updated'], existingId: existing.id }
                        : { action: 'create', messages: ['New range will be created'] };
                },
                commit: (row) => this._commitIPRange(row)
            }
        };
    },

    getImportHeaders(entity) {
        return this.getImportDefinitions()[entity]?.headers || [];
    },

    getImportDescription(entity) {
        return this.getImportDefinitions()[entity]?.description || '';
    },

    exportTemplate(entity = 'hosts') {
        return this.getImportHeaders(entity).map(header => `"${header}"`).join(',') + '\n';
    },

    previewImport(entity, content, options = {}) {
        const definitions = this.getImportDefinitions();
        const definition = definitions[entity];
        if (!definition) {
            return {
                entity,
                rows: [],
                headers: [],
                summary: this._emptySummary(),
                errors: ['Unsupported import type']
            };
        }

        const rows = this.parseCSV(content);
        const summary = this._emptySummary();
        const fileKeys = new Set();
        const previewRows = [];

        rows.forEach((rawRow, index) => {
            const normalized = definition.normalizeRow(rawRow, options);
            const dedupeKey = this._getDedupeKey(entity, normalized);
            const messages = [];
            let validation = definition.validateRow(normalized, options);

            if (dedupeKey && fileKeys.has(dedupeKey)) {
                validation = { action: 'duplicate', messages: ['Duplicate row in this import file'] };
            } else if (dedupeKey) {
                fileKeys.add(dedupeKey);
            }

            messages.push(...(validation.messages || []));
            summary[this._summaryKey(validation.action)]++;

            previewRows.push({
                rowNumber: index + 2,
                action: validation.action,
                existingId: validation.existingId || null,
                messages,
                options,
                raw: rawRow,
                normalized,
                display: this._buildDisplayRow(entity, normalized)
            });
        });

        return {
            entity,
            label: definition.label,
            headers: definition.headers,
            summary,
            rows: previewRows,
            options,
            canImport: previewRows.some(row => row.action === 'create' || row.action === 'update')
        };
    },

    commitImport(preview) {
        if (!preview || !preview.rows) {
            return { stats: { created: 0, updated: 0, skipped: 0, invalid: 0, errors: 0 }, errors: ['Nothing to import'] };
        }

        const definition = this.getImportDefinitions()[preview.entity];
        const stats = { created: 0, updated: 0, skipped: 0, invalid: 0, errors: 0 };
        const errors = [];

        preview.rows.forEach(row => {
            try {
                if (row.action === 'invalid' || row.action === 'duplicate') {
                    stats.invalid++;
                    return;
                }
                if (row.action === 'skip') {
                    stats.skipped++;
                    return;
                }

                const result = definition.commit(row);
                if (!result.success) {
                    stats.errors++;
                    errors.push(`Row ${row.rowNumber}: ${result.message}`);
                    return;
                }

                if (row.action === 'update') {
                    stats.updated++;
                } else {
                    stats.created++;
                }
            } catch (error) {
                stats.errors++;
                errors.push(`Row ${row.rowNumber}: ${error.message}`);
            }
        });

        return { stats, errors };
    },

    export() {
        const hosts = HostManager.getAll();
        const headers = [
            'Operating System',
            'Memory Used (GB)',
            'Memory Available (GB)',
            'VM Name',
            'Host Type',
            'Node',
            'Disk Size (GB)',
            'State',
            'CPU Count',
            'Disk Used (GB)',
            'Memory Total (GB)',
            'IP Addresses',
            'Fav'
        ];

        let csv = headers.map(header => `"${header}"`).join(',') + '\n';
        hosts.forEach(host => {
            const row = [
                host.operatingSystem || '',
                host.memoryUsedGB || '',
                host.memoryAvailableGB || '',
                host.vmName || '',
                host.hostType || 'vm',
                host.node || '',
                host.diskSizeGB || '',
                host.state || '',
                host.cpuCount || '',
                host.diskUsedGB || '',
                host.memoryTotalGB || '',
                host.ipAddresses || '',
                host.favorite ? '1' : '0'
            ];
            csv += row.map(value => `"${value}"`).join(',') + '\n';
        });

        return csv;
    },

    _emptySummary() {
        return { create: 0, update: 0, skip: 0, invalid: 0, duplicate: 0 };
    },

    _summaryKey(action) {
        return ['create', 'update', 'skip', 'invalid', 'duplicate'].includes(action) ? action : 'invalid';
    },

    _buildDisplayRow(entity, normalized) {
        switch (entity) {
            case 'hosts':
                return [normalized.vmName, normalized.companyName || 'Unassigned', normalized.hostType, normalized.ipAddresses || '-'];
            case 'companies':
                return [normalized.name, normalized.code || '-', normalized.contact || '-', normalized.email || '-'];
            case 'subnets':
                return [normalized.network, normalized.cidr, normalized.companyName || '-', normalized.name || '-'];
            case 'vlans':
                return [normalized.vlanId, normalized.name, normalized.type, normalized.companyName || '-'];
            case 'locations':
                return [normalized.name, normalized.type, normalized.datacenter || '-', normalized.room || '-'];
            case 'dhcpScopes':
                return [normalized.name || '-', normalized.subnetLabel, `${normalized.startIP} - ${normalized.endIP}`, normalized.domain || '-'];
            case 'ipRanges':
                return [normalized.subnetLabel, `${normalized.startIP} - ${normalized.endIP}`, normalized.purpose, normalized.name || '-'];
            default:
                return Object.values(normalized).slice(0, 4);
        }
    },

    _getDedupeKey(entity, normalized) {
        switch (entity) {
            case 'hosts':
                return normalized.vmName.toLowerCase();
            case 'companies':
                return normalized.name.toLowerCase();
            case 'subnets':
                return `${normalized.network}/${normalized.cidr}`;
            case 'vlans':
                return normalized.vlanId;
            case 'locations':
                return `${normalized.type}:${normalized.name.toLowerCase()}`;
            case 'dhcpScopes':
                return `${normalized.subnetLabel}:${normalized.startIP}:${normalized.endIP}`;
            case 'ipRanges':
                return `${normalized.subnetLabel}:${normalized.startIP}:${normalized.endIP}`;
            default:
                return null;
        }
    },

    _findCompanyId(companyName) {
        if (!companyName) return null;
        const company = CompanyManager.getAll().find(item =>
            item.name.toLowerCase() === companyName.toLowerCase()
        );
        return company?.id || null;
    },

    _findSubnetId(subnetLabel) {
        if (!subnetLabel) return null;
        const normalized = subnetLabel.trim().toLowerCase();
        const subnets = SubnetManager.getAll();
        const subnet = subnets.find(item => `${item.network}/${item.cidr}`.toLowerCase() === normalized);
        return subnet?.id || null;
    },

    _splitIPs(ipField) {
        return (ipField || '')
            .split(',')
            .map(ip => ip.trim())
            .filter(ip => ip);
    },

    _toBoolean(value) {
        return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    },

    _commitHost(row) {
        const data = row.normalized;
        const existing = row.existingId ? HostManager.getById(row.existingId) : HostManager.getByVMName(data.vmName);
        const companyId = data.companyId || row.options?.companyId || null;
        const ipList = this._splitIPs(data.ipAddresses);

        if (existing) {
            HostManager.update(existing.id, {
                companyId: companyId || existing.companyId,
                hostType: data.hostType || existing.hostType,
                operatingSystem: data.operatingSystem || existing.operatingSystem,
                memoryUsedGB: data.memoryUsedGB || existing.memoryUsedGB,
                memoryAvailableGB: data.memoryAvailableGB || existing.memoryAvailableGB,
                memoryTotalGB: data.memoryTotalGB || existing.memoryTotalGB,
                node: data.node || existing.node,
                diskSizeGB: data.diskSizeGB || existing.diskSizeGB,
                diskUsedGB: data.diskUsedGB || existing.diskUsedGB,
                state: data.state || existing.state,
                cpuCount: data.cpuCount || existing.cpuCount,
                favorite: this._toBoolean(data.favorite) ? 1 : 0
            });
            ipList.forEach(ip => {
                if (IPUtils.isValidIP(ip)) {
                    IPManager.register(ip, existing.id, 'assigned');
                }
            });
            return { success: true };
        }

        return HostManager.add({
            companyId,
            vmName: data.vmName,
            hostType: data.hostType,
            operatingSystem: data.operatingSystem,
            state: data.state,
            node: data.node,
            cpuCount: data.cpuCount,
            memoryUsedGB: data.memoryUsedGB,
            memoryAvailableGB: data.memoryAvailableGB,
            memoryTotalGB: data.memoryTotalGB,
            diskSizeGB: data.diskSizeGB,
            diskUsedGB: data.diskUsedGB,
            favorite: this._toBoolean(data.favorite)
        }, {
            method: 'manual',
            ips: ipList.join(', ')
        });
    },

    _commitCompany(row) {
        const data = row.normalized;
        if (row.existingId) {
            return CompanyManager.update(row.existingId, data);
        }
        return CompanyManager.add(data);
    },

    _commitSubnet(row) {
        const data = row.normalized;
        const payload = {
            companyId: data.companyId,
            network: IPUtils.getNetworkAddress(data.network, parseInt(data.cidr, 10)),
            cidr: parseInt(data.cidr, 10),
            name: data.name,
            vlanId: data.vlanId || null,
            gateway: data.gateway,
            dnsServers: data.dnsServers,
            description: data.description
        };

        if (row.existingId) {
            return SubnetManager.update(row.existingId, payload);
        }
        return SubnetManager.add(payload);
    },

    _commitVLAN(row) {
        const data = row.normalized;
        const payload = {
            vlanId: parseInt(data.vlanId, 10),
            name: data.name,
            type: data.type,
            companyId: data.companyId,
            description: data.description
        };

        if (row.existingId) {
            return VLANManager.update(row.existingId, payload);
        }
        return VLANManager.add(payload);
    },

    _commitLocation(row) {
        const data = row.normalized;
        const payload = {
            type: data.type,
            name: data.name,
            datacenter: data.datacenter,
            building: data.building,
            room: data.room,
            rackUnits: parseInt(data.rackUnits, 10) || 42,
            address: data.address,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            contactEmail: data.contactEmail,
            description: data.description
        };

        if (row.existingId) {
            return LocationManager.update(row.existingId, payload);
        }
        return LocationManager.add(payload);
    },

    _commitDHCPScope(row) {
        const data = row.normalized;
        const payload = {
            name: data.name,
            subnetId: data.subnetId,
            startIP: data.startIP,
            endIP: data.endIP,
            leaseTime: parseInt(data.leaseTime, 10) || 86400,
            dns: data.dns,
            gateway: data.gateway,
            domain: data.domain,
            enabled: this._toBoolean(data.enabled),
            notes: data.notes
        };

        if (row.existingId) {
            return DHCPManager.updateScope(row.existingId, payload);
        }
        return DHCPManager.addScope(payload);
    },

    _commitIPRange(row) {
        const data = row.normalized;
        const payload = {
            subnetId: data.subnetId,
            startIP: data.startIP,
            endIP: data.endIP,
            purpose: data.purpose,
            name: data.name,
            description: data.description
        };

        if (row.existingId) {
            return IPRangeManager.update(row.existingId, payload);
        }
        return IPRangeManager.add(payload);
    }
};
