'use client';

import { AlertTriangle, CalendarOff } from 'lucide-react';
import type { EnrichedPayslipDetail } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { getLeaveDeductionAmount } from '@/lib/payroll-derive';

interface DeductionTransparencyProps {
  detail?: EnrichedPayslipDetail;
}

const CATEGORY_STYLE: Record<string, string> = {
  attendance: 'bg-orange-50 text-orange-600',
  late: 'bg-orange-50 text-orange-600',
  conduct: 'bg-red-50 text-red-600',
  leave: 'bg-amber-50 text-amber-600',
};

/**
 * Surfaces *why* money was deducted, in plain language — fines/penalties from
 * the payslip snapshot plus a derived note for leave/absence deductions.
 * Renders nothing if there's nothing extra to explain.
 */
export function DeductionTransparency({ detail }: DeductionTransparencyProps) {
  if (!detail) return null;

  const fines = detail.fines ?? [];
  const leaveDeduction = getLeaveDeductionAmount(detail);
  const absentDays = detail.attendance?.absent_days ?? 0;

  if (fines.length === 0 && leaveDeduction <= 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Why was I charged?</p>
      </div>
      <div className="divide-y divide-gray-50">
        {fines.map((f) => (
          <div key={f.id} className="flex items-start gap-3 px-5 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-gray-700">
                <span className="font-semibold text-red-600">{formatCurrency(f.amount)}</span> deducted &mdash; {f.title}
              </p>
              {f.description && (
                <p className="text-[12px] text-gray-400 mt-0.5">{f.description}</p>
              )}
              {f.category && (
                <span className={cn('inline-flex mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full', CATEGORY_STYLE[f.category.toLowerCase()] ?? 'bg-gray-100 text-gray-500')}>
                  {f.category}
                </span>
              )}
            </div>
          </div>
        ))}

        {leaveDeduction > 0 && (
          <div className="flex items-start gap-3 px-5 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <CalendarOff className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-gray-700">
                <span className="font-semibold text-amber-600">{formatCurrency(leaveDeduction)}</span> deducted for unpaid leave / absence
              </p>
              {absentDays > 0 && (
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {absentDays} day{absentDays === 1 ? '' : 's'} marked absent during this pay period
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
