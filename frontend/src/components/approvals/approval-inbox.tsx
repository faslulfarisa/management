'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi, ApprovalRequest, InboxFilters } from '@/lib/approvals-api';
import { ApprovalReasonModal } from './approval-reason-modal';
import { ShiftOverrideApprovalModal } from './shift-override-approval-modal';
import { ApprovalTimeline } from './approval-timeline';
import { ApprovalChainViz } from './approval-chain-viz';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight,
  RefreshCw, Loader2, Search, X, Filter,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  pending:            'bg-amber-50 text-amber-700 border-amber-200',
  under_review:       'bg-blue-50 text-blue-700 border-blue-200',
  approved:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_approved: 'bg-teal-50 text-teal-700 border-teal-200',
  rejected:           'bg-red-50 text-red-700 border-red-200',
  escalated:          'bg-orange-50 text-orange-700 border-orange-200',
  cancelled:          'bg-slate-100 text-slate-600 border-slate-200',
  expired:            'bg-slate-100 text-slate-500 border-slate-200',
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    'text-slate-400',
  normal: 'text-slate-500',
  high:   'text-amber-600',
  urgent: 'text-red-600',
};

function wfLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ApprovalRowProps {
  request: ApprovalRequest;
  onExpand: (id: string) => void;
  expanded: boolean;
  onApprove: (r: ApprovalRequest) => void;
  onReject: (r: ApprovalRequest) => void;
  onCancel: (r: ApprovalRequest) => void;
  isSubmitted: boolean;
}

