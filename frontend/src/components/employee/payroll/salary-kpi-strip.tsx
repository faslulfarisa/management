'use client';

import { format } from 'date-fns';
import { TrendingUp, AlertCircle, Gift, CalendarClock, Banknote, MinusCircle } from 'lucide-react';
import type { EmployeePayslip, EnrichedPayslipDetail } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { getBonusAmount, getLeaveDeductionAmount, estimateNextPayDate } from '@/lib/payroll-derive';

interface SalaryKpiStripProps {
  latest?: EmployeePayslip;
  detail?: EnrichedPayslipDetail;
  payslips: EmployeePayslip[];
  isLoading: boolean;
}

interface Kpi {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

export function SalaryKpiStrip({ latest, detail, payslips, isLoading }: SalaryKpiStripProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!latest) return null;

  const grossSalary = detail?.totals.gross_salary ?? latest.gross_salary;
  const overtime = latest.overtime_amount ?? 0;
  const deductions = detail?.totals.total_deductions ?? latest.total_deductions;
  const bonus = getBonusAmount(detail, latest);
  const leaveDeduction = getLeaveDeductionAmount(detail, latest);
  const absentDays = detail?.attendance?.absent_days ?? 0;
  const nextPayDate = estimateNextPayDate(payslips);

  const kpis: Kpi[] = [
    {
      label: 'Gross Salary',
      value: formatCurrency(grossSalary),
      sub: 'Before deductions',
      icon: Banknote,
      iconClass: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Overtime Earnings',
      value: formatCurrency(overtime),
      sub: detail?.attendance?.overtime_hours
        ? `${Number(detail.attendance.overtime_hours).toFixed(1)}h approved`
        : overtime > 0 ? 'Approved this period' : 'None this period',
      icon: TrendingUp,
      iconClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Deductions & Fines',
      value: formatCurrency(deductions),
      sub: 'PF, ESI, tax & fines',
      icon: MinusCircle,
      iconClass: 'bg-red-50 text-red-600',
    },
    {
      label: 'Bonus / Incentives',
      value: formatCurrency(bonus),
      sub: bonus > 0 ? 'Included this period' : 'None this period',
      icon: Gift,
      iconClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Leave Impact',
      value: formatCurrency(leaveDeduction),
      sub: absentDays > 0 ? `${absentDays} absent day${absentDays === 1 ? '' : 's'}` : 'No leave deductions',
      icon: AlertCircle,
      iconClass: leaveDeduction > 0 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400',
    },
    {
      label: 'Next Salary Date',
      value: nextPayDate ? format(nextPayDate, 'd MMM') : 'TBA',
      sub: nextPayDate ? 'Estimated' : 'Awaiting first payout',
      icon: CalendarClock,
      iconClass: 'bg-violet-50 text-violet-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg mb-3', kpi.iconClass)}>
            <kpi.icon className="h-4 w-4" />
          </div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{kpi.label}</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{kpi.value}</p>
          {kpi.sub && <p className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  );
}
