'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { employeeApi } from '@/lib/employee-api';
import { approvalsApi } from '@/lib/approvals-api';
import {
  format, parseISO, addDays, isToday, isTomorrow,
} from 'date-fns';
import {
  Bell, LogIn, LogOut, CheckCircle2, Clock,
  Calendar, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PunchOutReasonModal } from '@/components/employee/home/punch-out-reason-modal';
import { ActiveBreakBanner } from '@/components/employee/home/active-break-banner';

// ── Helpers ──────────────────────────────────────────────────────

function fmtTime(t: string | null | undefined) {
  if (!t) return '—';
  try { return format(parseISO(t), 'hh:mm a'); } catch { return t; }
}

function fmtShiftTime(t: string) {
  try { return format(parseISO(`1970-01-01T${t}`), 'hh:mm a'); } catch { return t; }
}

function shiftDayLabel(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE d MMM');
  } catch { return dateStr; }
}

const statusMap: Record<string, { label: string; dot: string; chip: string }> = {
  present:  { label: 'Present',  dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  late:     { label: 'Late',     dot: 'bg-amber-400',   chip: 'bg-amber-50   text-amber-700   border border-amber-200'   },
  half_day: { label: 'Half Day', dot: 'bg-orange-400',  chip: 'bg-orange-50  text-orange-700  border border-orange-200'  },
  absent:   { label: 'Absent',   dot: 'bg-red-500',     chip: 'bg-red-50     text-red-700     border border-red-200'     },
};

const reqStatusMap: Record<string, { label: string; cls: string }> = {
  pending:            { label: 'Pending',      cls: 'bg-amber-50   text-amber-700'   },
  under_review:       { label: 'In Review',    cls: 'bg-blue-50    text-blue-700'    },
  approved:           { label: 'Approved',     cls: 'bg-emerald-50 text-emerald-700' },
  partially_approved: { label: 'Part. Appr.',  cls: 'bg-emerald-50 text-emerald-700' },
  rejected:           { label: 'Rejected',     cls: 'bg-red-50     text-red-700'     },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Sub-cards ─────────────────────────────────────────────────────

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      {children}
    </div>
  );
}

function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {action}
    </div>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────────

