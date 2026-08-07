'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquareText,
  Paperclip,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';
import { ApprovalTimeline } from '@/components/approvals/approval-timeline';
import { BottomSheet, BottomSheetContent } from '@/components/employee/shared/bottom-sheet';
import { SkeletonCard } from '@/components/employee/shared/skeleton-card';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EmployeeLeaveRequest } from '@/types/employee';

const PAGE_SIZE = 6;

const statusStyle: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function LeaveHistoryList() {
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<EmployeeLeaveRequest | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['employee-leave-history', page],
    queryFn: () => employeeApi.getLeaveHistory({ page, limit: PAGE_SIZE }),
    staleTime: 5 * 60_000,
  });

  const { data: approvalDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['approval-detail', selectedRequest?.approval_request_id],
    queryFn: () => approvalsApi.getOne(selectedRequest!.approval_request_id!),
    enabled: !!selectedRequest?.approval_request_id,
  });

  const records = data?.data ?? [];
  const filteredRecords = useMemo(
    () => records.filter((record) => statusFilter === 'all' || record.status === statusFilter),
    [records, statusFilter],
  );
  const totalPages = Math.max(1, Math.ceil((data?.total ?? records.length) / PAGE_SIZE));

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} lines={3} />)}
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
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Filters
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
        </button>

        {filtersOpen && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}

        {filteredRecords.length > 0 ? (
          <div className="space-y-3">
            {filteredRecords.map((record) => (
              <LeaveRequestCard key={record.id} request={record} onSelect={() => setSelectedRequest(record)} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            <EmptyState title="No matching requests" subtitle="Try a different status filter." className="py-10" />
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-2 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1 || isFetching}
            className="min-h-11"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Newer
          </Button>
          <p className="text-xs font-medium text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages || isFetching}
            className="min-h-11"
          >
            Older
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <BottomSheet open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <BottomSheetContent title="Leave Details" className="max-md:max-h-[96dvh]">
          {selectedRequest && (
            <div className="space-y-4 px-5 pb-8">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{selectedRequest.leave_type_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(parseISO(selectedRequest.start_date), 'd MMM')} - {format(parseISO(selectedRequest.end_date), 'd MMM yyyy')}
                    </p>
                  </div>
                  <StatusBadge status={selectedRequest.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <DetailStat label="Duration" value={`${selectedRequest.days} ${selectedRequest.days === 1 ? 'day' : 'days'}`} />
                  <DetailStat label="Applied" value={format(parseISO(selectedRequest.created_at), 'd MMM yyyy')} />
                </div>
              </div>

              <DetailSection icon={<MessageSquareText className="h-4 w-4" />} title="Reason">
                <p className="text-sm text-foreground">{selectedRequest.reason || 'No reason provided.'}</p>
              </DetailSection>

              <DetailSection icon={<UserCheck className="h-4 w-4" />} title="Approver">
                {loadingDetail ? (
                  <div className="h-5 w-36 animate-pulse rounded bg-muted" />
                ) : approvalDetail?.approval_log?.length ? (
                  <div className="space-y-2">
                    {approvalDetail.approval_log.map((entry) => (
                      <p key={`${entry.step}-${entry.timestamp}`} className="text-sm text-foreground">
                        Step {entry.step}
                        {entry.role ? ` - ${entry.role}` : ''}
                        <span className="text-muted-foreground"> - {entry.action}</span>
                      </p>
                    ))}
                  </div>
                ) : approvalDetail ? (
                  <p className="text-sm text-muted-foreground">Awaiting step {approvalDetail.current_step} approval.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Approval details are not available yet.</p>
                )}
              </DetailSection>

              <DetailSection icon={<FileText className="h-4 w-4" />} title="Approval Timeline">
                {loadingDetail ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-muted" />)}
                  </div>
                ) : approvalDetail ? (
                  <ApprovalTimeline request={approvalDetail} />
                ) : (
                  <p className="text-sm text-muted-foreground">Timeline is available after approval routing starts.</p>
                )}
              </DetailSection>

              <DetailSection icon={<MessageSquareText className="h-4 w-4" />} title="Comments">
                {approvalDetail?.approval_log?.some((entry) => entry.remarks || entry.reason) ? (
                  <div className="space-y-3">
                    {approvalDetail.approval_log
                      .filter((entry) => entry.remarks || entry.reason)
                      .map((entry) => (
                        <div key={`${entry.step}-${entry.timestamp}`} className="rounded-xl bg-muted/40 p-3">
                          <p className="text-sm text-foreground">{entry.remarks || entry.reason}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Step {entry.step} - {formatDistanceToNow(parseISO(entry.timestamp), { addSuffix: true })}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}
              </DetailSection>

              <DetailSection icon={<Paperclip className="h-4 w-4" />} title="Attachments">
                <p className="text-sm text-muted-foreground">No attachments added.</p>
              </DetailSection>
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}

function LeaveRequestCard({ request, onSelect }: { request: EmployeeLeaveRequest; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{request.leave_type_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {format(parseISO(request.start_date), 'd MMM')} - {format(parseISO(request.end_date), 'd MMM yyyy')}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailStat label="Duration" value={`${request.days} ${request.days === 1 ? 'day' : 'days'}`} />
        <DetailStat label="Applied" value={format(parseISO(request.created_at), 'd MMM yyyy')} />
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyle[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };

  return (
    <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', style.className)}>
      {style.label}
    </span>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DetailSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </section>
  );
}
