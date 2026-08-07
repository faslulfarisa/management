'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  Fingerprint,
  RefreshCw,
  Shield,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';

function hasAny(granted: string[], required: string[]) {
  return required.some((permission) => granted.includes(permission));
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className="bg-white border border-border rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      </div>
      <p className="text-sm font-semibold text-foreground mt-3">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Tag>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground truncate">{label}</span>
      <span className="text-sm font-semibold text-foreground shrink-0 ml-3">{value}</span>
    </div>
  );
}

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
          <span className="h-3 w-32 rounded bg-muted animate-pulse" />
          <span className="h-3 w-10 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function BranchAdminDashboardPage() {
  const router = useRouter();
  const { permissions, accessScope, activeOrganization, userType } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [hrMetrics, setHrMetrics] = useState<any>(null);
  const [financeMetrics, setFinanceMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/summary');
      setOverview(data.data.overview);
      setHrMetrics(data.data.hr_metrics);
      setFinanceMetrics(data.data.finance_metrics);
    } catch (err) {
      console.error('Failed to fetch branch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const quickActions = useMemo(() => ([
    {
      label: 'Add Employee',
      href: '/branch-admin/hr/employees/new',
      icon: UserPlus,
      permissions: [PERMISSIONS.EMPLOYEES_CREATE],
    },
    {
      label: 'Review Leave',
      href: '/branch-admin/hr/leave',
      icon: CalendarDays,
      permissions: [PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_VIEW],
    },
    {
      label: 'Attendance Corrections',
      href: '/branch-admin/biometrics/corrections',
      icon: Fingerprint,
      permissions: [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_EDIT],
    },
    {
      label: 'Open Recruitment',
      href: '/branch-admin/hr/recruitment',
      icon: Briefcase,
      permissions: [PERMISSIONS.RECRUITMENT_VIEW],
    },
    {
      label: 'Payroll Status',
      href: '/branch-admin/hr/payroll',
      icon: Banknote,
      permissions: [PERMISSIONS.PAYROLL_VIEW],
    },
    {
      label: 'Branch Reports',
      href: '/branch-admin/reports',
      icon: FileText,
      permissions: [PERMISSIONS.REPORTS_VIEW],
    },
  ]).filter((action) => hasAny(permissions, action.permissions)), [permissions]);

  const initialLoading = loading && !overview && !hrMetrics && !financeMetrics;
  const branchCount = accessScope.isGlobalAccess ? 'All' : accessScope.branchIds.length;
  const pendingLeaves = overview?.leave_requests?.pending ?? 0;
  const pendingExpenses = financeMetrics?.pending_expenses?.count ?? 0;
  const metricValue = (value: string | number) => initialLoading ? '...' : value;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="sticky top-16 z-[1] -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-background/95 backdrop-blur border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Branch Dashboard</h1>
              <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md font-medium">
                <Shield className="w-3 h-3" />
                {userType === 'admin' ? 'Single Branch Admin' : 'Branch Admin'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeOrganization?.name || 'Organization'} branch operations, scoped to {branchCount} assigned {branchCount === 1 ? 'branch' : 'branches'}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-lg px-3 py-2 hover:bg-muted transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Total Employees"
          value={metricValue(overview?.total_employees ?? 0)}
          sub="Assigned branch scope"
          icon={Users}
          tone="bg-blue-500/10 text-blue-600"
          onClick={() => router.push('/branch-admin/hr/employees')}
        />
        <StatTile
          label="Present Today"
          value={metricValue(overview?.present_today ?? overview?.attendance_today?.present ?? 0)}
          sub={`of ${overview?.attendance_workforce_total ?? overview?.total_employees ?? 0} active workforce`}
          icon={CalendarCheck}
          tone="bg-emerald-500/10 text-emerald-600"
          onClick={() => router.push('/branch-admin/hr/employees?attendance=present_today')}
        />
        <StatTile
          label="Employees on Leave"
          value={metricValue(pendingLeaves)}
          sub="Pending requests"
          icon={CalendarDays}
          tone="bg-amber-500/10 text-amber-600"
          onClick={() => router.push('/branch-admin/hr/leave')}
        />
        <StatTile
          label="Pending Approvals"
          value={metricValue(pendingLeaves + pendingExpenses)}
          sub="Branch action queue"
          icon={CheckSquare}
          tone="bg-rose-500/10 text-rose-600"
          onClick={() => router.push('/branch-admin/approvals')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Absent Today"
          value={metricValue(overview?.absent_today ?? 0)}
          sub="No clock-in recorded"
          icon={AlertCircle}
          tone="bg-red-500/10 text-red-600"
          onClick={() => router.push('/branch-admin/hr/employees?attendance=absent_today')}
        />
        <StatTile
          label="Late Arrivals"
          value={metricValue(overview?.late_arrivals_today ?? 0)}
          sub="After shift start"
          icon={Activity}
          tone="bg-teal-500/10 text-teal-600"
          onClick={() => router.push('/branch-admin/hr/employees?attendance=late_today')}
        />
        <StatTile
          label="Payroll Status"
          value={metricValue(financeMetrics?.pending_expenses?.count ?? 0)}
          sub="Pending finance items"
          icon={Banknote}
          tone="bg-indigo-500/10 text-indigo-600"
          onClick={() => router.push('/branch-admin/hr/payroll')}
        />
        <StatTile
          label="Performance Watch"
          value={metricValue(hrMetrics?.upcoming_probation?.length ?? 0)}
          sub="Probation ending soon"
          icon={ClipboardList}
          tone="bg-cyan-500/10 text-cyan-700"
          onClick={() => router.push('/branch-admin/hr/performance')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Quick Actions">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.href}
                  onClick={() => router.push(action.href)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground flex-1">{action.label}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
              );
            })}
            {!quickActions.length && (
              <p className="text-sm text-muted-foreground py-4">No quick actions are enabled for your permissions.</p>
            )}
          </div>
        </Panel>

        <Panel title="Attendance Summary">
          {initialLoading ? <PanelSkeleton /> : Object.entries(overview?.attendance_today || {}).map(([status, count]) => (
            <Row key={status} label={status.replace(/_/g, ' ')} value={count as number} />
          ))}
          {!initialLoading && !Object.keys(overview?.attendance_today || {}).length && (
            <p className="text-sm text-muted-foreground py-4">No attendance has been recorded today.</p>
          )}
        </Panel>

        <Panel title="Branch Activity">
          {initialLoading ? <PanelSkeleton /> : (
            <>
              <Row label="Recent joiners" value={hrMetrics?.recent_joinees?.length ?? 0} />
              <Row label="Probation ending" value={hrMetrics?.upcoming_probation?.length ?? 0} />
              <Row label="Pending leave requests" value={pendingLeaves} />
              <Row label="Pending finance items" value={pendingExpenses} />
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Department Distribution">
          {initialLoading ? <PanelSkeleton /> : hrMetrics?.by_department?.map((department: any) => (
            <Row key={department.name || 'Unassigned'} label={department.name || 'Unassigned'} value={department.count} />
          ))}
          {!initialLoading && !hrMetrics?.by_department?.length && (
            <p className="text-sm text-muted-foreground py-4">No department data is available for your branch scope.</p>
          )}
        </Panel>

        <Panel title="Employee Status">
          {initialLoading ? <PanelSkeleton /> : hrMetrics?.by_status?.map((status: any) => (
            <Row key={status.status} label={String(status.status).replace(/_/g, ' ')} value={status.count} />
          ))}
          {!initialLoading && !hrMetrics?.by_status?.length && (
            <p className="text-sm text-muted-foreground py-4">No employee status data is available.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
