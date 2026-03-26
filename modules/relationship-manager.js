const RelationshipManager = {
    getDependencyLabels(host) {
        return (host.dependencies || []).map(dep => this.resolveDependencyLabel(dep)).filter(Boolean);
    },
    resolveDependencyLabel(dep) {
        if (!dep || !dep.type || !dep.id) return null;
        switch (dep.type) {
            case 'host': {
                const host = HostManager.getById(dep.id);
                return host ? `Host: ${host.vmName}` : null;
            }
            case 'subnet': {
                const subnet = SubnetManager.getById(dep.id);
                return subnet ? `Subnet: ${subnet.network}/${subnet.cidr}` : null;
            }
            case 'vlan': {
                const vlan = VLANManager.getById(dep.id);
                return vlan ? `VLAN: ${vlan.vlanId} ${vlan.name}` : null;
            }
            default:
                return dep.label || null;
        }
    },
    getReverseDependencies(targetHostIds = []) {
        if (!Array.isArray(targetHostIds) || targetHostIds.length === 0) return [];
        const hosts = HostManager.getAll();
        const idSet = new Set(targetHostIds);
        return hosts.filter(host =>
            (host.dependencies || []).some(dep => dep.type === 'host' && idSet.has(dep.id))
        );
    },
    getMaintenanceImpact(hostIds = []) {
        const directHosts = hostIds
            .map(id => HostManager.getById(id))
            .filter(Boolean);
        const dependentHosts = this.getReverseDependencies(hostIds)
            .filter(host => !hostIds.includes(host.id));

        const services = [...new Set(
            [...directHosts, ...dependentHosts]
                .map(host => host.serviceName)
                .filter(Boolean)
        )];

        return {
            directHosts,
            dependentHosts,
            services
        };
    }
};
