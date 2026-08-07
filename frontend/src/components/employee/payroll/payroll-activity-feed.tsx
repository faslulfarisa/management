'use client';

import { format } from 'date-fns';
import { FileCheck2, Wallet, Gift, AlertTriangle, TrendingUp } from 'lucide-react';
import type { EmployeePayslip } from '@/types/employee';
import { formatCurrency, cn } from '@/lib/utils';
import { periodLabel, PAYROLL_PATTERNS } from '@/lib/payroll-derive';

interface PayrollActivityFeedProps {
  payslips: EmployeePayslip[];
}

interface ActivityItem {
  id: string;
  date: Date;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}

/**
 * Client-derived "payroll activity" timeline (payslip generated, salary
 * credited, bonus added, overtime added, fine issued) computed from the
 * employee's payslip history — no dedicated notification types required.
 */
export function PayrollActivityFeed({ payslips }: PayrollActivityFeedProps) {
  const items: ActivityItem[] = [];

  for (const p of payslips) {
    const periodDate = new Date(p.year, p.month - 1, 1);

    if (p.status === 'processed' || p.status === 'paid') {
      items.push({
        id: `${p.id}-generated`,
        date: periodDate,
        title: 'Payslip Generated',
        subtitle: periodLabel(p.month, p.year),
        icon: FileCheck2,
        iconClass: 'bg-blue-50 text-blue-600',
      });
    }

    if (p.status === 'paid') {
      items.push({
        id: `${p.id}-credited`,
        date: p.paid_at ? new Date(p.paid_at) : periodDate,
        title: 'Salary Credited',
        subtitle: `${formatCurrency(p.net_salary)} for ${periodLabel(p.month, p.year)}`,
        icon: Wallet,
        iconClass: 'bg-emerald-50 text-emerald-600',
      });
    }

    if (p.overtime_amount > 0) {
      items.push({
        id: `${p.id}-overtime`,
        date: periodDate,
        title: 'Overtime Added',
        subtitle: `${formatCurrency(p.overtime_amount)} for ${periodLabel(p.month, p.year)}`,
        icon: TrendingUp,
        iconClass: 'bg-violet-50 text-violet-600',
      });
    }

    for (const c of p.components ?? []) {
      if (c.type === 'earning' && PAYROLL_PATTERNS.BONUS_PATTERN.test(c.label) && c.amount > 0) {
        items.push({
          id: `${p.id}-bonus-${c.label}`,
          date: periodDate,
          title: 'Bonus Added',
          subtitle: `${formatCurrency(c.amount)} (${c.label}) — ${periodLabel(p.month, p.year)}`,
          icon: Gift,
          iconClass: 'bg-amber-50 text-amber-600',
        });
      }
      if (c.type === 'deduction' && PAYROLL_PATTERNS.FINE_PATTERN.test(c.label) && c.amount > 0) {
        items.push({
          id: `${p.id}-fine-${c.label}`,
          date: periodDate,
          title: 'Fine Issued',
          subtitle: `${formatCurrency(c.amount)} (${c.label}) — ${periodLabel(p.month, p.year)}`,
          icon: AlertTriangle,
          iconClass: 'bg-red-50 text-red-600',
        });
      }
    }
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  const recent = items.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payroll Activity</p>
      </div>
      {recent.length === 0 ? (
        <p className="px-5 py-6 text-[12px] text-gray-400 text-center">No payroll activity yet</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {recent.map((item) => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3">
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.iconClass)}>
                <item.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800">{item.title}</p>
                {item.subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{item.subtitle}</p>}
              </div>
              <p className="text-[11px] text-gray-400 shrink-0">{format(item.date, 'd MMM')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
