const AlertsManager = {
    getAll() {
        const alerts = [];
        const lifecycleHosts = HardwareLifecycle.getHostsNeedingAttention();
        const maintenance = MaintenanceManager.getUpcoming(14);
        const conflicts = ConflictDetector.checkForConflicts();
        const reconciliation = ReconciliationManager.getAllIssues();
        const scopes = DHCPManager.getAllScopes();

        lifecycleHosts.forEach(host => {
            alerts.push({
                id: `lifecycle-${host.id}`,
                category: 'lifecycle',
                severity: ['eol', 'out_of_warranty'].includes(host.lifecycleAlert.id) ? 'high' : 'medium',
                title: `${host.vmName} needs lifecycle attention`,
                detail: `${host.lifecycleAlert.name}${host.warrantyExpiry ? ` (warranty ${host.warrantyExpiry})` : ''}${host.eolDate ? `, EOL ${host.eolDate}` : ''}`,
                actions: []
            });
        });

        maintenance.forEach(window => {
            alerts.push({
                id: `maintenance-${window.id}`,
                category: 'maintenance',
                severity: 'medium',
                title: `Upcoming maintenance: ${window.title}`,
                detail: `${new Date(window.startTime).toLocaleString()}${window.isGenerated ? ' (generated from recurring schedule)' : ''}`,
                actions: []
            });
        });

        scopes
            .filter(scope => scope.utilization >= 80)
            .forEach(scope => {
                alerts.push({
                    id: `dhcp-util-${scope.id}`,
                    category: 'dhcp',
                    severity: scope.utilization >= 95 ? 'high' : 'medium',
                    title: `DHCP scope ${scope.name || scope.startIP} is ${scope.utilization}% utilized`,
                    detail: `${scope.used} of ${scope.totalIPs} addresses are in use.`,
                    actions: []
                });
            });

        conflicts.forEach(conflict => {
            alerts.push({
                id: `conflict-${conflict.type}-${conflict.ipAddress}`,
                category: 'conflict',
                severity: conflict.severity || 'medium',
                title: conflict.message,
                detail: conflict.hosts?.length ? `Affected hosts: ${conflict.hosts.join(', ')}` : conflict.ipAddress,
                actions: this._getConflictActions(conflict),
                conflict
            });
        });

        reconciliation.forEach(issue => {
            alerts.push({
                id: `reconcile-${issue.id}`,
                category: 'reconciliation',
                severity: issue.severity,
                title: issue.title,
                detail: issue.detail,
                actions: issue.actions || [],
                issue
            });
        });

        const severityOrder = { high: 0, medium: 1, low: 2 };
        return alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
    },
    _getConflictActions(conflict) {
        switch (conflict.type) {
            case 'duplicate':
                return ['dedupeIpRecords'];
            case 'subnet_mismatch':
                return ['moveIpToDetectedSubnet'];
            case 'network_address':
            case 'broadcast_address':
                return ['reserveSpecialIp'];
            default:
                return [];
        }
    }
};
