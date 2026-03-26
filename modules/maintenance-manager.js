const MaintenanceManager = {
    getAll() {
        const windows = this.materializeRecurringWindows(DB.get(DB.KEYS.MAINTENANCE_WINDOWS));
        const hosts = DB.get(DB.KEYS.HOSTS);
        const subnets = DB.get(DB.KEYS.SUBNETS);
        return windows.map(mw => {
            const affectedHosts = mw.hostIds ? mw.hostIds.map(id => {
                const host = hosts.find(h => h.id === id);
                return host ? host.vmName : 'Unknown';
            }) : [];
            const affectedSubnets = mw.subnetIds ? mw.subnetIds.map(id => {
                const subnet = subnets.find(s => s.id === id);
                return subnet ? `${subnet.network}/${subnet.cidr}` : 'Unknown';
            }) : [];
            const type = MAINTENANCE_TYPES.find(t => t.id === mw.type) || MAINTENANCE_TYPES[0];
            const status = MAINTENANCE_STATUS.find(s => s.id === mw.status) || MAINTENANCE_STATUS[0];
            return {
                ...mw,
                affectedHostNames: affectedHosts,
                affectedSubnetNames: affectedSubnets,
                typeName: type.name,
                typeIcon: type.icon,
                typeColor: type.color,
                statusName: status.name,
                statusColor: status.color,
                isActive: this.isActive(mw),
                isUpcoming: this.isUpcoming(mw),
                isPast: this.isPast(mw)
            };
        }).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    },
    materializeRecurringWindows(windows, occurrencesPerSeries = 6) {
        const materialized = [...windows];
        const now = new Date();

        windows.forEach(window => {
            if (!window.recurring || !window.recurringPattern || !window.startTime || !window.endTime) {
                return;
            }

            let start = new Date(window.startTime);
            let end = new Date(window.endTime);
            let generated = 0;
            let guard = 0;

            while (generated < occurrencesPerSeries && guard < 50) {
                guard++;
                start = this._shiftByPattern(start, window.recurringPattern);
                end = this._shiftByPattern(end, window.recurringPattern);
                if (!start || !end) break;

                if (start <= now) {
                    continue;
                }

                materialized.push({
                    ...window,
                    id: `${window.id}__generated__${generated + 1}`,
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    isGenerated: true,
                    sourceWindowId: window.id,
                    generatedOccurrence: generated + 1
                });
                generated++;
            }
        });

        return materialized;
    },
    getById(id) {
        const windows = this.getAll();
        return windows.find(mw => mw.id === id);
    },
    getUpcoming(days = 7) {
        const all = this.getAll();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        return all.filter(mw => {
            const startTime = new Date(mw.startTime);
            return startTime >= new Date() && startTime <= futureDate && mw.status === 'scheduled';
        });
    },
    getActive() {
        return this.getAll().filter(mw => this.isActive(mw));
    },
    getByHost(hostId) {
        const all = this.getAll();
        return all.filter(mw => mw.hostIds && mw.hostIds.includes(hostId));
    },
    getBySubnet(subnetId) {
        const all = this.getAll();
        return all.filter(mw => mw.subnetIds && mw.subnetIds.includes(subnetId));
    },
    isActive(mw) {
        const now = new Date();
        const start = new Date(mw.startTime);
        const end = new Date(mw.endTime);
        return now >= start && now <= end && mw.status === 'in_progress';
    },
    isUpcoming(mw) {
        const now = new Date();
        const start = new Date(mw.startTime);
        return start > now && mw.status === 'scheduled';
    },
    isPast(mw) {
        const now = new Date();
        const end = new Date(mw.endTime);
        return end < now;
    },
    add(data) {
        const windows = DB.get(DB.KEYS.MAINTENANCE_WINDOWS);
        const newWindow = {
            id: DB.generateId(),
            title: data.title,
            description: data.description || '',
            type: data.type || 'scheduled',
            status: 'scheduled',
            startTime: data.startTime,
            endTime: data.endTime,
            hostIds: data.hostIds || [],
            subnetIds: data.subnetIds || [],
            impact: data.impact || 'partial', 
            notifyBefore: data.notifyBefore || 24, 
            recurring: data.recurring || false,
            recurringPattern: data.recurringPattern || null, 
            notes: data.notes || '',
            createdAt: new Date().toISOString(),
            createdBy: data.createdBy || 'system'
        };
        windows.push(newWindow);
        DB.set(DB.KEYS.MAINTENANCE_WINDOWS, windows);
        AuditLog.log('create', 'maintenance', newWindow.id,
            `Created maintenance window: ${newWindow.title}`, null, newWindow);
        return { success: true, window: newWindow };
    },
    update(id, data) {
        const windows = DB.get(DB.KEYS.MAINTENANCE_WINDOWS);
        const index = windows.findIndex(mw => mw.id === id);
        if (index === -1) {
            return { success: false, message: 'Maintenance window not found' };
        }
        const oldWindow = { ...windows[index] };
        windows[index] = {
            ...windows[index],
            ...data,
            updatedAt: new Date().toISOString()
        };
        DB.set(DB.KEYS.MAINTENANCE_WINDOWS, windows);
        AuditLog.log('update', 'maintenance', id,
            `Updated maintenance window: ${windows[index].title}`, oldWindow, windows[index]);
        return { success: true, window: windows[index] };
    },
    updateStatus(id, status, notes = '') {
        const windows = DB.get(DB.KEYS.MAINTENANCE_WINDOWS);
        const index = windows.findIndex(mw => mw.id === id);
        if (index === -1) {
            return { success: false, message: 'Maintenance window not found' };
        }
        const oldStatus = windows[index].status;
        windows[index].status = status;
        windows[index].statusNotes = notes;
        windows[index].statusUpdatedAt = new Date().toISOString();
        if (status === 'completed') {
            windows[index].completedAt = new Date().toISOString();
        }
        DB.set(DB.KEYS.MAINTENANCE_WINDOWS, windows);
        AuditLog.log('update', 'maintenance', id,
            `Changed status from ${oldStatus} to ${status}`, { status: oldStatus }, { status });
        return { success: true };
    },
    delete(id) {
        const windows = DB.get(DB.KEYS.MAINTENANCE_WINDOWS);
        const window = windows.find(mw => mw.id === id);
        if (!window) {
            return { success: false, message: 'Maintenance window not found' };
        }
        const filtered = windows.filter(mw => mw.id !== id);
        DB.set(DB.KEYS.MAINTENANCE_WINDOWS, filtered);
        AuditLog.log('delete', 'maintenance', id,
            `Deleted maintenance window: ${window.title}`, window, null);
        return { success: true };
    },
    getCalendarEvents(startDate, endDate) {
        const all = this.getAll();
        return all.filter(mw => {
            const start = new Date(mw.startTime);
            const end = new Date(mw.endTime);
            return start <= endDate && end >= startDate;
        }).map(mw => ({
            id: mw.id,
            title: mw.title,
            start: mw.startTime,
            end: mw.endTime,
            type: mw.type,
            status: mw.status,
            color: MAINTENANCE_TYPES.find(t => t.id === mw.type)?.color || '#3b82f6'
        }));
    },
    _shiftByPattern(date, pattern) {
        const next = new Date(date);
        switch (pattern) {
            case 'daily':
                next.setDate(next.getDate() + 1);
                break;
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'biweekly':
                next.setDate(next.getDate() + 14);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
            case 'quarterly':
                next.setMonth(next.getMonth() + 3);
                break;
            case 'yearly':
                next.setFullYear(next.getFullYear() + 1);
                break;
            default:
                return null;
        }
        return next;
    }
};
