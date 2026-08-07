'use client';

import { Wallet, ChevronRight, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { EmployeePayslip, EnrichedPayslipDetail } from '@/types/employee';
import { formatCurrency } from '@/lib/utils';
import { periodLabel } from '@/lib/payroll-derive';
import { getPayrollStatus } from '@/lib/payroll-status';
import { PayrollStatusChip } from './payroll-status-chip';

interface SalaryHeroCardProps {
  latest?: EmployeePayslip;
  detail?: EnrichedPayslipDetail;
  isLoading: boolean;
  onViewPayslip: () => void;
}

export function SalaryHeroCard({ latest, detail, isLoading, onViewPayslip }: SalaryHeroCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
        <div className="h-3 w-32 rounded bg-gray-100 mb-4" />
        <div className="h-9 w-48 rounded bg-gray-100 mb-2" />
        <div className="h-3 w-24 rounded bg-gray-100" />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-50">
          <Clock className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Your payroll is being set up</p>
          <p className="text-xs text-gray-400 mt-0.5">Your first payslip will appear here once it's processed.</p>
        </div>
      </div>
    );
  }

  const status = getPayrollStatus(latest, detail?.payment);
  const paidAt = latest.paid_at ?? detail?.payment?.paid_at ?? detail?.payment?.payment_date;

  return (
    <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl shadow-sm p-6 text-primary-foreground relative overflow-hidden">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-10 h-24 w-24 rounded-full bg-white/10" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
            {periodLabel(latest.month, latest.year)} &middot; Net Pay
          </p>
          <p className="text-3xl sm:text-4xl font-bold mt-1.5 tabular-nums">
            {formatCurrency(latest.net_salary)}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Wallet className="h-5 w-5" />
        </div>
      </div>

      <div className="relative flex items-center gap-2 mt-4">
        <PayrollStatusChip status={status} className="bg-white/15 text-white" />
        {status.key === 'paid' && paidAt && (
          <span className="text-[11px] text-primary-foreground/70">
            Credited {format(new Date(paidAt), 'd MMM yyyy')}
          </span>
        )}
      </div>

      <button
        onClick={onViewPayslip}
        className="relative mt-5 w-full flex items-center justify-between gap-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors px-4 py-3 text-sm font-semibold"
      >
        <span>View payslip details</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
