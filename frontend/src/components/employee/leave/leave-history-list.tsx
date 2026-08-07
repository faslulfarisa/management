'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';
import { SkeletonRow } from '@/components/employee/shared/skeleton-card';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusStyle: Record<string, { label: string; bg: string; text: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-50',   text: 'text-amber-700'   },
  approved:  { label: 'Approved',  bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected:  { label: 'Rejected',  bg: 'bg-red-50',     text: 'text-red-700'     },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100',  text: 'text-slate-600'   },
};

export function LeaveHistoryList() {
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employee-leave-history'],
    queryFn: () => employeeApi.getLeaveHistory({ limit: 20 }),
    staleTime: 5 * 60_000,
  });

  const { data: approvalDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['approval-detail', selectedApprovalId],
    queryFn: () => approvalsApi.getOne(selectedApprovalId!),
    enabled: !!selectedApprovalId,
  });

  const records = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {[1, 2, 3].map((i) => <div key={i} className="px-4"><SkeletonRow /></div>)}
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No leave requests"
          subtitle="Your leave history will appear here."
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {records.map((r) => {
          const s = statusStyle[r.status] ?? { label: r.status, bg: 'bg-muted', text: 'text-muted-foreground' };
          return (
            <button
              key={r.id}
              onClick={() => r.approval_request_id && setSelectedApprovalId(r.approval_request_id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{r.leave_type_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(r.start_date), 'd MMM')} – {format(parseISO(r.end_date), 'd MMM yyyy')}
                  <span className="mx-1">·</span>
                  {r.days} {r.days === 1 ? 'day' : 'days'}
                </p>
              </div>
              <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0', s.bg, s.text)}>
                {s.label}
              </span>
              {r.approval_request_id && (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Approval timeline sheet */}
      <BottomSheet open={!!selectedApprovalId} onOpenChange={(v) => !v && setSelectedApprovalId(null)}>
        <BottomSheetContent title="Approval Status">
          <div className="px-5 pb-8">
            {loadingDetail ? (
              <div className="space-y-3 py-4">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : approvalDetail ? (
              <ApprovalTimeline request={approvalDetail} />
            ) : (
              <p className="text-sm text-muted-foreground py-4">Unable to load approval details.</p>
            )}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
