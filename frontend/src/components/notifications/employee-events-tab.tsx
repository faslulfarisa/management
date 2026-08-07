'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { DataSection } from './data-section';

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString() : '—';
}

export function EmployeeEventsTab() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-employee-events'],
    queryFn: () => notificationsApi.getEmployeeEvents(),
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
        title="New Joiners (last 30 days)"
        rows={d.new_joiners}
        emptyMessage="No new joiners in the last 30 days"
        rowKey={(r) => r.employee_id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'date', label: 'Date of Joining', render: (r) => fmtDate(r.date_of_joining) },
        ]}
      />

      <DataSection
        title="Probation Ending (next 14 days)"
        rows={d.probation_ending}
        emptyMessage="No probations ending soon"
        rowKey={(r) => r.employee_id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'date', label: 'Probation End', render: (r) => fmtDate(r.probation_end_date) },
        ]}
      />

      <DataSection
        title="Confirmed (last 30 days)"
        rows={d.confirmed}
        emptyMessage="No confirmations in the last 30 days"
        rowKey={(r) => r.employee_id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'date', label: 'Confirmation Date', render: (r) => fmtDate(r.confirmation_date) },
        ]}
      />

      <DataSection
        title="Resignations (last 30 days)"
        rows={d.resignations}
        emptyMessage="No resignations in the last 30 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'status', label: 'Status', render: (r) => <span className="capitalize">{r.status}</span> },
          { key: 'last_day', label: 'Last Working Day', render: (r) => fmtDate(r.last_working_date) },
        ]}
      />

      <DataSection
        title="Retired"
        rows={d.retired}
        emptyMessage="No retirements in the last 30 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.changed_at) },
        ]}
      />

      <DataSection
        title="Other Status Changes"
        rows={d.status_changes}
        emptyMessage="No other status changes in the last 30 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'change', label: 'Change', render: (r) => <span className="capitalize text-muted-foreground">{r.previous_status} → {r.new_status}</span> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.changed_at) },
        ]}
      />

      <DataSection
        title="Transfers (last 30 days)"
        rows={d.transfers}
        emptyMessage="No branch transfers in the last 30 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'route', label: 'Transfer', render: (r) => <span className="text-muted-foreground">{r.from_branch_name ?? '—'} → {r.to_branch_name ?? '—'}</span> },
          { key: 'status', label: 'Status', render: (r) => <span className="capitalize">{r.status}</span> },
          { key: 'effective', label: 'Effective Date', render: (r) => fmtDate(r.effective_date) },
        ]}
      />
    </div>
  );
}
