'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart2, Users, DollarSign, Wallet, CalendarDays,
  Clock, Fingerprint, GitBranch, ShieldCheck, Bookmark,
  LayoutDashboard, ChevronRight, UserCheck, UserX, AlertCircle, Timer, Award, Briefcase,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS, type Permission } from '@/lib/permissions';

interface Snapshot {
  workforce?: { total: number; active: number };
  today_attendance?: { present: number; absent: number; late: number };
}

const CATEGORIES: Array<{
  title: string;
  desc: string;
  href: string;
  icon: React.ElementType;
  color: string;
  count: number | string;
  tags: string[];
  permission: Permission;
}> = [
    {
      title: 'Analytics Dashboard',
      desc: 'Real-time operational KPIs, live attendance, branch comparison, and 7-day trends.',
      href: '/dashboard/reports/analytics',
      icon: LayoutDashboard,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
      count: 'Live',
      tags: ['Workforce KPIs', 'Branch Comparison', 'Live Punches', 'Trend Charts'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Attendance',
      desc: 'Daily, monthly matrix, punch logs, late arrivals, overtime, absenteeism, and more.',
      href: '/dashboard/reports/attendance',
      icon: BarChart2,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
      count: 14,
      tags: ['Daily Summary', 'Monthly Matrix', 'Punch Logs', 'Overtime', 'Late Arrivals'],
      permission: PERMISSIONS.REPORTS_ATTENDANCE,
    },
    {
      title: 'Employee',
      desc: 'Directory, headcount, joining & resignation trends, transfers, fines, and tenure.',
      href: '/dashboard/reports/employee',
      icon: Users,
      color: 'bg-violet-50 border-violet-200 text-violet-700',
      count: 10,
      tags: ['Headcount', 'Directory', 'Transfer History', 'Tenure Analysis', 'Fine Deductions'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Payroll',
      desc: 'Salary sheets, payslips, overtime cost, deduction analysis, and payroll audit.',
      href: '/dashboard/reports/payroll',
      icon: DollarSign,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      count: 7,
      tags: ['Salary Sheet', 'Payslip Detail', 'OT Cost', 'Deductions', 'Payroll Audit'],
      permission: PERMISSIONS.REPORTS_PAYROLL,
    },
    {
      title: 'Leave',
      desc: 'Leave balances, utilization, approval status, calendar view, and department analytics.',
      href: '/dashboard/reports/leave',
      icon: CalendarDays,
      color: 'bg-orange-50 border-orange-200 text-orange-700',
      count: 6,
      tags: ['Balance Report', 'Utilization', 'Approval Status', 'Calendar', 'Branch Analytics'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Shift & Rota',
      desc: 'Shift allocations, coverage, changes, overnight shifts, and overtime analysis.',
      href: '/dashboard/reports/shift',
      icon: Clock,
      color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
      count: 5,
      tags: ['Allocation', 'Coverage', 'Shift Changes', 'Overnight Shifts', 'OT Shifts'],
      permission: PERMISSIONS.REPORTS_ATTENDANCE,
    },
    {
      title: 'Biometrics',
      desc: 'Device activity, verification breakdown, punch timeline, and duplicate detection.',
      href: '/dashboard/reports/biometrics',
      icon: Fingerprint,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
      count: 5,
      tags: ['Device Activity', 'Verification', 'Punch Timeline', 'Duplicate Punches', 'Device Registry'],
      permission: PERMISSIONS.REPORTS_ATTENDANCE,
    },
    {
      title: 'Branch',
      desc: 'Cross-branch comparison: attendance, payroll, workforce, overtime, and leave KPIs.',
      href: '/dashboard/reports/branch',
      icon: GitBranch,
      color: 'bg-teal-50 border-teal-200 text-teal-700',
      count: 6,
      tags: ['Attendance', 'Payroll Cost', 'Workforce', 'OT Comparison', 'Operational KPIs'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Performance',
      desc: 'Attendance behaviour scores, department/branch rankings, employee and review cycle rollups.',
      href: '/dashboard/reports/performance',
      icon: Award,
      color: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
      count: 5,
      tags: ['Attendance Behaviour', 'Department Ranking', 'Branch Ranking', 'Employee Scores', 'Review Cycles'],
      permission: PERMISSIONS.PERFORMANCE_EXPORT,
    },
    {
      title: 'Recruitment',
      desc: 'Recruiter & source performance, hiring cost, time-to-hire, offer acceptance, and joining ratio.',
      href: '/dashboard/reports/recruitment',
      icon: Briefcase,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
      count: 7,
      tags: ['Recruiter Performance', 'Source Performance', 'Hiring Cost', 'Time to Hire', 'Offer Acceptance'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Finance',
      desc: 'Expense breakdown, reimbursements, budget vs actual, invoice aging, and cost analysis.',
      href: '/dashboard/reports/finance',
      icon: Wallet,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      count: 6,
      tags: ['Expense Breakdown', 'Invoice Aging', 'Budget vs Actual', 'Reimbursements', 'Payroll Cost'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
    {
      title: 'Compliance',
      desc: 'Attendance regularization rates, correction audit, overtime compliance, and data quality.',
      href: '/dashboard/reports/compliance',
      icon: ShieldCheck,
      color: 'bg-slate-50 border-slate-200 text-slate-700',
      count: 4,
      tags: ['Regularization Rate', 'Correction Audit', 'OT Compliance', 'Punch Quality'],
      permission: PERMISSIONS.REPORTS_VIEW,
    },
  ];

function StatChip({ icon: Icon, label, value, colorCls }: { icon: React.ElementType; label: string; value?: number | string; colorCls: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border', colorCls)}>
      <Icon className="w-4 h-4 shrink-0" />
      <div>
        <p className="text-xs leading-none opacity-70">{label}</p>
        <p className="text-sm font-bold tabular-nums leading-tight mt-0.5">
          {value == null ? <span className="inline-block w-8 h-3 bg-current opacity-20 rounded animate-pulse" /> : value}
        </p>
      </div>
    </div>
  );
}

export default function ReportsHomePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const permissions = useAuthStore((s) => s.permissions);
  const categories = useMemo(
    () => CATEGORIES.filter((c) => permissions.includes(c.permission)),
    [permissions],
  );

  useEffect(() => {
    api.get('/reports/analytics/snapshot').then(r => setSnap(r.data)).catch(() => { });
  }, []);

  const att = snap?.today_attendance;
  const wf = snap?.workforce;

  return (
    <div className="space-y-6">
      {/* Operational snapshot bar */}
      <div className="bg-white border border-border rounded-2xl px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Today&apos;s Operational Snapshot</p>
        <div className="flex flex-wrap gap-2">
          <StatChip icon={Users} label="Workforce" value={wf?.total} colorCls="bg-blue-50 border-blue-200 text-blue-800" />
          <StatChip icon={UserCheck} label="Present" value={att?.present} colorCls="bg-green-50 border-green-200 text-green-800" />
          <StatChip icon={UserX} label="Absent" value={att?.absent} colorCls="bg-red-50 border-red-200 text-red-800" />
          <StatChip icon={AlertCircle} label="Late" value={att?.late} colorCls="bg-amber-50 border-amber-200 text-amber-800" />
          <StatChip icon={Timer} label="On Leave" value={wf?.active != null && wf.total != null ? wf.total - wf.active : undefined} colorCls="bg-purple-50 border-purple-200 text-purple-800" />
        </div>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {categories.map(({ title, desc, href, icon: Icon, color, count, tags }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-border rounded-2xl p-5 hover:shadow-md transition-all hover:border-primary/30 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{title}</p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {typeof count === 'number' ? `${count} reports` : count}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{desc}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 bg-muted/60 text-muted-foreground rounded-md">{t}</span>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Open reports <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
