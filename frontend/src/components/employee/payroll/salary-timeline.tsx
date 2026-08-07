'use client';

import { FileText } from 'lucide-react';
import type { EmployeePayslip } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { periodLabel } from '@/lib/payroll-derive';
import { PayrollStatusChip } from './payroll-status-chip';

interface SalaryTimelineProps {
  payslips: EmployeePayslip[];
  isLoading: boolean;
  onSelect: (payslip: EmployeePayslip) => void;
}

/**
 * Monthly salary history — replaces the old admin-style ledger table with a
 * simple, scannable list of cards (period, net pay, status). Tapping a row
 * opens the friendly payslip viewer.
 */
export function SalaryTimeline({ payslips, isLoading, onSelect }: SalaryTimelineProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Salary History</p>
      </div>

      {isLoading ? (
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
              <div className="h-9 w-9 rounded-lg bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-2.5 w-16 rounded bg-gray-50" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : payslips.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No payslips yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {payslips.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-[11px] font-bold text-primary">{String(p.month).padStart(2, '0')}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">{periodLabel(p.month, p.year)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Net pay <span className={cn('font-medium text-gray-600')}>{formatCurrency(p.net_salary)}</span>
                </p>
              </div>
              <PayrollStatusChip payslip={p} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
