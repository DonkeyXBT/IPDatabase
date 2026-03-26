const GlobalSearch = {
    search(query) {
        if (!query || query.length < 2) return [];

        const q = query.toLowerCase();
        const results = [];
        const hosts = DB.get(DB.KEYS.HOSTS);

        hosts.forEach(host => {
            const customFieldMatch = Object.entries(host.customFields || {}).some(([key, value]) =>
                key.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)
            );

            if (host.vmName?.toLowerCase().includes(q) ||
                host.operatingSystem?.toLowerCase().includes(q) ||
                host.description?.toLowerCase().includes(q) ||
                host.serialNumber?.toLowerCase().includes(q) ||
                host.assetTag?.toLowerCase().includes(q) ||
                host.serviceName?.toLowerCase().includes(q) ||
                (host.tags || []).some(tag => tag.toLowerCase().includes(q)) ||
                (host.ipv6Addresses || []).some(ip => ip.toLowerCase().includes(q)) ||
                customFieldMatch) {
                results.push({
                    type: 'host',
                    id: host.id,
                    title: host.vmName,
                    subtitle: host.serviceName || host.operatingSystem || host.hostType,
                    icon: '[host]',
                    page: 'hosts'
                });
            }
        });

        const ips = DB.get(DB.KEYS.IPS);
        ips.forEach(ip => {
            if (ip.ipAddress?.toLowerCase().includes(q) ||
                ip.dnsName?.toLowerCase().includes(q)) {
                const host = hosts.find(h => h.id === ip.hostId);
                results.push({
                    type: 'ip',
                    id: ip.id,
                    title: ip.ipAddress,
                    subtitle: ip.dnsName || (host ? host.vmName : 'Unassigned'),
                    icon: '[ip]',
                    page: 'ipam'
                });
            }
        });

        const subnets = DB.get(DB.KEYS.SUBNETS);
        subnets.forEach(subnet => {
            const networkStr = `${subnet.network}/${subnet.cidr}`;
            if (networkStr.includes(q) ||
                subnet.name?.toLowerCase().includes(q) ||
                subnet.description?.toLowerCase().includes(q)) {
                results.push({
                    type: 'subnet',
                    id: subnet.id,
                    title: networkStr,
                    subtitle: subnet.name || subnet.description || '',
                    icon: '[subnet]',
                    page: 'subnets'
                });
            }
        });

        const vlans = DB.get(DB.KEYS.VLANS);
        vlans.forEach(vlan => {
            if (vlan.vlanId?.toString().includes(q) ||
                vlan.name?.toLowerCase().includes(q) ||
                vlan.description?.toLowerCase().includes(q)) {
                results.push({
                    type: 'vlan',
                    id: vlan.id,
                    title: `VLAN ${vlan.vlanId}`,
                    subtitle: vlan.name,
                    icon: '[vlan]',
                    page: 'vlans'
                });
            }
        });

        const companies = DB.get(DB.KEYS.COMPANIES);
        companies.forEach(company => {
            if (company.name?.toLowerCase().includes(q) ||
                company.contactName?.toLowerCase().includes(q)) {
                results.push({
                    type: 'company',
                    id: company.id,
                    title: company.name,
                    subtitle: company.contactName || '',
                    icon: '[company]',
                    page: 'companies'
                });
            }
        });

        const locations = DB.get(DB.KEYS.LOCATIONS);
        locations.forEach(location => {
            if (location.name?.toLowerCase().includes(q) ||
                location.datacenter?.toLowerCase().includes(q) ||
                location.room?.toLowerCase().includes(q)) {
                results.push({
                    type: 'location',
                    id: location.id,
                    title: location.name,
                    subtitle: `${location.datacenter || ''} ${location.room || ''}`.trim(),
                    icon: '[location]',
                    page: 'locations'
                });
            }
        });

        const dhcpScopes = DB.get(DB.KEYS.DHCP_SCOPES);
        dhcpScopes.forEach(scope => {
            if (scope.name?.toLowerCase().includes(q) ||
                scope.startIP?.toLowerCase().includes(q) ||
                scope.endIP?.toLowerCase().includes(q)) {
                results.push({
                    type: 'dhcp_scope',
                    id: scope.id,
                    title: scope.name || `${scope.startIP} - ${scope.endIP}`,
                    subtitle: `${scope.startIP} - ${scope.endIP}`,
                    icon: '[dhcp]',
                    page: 'dhcp'
                });
            }
        });

        return results.slice(0, 20);
    }
};
