'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { notificationsApi } from '@/lib/notifications-api';
import { DataSection } from './data-section';

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString() : '—';
}

function daysUntil(v: string): number {
  return Math.round((new Date(v).getTime() - Date.now()) / 86_400_000);
}

export function DocumentsComplianceTab() {
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications-documents-compliance'],
    queryFn: () => notificationsApi.getDocumentsCompliance(),
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
        title="Expiring Documents (next 30 days)"
        rows={d.expiring_documents}
        emptyMessage="No documents expiring in the next 30 days"
        rowKey={(r) => r.id}
        columns={[
          { key: 'employee', label: 'Employee', render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span> },
          { key: 'branch', label: 'Branch', render: (r) => r.branch_name ?? '—' },
          { key: 'document', label: 'Document', render: (r) => r.document_type || r.name },
          {
            key: 'expires', label: 'Expires', render: (r) => {
              const days = daysUntil(r.expires_at);
              const cls = days <= 7 ? 'text-red-600 font-medium' : days <= 30 ? 'text-amber-600 font-medium' : 'text-muted-foreground';
              return <span className={cls}>{fmtDate(r.expires_at)} {days <= 0 ? '(today)' : `(in ${days}d)`}</span>;
            },
          },
        ]}
      />

      <DataSection
        title="Missing Documents"
        rows={d.missing_documents}
        emptyMessage="No missing-document tasks"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />

      <DataSection
        title="Contract Expiry"
        rows={d.contract_expiry}
        emptyMessage="No contract expiry data available"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />

      <DataSection
        title="Passport Expiry"
        rows={d.passport_expiry}
        emptyMessage="No passport expiry data available"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />

      <DataSection
        title="Visa Expiry"
        rows={d.visa_expiry}
        emptyMessage="No visa expiry data available"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />

      <DataSection
        title="Certification Expiry"
        rows={d.certification_expiry}
        emptyMessage="No certification expiry data available"
        rowKey={(r) => r.id}
        columns={[{ key: 'employee', label: 'Employee', render: (r) => r.employee_name }]}
      />
    </div>
  );
}
