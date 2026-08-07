'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
  Home,
  LogOut,
  Menu,
  MoreVertical,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { PERMISSIONS, type Permission } from '@/lib/permissions';
import { useAuthStore } from '@/store/auth.store';

const ADMIN_MOBILE_QUERY = '(max-width: 767px)';
const PAGE_SIZE = 25;

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'slate';
type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permissions?: Permission[];
};

const toneClasses: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-800 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Employees', href: '/dashboard/hr/employees', icon: Users, permissions: [PERMISSIONS.EMPLOYEES_VIEW] },
  { label: 'Attendance', href: '/dashboard/hr/attendance', icon: CalendarCheck, permissions: [PERMISSIONS.ATTENDANCE_VIEW] },
  { label: 'Leave', href: '/dashboard/hr/leave', icon: CalendarDays, permissions: [PERMISSIONS.LEAVE_VIEW] },
  { label: 'Payroll', href: '/dashboard/hr/payroll', icon: Banknote, permissions: [PERMISSIONS.PAYROLL_VIEW] },
  { label: 'Approvals', href: '/dashboard/approvals', icon: CheckSquare, permissions: [PERMISSIONS.APPROVALS_VIEW] },
  { label: 'Branches', href: '/dashboard/platform/branches', icon: Building2, permissions: [PERMISSIONS.BRANCH_VIEW] },
  { label: 'Users & Roles', href: '/dashboard/platform/users', icon: Shield, permissions: [PERMISSIONS.PLATFORM_USERS_VIEW] },
  { label: 'Reports', href: '/dashboard/reports', icon: BarChart3, permissions: [PERMISSIONS.REPORTS_VIEW] },
  { label: 'Settings', href: '/dashboard/system/settings', icon: Settings },
];

const branchNavItems: NavItem[] = adminNavItems
  .filter((item) => item.label !== 'Branches' && item.label !== 'Users & Roles' && item.label !== 'Settings')
  .map((item) => ({ ...item, href: item.href.replace(/^\/dashboard/, '/branch-admin') }));

function canSee(permissions: string[], required?: Permission[]) {
  if (!required?.length) return true;
  return required.some((permission) => permissions.includes(permission));
}

function portalize(href: string, isBranchPortal: boolean) {
  return isBranchPortal ? href.replace(/^\/dashboard/, '/branch-admin') : href.replace(/^\/branch-admin/, '/dashboard');
}

function normalizePath(pathname: string) {
  return pathname.replace(/^\/branch-admin/, '/dashboard');
}

function pathAfter(pathname: string, base: string) {
  const normalized = normalizePath(pathname);
  if (normalized === base) return '';
  return normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : null;
}

function firstPathPart(pathname: string, base: string) {
  const rest = pathAfter(pathname, base);
  return rest ? rest.split('/')[0] : null;
}

function titleForPath(pathname: string) {
  const normalized = normalizePath(pathname);
  if (normalized === '/dashboard') return pathname.startsWith('/branch-admin') ? 'Branch Admin' : 'Organization Admin';
  if (normalized.includes('/hr/employees')) return 'Employees';
  if (normalized.includes('/hr/attendance')) return 'Attendance';
  if (normalized.includes('/hr/leave')) return 'Leave';
  if (normalized.includes('/hr/payroll')) return 'Payroll';
  if (normalized.includes('/platform/branches')) return 'Branches';
  if (normalized.includes('/platform/users')) return 'Users & Roles';
  if (normalized.includes('/reports')) return 'Reports';
  if (normalized.includes('/system/settings') || normalized.includes('/settings/company-profile')) return 'Settings';
  if (normalized.includes('/approvals')) return 'Approvals';
  return 'Admin Portal';
}

