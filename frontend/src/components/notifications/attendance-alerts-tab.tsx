'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { DataSection } from './data-section';

function fmtTime(v: string | null) {
  return v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function fmtDateTime(v: string | null) {
  return v ? new Date(v).toLocaleString() : '—';
}

export function AttendanceAlertsTab() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-attendance-alerts'],
    queryFn: () => notificationsApi.getAttendanceAlerts(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = data?.data;
  if (!d) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground">
          {isRefetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <DataSection
        title="Late Arrivals"
        rows={d.late_arrivals}
        emptyMessage="No late arrivals today"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'clock_in', label: 'Clock In', render: (r) => fmtTime(r.clock_in) },
          { key: 'late', label: 'Late By', render: (r) => <span className="text-amber-600 font-medium">{r.late_minutes} min</span> },
        ]}
      />

      <DataSection
        title="Missing Punches"
        rows={d.missing_punches}
        emptyMessage="No missing punches today"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'clock_in', label: 'Clock In', render: (r) => fmtTime(r.clock_in) },
          { key: 'clock_out', label: 'Clock Out', render: (r) => fmtTime(r.clock_out) },
        ]}
      />

      <DataSection
        title="Absent"
        rows={d.absent}
        emptyMessage="No absences recorded today"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
        ]}
      />

      <DataSection
        title="Early Exits"
        rows={d.early_exits}
        emptyMessage="No early exit data available"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => r.employee_name },
        ]}
      />

      <DataSection
        title="Break Violations"
        rows={d.break_violations}
        emptyMessage="No break violations today"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'reason', label: 'Reason', render: (r) => r.reason_label ?? '—' },
          { key: 'overdue', label: 'Overdue By', render: (r) => <span className="text-amber-600 font-medium">{r.overdue_minutes} min</span> },
        ]}
      />

      <DataSection
        title="Biometric Sync Failures"
        rows={d.biometric_sync_failures}
        emptyMessage="No sync failures in the last 24 hours"
        rowKey={(r) => r.id}
        columns={[
          { key: 'provider', label: 'Provider', render: (r) => r.provider_name },
          { key: 'status', label: 'Status', render: (r) => <span className="text-red-600 font-medium capitalize">{r.status}</span> },
          { key: 'error', label: 'Error', render: (r) => <span className="text-muted-foreground truncate max-w-xs block">{r.error_summary ?? '—'}</span> },
          { key: 'started', label: 'Started', render: (r) => fmtDateTime(r.started_at) },
        ]}
      />
    </div>
  );
}
