'use client';

import { format, parseISO } from 'date-fns';
import { ApprovalRequest } from '@/lib/approvals-api';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';
import { ApprovalChainViz } from '@/components/approvals/approval-chain-viz';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';
import { cn } from '@/lib/utils';

interface RequestDetailSheetProps {
  request: ApprovalRequest | null;
  onClose: () => void;
}

const statusStyle: Record<string, { label: string; bg: string; text: string }> = {
  pending:            { label: 'Pending',      bg: 'bg-amber-50',   text: 'text-amber-700'   },
  under_review:       { label: 'Under Review', bg: 'bg-blue-50',    text: 'text-blue-700'    },
  approved:           { label: 'Approved',     bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected:           { label: 'Rejected',     bg: 'bg-red-50',     text: 'text-red-700'     },
  cancelled:          { label: 'Cancelled',    bg: 'bg-slate-100',  text: 'text-slate-600'   },
  escalated:          { label: 'Escalated',    bg: 'bg-orange-50',  text: 'text-orange-700'  },
};

export function RequestDetailSheet({ request, onClose }: RequestDetailSheetProps) {
  if (!request) return null;

  const s = statusStyle[request.status] ?? { label: request.status, bg: 'bg-muted', text: 'text-muted-foreground' };

  return (
    <BottomSheet open={!!request} onOpenChange={(v) => !v && onClose()}>
      <BottomSheetContent title="Request Details">
        <div className="px-5 pb-8 space-y-5">
          {/* Header info */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground leading-snug flex-1">{request.title}</p>
              <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0', s.bg, s.text)}>
                {s.label}
              </span>
            </div>
            {request.description && (
              <p className="text-xs text-muted-foreground">{request.description}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Submitted {format(parseISO(request.created_at), 'd MMM yyyy')}
            </p>
            {request.rejection_reason && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-xs font-medium text-red-700">Rejection reason</p>
                <p className="text-xs text-red-600 mt-0.5">{request.rejection_reason}</p>
              </div>
            )}
          </div>

          {/* Chain viz */}
          {request.total_steps && request.total_steps > 1 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval Chain</p>
              <ApprovalChainViz request={request} />
            </div>
          )}

          {/* Timeline */}
          {request.approval_log.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Activity</p>
              <ApprovalTimeline request={request} />
            </div>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
