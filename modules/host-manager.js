const HostManager = {
    getAll() {
        const hosts = DB.get(DB.KEYS.HOSTS);
        const ips = DB.get(DB.KEYS.IPS);
        const companies = DB.get(DB.KEYS.COMPANIES);
        return hosts.map(host => {
            const hostIPs = ips.filter(ip => ip.hostId === host.id);
            const company = companies.find(c => c.id === host.companyId);
            const hostType = HOST_TYPES.find(t => t.id === host.hostType) || HOST_TYPES[0] || { id: 'vm', name: 'Virtual Machine', icon: '💻' };
            return {
                ...host,
                ipAddresses: [...hostIPs.map(ip => ip.ipAddress), ...((Array.isArray(host.ipv6Addresses) ? host.ipv6Addresses : []))].join(', '),
                companyName: company ? company.name : 'Unassigned',
                companyColor: company ? company.color : '#6b7280',
                hostTypeName: hostType.name,
                hostTypeIcon: hostType.icon,
                hostTypeColor: hostType.color,
                tags: Array.isArray(host.tags) ? host.tags : [],
                customFields: host.customFields || {},
                dependencies: Array.isArray(host.dependencies) ? host.dependencies : [],
                serviceName: host.serviceName || '',
                ipv6Addresses: Array.isArray(host.ipv6Addresses) ? host.ipv6Addresses : []
            };
        });
    },
    getById(id) {
        const hosts = DB.get(DB.KEYS.HOSTS);
        const host = hosts.find(h => h.id === id);
        if (!host) return null;
        const ips = DB.get(DB.KEYS.IPS);
        const hostIPs = ips.filter(ip => ip.hostId === id);
        const companies = DB.get(DB.KEYS.COMPANIES);
        const company = companies.find(c => c.id === host.companyId);
        const hostType = HOST_TYPES.find(t => t.id === host.hostType) || HOST_TYPES[0] || { id: 'vm', name: 'Virtual Machine', icon: '💻' };
        return {
            ...host,
            ipAddresses: [...hostIPs.map(ip => ip.ipAddress), ...((Array.isArray(host.ipv6Addresses) ? host.ipv6Addresses : []))].join(', '),
            companyName: company ? company.name : 'Unassigned',
            companyColor: company ? company.color : '#6b7280',
            hostTypeName: hostType.name,
            hostTypeIcon: hostType.icon,
            hostTypeColor: hostType.color,
            tags: Array.isArray(host.tags) ? host.tags : [],
            customFields: host.customFields || {},
            dependencies: Array.isArray(host.dependencies) ? host.dependencies : [],
            serviceName: host.serviceName || '',
            ipv6Addresses: Array.isArray(host.ipv6Addresses) ? host.ipv6Addresses : []
        };
    },
    getByVMName(vmName) {
        const hosts = DB.get(DB.KEYS.HOSTS);
        return hosts.find(h => h.vmName.toLowerCase() === vmName.toLowerCase());
    },
    add(data, ipAssignment = {}) {
        const hosts = DB.get(DB.KEYS.HOSTS);
        const newHost = {
            id: DB.generateId(),
            companyId: data.companyId || null,
            vmName: data.vmName,
            hostType: data.hostType || 'vm',
            description: data.description || '',
            serialNumber: data.serialNumber || '',
            operatingSystem: data.operatingSystem || '',
            memoryUsedGB: parseFloat(data.memoryUsedGB) || null,
            memoryAvailableGB: parseFloat(data.memoryAvailableGB) || null,
            memoryTotalGB: parseFloat(data.memoryTotalGB) || null,
            node: data.node || '',
            diskSizeGB: parseFloat(data.diskSizeGB) || null,
            diskUsedGB: parseFloat(data.diskUsedGB) || null,
            state: data.state || 'running',
            cpuCount: parseInt(data.cpuCount) || null,
            favorite: data.favorite ? 1 : 0,
            purchaseDate: data.purchaseDate || null,
            warrantyExpiry: data.warrantyExpiry || null,
            eolDate: data.eolDate || null,
            lifecycleStatus: data.lifecycleStatus || 'active',
            vendor: data.vendor || '',
            model: data.model || '',
            assetTag: data.assetTag || '',
            location: data.location || '',
            locationId: data.locationId || null,
            uPosition: parseInt(data.uPosition, 10) || null,
            uHeight: parseInt(data.uHeight, 10) || 1,
            serviceName: data.serviceName || '',
            ipv6Addresses: Array.isArray(data.ipv6Addresses) ? data.ipv6Addresses : [],
            tags: Array.isArray(data.tags) ? data.tags : [],
            customFields: data.customFields || {},
            dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
            createdAt: new Date().toISOString()
        };
        hosts.push(newHost);
        DB.set(DB.KEYS.HOSTS, hosts);
        const assignedIPs = [];
        if (ipAssignment.method === 'auto' && ipAssignment.subnetId) {
            const nextIP = IPManager.getNextAvailable(ipAssignment.subnetId);
            if (nextIP) {
                IPManager.assign(nextIP, newHost.id, ipAssignment.subnetId);
                assignedIPs.push(nextIP);
            }
        } else if (ipAssignment.method === 'manual' && ipAssignment.ips) {
            const ipList = ipAssignment.ips.split(',').map(ip => ip.trim()).filter(ip => ip);
            ipList.forEach(ip => {
                const result = IPManager.register(ip, newHost.id, 'assigned');
                if (result.success) assignedIPs.push(ip);
            });
        }
        AuditLog.log('create', 'host', newHost.id,
            `Created host: ${newHost.vmName}${assignedIPs.length ? ' with IPs: ' + assignedIPs.join(', ') : ''}`, null, newHost);
        return {
            success: true,
            message: `Host added${assignedIPs.length ? ' with IPs: ' + assignedIPs.join(', ') : ''}`,
            host: newHost,
            assignedIPs
        };
    },
    update(id, updates) {
        const hosts = DB.get(DB.KEYS.HOSTS);
        const index = hosts.findIndex(h => h.id === id);
        if (index === -1) {
            return { success: false, message: 'Host not found' };
        }
        const oldHost = { ...hosts[index] };
        if (updates.memoryUsedGB !== undefined) updates.memoryUsedGB = parseFloat(updates.memoryUsedGB) || null;
        if (updates.memoryAvailableGB !== undefined) updates.memoryAvailableGB = parseFloat(updates.memoryAvailableGB) || null;
        if (updates.memoryTotalGB !== undefined) updates.memoryTotalGB = parseFloat(updates.memoryTotalGB) || null;
        if (updates.diskSizeGB !== undefined) updates.diskSizeGB = parseFloat(updates.diskSizeGB) || null;
        if (updates.diskUsedGB !== undefined) updates.diskUsedGB = parseFloat(updates.diskUsedGB) || null;
        if (updates.cpuCount !== undefined) updates.cpuCount = parseInt(updates.cpuCount) || null;
        if (updates.uPosition !== undefined) updates.uPosition = parseInt(updates.uPosition, 10) || null;
        if (updates.uHeight !== undefined) updates.uHeight = parseInt(updates.uHeight, 10) || 1;
        if (updates.tags !== undefined && !Array.isArray(updates.tags)) updates.tags = [];
        if (updates.ipv6Addresses !== undefined && !Array.isArray(updates.ipv6Addresses)) updates.ipv6Addresses = [];
        if (updates.customFields !== undefined && typeof updates.customFields !== 'object') updates.customFields = {};
        if (updates.dependencies !== undefined && !Array.isArray(updates.dependencies)) updates.dependencies = [];
        hosts[index] = { ...hosts[index], ...updates, updatedAt: new Date().toISOString() };
        DB.set(DB.KEYS.HOSTS, hosts);
        AuditLog.log('update', 'host', id,
            `Updated host: ${hosts[index].vmName}`, oldHost, hosts[index]);
        return { success: true, message: 'Host updated successfully' };
    },
    delete(id) {
        const hosts = DB.get(DB.KEYS.HOSTS);
        const ips = DB.get(DB.KEYS.IPS);
        const host = hosts.find(h => h.id === id);
        const updatedIPs = ips.map(ip => {
            if (ip.hostId === id) {
                return { ...ip, hostId: null, status: 'available', updatedAt: new Date().toISOString() };
            }
            return ip;
        });
        const newHosts = hosts.filter(h => h.id !== id);
        DB.set(DB.KEYS.HOSTS, newHosts);
        DB.set(DB.KEYS.IPS, updatedIPs);
        AuditLog.log('delete', 'host', id,
            `Deleted host: ${host ? host.vmName : id}`, host, null);
        return { success: true, message: 'Host deleted successfully' };
    }
};