function fmtMoney(value: number | string | undefined | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'INR 0';
  return `INR ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullName(item: any) {
  return [item?.first_name, item?.last_name].filter(Boolean).join(' ') || item?.employee_name || item?.name || item?.email || 'Unnamed';
}

export function useAdminMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(ADMIN_MOBILE_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function AdminMobileShell({ pathname }: { pathname: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const permissions = useAuthStore((state) => state.permissions);
  const activeOrganization = useAuthStore((state) => state.activeOrganization);
  const isBranchPortal = pathname.startsWith('/branch-admin');
  const navItems = (isBranchPortal ? branchNavItems : adminNavItems).filter((item) => canSee(permissions, item.permissions));
  const title = titleForPath(pathname);

  return (
    <div className="min-h-dvh bg-slate-50 text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">{title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {activeOrganization?.name || (isBranchPortal ? 'Branch workspace' : 'Organization workspace')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        className={cn('fixed inset-0 z-50 bg-black/40 transition-opacity', drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile admin navigation"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <p className="text-sm font-bold">{isBranchPortal ? 'Branch Admin' : 'Organization Admin'}</p>
            <p className="text-xs text-muted-foreground">Touch navigation</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  'mb-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium',
                  active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="px-4 pb-24 pt-20">
        <AdminMobileRoute pathname={pathname} />
      </main>
    </div>
  );
}

function AdminMobileRoute({ pathname }: { pathname: string }) {
  const normalized = normalizePath(pathname);
  const isBranchPortal = pathname.startsWith('/branch-admin');
  const employeeRoute = pathAfter(pathname, '/dashboard/hr/employees');
  const branchRoute = pathAfter(pathname, '/dashboard/platform/branches');
  const userRoute = pathAfter(pathname, '/dashboard/platform/users');
  const approvalId = firstPathPart(pathname, '/dashboard/approvals');

  if (normalized === '/dashboard') return <MobileDashboard isBranchPortal={isBranchPortal} />;
  if (employeeRoute === 'new') return <EmployeeFormMobile isBranchPortal={isBranchPortal} />;
  if (employeeRoute?.endsWith('/edit')) return <EmployeeFormMobile employeeId={employeeRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (employeeRoute) return <EmployeeDetailMobile employeeId={employeeRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (branchRoute === 'new') return <BranchFormMobile isBranchPortal={isBranchPortal} />;
  if (branchRoute?.endsWith('/edit')) return <BranchFormMobile branchId={branchRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (branchRoute) return <BranchDetailMobile branchId={branchRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (userRoute === 'new') return <UserFormMobile isBranchPortal={isBranchPortal} />;
  if (userRoute?.endsWith('/edit')) return <UserFormMobile userId={userRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (userRoute) return <UserDetailMobile userId={userRoute.split('/')[0]} isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/platform/branches')) return <BranchesMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/hr/employees')) return <EmployeesMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/hr/attendance')) return <AttendanceMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/hr/leave')) return <LeaveMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/hr/payroll')) return <PayrollMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/platform/users')) return <UsersMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/reports')) return <ReportsMobile isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/system/settings') || normalized.startsWith('/dashboard/settings/company-profile')) {
    return <SettingsMobile isBranchPortal={isBranchPortal} />;
  }
  if (approvalId) return <ApprovalDetailMobile approvalId={approvalId} isBranchPortal={isBranchPortal} />;
  if (normalized.startsWith('/dashboard/approvals')) return <ApprovalsMobile isBranchPortal={isBranchPortal} />;

  return <ModuleHubMobile isBranchPortal={isBranchPortal} />;
}

function ScreenHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-snug text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone, sub }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: Tone;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-sm font-semibold">{label}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="h-9 w-9 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const value = status || 'unknown';
  const isGood = ['active', 'present', 'approved', 'paid', 'confirmed'].includes(value);
  const isWarn = ['pending', 'probation', 'late', 'processing', 'draft'].includes(value);
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-1 text-[11px] font-semibold capitalize',
        isGood && 'bg-emerald-50 text-emerald-700',
        isWarn && 'bg-amber-50 text-amber-800',
        !isGood && !isWarn && 'bg-slate-100 text-slate-700',
      )}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function FloatingAction({ href, label, isBranchPortal }: { href: string; label: string; isBranchPortal: boolean }) {
  return (
    <Link
      href={portalize(href, isBranchPortal)}
      className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/25"
      aria-label={label}
    >
      <Plus className="h-6 w-6" />
    </Link>
  );
}

function SearchAndFilter({
  value,
  onChange,
  filterLabel = 'Filters',
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  filterLabel?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Search"
              className="h-12 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          {children && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white"
              aria-label={filterLabel}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      {children && (
        <BottomSheet open={open} title={filterLabel} onClose={() => setOpen(false)}>
          {children}
        </BottomSheet>
      )}
    </>
  );
}

function BottomSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className={cn('fixed inset-0 z-50 bg-black/40 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <section
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] rounded-t-2xl border border-border bg-white shadow-2xl transition-transform duration-200',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="flex justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-muted" />
        </div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </section>
    </>
  );
}

function OverflowActions({ actions }: { actions: Array<{ label: string; href?: string; onClick?: () => void }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white"
        aria-label="Open actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <BottomSheet open={open} title="Actions" onClose={() => setOpen(false)}>
        <div className="space-y-2">
          {actions.map((action) => {
            const content = <span className="text-sm font-medium">{action.label}</span>;
            if (action.href) {
              return (
                <Link key={action.label} href={action.href} className="flex min-h-12 items-center rounded-xl border border-border px-4">
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.onClick?.();
                  setOpen(false);
                }}
                className="flex min-h-12 w-full items-center rounded-xl border border-border px-4 text-left"
              >
                {content}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

function useApiData<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await load());
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load data');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}

function MobileDashboard({ isBranchPortal }: { isBranchPortal: boolean }) {
  const router = useRouter();
  const prefix = isBranchPortal ? '/branch-admin' : '/dashboard';
  const { data, loading, refresh } = useApiData(async () => {
    const [overviewRes, hrRes, financeRes] = await Promise.all([
      api.get('/dashboard/overview'),
      api.get('/dashboard/hr-metrics'),
      api.get('/dashboard/finance-metrics'),
    ]);
    return {
      overview: overviewRes.data.data,
      hr: hrRes.data.data,
      finance: financeRes.data.data,
    };
  }, []);

  if (loading) return <LoadingState />;
  const overview = data?.overview || {};
  const hr = data?.hr || {};
  const finance = data?.finance || {};
  const pendingLeaves = overview?.leave_requests?.pending ?? 0;
  const pendingExpenses = finance?.pending_expenses?.count ?? 0;
  const attendance = overview?.attendance_today || {};
  const presentToday = overview?.present_today ?? attendance?.present ?? 0;
  const attendanceWorkforceTotal = overview?.attendance_workforce_total ?? overview?.total_employees ?? 0;
  const activities = [
    ...(hr?.recent_joinees || []).slice(0, 2).map((person: any) => ({ label: fullName(person), sub: 'Recent joiner', icon: UserPlus })),
    ...(hr?.upcoming_probation || []).slice(0, 2).map((person: any) => ({ label: fullName(person), sub: 'Probation ending', icon: Clock })),
  ];

  return (
    <div className="space-y-4">
      <ScreenHeader
        title={isBranchPortal ? 'Branch Snapshot' : 'Admin Snapshot'}
        subtitle="Essential operations for today"
        action={(
          <button type="button" onClick={refresh} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      />

      <div className="grid gap-3">
        <MetricCard label="Total Employees" value={overview?.total_employees ?? 0} icon={Users} tone="blue" />
        <MetricCard label="Present Today" value={presentToday} icon={CalendarCheck} tone="green" sub={`of ${attendanceWorkforceTotal}`} />
        <MetricCard label="Pending Approvals" value={pendingLeaves + pendingExpenses} icon={CheckSquare} tone="amber" />
      </div>

      <Section title="Attendance Today">
        <div className="grid grid-cols-2 gap-3">
          <MetricTile label="Present" value={presentToday} />
          <MetricTile label="Absent" value={overview?.absent_today ?? 0} />
          <MetricTile label="Late" value={overview?.late_arrivals_today ?? 0} />
          <MetricTile label="Early Leave" value={overview?.early_leave_today ?? 0} />
        </div>
      </Section>

      <Section title="Quick Actions">
        <div className="grid grid-cols-2 gap-3">
          <QuickAction label="Add Employee" icon={UserPlus} href={`${prefix}/hr/employees/new`} />
          <QuickAction label="Review Leave" icon={CalendarDays} href={`${prefix}/hr/leave`} />
          <QuickAction label="Approvals" icon={CheckSquare} href={`${prefix}/approvals`} />
          <QuickAction label="Reports" icon={FileText} href={`${prefix}/reports`} />
        </div>
      </Section>

      <Section title="Employees on Leave">
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <div>
            <p className="text-2xl font-bold">{pendingLeaves}</p>
            <p className="text-xs text-muted-foreground">Pending leave requests</p>
          </div>
          <button type="button" onClick={() => router.push(`${prefix}/hr/leave`)} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
            Review
          </button>
        </div>
      </Section>

      <Section title="Recent Activities">
        {activities.length ? (
          <div className="space-y-2">
            {activities.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div key={`${activity.label}-${index}`} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{activity.label}</p>
                    <p className="text-xs text-muted-foreground">{activity.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <EmptyState label="No recent activity." />}
      </Section>

      <Section title="Notifications">
        <div className="space-y-2">
          <InfoRow label="Pending finance items" value={pendingExpenses} />
          <InfoRow label="Recent invoices" value={finance?.recent_invoices?.count ?? 0} />
          <InfoRow label="Pending expense value" value={fmtMoney(finance?.pending_expenses?.total)} />
        </div>
      </Section>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function QuickAction({ label, icon: Icon, href }: { label: string; icon: React.ElementType; href: string }) {
  return (
    <Link href={href} className="flex min-h-24 flex-col justify-between rounded-xl border border-border bg-muted/30 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

function BranchesMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const [search, setSearch] = useState('');
  const { data: branches, loading, refresh } = useApiData(async () => {
    const res = await api.get('/branches');
    return res.data.data || [];
  }, []);
  const visible = (branches || []).filter((branch: any) =>
    [branch.name, branch.code, branch.branch_code, branch.manager_name].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = (branches || []).filter((branch: any) => branch.status === 'active' || branch.is_active).length;

  return (
    <div className="space-y-4">
      <ScreenHeader title="Branches" subtitle="Branch summary and access scope" />
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Branches" value={branches?.length ?? 0} icon={Building2} tone="blue" />
        <MetricCard label="Active" value={activeCount} icon={UserCheck} tone="green" />
      </div>
      <SearchAndFilter value={search} onChange={setSearch}>
        <p className="text-sm text-muted-foreground">Branch filters will appear here as branch metadata grows.</p>
      </SearchAndFilter>
      {loading ? <LoadingState /> : (
        <div className="space-y-3">
          {visible.map((branch: any) => (
            <article key={branch.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{branch.name}</p>
                  <p className="text-xs text-muted-foreground">{branch.code || branch.branch_code || 'No branch code'}</p>
                </div>
                <OverflowActions actions={[
                  { label: 'View details', href: portalize(`/dashboard/platform/branches/${branch.id}`, isBranchPortal) },
                  { label: 'Edit branch', href: portalize(`/dashboard/platform/branches/${branch.id}/edit`, isBranchPortal) },
                  { label: 'Refresh list', onClick: refresh },
                ]} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <InfoBlock label="Manager" value={branch.manager_name || branch.manager || 'Unassigned'} />
                <InfoBlock label="Employees" value={branch.employee_count ?? branch.total_employees ?? 0} />
              </div>
              <div className="mt-3"><StatusPill status={branch.status || (branch.is_active ? 'active' : 'inactive')} /></div>
            </article>
          ))}
          {!visible.length && <EmptyState label="No branches found." />}
        </div>
      )}
      {!isBranchPortal && <FloatingAction href="/dashboard/platform/branches/new" label="Add branch" isBranchPortal={isBranchPortal} />}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function BackButton({ isBranchPortal, fallback }: { isBranchPortal: boolean; fallback: string }) {
  return (
    <Link
      href={portalize(fallback, isBranchPortal)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white"
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function MobileInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-12 w-full rounded-xl border border-border bg-white px-3 text-base outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground',
        props.className,
      )}
    />
  );
}

function MobileSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'h-12 w-full rounded-xl border border-border bg-white px-3 text-base outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-muted disabled:text-muted-foreground',
        props.className,
      )}
    />
  );
}

function MobileTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-28 w-full rounded-xl border border-border bg-white px-3 py-3 text-base outline-none focus:ring-2 focus:ring-primary/20',
        props.className,
      )}
    />
  );
}

function SaveBar({
  saving,
  label,
  onSave,
  disabled,
}: {
  saving: boolean;
  label: string;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function useSavingAction() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Action failed');
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, run };
}

function compactPayload<T extends Record<string, any>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== ''),
  );
}

function EmployeeDetailMobile({ employeeId, isBranchPortal }: { employeeId: string; isBranchPortal: boolean }) {
  const { data: employee, loading, refresh } = useApiData(async () => {
    const res = await api.get(`/employees/${employeeId}`);
    return res.data.data;
  }, [employeeId]);
  const { saving, error, run } = useSavingAction();

  if (loading) return <LoadingState />;
  if (!employee) return <EmptyState label="Employee not found." />;

  const updateStatus = (status: string) => run(async () => {
    await api.patch(`/employees/${employeeId}/status`, { status });
    await refresh();
  });

  return (
    <div className="space-y-4 pb-20">
      <ScreenHeader
        title={fullName(employee)}
        subtitle={employee.employee_code || 'Employee profile'}
        action={<BackButton isBranchPortal={isBranchPortal} fallback="/dashboard/hr/employees" />}
      />
      <ErrorBanner message={error} />
      <Section title="Profile">
        <div className="flex gap-3">
          <Avatar name={fullName(employee)} src={employee.photo_url || employee.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{fullName(employee)}</p>
            <p className="text-xs text-muted-foreground">{employee.personal_email || employee.email || 'No email'}</p>
            <div className="mt-2"><StatusPill status={employee.status} /></div>
          </div>
        </div>
      </Section>
      <Section title="Work Details">
        <div className="grid grid-cols-2 gap-2">
          <InfoBlock label="Department" value={employee.department || employee.department_name || 'Unassigned'} />
          <InfoBlock label="Designation" value={employee.designation || employee.designation_name || 'Unassigned'} />
          <InfoBlock label="Branch" value={employee.branch || employee.branch_name || 'Unassigned'} />
          <InfoBlock label="Joined" value={fmtDate(employee.date_of_joining)} />
        </div>
      </Section>
      <Section title="Contact">
        <InfoRow label="Phone" value={employee.personal_phone || employee.phone || 'Not set'} />
        <InfoRow label="Email" value={employee.personal_email || employee.email || 'Not set'} />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={portalize(`/dashboard/hr/employees/${employeeId}/edit`, isBranchPortal)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold"
        >
          <Edit3 className="h-4 w-4" /> Edit
        </Link>
        <button
          type="button"
          onClick={() => updateStatus(employee.status === 'active' ? 'inactive' : 'active')}
          disabled={saving}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {employee.status === 'active' ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  );
}

function EmployeeFormMobile({ employeeId, isBranchPortal }: { employeeId?: string; isBranchPortal: boolean }) {
  const router = useRouter();
  const isEdit = !!employeeId;
  const [form, setForm] = useState({
    employee_code: '',
    first_name: '',
    last_name: '',
    personal_email: '',
    personal_phone: '',
    status: 'active',
    date_of_joining: '',
  });
  const { saving, error, run } = useSavingAction();
  const { loading } = useApiData(async () => {
    if (!employeeId) return null;
    const res = await api.get(`/employees/${employeeId}`);
    const employee = res.data.data;
    setForm({
      employee_code: employee.employee_code || '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      personal_email: employee.personal_email || employee.email || '',
      personal_phone: employee.personal_phone || employee.phone || '',
      status: employee.status || 'active',
      date_of_joining: employee.date_of_joining?.slice(0, 10) || '',
    });
    return employee;
  }, [employeeId]);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => run(async () => {
    const payload = compactPayload(form);
    if (isEdit) await api.put(`/employees/${employeeId}`, payload);
    else await api.post('/employees', payload);
    router.push(portalize(isEdit ? `/dashboard/hr/employees/${employeeId}` : '/dashboard/hr/employees', isBranchPortal));
  });

  if (isEdit && loading) return <LoadingState />;

  return (
    <div className="space-y-4 pb-24">
      <ScreenHeader
        title={isEdit ? 'Edit Employee' : 'Add Employee'}
        subtitle="Single-column mobile form"
        action={<BackButton isBranchPortal={isBranchPortal} fallback={isEdit ? `/dashboard/hr/employees/${employeeId}` : '/dashboard/hr/employees'} />}
      />
      <ErrorBanner message={error} />
      <Section title="Identity">
        <div className="space-y-3">
          <Field label="Employee Code"><MobileInput value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} placeholder="Auto if blank" /></Field>
          <Field label="First Name" required><MobileInput value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last Name" required><MobileInput value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Contact">
        <div className="space-y-3">
          <Field label="Email"><MobileInput type="email" value={form.personal_email} onChange={(e) => set('personal_email', e.target.value)} /></Field>
          <Field label="Phone"><MobileInput type="tel" value={form.personal_phone} onChange={(e) => set('personal_phone', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Employment">
        <div className="space-y-3">
          <Field label="Status">
            <MobileSelect value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="probation">Probation</option>
              <option value="inactive">Inactive</option>
            </MobileSelect>
          </Field>
          <Field label="Date of Joining"><MobileInput type="date" value={form.date_of_joining} onChange={(e) => set('date_of_joining', e.target.value)} /></Field>
        </div>
      </Section>
      <SaveBar saving={saving} label={isEdit ? 'Save Employee' : 'Create Employee'} onSave={save} disabled={!form.first_name.trim() || !form.last_name.trim()} />
    </div>
  );
}

function UserDetailMobile({ userId, isBranchPortal }: { userId: string; isBranchPortal: boolean }) {
  const { data: user, loading, refresh } = useApiData(async () => {
    const res = await api.get(`/users/${userId}`);
    return res.data.data;
  }, [userId]);
  const { saving, error, run } = useSavingAction();
  const [actionOpen, setActionOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [deactivationReasons, setDeactivationReasons] = useState<any[]>([]);

  useEffect(() => {
    api.get('/users/deactivation-reasons').then((res) => setDeactivationReasons(res.data.data || [])).catch(() => {});
  }, []);

  if (loading) return <LoadingState />;
  if (!user) return <EmptyState label="User not found." />;

  const deactivate = () => run(async () => {
    await api.post(`/users/${userId}/deactivate`, { reasonId: reason, notes });
    setActionOpen(false);
    await refresh();
  });
  const reactivate = () => run(async () => {
    await api.post(`/users/${userId}/reactivate`, { notes });
    setActionOpen(false);
    await refresh();
  });
  const unlock = () => run(async () => {
    await api.post(`/users/${userId}/unlock`);
    await refresh();
  });

  const isActive = user.is_active !== false && user.status !== 'inactive' && user.status !== 'deactivated';

  return (
    <div className="space-y-4 pb-20">
      <ScreenHeader title={user.full_name || user.email} subtitle={user.email} action={<BackButton isBranchPortal={isBranchPortal} fallback="/dashboard/platform/users" />} />
      <ErrorBanner message={error} />
      <Section title="User">
        <div className="flex gap-3">
          <Avatar name={user.full_name || user.email || 'User'} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{user.full_name || user.email}</p>
            <p className="text-xs text-muted-foreground">{user.phone || 'No phone'}</p>
            <div className="mt-2"><StatusPill status={user.status || (isActive ? 'active' : 'inactive')} /></div>
          </div>
        </div>
      </Section>
      <Section title="Access">
        <InfoRow label="Role" value={user.role_name || user.user_type || user.role || 'No role'} />
        <InfoRow label="Username" value={user.username || 'Not set'} />
        <InfoRow label="MFA" value={user.mfa_enabled ? 'Enabled' : 'Not enabled'} />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Link href={portalize(`/dashboard/platform/users/${userId}/edit`, isBranchPortal)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold">
          <Edit3 className="h-4 w-4" /> Edit
        </Link>
        <button type="button" onClick={() => setActionOpen(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold">
          <MoreVertical className="h-4 w-4" /> Actions
        </button>
      </div>
      {user.is_locked && (
        <button type="button" onClick={unlock} disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Unlock Account
        </button>
      )}
      <BottomSheet open={actionOpen} title="Account Actions" onClose={() => setActionOpen(false)}>
        <div className="space-y-3">
          {!isActive && (
            <Field label="Notes">
              <MobileTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </Field>
          )}
          {isActive && (
            <>
              <Field label="Reason" required>
                <MobileSelect value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Select reason</option>
                  {deactivationReasons.map((item) => <option key={item.id} value={item.id}>{item.label || item.name}</option>)}
                </MobileSelect>
              </Field>
              <Field label="Notes">
                <MobileTextarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </Field>
            </>
          )}
          <button
            type="button"
            onClick={isActive ? deactivate : reactivate}
            disabled={saving || (isActive && !reason)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isActive ? 'Deactivate User' : 'Reactivate User'}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function UserFormMobile({ userId, isBranchPortal }: { userId?: string; isBranchPortal: boolean }) {
  const router = useRouter();
  const isEdit = !!userId;
  const [form, setForm] = useState({
    email: '',
    phone: '',
    password: '',
    first_name: '',
    last_name: '',
    user_type: 'employee',
    must_change_password: true,
  });
  const { saving, error, run } = useSavingAction();
  const { loading } = useApiData(async () => {
    if (!userId) return null;
    const res = await api.get(`/users/${userId}`);
    const user = res.data.data;
    const [firstName, ...restName] = String(user.full_name || '').split(' ');
    setForm({
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      first_name: user.first_name || firstName || '',
      last_name: user.last_name || restName.join(' ') || '',
      user_type: user.user_type || 'employee',
      must_change_password: user.must_change_password ?? true,
    });
    return user;
  }, [userId]);

  const set = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => run(async () => {
    const payload = compactPayload({
      ...form,
      full_name: [form.first_name, form.last_name].filter(Boolean).join(' '),
      password: form.password || undefined,
    });
    if (isEdit) await api.put(`/users/${userId}`, payload);
    else await api.post('/users', payload);
    router.push(portalize(isEdit ? `/dashboard/platform/users/${userId}` : '/dashboard/platform/users', isBranchPortal));
  });

  if (isEdit && loading) return <LoadingState />;

  return (
    <div className="space-y-4 pb-24">
      <ScreenHeader title={isEdit ? 'Edit User' : 'Add User'} subtitle="Mobile user access form" action={<BackButton isBranchPortal={isBranchPortal} fallback={isEdit ? `/dashboard/platform/users/${userId}` : '/dashboard/platform/users'} />} />
      <ErrorBanner message={error} />
      <Section title="Identity">
        <div className="space-y-3">
          <Field label="First Name"><MobileInput value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last Name"><MobileInput value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          <Field label="Email" required><MobileInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><MobileInput type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Access">
        <div className="space-y-3">
          <Field label="User Type">
            <MobileSelect value={form.user_type} onChange={(e) => set('user_type', e.target.value)}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="branch_admin">Branch Admin</option>
              <option value="org_admin">Organization Admin</option>
            </MobileSelect>
          </Field>
          <Field label={isEdit ? 'New Password' : 'Password'}>
            <MobileInput type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep current' : 'Auto-generated if blank'} />
          </Field>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-white px-3 text-sm">
            <input type="checkbox" checked={form.must_change_password} onChange={(e) => set('must_change_password', e.target.checked)} className="h-4 w-4 accent-primary" />
            Require password change on next login
          </label>
        </div>
      </Section>
      <SaveBar saving={saving} label={isEdit ? 'Save User' : 'Create User'} onSave={save} disabled={!form.email.trim()} />
    </div>
  );
}

function BranchDetailMobile({ branchId, isBranchPortal }: { branchId: string; isBranchPortal: boolean }) {
  const { data: branch, loading, refresh } = useApiData(async () => {
    const res = await api.get(`/branches/${branchId}`);
    return res.data.data;
  }, [branchId]);
  const { saving, error, run } = useSavingAction();

  if (loading) return <LoadingState />;
  if (!branch) return <EmptyState label="Branch not found." />;

  const toggleActivation = () => run(async () => {
    await api.post(`/branches/${branchId}/${branch.is_active === false || branch.status === 'inactive' ? 'activate' : 'deactivate'}`);
    await refresh();
  });

  return (
    <div className="space-y-4 pb-20">
      <ScreenHeader title={branch.name} subtitle={branch.code || 'Branch detail'} action={<BackButton isBranchPortal={isBranchPortal} fallback="/dashboard/platform/branches" />} />
      <ErrorBanner message={error} />
      <Section title="Branch Summary">
        <div className="grid grid-cols-2 gap-2">
          <InfoBlock label="Code" value={branch.code || 'Not set'} />
          <InfoBlock label="Status" value={branch.status || (branch.is_active ? 'active' : 'inactive')} />
          <InfoBlock label="Manager" value={branch.manager_name || 'Unassigned'} />
          <InfoBlock label="Employees" value={branch.employee_count ?? branch.total_employees ?? 0} />
        </div>
      </Section>
      <Section title="Contact">
        <InfoRow label="Phone" value={branch.phone || 'Not set'} />
        <InfoRow label="Email" value={branch.email || 'Not set'} />
        <InfoRow label="Address" value={branch.address || 'Not set'} />
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <Link href={portalize(`/dashboard/platform/branches/${branchId}/edit`, isBranchPortal)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold">
          <Edit3 className="h-4 w-4" /> Edit
        </Link>
        <button type="button" onClick={toggleActivation} disabled={saving} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold disabled:opacity-60">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Toggle
        </button>
      </div>
    </div>
  );
}

function BranchFormMobile({ branchId, isBranchPortal }: { branchId?: string; isBranchPortal: boolean }) {
  const router = useRouter();
  const isEdit = !!branchId;
  const [form, setForm] = useState({ name: '', code: '', phone: '', email: '', address: '' });
  const { saving, error, run } = useSavingAction();
  const { loading } = useApiData(async () => {
    if (!branchId) return null;
    const res = await api.get(`/branches/${branchId}`);
    const branch = res.data.data;
    setForm({
      name: branch.name || '',
      code: branch.code || '',
      phone: branch.phone || '',
      email: branch.email || '',
      address: branch.address || '',
    });
    return branch;
  }, [branchId]);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => run(async () => {
    const payload = compactPayload(form);
    if (isEdit) await api.put(`/branches/${branchId}`, payload);
    else await api.post('/branches', payload);
    router.push(portalize(isEdit ? `/dashboard/platform/branches/${branchId}` : '/dashboard/platform/branches', isBranchPortal));
  });

  if (isEdit && loading) return <LoadingState />;

  return (
    <div className="space-y-4 pb-24">
      <ScreenHeader title={isEdit ? 'Edit Branch' : 'Add Branch'} subtitle="Branch mobile form" action={<BackButton isBranchPortal={isBranchPortal} fallback={isEdit ? `/dashboard/platform/branches/${branchId}` : '/dashboard/platform/branches'} />} />
      <ErrorBanner message={error} />
      <Section title="Branch">
        <div className="space-y-3">
          <Field label="Branch Name" required><MobileInput value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Branch Code"><MobileInput value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="Optional" /></Field>
        </div>
      </Section>
      <Section title="Contact">
        <div className="space-y-3">
          <Field label="Phone"><MobileInput type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><MobileInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address"><MobileTextarea value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
      </Section>
      <SaveBar saving={saving} label={isEdit ? 'Save Branch' : 'Create Branch'} onSave={save} disabled={!form.name.trim()} />
    </div>
  );
}

function EmployeesMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const { data, loading } = useApiData(async () => {
    const res = await api.get('/employees', { params: { page: 1, limit: PAGE_SIZE, ...(search ? { search } : {}), ...(status ? { status } : {}) } });
    return res.data.data || [];
  }, [search, status]);

  return (
    <div className="space-y-4">
      <ScreenHeader title="Employees" subtitle="Search, inspect profile cards, and open actions" />
      <SearchAndFilter value={search} onChange={setSearch}>
        <SegmentedOptions
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { label: 'All', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Probation', value: 'probation' },
            { label: 'Inactive', value: 'inactive' },
          ]}
        />
      </SearchAndFilter>
      {loading ? <LoadingState /> : (
        <div className="space-y-3">
          {(data || []).map((employee: any) => (
            <Link key={employee.id} href={portalize(`/dashboard/hr/employees/${employee.id}`, isBranchPortal)} className="block rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                <Avatar name={fullName(employee)} src={employee.photo_url || employee.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{fullName(employee)}</p>
                      <p className="text-xs text-muted-foreground">{employee.employee_code || 'No employee code'}</p>
                    </div>
                    <StatusPill status={employee.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <InfoBlock label="Department" value={employee.department || employee.department_name || 'Unassigned'} />
                    <InfoBlock label="Designation" value={employee.designation || employee.designation_name || 'Unassigned'} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {!data?.length && <EmptyState label="No employees found." />}
        </div>
      )}
      <FloatingAction href="/dashboard/hr/employees/new" label="Add employee" isBranchPortal={isBranchPortal} />
    </div>
  );
}

function Avatar({ name, src }: { name: string; src?: string }) {
  if (src) return <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />;
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function SegmentedOptions({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn('min-h-11 rounded-xl border px-3 text-sm font-medium', value === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AttendanceMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const [tab, setTab] = useState<'today' | 'history' | 'requests' | 'team'>('today');
  const today = new Date().toISOString().slice(0, 10);
  const { data, loading } = useApiData(async () => {
    const [recordsRes, summaryRes, requestsRes] = await Promise.all([
      api.get('/attendance', { params: { page: 1, limit: PAGE_SIZE, date_from: today, date_to: today } }),
      api.get('/attendance/summary', { params: { date_from: today, date_to: today } }),
      api.get('/attendance/requests'),
    ]);
    return {
      records: recordsRes.data.data || [],
      summary: summaryRes.data.data || [],
      requests: requestsRes.data.data || [],
    };
  }, [today]);

  const counts = Object.fromEntries((data?.summary || []).map((item: any) => [item.status, item.count]));
  const list = tab === 'requests' ? data?.requests || [] : data?.records || [];

  return (
    <div className="space-y-4">
      <ScreenHeader title="Attendance" subtitle="Today, history, requests, and team attendance" />
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Present" value={counts.present ?? 0} icon={UserCheck} tone="green" />
        <MetricCard label="Absent" value={counts.absent ?? 0} icon={LogOut} tone="red" />
      </div>
      <MobileTabs value={tab} onChange={setTab} items={[
        { label: 'Today', value: 'today' },
        { label: 'History', value: 'history' },
        { label: 'Requests', value: 'requests' },
        { label: 'Team', value: 'team' },
      ]} />
      {loading ? <LoadingState /> : (
        <div className="space-y-3">
          {list.map((item: any) => (
            <article key={item.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{fullName(item)}</p>
                  <p className="text-xs text-muted-foreground">{item.employee_code || fmtDate(item.date)}</p>
                </div>
                <StatusPill status={item.status || item.request_type} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <InfoBlock label="Clock In" value={item.clock_in ? new Date(item.clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not punched'} />
                <InfoBlock label="Clock Out" value={item.clock_out ? new Date(item.clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Open'} />
              </div>
            </article>
          ))}
          {!list.length && <EmptyState label="No attendance records found." />}
        </div>
      )}
      <FloatingAction href="/dashboard/hr/attendance" label="Attendance action" isBranchPortal={isBranchPortal} />
    </div>
  );
}

function MobileTabs<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ label: string; value: T }>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={cn('min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold', value === item.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white')}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LeaveMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const { data, loading } = useApiData(async () => {
    const [typesRes, balancesRes, requestsRes] = await Promise.all([
      api.get('/leaves/types', { params: { all: true } }),
      api.get('/leaves/balances'),
      api.get('/leaves/requests', { params: { page: 1, limit: PAGE_SIZE } }),
    ]);
    return {
      types: typesRes.data?.data || typesRes.data || [],
      balances: balancesRes.data?.data || balancesRes.data || [],
      requests: requestsRes.data?.data || requestsRes.data || [],
    };
  }, []);

  const pending = (data?.requests || []).filter((item: any) => item.status === 'pending');
  return (
    <div className="space-y-4">
      <ScreenHeader title="Leave" subtitle="Balances, pending approvals, recent history, and leave application" />
      {loading ? <LoadingState /> : (
        <>
          <Section title="Leave Balance">
            <div className="space-y-2">
              {(data?.types || []).slice(0, 5).map((type: any) => {
                const rows = (data?.balances || []).filter((balance: any) => balance.leave_type_id === type.id);
                const allocated = rows.reduce((sum: number, balance: any) => sum + Number(balance.allocated || 0), 0);
                const used = rows.reduce((sum: number, balance: any) => sum + Number(balance.used || 0), 0);
                return <InfoRow key={type.id} label={type.name} value={`${allocated - used} available`} />;
              })}
              {!data?.types?.length && <EmptyState label="No leave types configured." />}
            </div>
          </Section>
          <Section title="Pending Requests">
            <LeaveCards requests={pending} />
          </Section>
          <Section title="Recent History">
            <LeaveCards requests={(data?.requests || []).slice(0, 5)} />
          </Section>
        </>
      )}
      <FloatingAction href="/dashboard/hr/leave" label="Apply leave" isBranchPortal={isBranchPortal} />
    </div>
  );
}

function LeaveCards({ requests }: { requests: any[] }) {
  if (!requests.length) return <EmptyState label="No leave requests." />;
  return (
    <div className="space-y-2">
      {requests.map((request: any) => (
        <article key={request.id} className="rounded-xl bg-muted/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{fullName(request)}</p>
              <p className="text-xs text-muted-foreground">{request.leave_type_name || 'Leave'} | {fmtDate(request.start_date)} - {fmtDate(request.end_date)}</p>
            </div>
            <StatusPill status={request.status} />
          </div>
        </article>
      ))}
    </div>
  );
}

function PayrollMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const { saving, error, run } = useSavingAction();
  const { data, loading, refresh } = useApiData(async () => {
    const res = await api.get('/payroll/payslips', { params: { month, year } });
    return res.data.data || [];
  }, [month, year]);
  const total = (data || []).reduce((sum: number, item: any) => sum + Number(item.net_salary || 0), 0);
  const paid = (data || []).filter((item: any) => item.status === 'paid').reduce((sum: number, item: any) => sum + Number(item.net_salary || 0), 0);
  const initiatePayment = () => run(async () => {
    if (!selectedPayslip) return;
    await api.post(`/payroll/payslips/${selectedPayslip.id}/initiate-payment`, { payment_method: paymentMethod });
    setSelectedPayslip(null);
    await refresh();
  });

  return (
    <div className="space-y-4">
      <ScreenHeader title="Payroll" subtitle="Salary summary, current payroll, payslips, and PDF actions" />
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-2">
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-12 rounded-xl border border-border bg-white px-3 text-sm">
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>{new Date(0, index).toLocaleString('default', { month: 'long' })}</option>
          ))}
        </select>
        <input value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-12 rounded-xl border border-border bg-white px-3 text-sm" type="number" />
      </div>
      <div className="grid gap-3">
        <MetricCard label="Total Payroll" value={fmtMoney(total)} icon={Banknote} tone="blue" />
        <MetricCard label="Disbursed" value={fmtMoney(paid)} icon={UserCheck} tone="green" />
      </div>
      <Section title="Current Payroll">
        <InfoRow label="Outstanding" value={fmtMoney(total - paid)} />
        <InfoRow label="Payslips" value={data?.length ?? 0} />
      </Section>
      <Section title="Payslips">
        {loading ? <LoadingState /> : (
          <div className="space-y-2">
            {(data || []).map((payslip: any) => (
              <article key={payslip.id} className="rounded-xl bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{fullName(payslip)}</p>
                    <p className="text-xs text-muted-foreground">Net pay {fmtMoney(payslip.net_salary)}</p>
                  </div>
                  <StatusPill status={payslip.status} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setSelectedPayslip(payslip)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white text-xs font-semibold">
                    <Eye className="h-4 w-4" /> View
                  </button>
                  <button type="button" onClick={() => setSelectedPayslip(payslip)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-white text-xs font-semibold">
                    <Download className="h-4 w-4" /> PDF
                  </button>
                </div>
              </article>
            ))}
            {!data?.length && <EmptyState label="No payslips generated." />}
          </div>
        )}
      </Section>
      <BottomSheet open={!!selectedPayslip} title="Payslip Actions" onClose={() => setSelectedPayslip(null)}>
        {selectedPayslip && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-sm font-semibold">{fullName(selectedPayslip)}</p>
              <p className="text-xs text-muted-foreground">Net pay {fmtMoney(selectedPayslip.net_salary)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoBlock label="Gross" value={fmtMoney(selectedPayslip.gross_salary)} />
              <InfoBlock label="Deductions" value={fmtMoney(selectedPayslip.total_deductions)} />
              <InfoBlock label="Overtime" value={fmtMoney(selectedPayslip.overtime || 0)} />
              <InfoBlock label="Status" value={selectedPayslip.status || 'draft'} />
            </div>
            {selectedPayslip.status !== 'paid' && (
              <>
                <Field label="Payment Method">
                  <MobileSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                  </MobileSelect>
                </Field>
                <button
                  type="button"
                  onClick={initiatePayment}
                  disabled={saving}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Initiate Payment
                </button>
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function UsersMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const [search, setSearch] = useState('');
  const { data, loading } = useApiData(async () => {
    const res = await api.get('/users', { params: { page: 1, limit: 100 } });
    return res.data.data || [];
  }, []);
  const visible = (data || []).filter((user: any) =>
    [user.full_name, user.email, user.role_name, user.user_type].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <ScreenHeader title="Users & Roles" subtitle="User cards with role and status details" />
      <SearchAndFilter value={search} onChange={setSearch} />
      {loading ? <LoadingState /> : (
        <div className="space-y-3">
          {visible.map((user: any) => (
            <Link key={user.id} href={portalize(`/dashboard/platform/users/${user.id}`, isBranchPortal)} className="block rounded-xl border border-border bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                <Avatar name={user.full_name || user.email || 'User'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{user.full_name || user.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <StatusPill status={user.status || (user.is_active ? 'active' : 'inactive')} />
                  </div>
                  <p className="mt-3 rounded-xl bg-muted/40 p-3 text-sm font-semibold">{user.role_name || user.user_type || 'No role assigned'}</p>
                </div>
              </div>
            </Link>
          ))}
          {!visible.length && <EmptyState label="No users found." />}
        </div>
      )}
      {!isBranchPortal && <FloatingAction href="/dashboard/platform/users/new" label="Add user" isBranchPortal={isBranchPortal} />}
    </div>
  );
}

function ReportsMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const permissions = useAuthStore((state) => state.permissions);
  const { data } = useApiData(async () => {
    const res = await api.get('/reports/analytics/snapshot');
    return res.data;
  }, []);
  const reports = [
    { label: 'Analytics', href: '/dashboard/reports/analytics', icon: BarChart3, permission: PERMISSIONS.REPORTS_VIEW },
    { label: 'Attendance', href: '/dashboard/reports/attendance', icon: CalendarCheck, permission: PERMISSIONS.REPORTS_ATTENDANCE },
    { label: 'Payroll', href: '/dashboard/reports/payroll', icon: Banknote, permission: PERMISSIONS.REPORTS_PAYROLL },
    { label: 'Employee', href: '/dashboard/reports/employee', icon: Users, permission: PERMISSIONS.REPORTS_VIEW },
    { label: 'Leave', href: '/dashboard/reports/leave', icon: CalendarDays, permission: PERMISSIONS.REPORTS_VIEW },
    { label: 'Branch', href: '/dashboard/reports/branch', icon: Building2, permission: PERMISSIONS.REPORTS_VIEW },
  ].filter((item) => permissions.includes(item.permission));

  return (
    <div className="space-y-4">
      <ScreenHeader title="Reports" subtitle="KPI summary, charts, and downloadable reports" />
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Workforce" value={data?.workforce?.total ?? 0} icon={Users} tone="blue" />
        <MetricCard label="Present" value={data?.today_attendance?.present ?? 0} icon={UserCheck} tone="green" />
      </div>
      <Section title="Report Library">
        <div className="space-y-2">
          {reports.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={portalize(item.href, isBranchPortal)} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-white px-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-sm font-semibold">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </Section>
      <Link href={portalize('/dashboard/reports/saved', isBranchPortal)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
        <Download className="h-4 w-4" /> Download Report
      </Link>
    </div>
  );
}

function SettingsMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const categories = [
    { label: 'Organization', href: '/dashboard/settings/company-profile', icon: Building2 },
    { label: 'Employees', href: '/dashboard/platform/departments', icon: Users },
    { label: 'Attendance', href: '/dashboard/templates/attendance-policy', icon: CalendarCheck },
    { label: 'Payroll', href: '/dashboard/templates/salary-structure', icon: Banknote },
    { label: 'Security', href: '/dashboard/system/settings/mfa', icon: Shield },
    { label: 'Notifications', href: '/dashboard/automation', icon: Bell },
    { label: 'Billing', href: '/dashboard/system/settings/saas-billing', icon: FileText },
  ];
  return (
    <div className="space-y-4">
      <ScreenHeader title="Settings" subtitle="Grouped settings categories" />
      <div className="space-y-2">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Link key={category.href} href={portalize(category.href, isBranchPortal)} className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-white px-4 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-semibold">{category.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ApprovalsMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const { data, loading, refresh } = useApiData(async () => {
    const res = await api.get('/approvals/inbox', { params: { page: 1, limit: PAGE_SIZE } });
    return res.data.data || res.data.items || res.data || [];
  }, []);

  return (
    <div className="space-y-4">
      <ScreenHeader title="Approvals" subtitle="Approval work appears as review cards on mobile" />
      <Section title="Action Queue" action={<button type="button" onClick={refresh} className="text-xs font-semibold text-primary">Refresh</button>}>
        {loading ? <LoadingState /> : (
          <div className="space-y-2">
            {(Array.isArray(data) ? data : []).map((approval: any) => (
              <Link key={approval.id} href={portalize(`/dashboard/approvals/${approval.id}`, isBranchPortal)} className="block rounded-xl bg-muted/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{approval.title || approval.workflow_type || 'Approval request'}</p>
                    <p className="text-xs text-muted-foreground">{approval.requester_name || approval.submitted_by_name || 'Submitted request'}</p>
                  </div>
                  <StatusPill status={approval.status || approval.priority || 'pending'} />
                </div>
              </Link>
            ))}
            {(!Array.isArray(data) || data.length === 0) && <EmptyState label="No pending approvals." />}
          </div>
        )}
      </Section>
    </div>
  );
}

function ApprovalDetailMobile({ approvalId, isBranchPortal }: { approvalId: string; isBranchPortal: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const { saving, error, run } = useSavingAction();
  const { data: approval, loading } = useApiData(async () => {
    const res = await api.get(`/approvals/${approvalId}`);
    return res.data.data || res.data;
  }, [approvalId]);

  const submit = () => run(async () => {
    if (!action) return;
    await api.post(`/approvals/${approvalId}/${action}`, { reason: reason || (action === 'approve' ? 'Approved from mobile' : 'Rejected from mobile') });
    router.push(portalize('/dashboard/approvals', isBranchPortal));
  });

  if (loading) return <LoadingState />;
  if (!approval) return <EmptyState label="Approval not found." />;

  return (
    <div className="space-y-4 pb-20">
      <ScreenHeader title={approval.title || approval.workflow_type || 'Approval'} subtitle={approval.status || 'Pending review'} action={<BackButton isBranchPortal={isBranchPortal} fallback="/dashboard/approvals" />} />
      <ErrorBanner message={error} />
      <Section title="Request">
        <InfoRow label="Type" value={approval.workflow_type || approval.type || 'Approval'} />
        <InfoRow label="Submitted by" value={approval.requester_name || approval.submitted_by_name || 'Unknown'} />
        <InfoRow label="Priority" value={approval.priority || 'normal'} />
        <InfoRow label="Status" value={approval.status || 'pending'} />
      </Section>
      <Section title="Details">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          {JSON.stringify(approval.payload || approval.request_data || approval.entity || approval, null, 2)}
        </pre>
      </Section>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setAction('reject')} className="flex min-h-12 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700">
          Reject
        </button>
        <button type="button" onClick={() => setAction('approve')} className="flex min-h-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
          Approve
        </button>
      </div>
      <BottomSheet open={!!action} title={action === 'approve' ? 'Approve Request' : 'Reject Request'} onClose={() => setAction(null)}>
        <div className="space-y-3">
          <Field label="Reason">
            <MobileTextarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add a reason or remark" />
          </Field>
          <button type="button" onClick={submit} disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Confirm
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ModuleHubMobile({ isBranchPortal }: { isBranchPortal: boolean }) {
  const prefix = isBranchPortal ? '/branch-admin' : '/dashboard';
  return (
    <div className="space-y-4">
      <ScreenHeader title="Admin Modules" subtitle="Choose a mobile-optimized admin area" />
      <Section title="Core Sections">
        <div className="grid grid-cols-2 gap-3">
          <QuickAction label="Employees" icon={Users} href={`${prefix}/hr/employees`} />
          <QuickAction label="Attendance" icon={CalendarCheck} href={`${prefix}/hr/attendance`} />
          <QuickAction label="Leave" icon={CalendarDays} href={`${prefix}/hr/leave`} />
          <QuickAction label="Payroll" icon={Banknote} href={`${prefix}/hr/payroll`} />
        </div>
      </Section>
      <Section title="Operations">
        <div className="grid grid-cols-2 gap-3">
          <QuickAction label="Approvals" icon={CheckSquare} href={`${prefix}/approvals`} />
          <QuickAction label="Reports" icon={FileText} href={`${prefix}/reports`} />
          {!isBranchPortal && <QuickAction label="Branches" icon={Building2} href="/dashboard/platform/branches" />}
          {!isBranchPortal && <QuickAction label="Users" icon={Shield} href="/dashboard/platform/users" />}
        </div>
      </Section>
    </div>
  );
}
