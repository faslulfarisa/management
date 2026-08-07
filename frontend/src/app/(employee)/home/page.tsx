'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isAfter, isEqual, parseISO, startOfDay } from 'date-fns';
import Link from 'next/link';
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { EmployeeGuard } from '@/components/employee/layout/employee-guard';
import { PortalDashboard } from '@/components/employee/desktop/portal-dashboard';
import { PunchCard } from '@/components/employee/home/punch-card';
import { ShiftSummaryCard } from '@/components/employee/home/shift-summary-card';
import { SkeletonCard } from '@/components/employee/shared/skeleton-card';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { MobileTopTabSwitcher } from '@/components/employee/layout/mobile-top-tab-switcher';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';
import { cn, formatCurrency } from '@/lib/utils';
import { periodLabel } from '@/lib/payroll-derive';
import { getPayrollStatus } from '@/lib/payroll-status';
import { formatLeaveDays, getApprovedLeaveDaysInCurrentMonth } from '@/lib/leave-stats';
import { useAuthStore } from '@/store/auth.store';
import { useAdminSection } from '@/hooks/use-admin-section';
import { useNotificationAction } from '@/lib/notification-action-registry';

export default function HomePage() {
  return (
    <EmployeeGuard>
      <div className="md:hidden flex flex-col">
        <MobileHomeContent />
      </div>

      <div className="hidden md:block">
        <PortalDashboard />
      </div>
    </EmployeeGuard>
  );
}

