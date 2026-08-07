import { VacancyStatus } from '@/lib/vacancies-api';

const STATUS_STYLES: Record<VacancyStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  open: 'bg-emerald-50 text-emerald-700',
  on_hold: 'bg-amber-50 text-amber-700',
  closed: 'bg-slate-100 text-slate-600',
  reopened: 'bg-blue-50 text-blue-700',
  archived: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<VacancyStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  open: 'Open',
  on_hold: 'On Hold',
  closed: 'Closed',
  reopened: 'Reopened',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
