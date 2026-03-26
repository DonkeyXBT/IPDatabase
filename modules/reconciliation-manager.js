const ReconciliationManager = {
    getAllIssues() {
        const issues = [];
        const ips = DB.get(DB.KEYS.IPS);
        const scopes = DHCPManager.getAllScopes();
        const leases = DHCPManager.getAllLeases();
        const reservations = DHCPManager.getReservations();
        const seenLeaseMacs = new Map();
        const seenReservationMacs = new Map();

        leases.forEach(lease => {
            const ipRecord = ips.find(ip => ip.ipAddress === lease.ipAddress);
            if (!ipRecord || ipRecord.status === 'available') {
                issues.push({
                    id: `lease-sync-${lease.id}`,
                    type: 'lease_sync',
                    severity: 'high',
                    title: `DHCP lease ${lease.ipAddress} is not synced to IPAM`,
                    detail: `${lease.hostname || lease.macAddress || 'Lease'} exists in DHCP, but IPAM has it missing or available.`,
                    data: lease,
                    actions: ['syncLease']
                });
            }

            if (lease.macAddress) {
                const normalized = lease.macAddress.toLowerCase();
                const existing = seenLeaseMacs.get(normalized);
                if (existing && existing.ipAddress !== lease.ipAddress) {
                    issues.push({
                        id: `duplicate-lease-mac-${existing.id}-${lease.id}`,
                        type: 'duplicate_lease_mac',
                        severity: 'medium',
                        title: `Duplicate DHCP lease MAC ${lease.macAddress}`,
                        detail: `The same MAC appears on ${existing.ipAddress} and ${lease.ipAddress}.`,
                        data: { existing, current: lease },
                        actions: []
                    });
                } else {
                    seenLeaseMacs.set(normalized, lease);
                }
            }
        });

        reservations.forEach(reservation => {
            const ipRecord = ips.find(ip => ip.ipAddress === reservation.ipAddress);
            if (!ipRecord) {
                issues.push({
                    id: `reservation-sync-${reservation.id}`,
                    type: 'reservation_sync',
                    severity: 'medium',
                    title: `DHCP reservation ${reservation.ipAddress} is missing in IPAM`,
                    detail: `${reservation.hostname || reservation.macAddress || 'Reservation'} exists in DHCP but has no IPAM record.`,
                    data: reservation,
                    actions: ['syncReservation']
                });
            }

            if (reservation.macAddress) {
                const normalized = reservation.macAddress.toLowerCase();
                const existing = seenReservationMacs.get(normalized);
                if (existing && existing.ipAddress !== reservation.ipAddress) {
                    issues.push({
                        id: `duplicate-reservation-mac-${existing.id}-${reservation.id}`,
                        type: 'duplicate_reservation_mac',
                        severity: 'medium',
                        title: `Duplicate DHCP reservation MAC ${reservation.macAddress}`,
                        detail: `The same MAC appears on ${existing.ipAddress} and ${reservation.ipAddress}.`,
                        data: { existing, current: reservation },
                        actions: []
                    });
                } else {
                    seenReservationMacs.set(normalized, reservation);
                }
            }
        });

        scopes.forEach(scope => {
            const subnet = SubnetManager.getById(scope.subnetId);
            if (!subnet) return;

            if (!IPUtils.isIPInSubnet(scope.startIP, subnet.network, subnet.cidr) ||
                !IPUtils.isIPInSubnet(scope.endIP, subnet.network, subnet.cidr)) {
                issues.push({
                    id: `scope-subnet-${scope.id}`,
                    type: 'scope_subnet_mismatch',
                    severity: 'high',
                    title: `DHCP scope ${scope.name || scope.id} does not fit its subnet`,
                    detail: `${scope.startIP} - ${scope.endIP} falls outside ${subnet.network}/${subnet.cidr}.`,
                    data: scope,
                    actions: []
                });
            }
        });

        return issues;
    },
    syncLeaseToIP(leaseId) {
        const lease = DHCPManager.getAllLeases().find(item => item.id === leaseId);
        if (!lease) return { success: false, message: 'Lease not found' };

        const result = IPManager.register(lease.ipAddress, null, 'reserved');
        if (!result.success) return result;

        const ips = DB.get(DB.KEYS.IPS);
        const record = ips.find(ip => ip.ipAddress === lease.ipAddress);
        if (record) {
            record.macAddress = lease.macAddress || record.macAddress || '';
            record.dnsName = lease.hostname || record.dnsName || '';
            record.updatedAt = new Date().toISOString();
            DB.set(DB.KEYS.IPS, ips);
        }

        return { success: true, message: 'Lease synced to IPAM' };
    },
    syncReservationToIP(reservationId) {
        const reservation = DHCPManager.getReservations().find(item => item.id === reservationId);
        if (!reservation) return { success: false, message: 'Reservation not found' };

        const result = IPManager.register(reservation.ipAddress, null, 'reserved');
        if (!result.success) return result;

        const ips = DB.get(DB.KEYS.IPS);
        const record = ips.find(ip => ip.ipAddress === reservation.ipAddress);
        if (record) {
            record.macAddress = reservation.macAddress || record.macAddress || '';
            record.dnsName = reservation.hostname || record.dnsName || '';
            record.reservationType = 'dhcp';
            record.reservationDescription = reservation.description || 'Imported from DHCP reservation';
            record.updatedAt = new Date().toISOString();
            DB.set(DB.KEYS.IPS, ips);
        }

        return { success: true, message: 'Reservation synced to IPAM' };
    }
};
