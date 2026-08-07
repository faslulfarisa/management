'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { DataSection } from './data-section';
import { PriorityBadge } from './shared';

export function PayrollAlertsTab() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-payroll-alerts'],
    queryFn: () => notificationsApi.getPayrollAlerts(),
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
        title="Missing Bank Details"
        rows={d.missing_bank_details}
        emptyMessage="Everyone has verified bank details"
        rowKey={(r) => r.employee_id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
        ]}
      />

      <DataSection
        title="Pending Payslip Generation"
        rows={d.pending_payslip_generation}
        emptyMessage="No draft payslips pending"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'period', label: 'Period', render: (r) => `${r.month}/${r.year}` },
          { key: 'status', label: 'Status', render: (r) => <span className="text-amber-600 font-medium capitalize">{r.status}</span> },
        ]}
      />

      <DataSection
        title="Payroll Approvals Pending"
        rows={d.payroll_approval_pending}
        emptyMessage="No payroll approvals pending"
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', label: 'Title', render: (r) => <span className="font-medium text-foreground">{r.title}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'priority', label: 'Priority', render: (r) => <PriorityBadge priority={r.priority === 'urgent' ? 'critical' : r.priority === 'normal' ? 'medium' : r.priority} /> },
          { key: 'created', label: 'Submitted', render: (r) => new Date(r.created_at).toLocaleString() },
        ]}
      />

      <DataSection
        title="Fine & Deduction Changes"
        rows={d.fine_deduction_changes}
        emptyMessage="No fine/deduction changes in the last 7 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'field', label: 'Field Changed', render: (r) => r.field_changed },
          { key: 'change', label: 'Change', render: (r) => <span className="text-muted-foreground">{r.old_value ?? '—'} → {r.new_value ?? '—'}</span> },
          { key: 'reason', label: 'Reason', render: (r) => r.change_reason ?? '—' },
          { key: 'created', label: 'Date', render: (r) => new Date(r.created_at).toLocaleDateString() },
        ]}
      />

      <DataSection
        title="Salary Structure Issues"
        rows={d.salary_structure_issues}
        emptyMessage="No salary structure issues detected"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />

      <DataSection
        title="Failed Payroll Processing"
        rows={d.failed_payroll_processing}
        emptyMessage="No failed payroll runs"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />
    </div>
  );
}