function KPIStrip() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const { data: today } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['employee-attendance-summary', month, year],
    queryFn: () => employeeApi.getAttendanceSummary(month, year),
    staleTime: 5 * 60_000,
  });

  const { data: balances } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['employee-pending-requests'],
    queryFn: () => approvalsApi.getSubmitted({ status: 'pending', limit: 1 }),
    staleTime: 60_000,
    retry: false,
  });

  const todayStatus  = today?.status;
  const totalLeave   = balances?.reduce((s, b) => s + b.available, 0) ?? 0;
  const presentDays  = summary?.present ?? 0;
  const totalWD      = summary?.total_working_days ?? 0;
  const attendancePct = totalWD > 0 ? Math.round((presentDays / totalWD) * 100) : null;
  const pendingCount = pendingData?.total ?? 0;

  const todayStatusCfg = todayStatus ? statusMap[todayStatus] : null;

  const kpis = [
    {
      label: 'Today',
      value: todayStatusCfg?.label ?? 'Not marked',
      sub: today?.clock_in ? `In at ${fmtTime(today.clock_in)}` : 'No clock-in yet',
      dotColor: todayStatusCfg?.dot ?? 'bg-gray-300',
      href: '/attendance',
    },
    {
      label: 'This Month',
      value: totalWD > 0 ? `${presentDays} / ${totalWD}` : '—',
      sub: attendancePct != null ? `${attendancePct}% attendance` : 'No data yet',
      dotColor: 'bg-primary',
      href: '/attendance',
    },
    {
      label: 'Leave Balance',
      value: `${totalLeave}d`,
      sub: `Across ${balances?.length ?? 0} leave type${balances?.length !== 1 ? 's' : ''}`,
      dotColor: 'bg-emerald-500',
      href: '/leave',
    },
    {
      label: 'Pending',
      value: String(pendingCount),
      sub: pendingCount === 1 ? '1 awaiting approval' : `${pendingCount} awaiting approval`,
      dotColor: pendingCount > 0 ? 'bg-amber-400' : 'bg-gray-300',
      href: '/requests',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {kpis.map((k) => (
        <Link key={k.label} href={k.href}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-gray-300 transition-colors cursor-pointer">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('h-2 w-2 rounded-full shrink-0', k.dotColor)} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{k.label}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 leading-none">{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Today Attendance Panel ────────────────────────────────────────

function TodayPanel() {
  const queryClient = useQueryClient();
  const [flashed, setFlashed] = useState(false);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);

  const { data: today, isLoading } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: shift } = useQuery({
    queryKey: ['employee-today-shift'],
    queryFn: () => employeeApi.getTodayShift(),
    staleTime: 5 * 60_000,
  });

  const punch = useMutation({
    mutationFn: ({ type, reason_code, note }: { type: 'in' | 'out'; reason_code?: string; note?: string }) =>
      employeeApi.punch(type, { reason_code, note }),
    onSuccess: (data) => {
      queryClient.setQueryData(['employee-today-attendance'], data);
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-history'] });
      queryClient.invalidateQueries({ queryKey: ['employee-today-breaks'] });
      setReasonModalOpen(false);
      setFlashed(true);
      setTimeout(() => setFlashed(false), 2000);
    },
  });

  const isOnBreak = today?.is_on_break ?? false;
  const canPunchIn  = !today?.is_punched_in && !today?.clock_in && !isOnBreak;
  const canPunchOut = today?.is_punched_in && !today?.clock_out && !isOnBreak;
  const s = today?.status ? statusMap[today.status] : null;

  return (
    <Card>
      <CardHeader title="Today's Attendance" />
      <div className="p-4 space-y-4">
        {/* Date + Status */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">
            {format(new Date(), 'EEEE, d MMM yyyy')}
          </p>
          {s && (
            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', s.chip)}>
              {s.label}
            </span>
          )}
        </div>

        {/* Clock times */}
        {(today?.clock_in || today?.clock_out) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Clock In</p>
              <p className="text-sm font-bold text-gray-900">{fmtTime(today?.clock_in)}</p>
              {today?.late_minutes > 0 && (
                <p className="text-[10px] text-amber-600 font-medium mt-0.5">{today.late_minutes}m late</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Clock Out</p>
              <p className="text-sm font-bold text-gray-900">{fmtTime(today?.clock_out)}</p>
            </div>
          </div>
        )}

        {/* Shift */}
        {shift && (
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2.5">
            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-700">{shift.shift_name}</p>
              <p className="text-[11px] text-gray-400">
                {fmtShiftTime(shift.start_time)} – {fmtShiftTime(shift.end_time)}
                {shift.break_minutes ? ` · ${shift.break_minutes}m break` : ''}
                {shift.grace_period_minutes ? ` · ${shift.grace_period_minutes}m grace` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Active break banner */}
        {isOnBreak && today?.current_break && (
          <ActiveBreakBanner
            currentBreak={today.current_break}
            onReturn={() => punch.mutate({ type: 'in' })}
            isSubmitting={punch.isPending}
          />
        )}

        {/* Punch button */}
        {isLoading ? (
          <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
        ) : (canPunchIn || canPunchOut) ? (
          <button
            onClick={() => (canPunchIn ? punch.mutate({ type: 'in' }) : setReasonModalOpen(true))}
            disabled={punch.isPending}
            className={cn(
              'w-full flex items-center justify-center gap-2 h-10 rounded-lg font-semibold text-sm transition-all',
              canPunchIn
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              punch.isPending && 'opacity-60 cursor-not-allowed',
            )}
          >
            {punch.isPending ? (
              <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : flashed ? (
              <><CheckCircle2 className="h-4 w-4" /> Done!</>
            ) : canPunchIn ? (
              <><LogIn className="h-4 w-4" /> Punch In</>
            ) : (
              <><LogOut className="h-4 w-4" /> Punch Out</>
            )}
          </button>
        ) : today?.clock_in && today?.clock_out ? (
          <div className="flex items-center justify-center gap-1.5 h-10 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Attendance recorded
          </div>
        ) : null}
      </div>

      <PunchOutReasonModal
        open={reasonModalOpen}
        onOpenChange={setReasonModalOpen}
        onConfirm={(reason_code, note) => punch.mutate({ type: 'out', reason_code, note })}
        isSubmitting={punch.isPending}
      />
    </Card>
  );
}

// ── Month Summary Panel ───────────────────────────────────────────

function MonthPanel() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['employee-attendance-summary', month, year],
    queryFn: () => employeeApi.getAttendanceSummary(month, year),
    staleTime: 5 * 60_000,
  });

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['employee-attendance-history', 'recent', 6],
    queryFn: () => employeeApi.getAttendanceHistory({ limit: 6 }),
    staleTime: 5 * 60_000,
  });

  const records = history?.data?.slice(0, 5) ?? [];
  const pct = summary && summary.total_working_days > 0
    ? Math.round((summary.present / summary.total_working_days) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title={format(now, 'MMMM yyyy')}
        action={
          <Link href="/attendance" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="p-4 space-y-4">
        {loadingSummary ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-4 rounded bg-gray-100 animate-pulse" />)}
          </div>
        ) : summary ? (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Present', value: summary.present, color: 'text-emerald-600' },
                { label: 'Late',    value: summary.late,    color: 'text-amber-600'   },
                { label: 'Absent',  value: summary.absent,  color: 'text-red-600'     },
                { label: 'OT Hrs',  value: summary.overtime_hours?.toFixed(1) ?? '0', color: 'text-primary' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={cn('text-xl font-bold', color)}>{value}</p>
                  <p className="text-[10px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Attendance % bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-gray-500">Attendance rate</p>
                <p className="text-[11px] font-semibold text-gray-700">{pct}%</p>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </>
        ) : null}

        {/* Recent records */}
        {!loadingHistory && records.length > 0 && (
          <div className="space-y-0 border-t border-gray-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Recent</p>
            {records.map((r) => {
              const s = statusMap[r.status];
              return (
                <div key={r.id} className="flex items-center gap-2 py-1.5">
                  <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', s?.dot ?? 'bg-gray-300')} />
                  <p className="text-[12px] text-gray-600 flex-1">{format(parseISO(r.date), 'EEE, d MMM')}</p>
                  <p className={cn('text-[11px] font-medium', s ? (r.status === 'present' ? 'text-emerald-600' : r.status === 'late' ? 'text-amber-600' : 'text-red-600') : 'text-gray-400')}>
                    {s?.label ?? r.status}
                  </p>
                  <p className="text-[11px] text-gray-400 w-24 text-right shrink-0">
                    {r.clock_in ? format(parseISO(r.clock_in), 'hh:mm a') : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Right Column: Shifts + Leave Balance ──────────────────────────

function RightColumn() {
  const now = new Date();

  const { data: upcomingShifts } = useQuery({
    queryKey: ['employee-shift-schedule-upcoming'],
    queryFn: () => employeeApi.getShiftSchedule({
      from: format(now, 'yyyy-MM-dd'),
      to: format(addDays(now, 7), 'yyyy-MM-dd'),
    }),
    staleTime: 5 * 60_000,
  });

  const { data: balances } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  const nextShifts = upcomingShifts?.slice(0, 4) ?? [];

  return (
    <div className="space-y-4">
      {/* Upcoming shifts */}
      <Card>
        <CardHeader
          title="Upcoming Shifts"
          action={
            <Link href="/shifts" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5">
              View <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        <div className="divide-y divide-gray-50">
          {nextShifts.length === 0 ? (
            <p className="px-4 py-4 text-[12px] text-gray-400 text-center">No upcoming shifts</p>
          ) : nextShifts.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-100">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{shiftDayLabel(s.date)}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {s.shift_name} · {fmtShiftTime(s.start_time)}–{fmtShiftTime(s.end_time)}
                </p>
              </div>
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                s.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                s.status === 'absent'    ? 'bg-red-50 text-red-500' :
                'bg-gray-100 text-gray-500',
              )}>
                {s.status === 'scheduled' ? 'Scheduled' : s.status === 'completed' ? 'Done' : 'Absent'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Leave balance */}
      <Card>
        <CardHeader
          title="Leave Balance"
          action={
            <Link href="/leave" className="text-[11px] font-medium text-primary hover:underline">
              Apply
            </Link>
          }
        />
        <div className="divide-y divide-gray-50">
          {!balances?.length ? (
            <p className="px-4 py-4 text-[12px] text-gray-400 text-center">No leave types</p>
          ) : balances.map((b) => {
            const pct = b.allocated > 0 ? Math.round((b.available / b.allocated) * 100) : 0;
            return (
              <div key={b.leave_type_id} className="px-4 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-medium text-gray-700 truncate pr-2">{b.leave_type_name}</p>
                  <p className="text-[12px] font-bold text-gray-900 shrink-0">{b.available}d</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 shrink-0">{b.used}/{b.allocated}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Payroll Snapshot Panel ────────────────────────────────────────

function PayrollPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['employee-payslips'],
    queryFn: () => employeeApi.getPayslips({ limit: 3 }),
    staleTime: 10 * 60_000,
  });

  const payslips = data?.data ?? [];
  const latest   = payslips[0];

  const statusStyle: Record<string, string> = {
    paid:      'bg-emerald-50 text-emerald-700',
    processed: 'bg-blue-50 text-blue-700',
    draft:     'bg-gray-100 text-gray-600',
  };

  return (
    <Card>
      <CardHeader
        title="Payroll"
        action={
          <Link href="/payslips" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5">
            All payslips <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1,2].map(i => <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />)}
        </div>
      ) : payslips.length === 0 ? (
        <p className="px-4 py-5 text-[12px] text-gray-400 text-center">No payslips yet</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {payslips.map((p) => (
            <Link
              key={p.id}
              href="/payslips"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">
                  {MONTHS[p.month - 1]} {p.year}
                </p>
                <p className="text-[11px] text-gray-400">
                  Net:{' '}
                  <span className="font-semibold text-gray-700">
                    {p.net_salary.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </span>
                </p>
              </div>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0', statusStyle[p.status] ?? 'bg-gray-100 text-gray-600')}>
                {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Recent Requests ───────────────────────────────────────────────

function RecentRequests() {
  const { data } = useQuery({
    queryKey: ['employee-submitted-requests'],
    queryFn: () => approvalsApi.getSubmitted({ limit: 4 }),
    staleTime: 60_000,
  });
  const requests = data?.data?.slice(0, 3) ?? [];

  const typeLabel: Record<string, string> = {
    leave_request:         'Leave',
    attendance_correction: 'Attendance',
    shift_change:          'Shift Change',
    overtime:              'Overtime',
    expense:               'Expense',
    fine_appeal:           'Fine Appeal',
  };

  if (!requests.length) return null;

  return (
    <Card>
      <CardHeader
        title="Recent Requests"
        action={
          <Link href="/requests" className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="divide-y divide-gray-50">
        {requests.map((r) => {
          const s = reqStatusMap[r.status];
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{r.title}</p>
                <p className="text-[11px] text-gray-400">{typeLabel[r.workflow_type] ?? r.workflow_type}</p>
              </div>
              {s && (
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0', s.cls)}>
                  {s.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────

export function PortalDashboard() {
  const { employeeProfile } = useAuthStore();
  const firstName = employeeProfile?.first_name ?? 'there';

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => employeeApi.getNotifications(),
    staleTime: 60_000,
    retry: false,
  });
  const unreadCount = notifData?.unread_count ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      {/* Page header — sticky within scroll area */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <div>
          <p className="text-xs text-gray-400">{greeting}</p>
          <h1 className="text-[15px] font-bold text-gray-900 leading-tight">{firstName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-400 hidden lg:block">{format(new Date(), 'EEEE, d MMM yyyy')}</p>
          <Link
            href="/notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Scrollable page content */}
      <div className="p-6 space-y-5 max-w-[1400px]">
        {/* KPI strip */}
        <KPIStrip />

        {/* Main grid: 3 cols on large screens, 2 cols on md */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Today + Month */}
          <div className="lg:col-span-1 space-y-5">
            <TodayPanel />
          </div>

          {/* Center: Month summary */}
          <div className="lg:col-span-1 space-y-5">
            <MonthPanel />
          </div>

          {/* Right: Shifts + Leave */}
          <div className="lg:col-span-1">
            <RightColumn />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <RecentRequests />
          <PayrollPanel />
        </div>
      </div>
    </div>
  );
}
