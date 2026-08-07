'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { approvalsApi, ApprovalRequest } from '@/lib/approvals-api';
import { RequestDetailSheet } from './request-detail-sheet';
import { SkeletonRow } from '@/components/employee/shared/skeleton-card';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { cn } from '@/lib/utils';

const statusStyle: Record<string, { label: string; bg: string; text: string }> = {
  pending:            { label: 'Pending',         bg: 'bg-amber-50',   text: 'text-amber-700'   },
  under_review:       { label: 'Under Review',    bg: 'bg-blue-50',    text: 'text-blue-700'    },
  approved:           { label: 'Approved',        bg: 'bg-emerald-50', text: 'text-emerald-700' },
  partially_approved: { label: 'Part. Approved',  bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected:           { label: 'Rejected',        bg: 'bg-red-50',     text: 'text-red-700'     },
  cancelled:          { label: 'Cancelled',       bg: 'bg-slate-100',  text: 'text-slate-600'   },
  expired:            { label: 'Expired',         bg: 'bg-slate-100',  text: 'text-slate-500'   },
  escalated:          { label: 'Escalated',       bg: 'bg-orange-50',  text: 'text-orange-700'  },
};

const typeLabel: Record<string, string> = {
  leave_request:       'Leave',
  attendance_correction: 'Attendance Fix',
  shift_change:        'Shift Change',
  shift_override:      'Shift Override',
  overtime:            'Overtime',
  expense:             'Expense',
  fine_appeal:         'Fine Appeal',
};

export function RequestList() {
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-submitted-requests'],
    queryFn: () => approvalsApi.getSubmitted({ limit: 30 }),
    staleTime: 60_000,
  });

  const requests = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {[1, 2, 3, 4].map((i) => <div key={i} className="px-4"><SkeletonRow /></div>)}
      </div>
    );
  }

  if (!requests.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No requests yet"
          subtitle="Use the options above to submit a request."
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {requests.map((r) => {
          const s = statusStyle[r.status] ?? { label: r.status, bg: 'bg-muted', text: 'text-muted-foreground' };
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {typeLabel[r.workflow_type] ?? r.workflow_type}
                  <span className="mx-1">·</span>
                  {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                </p>
              </div>
              <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap', s.bg, s.text)}>
                {s.label}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
      </div>

      <RequestDetailSheet
        request={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
