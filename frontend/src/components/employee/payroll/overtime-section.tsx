'use client';

import { format, parseISO } from 'date-fns';
import { Timer } from 'lucide-react';
import type { EnrichedPayslipDetail, MyOvertimeRequest, EmployeePayslip } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { shortMonth } from '@/lib/payroll-derive';

interface OvertimeSectionProps {
  latest?: EmployeePayslip;
  detail?: EnrichedPayslipDetail;
  otRequests: MyOvertimeRequest[];
}

const OT_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  under_review: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

/**
 * Overtime visibility for the employee: approved OT earnings/hours from the
 * latest payslip, plus their own pending/recent OT requests. Hidden entirely
 * if the employee has no OT activity at all.
 */
export function OvertimeSection({ latest, detail, otRequests }: OvertimeSectionProps) {
  const overtimeAmount = latest?.overtime_amount ?? 0;
  const overtimeHours = detail?.attendance?.overtime_hours ?? 0;
  const pendingRequests = otRequests.filter((r) => r.status === 'pending' || r.status === 'under_review');
  const recentRequests = otRequests.slice(0, 4);

  if (overtimeAmount <= 0 && overtimeHours <= 0 && otRequests.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Overtime</p>
        {pendingRequests.length > 0 && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {pendingRequests.length} pending
          </span>
        )}
      </div>

      {(overtimeAmount > 0 || overtimeHours > 0) && (
        <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Approved Hours</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{Number(overtimeHours).toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">OT Earnings</p>
            <p className="text-lg font-bold text-emerald-600 mt-0.5">{formatCurrency(overtimeAmount)}</p>
          </div>
        </div>
      )}

      {recentRequests.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {recentRequests.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <Timer className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-gray-700">
                  {format(parseISO(r.ot_date), 'd MMM yyyy')}
                </p>
                <p className="text-[11px] text-gray-400">
                  Requested {r.requested_hours}h
                  {r.approved_hours != null ? ` · Approved ${r.approved_hours}h` : ''}
                  {r.payroll_month && r.payroll_year ? ` · ${shortMonth(r.payroll_month)} ${r.payroll_year} payroll` : ''}
                </p>
              </div>
              <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 capitalize', OT_STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-500')}>
                {r.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-[12px] text-gray-400 text-center">No overtime requests yet</p>
      )}
    </div>
  );
}
