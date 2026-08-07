'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { DataSection } from './data-section';

function fmtDateTime(v: string | null) {
  return v ? new Date(v).toLocaleString() : 'Never';
}

export function SystemAlertsTab() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-system-alerts'],
    queryFn: () => notificationsApi.getSystemAlerts(),
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
        title="Biometric Devices Offline"
        rows={d.biometric_devices_offline}
        emptyMessage="All biometric devices are online"
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', label: 'Device', render: (r) => <span className="font-medium text-foreground">{r.name || r.provider_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'provider', label: 'Provider', render: (r) => r.provider_name },
          { key: 'last_seen', label: 'Last Seen', render: (r) => <span className="text-red-600 font-medium">{fmtDateTime(r.last_seen_at)}</span> },
        ]}
      />

      <DataSection
        title="Sync Failures (last 24h)"
        rows={d.sync_failures}
        emptyMessage="No sync failures in the last 24 hours"
        rowKey={(r) => r.id}
        columns={[
          { key: 'provider', label: 'Provider', render: (r) => r.provider_name },
          { key: 'status', label: 'Status', render: (r) => <span className="text-red-600 font-medium capitalize">{r.status}</span> },
          { key: 'error', label: 'Error', render: (r) => <span className="text-muted-foreground truncate max-w-xs block">{r.error_summary ?? '—'}</span> },
          { key: 'started', label: 'Started', render: (r) => fmtDateTime(r.started_at) },
        ]}
      />

      <DataSection
        title="Branch Activation Restrictions"
        rows={d.branch_activation_restrictions}
        emptyMessage="No deactivated branches"
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', label: 'Branch', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
          { key: 'status', label: 'Status', render: (r) => <span className="text-red-600 font-medium capitalize">{r.status || (r.is_active ? 'active' : 'inactive')}</span> },
        ]}
      />

      <DataSection
        title="Integration Errors"
        rows={d.integration_errors}
        emptyMessage="No integration errors"
        rowKey={(r) => r.id}
        columns={[{ key: 'name', label: 'Integration', render: (r) => r.name }]}
      />

      <DataSection
        title="Email Delivery Failures"
        rows={d.email_failures}
        emptyMessage="No email delivery failures"
        rowKey={(r) => r.id}
        columns={[{ key: 'name', label: 'Recipient', render: (r) => r.name }]}
      />

      <DataSection
        title="SMS Delivery Failures"
        rows={d.sms_failures}
        emptyMessage="No SMS delivery failures"
        rowKey={(r) => r.id}
        columns={[{ key: 'name', label: 'Recipient', render: (r) => r.name }]}
      />

      <DataSection
        title="Queue Failures"
        rows={d.queue_failures}
        emptyMessage="No queue failures"
        rowKey={(r) => r.id}
        columns={[{ key: 'name', label: 'Queue', render: (r) => r.name }]}
      />

      <DataSection
        title="Payroll Processing Errors"
        rows={d.payroll_processing_errors}
        emptyMessage="No payroll processing errors"
        rowKey={(r) => r.id}
        columns={[{ key: 'name', label: 'Employee', render: (r) => r.employee_name }]}
      />
    </div>
  );
}