function ApprovalRow({ request, onExpand, expanded, onApprove, onReject, onCancel, isSubmitted }: ApprovalRowProps) {
  const isPending = ['pending', 'under_review', 'escalated'].includes(request.status);
  const canApprove = useCan(PERMISSIONS.APPROVALS_APPROVE);
  const canReject = useCan(PERMISSIONS.APPROVALS_REJECT);

  return (
    <div className={`border border-border rounded-xl overflow-hidden transition-all ${expanded ? 'shadow-md' : 'hover:shadow-sm'}`}>
      {/* Summary row */}
      <button
        onClick={() => onExpand(request.id)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 bg-white hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[request.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {request.status.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
              {wfLabel(request.workflow_type)}
            </span>
            {request.priority !== 'normal' && (
              <span className={`text-xs font-semibold uppercase ${PRIORITY_STYLES[request.priority]}`}>
                {request.priority}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 mt-1 truncate">{request.title}</p>
          {request.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{request.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span>Step {request.current_step}{request.total_steps ? `/${request.total_steps}` : ''}</span>
            {request.branch_name && <span>· {request.branch_name}</span>}
            {request.due_at && (
              <span className={new Date(request.due_at) < new Date() ? 'text-red-500' : ''}>
                · due {formatDistanceToNow(parseISO(request.due_at), { addSuffix: true })}
              </span>
            )}
            <span>· {formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}</span>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5 space-y-5">
          {/* Chain visualization */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Approval Chain</p>
            <ApprovalChainViz request={request} />
          </div>

          {/* Timeline */}
          {request.approval_log.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">History</p>
              <ApprovalTimeline request={request} />
            </div>
          )}

          {/* Rejection reason */}
          {request.rejection_reason && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-xs font-medium text-red-700">Rejection reason</p>
              <p className="text-sm text-red-600 mt-0.5">{request.rejection_reason}</p>
            </div>
          )}

          {/* Actions */}
          {!isSubmitted && isPending && (canApprove || canReject) && (
            <div className="flex gap-2 pt-1">
              {canApprove && (
                <button
                  onClick={() => onApprove(request)}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  Approve
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => onReject(request)}
                  className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Reject
                </button>
              )}
            </div>
          )}
          {isSubmitted && isPending && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onCancel(request)}
                className="px-4 py-2 text-sm font-medium border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors"
              >
                Cancel Request
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

interface ApprovalInboxProps {
  mode: 'inbox' | 'submitted' | 'history';
}

export function ApprovalInbox({ mode }: ApprovalInboxProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<InboxFilters>({ page: 1, limit: 20 });
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState<{
    open: boolean;
    action: 'approve' | 'reject' | 'cancel';
    request: ApprovalRequest | null;
  }>({ open: false, action: 'approve', request: null });

  const queryKey = mode === 'inbox' 
    ? ['approvals-inbox', filters] 
    : mode === 'submitted' 
      ? ['approvals-submitted', filters]
      : ['approvals-history', filters];

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey,
    queryFn: () => mode === 'inbox'
      ? approvalsApi.getInbox(filters)
      : mode === 'submitted'
        ? approvalsApi.getSubmitted(filters)
        : approvalsApi.getHistory(filters),
  });

  const requests = data?.data ?? [];
  const total = data?.total ?? 0;

  const handleConfirm = async (reason: string, remarks?: string) => {
    const { action, request } = modal;
    if (!request) return;
    if (action === 'approve') await approvalsApi.approve(request.id, reason, remarks);
    else if (action === 'reject') await approvalsApi.reject(request.id, reason);
    else await approvalsApi.cancel(request.id, reason);

    queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
    queryClient.invalidateQueries({ queryKey: ['approvals-submitted'] });
    queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
    setExpandedId(null);
  };

  const openModal = (action: 'approve' | 'reject' | 'cancel', request: ApprovalRequest) => {
    setModal({ open: true, action, request });
  };

  const closeModal = () => setModal((m) => ({ ...m, open: false, request: null }));

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        <select
          value={filters.workflow_type ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, workflow_type: e.target.value || undefined, page: 1 }))}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">All workflows</option>
          <option value="leave">Leave</option>
          <option value="leave_encashment">Leave Encashment</option>
          <option value="overtime">Overtime</option>
          <option value="expense">Expense</option>
          <option value="reimbursement">Reimbursement</option>
          <option value="attendance_correction">Attendance Correction</option>
          <option value="transfer">Transfer</option>
          <option value="payroll">Payroll</option>
          <option value="payroll_payment">Payroll Payment</option>
          <option value="shift_change">Shift Change</option>
          <option value="shift_override">Shift Override</option>
          <option value="biometric_device">Biometric Device</option>
          <option value="exit_request">Exit Request</option>
          <option value="exit_clearance">Exit Clearance</option>
          <option value="ff_settlement">F&F Settlement</option>
          <option value="compliance_document">Compliance Document</option>
          <option value="vacancy_request">Vacancy Request</option>
          <option value="job_description">Job Description</option>
          <option value="offer">Offer</option>
          <option value="probation_confirmation">Probation Confirmation</option>
          <option value="workforce_plan">Workforce Plan</option>
          <option value="fine_deduction">Fine & Deduction</option>
          <option value="fine_appeal">Fine Appeal</option>
        </select>

        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined, page: 1 }))}
          className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under review</option>
          <option value="escalated">Escalated</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>

        <button
          onClick={() => refetch()}
          className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600"
        >
          {isRefetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <CheckCircle2 className="w-10 h-10 mb-3 text-slate-300" />
          <p className="text-sm font-medium">No requests found</p>
          <p className="text-xs mt-1">
            {mode === 'inbox' ? "You're all caught up." 
              : mode === 'submitted' ? 'No submitted requests.'
              : 'No approval history found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests
            .filter((r) => !search || r.title.toLowerCase().includes(search.toLowerCase()))
            .map((request) => (
              <ApprovalRow
                key={request.id}
                request={request}
                expanded={expandedId === request.id}
                onExpand={toggleExpand}
                onApprove={(r) => openModal('approve', r)}
                onReject={(r) => openModal('reject', r)}
                onCancel={(r) => openModal('cancel', r)}
                isSubmitted={mode === 'submitted'}
              />
            ))}
        </div>
      )}

      {/* Pagination */}
      {total > (filters.limit ?? 20) && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-slate-500">
            Showing {Math.min((filters.page! - 1) * filters.limit! + 1, total)}–{Math.min(filters.page! * filters.limit!, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              disabled={(filters.page ?? 1) * (filters.limit ?? 20) >= total}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Reason modal */}
      {modal.open && modal.request?.workflow_type === 'shift_override' && modal.action === 'approve' ? (
        <ShiftOverrideApprovalModal
          isOpen={modal.open}
          request={modal.request}
          onClose={closeModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['approvals-inbox'] });
            queryClient.invalidateQueries({ queryKey: ['approvals-submitted'] });
            queryClient.invalidateQueries({ queryKey: ['approvals-count'] });
            setExpandedId(null);
            closeModal();
          }}
        />
      ) : (
        <ApprovalReasonModal
          isOpen={modal.open}
          action={modal.action}
          requestTitle={modal.request?.title ?? ''}
          onConfirm={handleConfirm}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