function MobileHomeContent() {
  const { employeeProfile } = useAuthStore();
  const { isAdminDualContext } = useAdminSection();
  const queryClient = useQueryClient();
  const openNotification = useNotificationAction();
  const [refreshing, setRefreshing] = useState(false);

  const firstName = employeeProfile?.first_name ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data: today } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: balances, isLoading: loadingBalances } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  const { data: leaveHistory, isLoading: loadingLeaveHistory } = useQuery({
    queryKey: ['employee-leave-history', 'dashboard'],
    queryFn: () => employeeApi.getLeaveHistory({ limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const { data: payslipData, isLoading: loadingPayroll } = useQuery({
    queryKey: ['employee-payslips', 'dashboard'],
    queryFn: () => employeeApi.getPayslips({ limit: 1 }),
    staleTime: 10 * 60_000,
  });

  const { data: upcomingHolidays, isLoading: loadingHolidays } = useQuery({
    queryKey: ['employee-upcoming-holidays'],
    queryFn: () => employeeApi.getUpcomingHolidays(3),
    staleTime: 10 * 60_000,
  });

  const { data: notificationsData, isLoading: loadingNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => employeeApi.getNotifications(),
    staleTime: 60_000,
    retry: false,
  });

  const { data: submittedData } = useQuery({
    queryKey: ['employee-submitted-requests', 'dashboard'],
    queryFn: () => approvalsApi.getSubmitted({ limit: 4 }),
    staleTime: 60_000,
    retry: false,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['employee-pending-requests'],
    queryFn: () => approvalsApi.getSubmitted({ status: 'pending', limit: 3 }),
    staleTime: 60_000,
    retry: false,
  });

  const upcomingLeave = useMemo(() => {
    const todayStart = startOfDay(new Date());

    return (leaveHistory?.data ?? []).find((leave) => {
      const start = startOfDay(parseISO(leave.start_date));
      return (leave.status === 'approved' || leave.status === 'pending') && (isAfter(start, todayStart) || isEqual(start, todayStart));
    });
  }, [leaveHistory?.data]);

  const leaveTakenThisMonth = getApprovedLeaveDaysInCurrentMonth(leaveHistory?.data);
  const latestPayslip = payslipData?.data?.[0];
  const workedToday = formatWorkDuration(today?.clock_in, today?.clock_out);
  const unreadCount = notificationsData?.unread_count ?? 0;
  const pendingCount = pendingData?.total ?? 0;

  const refreshDashboard = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee-today-attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-today-shift'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-today-breaks'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-leave-balances'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-leave-history'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-payslips'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-upcoming-holidays'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-pending-requests'] }),
    ]);
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col overflow-x-hidden">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{greeting}</p>
            <h1 className="truncate text-xl font-bold text-foreground">{firstName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={refreshing}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-60"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
            <Link
              href="/notifications"
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/80"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
        <MobileTopTabSwitcher />
      </div>

      <div className="space-y-4 px-4 pb-6 pt-4">
        <MobileCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {employeeProfile?.first_name} {employeeProfile?.last_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {employeeProfile?.designation_name ?? (isAdminDualContext ? 'Administrator' : 'Employee')}
                {employeeProfile?.department_name ? ` - ${employeeProfile.department_name}` : ''}
              </p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                {employeeProfile?.employee_code ?? 'Profile active'}
              </p>
            </div>
          </div>
        </MobileCard>

        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Status" value={statusLabel(today?.status)} sub={today?.clock_in ? `In ${formatTime(today.clock_in)}` : 'Not punched in'} />
          <KpiCard label="Worked" value={workedToday} sub="Today" />
          <KpiCard label="Leave" value={`${formatLeaveDays(leaveTakenThisMonth)}d`} sub="Taken this month" />
          <KpiCard label="Pending" value={String(pendingCount)} sub="Approvals" tone={pendingCount > 0 ? 'warning' : 'neutral'} />
        </div>

        <section>
          <SectionTitle title="Quick Actions" />
          <div className="grid grid-cols-2 gap-3">
            <QuickAction href="/attendance" icon={<CalendarCheck className="h-5 w-5" />} label="Attendance" />
            <QuickAction href="/leave" icon={<CalendarDays className="h-5 w-5" />} label="Apply Leave" />
            <QuickAction href="/payslips" icon={<CreditCard className="h-5 w-5" />} label="Payroll" />
            <QuickAction href="/requests" icon={<FileText className="h-5 w-5" />} label="Requests" />
          </div>
        </section>

        <PunchCard />
        <ShiftSummaryCard />

        <section>
          <SectionTitle title="Leave" actionHref="/leave" actionLabel="View all" />
          {loadingBalances ? (
            <div className="grid grid-cols-2 gap-3">
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </div>
          ) : balances?.length ? (
            <div className="grid grid-cols-2 gap-3">
              {balances.slice(0, 4).map((balance) => {
                const pct = balance.allocated > 0 ? Math.round((balance.available / balance.allocated) * 100) : 0;
                return (
                  <MobileCard key={balance.leave_type_id} className="p-4">
                    <p className="line-clamp-2 min-h-[2rem] text-xs font-medium text-muted-foreground">
                      {balance.leave_type_name}
                    </p>
                    <p className="mt-2 text-2xl font-bold leading-none text-foreground">{balance.available}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">of {balance.allocated} days</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </MobileCard>
                );
              })}
            </div>
          ) : (
            <MobileCard>
              <EmptyState title="No leave balances" subtitle="Your balances will appear once HR assigns your leave policy." />
            </MobileCard>
          )}
        </section>

        <MobileCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Leave</p>
              {loadingLeaveHistory ? (
                <div className="mt-3 h-10 w-40 animate-pulse rounded bg-muted" />
              ) : upcomingLeave ? (
                <>
                  <p className="mt-2 truncate text-sm font-semibold text-foreground">{upcomingLeave.leave_type_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(parseISO(upcomingLeave.start_date), 'd MMM')} - {format(parseISO(upcomingLeave.end_date), 'd MMM yyyy')}
                    {' - '}
                    {upcomingLeave.days} {upcomingLeave.days === 1 ? 'day' : 'days'}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No upcoming leave scheduled.</p>
              )}
            </div>
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
          </div>
        </MobileCard>

        <MobileCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming Holidays</p>
              {loadingHolidays ? (
                <div className="mt-3 h-12 w-44 animate-pulse rounded bg-muted" />
              ) : upcomingHolidays?.length ? (
                <div className="mt-3 space-y-2">
                  {upcomingHolidays.map((holiday) => (
                    <div key={`${holiday.date}-${holiday.name}`} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{holiday.name}</p>
                        <p className="text-xs text-muted-foreground">{holiday.type}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {format(parseISO(holiday.date), 'd MMM')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No upcoming holidays published.</p>
              )}
            </div>
            <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
          </div>
        </MobileCard>

        <MobileCard className="overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll Summary</p>
                {loadingPayroll ? (
                  <div className="mt-3 h-12 w-44 animate-pulse rounded bg-muted" />
                ) : latestPayslip ? (
                  <>
                    <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(latestPayslip.net_salary)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{periodLabel(latestPayslip.month, latestPayslip.year)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Your first payslip will appear here.</p>
                )}
              </div>
              {latestPayslip && <PayrollPill payslip={latestPayslip} />}
            </div>
          </div>
          <Link href="/payslips" className="flex min-h-11 items-center justify-between border-t border-border px-4 py-3 text-sm font-semibold text-primary">
            Open payroll
            <ChevronRight className="h-4 w-4" />
          </Link>
        </MobileCard>

        <MobileCard className="overflow-hidden">
          <SectionTitle title="Pending Approvals" compact actionHref="/requests" actionLabel="Requests" />
          {(pendingData?.data ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {pendingData!.data.slice(0, 3).map((request) => (
                <Link key={request.id} href="/requests" className="block min-h-14 px-4 py-3">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{request.title}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {request.workflow_type.replaceAll('_', ' ')} - {formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Nothing pending" subtitle="Your requests are clear for now." className="py-8" />
          )}
        </MobileCard>

        <MobileCard className="overflow-hidden">
          <SectionTitle title="Recent Notifications" compact actionHref="/notifications" actionLabel="All" />
          {loadingNotifications ? (
            <div className="space-y-2 p-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
          ) : (notificationsData?.notifications ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {notificationsData!.notifications.slice(0, 3).map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => openNotification({
                    ...notification,
                    action_url: notification.action_url ?? notification.href ?? null,
                    source_module: notification.source_module ?? notification.type,
                  })}
                  className="block min-h-14 w-full px-4 py-3 text-left hover:bg-muted/50"
                >
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{notification.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" subtitle="Important HR updates will show up here." className="py-8" />
          )}
        </MobileCard>

        <MobileCard className="overflow-hidden">
          <SectionTitle title="Recent Activities" compact actionHref="/requests" actionLabel="View" />
          {(submittedData?.data ?? []).length > 0 ? (
            <div className="divide-y divide-border">
              {submittedData!.data.slice(0, 3).map((request) => (
                <Link key={request.id} href="/requests" className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">{request.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDistanceToNow(parseISO(request.created_at), { addSuffix: true })}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent activity" subtitle="Submitted requests and updates will appear here." className="py-8" />
          )}
        </MobileCard>
      </div>
    </div>
  );
}

function MobileCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-sm', className)}>
      {children}
    </div>
  );
}

function SectionTitle({
  title,
  actionHref,
  actionLabel,
  compact,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  compact?: boolean;
}) {
  const content = (
    <>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </>
  );

  if (compact) {
    return <div className="flex items-center justify-between border-b border-border px-4 py-2">{content}</div>;
  }

  return <div className="mb-3 flex items-center justify-between">{content}</div>;
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <MobileCard className="p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold leading-tight text-foreground', tone === 'warning' && 'text-amber-700')}>{value}</p>
      <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{sub}</p>
    </MobileCard>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm active:scale-[0.98]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function PayrollPill({ payslip }: { payslip: { status: 'draft' | 'processed' | 'paid' } }) {
  const status = getPayrollStatus(payslip);

  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', status.bg, status.text)}>
      {status.label}
    </span>
  );
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    present: 'Present',
    late: 'Late',
    half_day: 'Half day',
    absent: 'Absent',
  };

  return status ? labels[status] ?? status : 'Open';
}

function formatTime(value: string) {
  try {
    return format(parseISO(value), 'hh:mm a');
  } catch {
    return value;
  }
}

function formatWorkDuration(clockIn?: string | null, clockOut?: string | null) {
  if (!clockIn) return '0h';

  const start = parseISO(clockIn).getTime();
  const end = clockOut ? parseISO(clockOut).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
