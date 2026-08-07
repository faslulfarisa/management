'use client';

import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { EnrichedPayslipDetail } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { friendlyLabel } from '@/lib/payroll-derive';
import { getPayrollStatus } from '@/lib/payroll-status';
import { HelpTooltip } from './help-tooltip';
import { PayrollStatusChip } from './payroll-status-chip';

interface SalaryBreakdownProps {
  detail?: EnrichedPayslipDetail;
  isLoading: boolean;
}

function LineItemRow({ label, amount, tone }: { label: string; amount: number; tone: 'earning' | 'deduction' }) {
  const friendly = friendlyLabel(label);
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <p className="text-[13px] text-gray-600 truncate">{friendly}</p>
        <HelpTooltip label={label} />
      </div>
      <p className={cn('text-[13px] font-semibold tabular-nums shrink-0', tone === 'earning' ? 'text-gray-900' : 'text-red-600')}>
        {tone === 'deduction' && amount > 0 ? '−' : ''}{formatCurrency(amount)}
      </p>
    </div>
  );
}

export function SalaryBreakdown({ detail, isLoading }: SalaryBreakdownProps) {
  if (isLoading || !detail) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-gray-100 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 rounded bg-gray-50" />)}
        </div>
      </div>
    );
  }

  const status = getPayrollStatus(detail, detail.payment);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Salary Breakdown</p>
        <p className="text-[12px] text-gray-400 mt-0.5">{detail.period.period_label}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {/* Earnings */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Earnings</p>
          </div>
          <div className="divide-y divide-gray-50">
            {detail.earnings.map((e, i) => (
              <LineItemRow key={i} label={e.label} amount={e.amount} tone="earning" />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
            <p className="text-[13px] font-semibold text-gray-700">Gross Earnings</p>
            <p className="text-[13px] font-bold text-gray-900 tabular-nums">{formatCurrency(detail.totals.gross_salary)}</p>
          </div>
        </div>

        {/* Deductions */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deductions</p>
          </div>
          {detail.deductions.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No deductions this period</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {detail.deductions.map((d, i) => (
                <LineItemRow key={i} label={d.label} amount={d.amount} tone="deduction" />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
            <p className="text-[13px] font-semibold text-gray-700">Total Deductions</p>
            <p className="text-[13px] font-bold text-red-600 tabular-nums">
              {detail.totals.total_deductions > 0 ? '−' : ''}{formatCurrency(detail.totals.total_deductions)}
            </p>
          </div>
        </div>
      </div>

      {/* Final pay */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Final Pay</p>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {formatCurrency(detail.totals.gross_salary)} &minus; {formatCurrency(detail.totals.total_deductions)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900 tabular-nums">{formatCurrency(detail.totals.net_salary)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Net &amp; credited amount</p>
        </div>
        <PayrollStatusChip status={status} />
      </div>
    </div>
  );
}
