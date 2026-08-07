'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { startOfWeek, endOfWeek, subDays, format, startOfMonth, endOfMonth, eachDayOfInterval, addDays } from 'date-fns';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  Users, CalendarCheck, Clock, TrendingUp, TrendingDown,
  Building2, UserCheck, UserPlus, AlertTriangle,
  CreditCard, FileText, RefreshCw, ArrowRight,
  Shield, Layers, ChevronLeft, ChevronRight, Search, Loader2,
  Fingerprint, UserX, AlarmClock, LogOut, Calendar, Coffee, X,
} from 'lucide-react';
import { AttendanceStatusModal } from '@/components/ui/attendance-status-modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { SummaryStats } from '@/components/attendance/summary-stats';
import { DailyAttendanceGrid } from '@/components/attendance/daily-attendance-grid';
import { WeeklySummary } from '@/components/attendance/weekly-summary';
import { RequestModal } from '@/components/attendance/request-modal';

/* ─── tiny helpers ──────────────────────────────────────────────── */
function StatCard({
  label, value, sub, gradient, icon: Icon, trend, onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  gradient: string;
  icon: React.ElementType;
  trend?: { dir: 'up' | 'down'; label: string };
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg animate-slide-up text-left w-full ${gradient} ${onClick ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
    >
      {/* Background circle decoration */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
      <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              trend.dir === 'up' ? 'bg-white/20' : 'bg-black/20'
            }`}>
              {trend.dir === 'up'
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />
              }
              {trend.label}
            </div>
          )}
        </div>
        <p className="text-3xl font-bold tracking-tight mb-0.5">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
      </div>
    </Tag>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: string }) {
  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action && (
          <button className="flex items-center gap-1 text-xs text-primary font-medium hover:underline transition-colors">
            {action} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseMonthValue(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function getWeekOptionsForMonth(monthValue: string) {
  const monthStart = startOfMonth(parseMonthValue(monthValue));
  const monthEnd = endOfMonth(monthStart);
  const weeks: Array<{ value: string; label: string }> = [];

  for (let cursor = startOfWeek(monthStart), index = 1; cursor <= monthEnd; cursor = addDays(cursor, 7), index += 1) {
    weeks.push({
      value: format(cursor, 'yyyy-MM-dd'),
      label: `Week ${index}: ${format(cursor, 'MMM d')} - ${format(endOfWeek(cursor), 'MMM d')}`,
    });
  }

  return weeks;
}

function RowItem({ label, value, badge }: { label: string; value: string | number; badge?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0 group">
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(220 65% 46%), hsl(230 70% 58%))' }}
        >
          {String(label).slice(0, 1).toUpperCase()}
        </div>
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {badge}
          </span>
        )}
        <span className="text-sm font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

function PersonRow({ name, date, dateLabel }: { name: string; date: string; dateLabel?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(220 65% 46%))' }}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-sm text-foreground">{name}</span>
      </div>
      <div className="text-right">
        {dateLabel && <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{dateLabel}</p>}
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
    </div>
  );
}

/* ─── organization overview tab content components ─────────────── */
type SubTab = 'overview' | 'employees' | 'attendance' | 'departments';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

const liveActivityMeta = (status: any): { label: string; icon: React.ElementType; className: string; time?: string } => {
  const code = status?.code ?? 'not_punched_in';
  switch (code) {
    case 'present':
      return { label: 'Punched In', icon: UserCheck, className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', time: status?.clockIn };
    case 'late':
      return { label: `Punched In · Late${status?.lateMinutes ? ` ${status.lateMinutes}m` : ''}`, icon: AlarmClock, className: 'bg-amber-500/10 text-amber-700 border-amber-500/20', time: status?.clockIn };
    case 'on_break':
      return { label: status?.breakLabel || 'On Break', icon: Coffee, className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20', time: status?.clockIn };
    case 'checked_out':
      return { label: 'Punched Out', icon: LogOut, className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', time: status?.clockOut };
    case 'absent':
      return { label: 'Absent', icon: UserX, className: 'bg-red-500/10 text-red-600 border-red-500/20' };
    default:
      return { label: 'Not Punched In', icon: Clock, className: 'bg-gray-100 text-gray-500 border-gray-200' };
  }
};

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

function LiveActivityBadge({ status }: { status: any }) {
  const meta = liveActivityMeta(status);
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${meta.className}`}>
        <Icon className="w-3 h-3" />
        {meta.label}
      </span>
      {meta.time && <span className="text-[11px] text-muted-foreground">{fmtTime(meta.time)}</span>}
    </div>
  );
}

const attBadge = (s: string) => ({
  present: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  absent: 'bg-red-500/10 text-red-600 border-red-500/20',
  late: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  'half-day': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  inactive: 'bg-gray-500/10 text-gray-500 border-gray-200',
  probation: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  confirmed: 'bg-teal-500/10 text-teal-700 border-teal-500/20',
}[s] ?? 'bg-gray-100 text-gray-500 border-gray-200');

type EmployeeListFilter = { label: string; status?: string; attendance?: string };

function OrgOverviewTab({ orgId, onFilterEmployees }: { orgId: string; onFilterEmployees: (filter: EmployeeListFilter) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    api.get(`/platform/orgs/${orgId}/stats`)
      .then(r => setStats(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <InlineSpinner />;
  if (!stats) return <InlineEmpty label="Failed to load overview" />;

  const attTotal = Object.values(stats.attendance_today as Record<string, number>).reduce((a, b) => a + b, 0);
  const presentToday = stats.present_today ?? stats.attendance_today?.present ?? 0;

  return (
    <div className="space-y-5">
      {/* Row 1: core KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Total Employees', value: stats.total_employees, icon: Users, color: 'text-blue-600 bg-blue-500/10', filter: { label: 'Total Employees' } },
          { label: 'Present Today', value: presentToday, icon: CalendarCheck, color: 'text-emerald-600 bg-emerald-500/10', filter: { label: 'Present Today', attendance: 'present_today' } },
          { label: 'Active', value: stats.currently_punched_in ?? 0, icon: UserCheck, color: 'text-teal-600 bg-teal-500/10', filter: { label: 'Currently Punched In', attendance: 'punched_in' } },
          { label: 'On Probation', value: stats.employees_by_status?.probation ?? 0, icon: Clock, color: 'text-amber-600 bg-amber-500/10', filter: { label: 'On Probation', status: 'probation' } },
        ].map(({ label, value, icon: Icon, color, filter }) => (
          <button key={label} onClick={() => onFilterEmployees(filter)}
            className="bg-muted/40 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-muted/70 hover:shadow-sm transition-all cursor-pointer">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-none">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Row 2: attendance detail KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Biometric Devices', value: stats.total_biometric_devices ?? 0, icon: Fingerprint, color: 'text-indigo-600 bg-indigo-500/10', filter: null },
          { label: 'Absent Today', value: stats.absent_today ?? 0, icon: UserX, color: 'text-red-600 bg-red-500/10', filter: { label: 'Absent Today', attendance: 'absent_today' } },
          { label: 'Early Leave', value: stats.early_leave_today ?? 0, icon: LogOut, color: 'text-orange-600 bg-orange-500/10', filter: { label: 'Early Leave', attendance: 'early_leave_today' } },
          { label: 'Late Arrivals', value: stats.late_arrivals_today ?? 0, icon: AlarmClock, color: 'text-teal-600 bg-teal-500/10', filter: { label: 'Late Arrivals', attendance: 'late_today' } },
        ].map(({ label, value, icon: Icon, color, filter }) => {
          const Tag = filter ? 'button' : 'div';
          return (
            <Tag key={label} onClick={filter ? () => onFilterEmployees(filter) : undefined}
              className={`bg-muted/40 rounded-xl p-4 flex items-center gap-3 text-left transition-all ${filter ? 'hover:bg-muted/70 hover:shadow-sm cursor-pointer' : ''}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground leading-none">{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            </Tag>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Employee Status</p>
          {Object.entries(stats.employees_by_status as Record<string, number>).map(([s, c]) => (
            <div key={s} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${attBadge(s)}`}>{s}</span>
              <span className="text-sm font-semibold">{c}</span>
            </div>
          ))}
          {!Object.keys(stats.employees_by_status).length && <InlineEmpty label="No data" />}
        </div>

        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today's Attendance</p>
          {Object.entries(stats.attendance_today as Record<string, number>).map(([s, c]) => (
            <div key={s} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${attBadge(s)}`}>{s}</span>
              <span className="text-sm font-semibold">{c}</span>
            </div>
          ))}
          {!attTotal && <InlineEmpty label="No attendance today" />}
        </div>

        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top Departments</p>
          {stats.departments?.map((d: any) => (
            <div key={d.name} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
              <span className="text-sm text-foreground truncate">{d.name || 'Unassigned'}</span>
              <span className="text-sm font-semibold shrink-0 ml-2">{d.count}</span>
            </div>
          ))}
          {!stats.departments?.length && <InlineEmpty label="No departments" />}
        </div>
      </div>

      {/* Recent Joiners + Recent Resigned as lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Joiners</p>
          {stats.recent_joiners?.length > 0 ? (
            stats.recent_joiners.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(220 65% 46%))' }}>
                    {e.first_name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-foreground">{e.first_name} {e.last_name}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Joined</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(e.date_of_joining)}</p>
                </div>
              </div>
            ))
          ) : (
            <InlineEmpty label="No recent joiners" />
          )}
        </div>

        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Resigned</p>
          {stats.recent_resigned?.length > 0 ? (
            stats.recent_resigned.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, hsl(0 65% 55%), hsl(10 70% 62%))' }}>
                    {e.first_name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-foreground">{e.first_name} {e.last_name}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Left on</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(e.date_of_leaving || e.resigned_date)}</p>
                </div>
              </div>
            ))
          ) : (
            <InlineEmpty label="No recent resignations" />
          )}
        </div>
      </div>
    </div>
  );
}

function OrgEmployeesTab({ orgId, filterPreset }: { orgId: string; filterPreset?: (EmployeeListFilter & { nonce: number }) | null }) {
  // orgId/filterPreset only ever take a new value via a fresh mount (switching
  // org or clicking a stat card both unmount this tab first), so the filter
  // can be seeded as initial state — no sync effect needed, which would
  // otherwise race an unfiltered first fetch against the filtered one.
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(filterPreset?.status ?? '');
  const [attendanceFilter, setAttendanceFilter] = useState(filterPreset?.attendance ?? '');
  const [activeFilterLabel, setActiveFilterLabel] = useState(
    filterPreset && (filterPreset.status || filterPreset.attendance) ? filterPreset.label : ''
  );
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, total_pages: 1 });

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) p.set('search', search);
      if (statusFilter) p.set('status', statusFilter);
      if (attendanceFilter) p.set('attendance', attendanceFilter);
      const r = await api.get(`/platform/orgs/${orgId}/employees?${p}`);
      setEmployees(r.data.data || []);
      setMeta(r.data.meta || { total: 0, total_pages: 1 });
    } catch { setEmployees([]); }
    finally { setLoading(false); }
  }, [orgId, page, search, statusFilter, attendanceFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const clearFilter = () => {
    setStatusFilter(''); setAttendanceFilter(''); setActiveFilterLabel(''); setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or code..."
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setAttendanceFilter(''); setActiveFilterLabel(''); setPage(1); }}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">All Statuses</option>
          {['active', 'inactive', 'probation', 'confirmed'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>
      {activeFilterLabel && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            Filtered by: {activeFilterLabel}
            <button onClick={clearFilter} className="p-0.5 rounded-full hover:bg-primary/20">
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}
      <div className="rounded-xl border border-border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {['Employee', 'Code', 'Department', 'Designation', 'Joined', 'Status', 'Live Activity'].map(h => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-12 text-center"><InlineSpinner /></TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12"><InlineEmpty label="No employees found" /></TableCell></TableRow>
            ) : employees.map((e, i) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: `linear-gradient(135deg, hsl(${(i * 47 + 200) % 360} 65% 50%), hsl(${(i * 47 + 220) % 360} 70% 58%))` }}>
                      {e.first_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground">{e.first_name} {e.last_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{e.employee_code}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.department_name || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.designation_name || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(e.date_of_joining)}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${attBadge(e.status)}`}>{e.status}</span>
                </TableCell>
                <TableCell>
                  <LiveActivityBadge status={e.live_status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">{meta.total} employees</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-muted-foreground">pg {page}/{meta.total_pages}</span>
              <button onClick={() => setPage(p => Math.min(meta.total_pages, p + 1))} disabled={page === meta.total_pages}
                className="p-1 rounded-lg border border-border hover:bg-muted disabled:opacity-40">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrgAttendanceTab({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'requests' | 'breaks'>('daily');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedWeekMonth, setSelectedWeekMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedWeekStart, setSelectedWeekStart] = useState(format(startOfWeek(new Date()), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [violationsFrom, setViolationsFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [violationsTo, setViolationsTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [attendanceStatusEmp, setAttendanceStatusEmp] = useState<any | null>(null);
  const [overviewView, setOverviewView] = useState<'weekly' | 'monthly'>('weekly');
  const [currentPage, setCurrentPage] = useState(1);

  const weekOptions = useMemo(() => getWeekOptionsForMonth(selectedWeekMonth), [selectedWeekMonth]);

  const attendanceRange = useMemo(() => {
    if (activeTab === 'weekly' && overviewView === 'weekly') {
      const weekStart = parseDateValue(selectedWeekStart);
      return {
        dateFrom: format(weekStart, 'yyyy-MM-dd'),
        dateTo: format(endOfWeek(weekStart), 'yyyy-MM-dd'),
      };
    }

    if (activeTab === 'weekly' && overviewView === 'monthly') {
      const monthStart = startOfMonth(parseMonthValue(selectedMonth));
      return {
        dateFrom: format(monthStart, 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(monthStart), 'yyyy-MM-dd'),
      };
    }

    return {
      dateFrom: selectedDate,
      dateTo: selectedDate,
    };
  }, [activeTab, overviewView, selectedDate, selectedMonth, selectedWeekStart]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, summaryRes, requestsRes] = await Promise.all([
        api.get(`/platform/orgs/${orgId}/attendance`, {
          params: {
            page: 1,
            limit: 500,
            date_from: attendanceRange.dateFrom,
            date_to: attendanceRange.dateTo,
          },
        }),
        api.get(`/platform/orgs/${orgId}/attendance/summary`, {
          params: { date_from: attendanceRange.dateFrom, date_to: attendanceRange.dateTo },
        }),
        api.get(`/platform/orgs/${orgId}/attendance/requests`),
      ]);

      const normalizedRecords = (recordsRes.data.data || []).map((record: any) => ({
        id: record.id,
        employee_id: record.employee_id,
        employee_code: record.employee_code || '',
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        date: record.date,
        clock_in: record.clock_in,
        clock_out: record.clock_out,
        status: record.status || 'absent',
        late_minutes: record.late_minutes || 0,
        overtime_minutes: record.overtime_minutes || 0,
      }));

      const summaryData = summaryRes.data.data || [];
      const statuses = ['present', 'absent', 'late', 'half_day'];
      const normalizedSummary = statuses.map(status => {
        const found = summaryData.find((s: any) => s.status === status);
        return { status, count: found ? found.count : 0 };
      });

      setRecords(normalizedRecords);
      setSummary(normalizedSummary);
      setRequests(requestsRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch org attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, attendanceRange]);

  useEffect(() => {
    const today = new Date();
    setActiveTab('daily');
    setSelectedDate(format(today, 'yyyy-MM-dd'));
    setSelectedWeekMonth(format(today, 'yyyy-MM'));
    setSelectedWeekStart(format(startOfWeek(today), 'yyyy-MM-dd'));
    setSelectedMonth(format(today, 'yyyy-MM'));
  }, [orgId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, selectedWeekMonth, selectedWeekStart, selectedMonth, activeTab, overviewView]);

  useEffect(() => {
    if (overviewView !== 'weekly') return;
    if (weekOptions.some((option) => option.value === selectedWeekStart)) return;
    setSelectedWeekStart(weekOptions[0]?.value ?? format(startOfWeek(parseMonthValue(selectedWeekMonth)), 'yyyy-MM-dd'));
  }, [overviewView, selectedWeekMonth, selectedWeekStart, weekOptions]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchViolations = useCallback(async () => {
    setViolationsLoading(true);
    try {
      const res = await api.get(`/platform/orgs/${orgId}/attendance/breaks/violations`, {
        params: { date_from: violationsFrom, date_to: violationsTo },
      });
      setViolations(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch org break violations:', err);
    } finally {
      setViolationsLoading(false);
    }
  }, [orgId, violationsFrom, violationsTo]);

  useEffect(() => {
    if (activeTab === 'breaks') fetchViolations();
  }, [activeTab, fetchViolations]);

  const handleApproveRequest = async (id: string) => {
    try {
      setRequestLoading(true);
      await api.post(`/platform/orgs/${orgId}/attendance/requests/${id}/approve`);
      fetchData();
    } catch {
      alert('Failed to approve request');
    } finally {
      setRequestLoading(false);
    }
  };

  const handleRejectRequest = async (id: string, notes: string) => {
    try {
      setRequestLoading(true);
      await api.post(`/platform/orgs/${orgId}/attendance/requests/${id}/reject`, { reason: notes });
      fetchData();
    } catch {
      alert('Failed to reject request');
    } finally {
      setRequestLoading(false);
    }
  };

  const mappedSummary = summary.map((s) => ({
    status: s.status as 'present' | 'absent' | 'late' | 'half_day',
    count: s.count,
  }));

  const weekStartDate = parseDateValue(selectedWeekStart);
  const selectedMonthStartDate = startOfMonth(parseMonthValue(selectedMonth));
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <SummaryStats stats={mappedSummary} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'daily', label: 'Daily Records' },
          { id: 'weekly', label: 'Overview' },
          { id: 'requests', label: 'Requests' },
          { id: 'breaks', label: 'Break Violations' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-4 py-3 font-medium text-sm transition-colors ${
              activeTab === t.id
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'requests' && pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Date pickers */}
      {activeTab === 'breaks' ? (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input type="date" value={violationsFrom} onChange={(e) => setViolationsFrom(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={violationsTo} onChange={(e) => setViolationsTo(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      ) : activeTab === 'daily' ? (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      ) : activeTab === 'weekly' && (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <Calendar className="w-4 h-4 text-muted-foreground mb-2.5" />
          {overviewView === 'weekly' ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Month
                <input
                  type="month"
                  value={selectedWeekMonth}
                  onChange={(e) => setSelectedWeekMonth(e.target.value)}
                  className="border border-border rounded-xl px-3 py-2 text-sm font-normal text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label className="flex min-w-[220px] flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Week
                <select
                  value={selectedWeekStart}
                  onChange={(e) => setSelectedWeekStart(e.target.value)}
                  className="border border-border rounded-xl px-3 py-2 text-sm font-normal text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {weekOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="pb-2 text-sm text-muted-foreground">
                {format(weekStartDate, 'MMM d')} - {format(endOfWeek(weekStartDate), 'MMM d, yyyy')}
              </p>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Month
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-border rounded-xl px-3 py-2 text-sm font-normal text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <p className="pb-2 text-sm text-muted-foreground">
                {format(selectedMonthStartDate, 'MMMM yyyy')}
              </p>
            </>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === 'daily' && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
          </h3>
          <DailyAttendanceGrid
            records={records}
            isLoading={loading}
            onViewDetails={(id) => {
              const r = records.find((rec) => rec.id === id);
              if (r) {
                setAttendanceStatusEmp({
                  id: r.employee_id, first_name: r.first_name, last_name: r.last_name, employee_code: r.employee_code,
                });
              }
            }}
          />
        </div>
      )}

      {activeTab === 'weekly' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 border border-border rounded-xl shadow-sm">
            <h4 className="text-sm font-semibold text-foreground">Overview</h4>
            <div className="flex gap-2 bg-muted p-1 rounded-lg">
              <button
                onClick={() => setOverviewView('weekly')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  overviewView === 'weekly' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setOverviewView('monthly')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  overviewView === 'monthly' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {(() => {
            const grouped = Object.entries(
              records.reduce((acc: Record<string, any>, record) => {
                if (!acc[record.employee_id]) {
                  acc[record.employee_id] = {
                    employeeName: `${record.first_name} ${record.last_name}`,
                    employeeCode: record.employee_code,
                    records: [],
                  };
                }
                acc[record.employee_id].records.push({
                  date: format(new Date(record.date), 'yyyy-MM-dd'),
                  status: record.status,
                  clockIn: record.clock_in,
                  clockOut: record.clock_out,
                });
                return acc;
              }, {})
            );

            if (grouped.length === 0) {
              return (
                <div className="flex items-center justify-center h-32 text-muted-foreground bg-white border border-border rounded-xl">
                  No attendance records found
                </div>
              );
            }

            const ITEMS_PER_PAGE = 6;
            const totalPages = Math.ceil(grouped.length / ITEMS_PER_PAGE);
            const paginated = grouped.slice(
              (currentPage - 1) * ITEMS_PER_PAGE,
              currentPage * ITEMS_PER_PAGE
            );

            return (
              <div className="space-y-6">
                {overviewView === 'weekly' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
                    {paginated.map(([employeeId, empData]: [string, any]) => (
                      <WeeklySummary
                        key={employeeId}
                        employeeName={empData.employeeName}
                        employeeCode={empData.employeeCode}
                        weekStartDate={weekStartDate}
                        records={empData.records}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
                    {paginated.map(([employeeId, empData]: [string, any]) => {
                      const { employeeName, employeeCode, records: empRecords } = empData;
                      const monthStart = selectedMonthStartDate;
                      const monthEnd = endOfMonth(selectedMonthStartDate);
                      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
                      const startDayOfWeek = monthStart.getDay();
                      const padding = Array.from({ length: startDayOfWeek }, (_, i) => null);

                      const presentCount = empRecords.filter((r: any) => r.status === 'present').length;
                      const lateCount = empRecords.filter((r: any) => r.status === 'late').length;
                      const absentCount = empRecords.filter((r: any) => r.status === 'absent').length;
                      const halfDayCount = empRecords.filter((r: any) => r.status === 'half_day').length;

                      return (
                        <div key={employeeId} className="bg-white border border-border rounded-xl p-4 shadow-sm space-y-4 flex flex-col justify-between w-full">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border pb-3">
                              <div>
                                <h3 className="font-semibold text-foreground text-sm truncate max-w-[150px]">{employeeName}</h3>
                                <p className="text-xs font-mono text-muted-foreground mt-0.5">{employeeCode}</p>
                              </div>
                              <p className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                {format(monthStart, 'MMM yyyy')}
                              </p>
                            </div>

                            {/* Scaled Calendar: ~75% size (3/4 Size) */}
                            <div className="grid grid-cols-7 gap-0.5 text-center max-w-[210px] mx-auto">
                              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
                                <div key={w} className="text-[8.5px] font-bold text-muted-foreground py-0.5 uppercase">{w}</div>
                              ))}
                              {padding.map((_, pIdx) => (
                                <div key={`pad-${pIdx}`} className="w-6 h-6" />
                              ))}
                              {daysInMonth.map((day, dIdx) => {
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const record = empRecords.find((r: any) => r.date === dayStr);
                                let colorCls = 'bg-muted/30 border-border text-muted-foreground';
                                if (record) {
                                  if (record.status === 'present') colorCls = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                                  if (record.status === 'absent') colorCls = 'bg-red-100 text-red-700 border-red-200';
                                  if (record.status === 'late') colorCls = 'bg-orange-100 text-orange-700 border-orange-200';
                                  if (record.status === 'half_day') colorCls = 'bg-blue-100 text-blue-700 border-blue-200';
                                }
                                return (
                                  <div
                                    key={dIdx}
                                    className={`w-6 h-6 mx-auto flex items-center justify-center rounded border text-[8px] font-semibold transition-all ${colorCls}`}
                                    title={record ? `${format(day, 'MMM d')}: ${record.status}` : format(day, 'MMM d')}
                                  >
                                    {format(day, 'd')}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t border-border pt-3 grid grid-cols-4 gap-1 text-center text-[11px]">
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground uppercase">Present</p>
                              <p className="font-bold text-emerald-600">{presentCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground uppercase">Late</p>
                              <p className="font-bold text-orange-600">{lateCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground uppercase">Half Day</p>
                              <p className="font-bold text-blue-600">{halfDayCount}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground uppercase">Absent</p>
                              <p className="font-bold text-red-600">{absentCount}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Centered Pagination Control Panel */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8 bg-white p-3 border border-border rounded-xl shadow-sm max-w-sm mx-auto">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40 transition-all"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-7.5 h-7.5 flex items-center justify-center rounded-lg text-xs font-bold border transition-all ${
                            currentPage === page
                              ? 'bg-primary border-primary text-white shadow-sm'
                              : 'bg-white border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40 transition-all"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <InlineEmpty label="No attendance requests" />
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="p-4 border border-border rounded-xl hover:bg-muted/40 cursor-pointer transition-colors bg-white"
                onClick={() => { setSelectedRequest(request); setShowRequestModal(true); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{request.first_name} {request.last_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.request_type} • {format(new Date(request.date), 'MMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{request.reason}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    request.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : request.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'breaks' && (
        <div className="space-y-6">
          {(() => {
            const byEmployee = violations.reduce((acc: Record<string, any>, v: any) => {
              const key = v.employee_id;
              if (!acc[key]) acc[key] = { name: `${v.first_name} ${v.last_name}`, code: v.employee_code, count: 0, totalOverdue: 0 };
              acc[key].count += 1;
              acc[key].totalOverdue += v.overdue_minutes || 0;
              return acc;
            }, {});
            const offenders = Object.values(byEmployee).sort((a: any, b: any) => b.count - a.count).slice(0, 6);

            if (violationsLoading || offenders.length === 0) return null;

            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {offenders.map((o: any) => (
                  <div key={`${o.code}-${o.name}`} className="bg-white border border-border rounded-xl p-3">
                    <p className="text-sm font-semibold text-foreground truncate">{o.name}</p>
                    <p className="text-xs text-muted-foreground">{o.code}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-bold text-red-600">{o.count} violation{o.count !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-muted-foreground">{o.totalOverdue}m over</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="rounded-xl border border-border overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  {['Employee', 'Date', 'Break Type', 'Started', 'Duration', 'Allowed', 'Overdue By'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {violationsLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-12"><InlineSpinner /></TableCell></TableRow>
                ) : violations.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-12"><InlineEmpty label="No break violations in this date range" /></TableCell></TableRow>
                ) : violations.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{v.first_name} {v.last_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{v.employee_code}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(v.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Coffee className="w-3.5 h-3.5 text-amber-500" />
                        {v.reason_label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(v.started_at), 'hh:mm a')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.duration_minutes}m</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.allowed_minutes != null ? `${v.allowed_minutes}m` : '—'}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        {v.overdue_minutes}m
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <RequestModal
        request={selectedRequest}
        isOpen={showRequestModal}
        onClose={() => { setShowRequestModal(false); setSelectedRequest(null); }}
        onApprove={handleApproveRequest}
        onReject={handleRejectRequest}
        isLoading={requestLoading}
      />

      {attendanceStatusEmp && (
        <AttendanceStatusModal employee={attendanceStatusEmp} orgId={orgId} onClose={() => setAttendanceStatusEmp(null)} />
      )}
    </div>
  );
}

function OrgDepartmentsTab({ orgId }: { orgId: string }) {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setDepartments([]);
    api.get(`/platform/orgs/${orgId}/departments`)
      .then(r => setDepartments(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <InlineSpinner />;

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {['Department', 'Code', 'Employees'].map(h => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.length === 0 ? (
            <TableRow><TableCell colSpan={3} className="py-12"><InlineEmpty label="No departments configured" /></TableCell></TableRow>
          ) : departments.map((d, i) => (
            <TableRow key={d.id}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ background: `linear-gradient(135deg, hsl(${(i * 60 + 210) % 360} 60% 48%), hsl(${(i * 60 + 230) % 360} 65% 56%))` }}>
                    {d.name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{d.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-xs font-mono text-muted-foreground">{d.code || '—'}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  {d.employee_count}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InlineSpinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-primary/50" />
    </div>
  );
}

function InlineEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Building2 className="w-7 h-7 mb-2 opacity-20" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ─── organization platform overview — browser-tab layout ───────── */
interface OrgSummary {
  id: string; name: string; slug: string; status: string;
  emp_code_prefix?: string; timezone: string;
  total_employees: number; present_today: number;
}

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'departments', label: 'Departments', icon: Building2 },
];

function PlatformDashboard() {
  const { selectedTenantId } = useAuthStore();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [employeeFilter, setEmployeeFilter] = useState<(EmployeeListFilter & { nonce: number }) | null>(null);

  const filterEmployees = (filter: EmployeeListFilter) => {
    setEmployeeFilter({ ...filter, nonce: Date.now() });
    setSubTab('employees');
  };

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const r = await api.get('/platform/orgs');
      const list: OrgSummary[] = r.data.data || [];
      setOrgs(list);
      if (list.length && !selectedId) {
        // Default the active tab to whichever org is currently selected in
        // the header dropdown, so the dashboard doesn't drift to an
        // unrelated org on its own — it only changes when the user picks a
        // different one there.
        const headerOrg = selectedTenantId && list.find(o => o.id === selectedTenantId);
        setSelectedId(headerOrg ? headerOrg.id : list[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch platform overview:', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchOrgs(); }, []);

  const selectedOrg = orgs.find(o => o.id === selectedId);

  const orgColor = (i: number) =>
    `linear-gradient(135deg, hsl(${(i * 55 + 210) % 360} 65% 46%), hsl(${(i * 55 + 230) % 360} 70% 58%))`;

  return (
    <div className="animate-fade-in space-y-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">Platform Overview</h1>
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md font-medium">
            <Shield className="w-3 h-3" />
            Admin
          </span>
        </div>
        <button onClick={fetchOrgs}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground border border-border rounded-2xl bg-white">
          <Building2 className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">No organizations found</p>
        </div>
      ) : (
        <>
          {/* ── Browser-style org tab bar ── */}
          <div className="flex items-end overflow-x-auto gap-0.5 border-b border-border pb-0 scrollbar-hide">
            {orgs.map((org, i) => {
              const active = org.id === selectedId;
              return (
                <button
                  key={org.id}
                  onClick={() => { setSelectedId(org.id); setSubTab('overview'); setEmployeeFilter(null); }}
                  className={`
                    group relative flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap
                    border border-b-0 rounded-t-lg transition-all min-w-0 shrink-0
                    ${active
                      ? 'bg-white border-border text-foreground font-semibold shadow-sm -mb-px z-10'
                      : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                    }
                  `}
                >
                  <div
                    className="w-4 h-4 rounded-sm shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ background: orgColor(i) }}
                  >
                    {org.name[0]?.toUpperCase()}
                  </div>
                  <span className="max-w-[140px] truncate">{org.name}</span>
                  {org.status !== 'active' && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 shrink-0">
                      {org.status}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Content panel for selected org ── */}
          {selectedOrg && (
            <div className="bg-white border border-border border-t-0 rounded-b-2xl overflow-hidden">
              {/* Org info bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: orgColor(orgs.findIndex(o => o.id === selectedOrg.id)) }}>
                    {selectedOrg.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">{selectedOrg.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{selectedOrg.slug}</span>
                    {selectedOrg.emp_code_prefix && (
                      <span className="text-[10px] font-mono font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {selectedOrg.emp_code_prefix}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {selectedOrg.total_employees} employees
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarCheck className="w-3 h-3" />
                    {selectedOrg.present_today} present today
                  </span>
                </div>
              </div>

              {/* Sub-tab nav */}
              <div className="flex items-center gap-0 border-b border-border px-5">
                {SUB_TABS.map(tab => {
                  const Icon = tab.icon;
                  const active = subTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setSubTab(tab.id); setEmployeeFilter(null); }}
                      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px
                        ${active
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Sub-tab content */}
              <div className="p-5">
                {subTab === 'overview' && <OrgOverviewTab orgId={selectedOrg.id} onFilterEmployees={filterEmployees} />}
                {subTab === 'employees' && <OrgEmployeesTab orgId={selectedOrg.id} filterPreset={employeeFilter} />}
                {subTab === 'attendance' && <OrgAttendanceTab orgId={selectedOrg.id} />}
                {subTab === 'departments' && <OrgDepartmentsTab orgId={selectedOrg.id} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── page ─────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { activeOrganization, userType } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [hrMetrics, setHrMetrics] = useState<any>(null);
  const [financeMetrics, setFinanceMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const usePlatformDashboard =
    userType === 'super_admin' ||
    userType === 'org_admin' ||
    !!activeOrganization?.isOrgAdmin;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/summary');
      setOverview(data.data.overview);
      setHrMetrics(data.data.hr_metrics);
      setFinanceMetrics(data.data.finance_metrics);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!usePlatformDashboard) fetchData();
  }, [fetchData, usePlatformDashboard]);

  if (usePlatformDashboard) {
    return <PlatformDashboard />;
  }

  const fmt = (n: number) =>
    n >= 1_00_000
      ? `₹${(n / 1_00_000).toFixed(1)}L`
      : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const initialLoading = loading && !overview && !hrMetrics && !financeMetrics;
  const metricValue = (value: string | number) => initialLoading ? '...' : value;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time snapshot of your hotel workforce
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-2 hover:bg-muted transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── KPI stat cards row 1 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Employees"
          value={metricValue(overview?.total_employees ?? 0)}
          sub="All departments"
          gradient="card-gradient-blue"
          icon={Users}
          trend={{ dir: 'up', label: 'Active' }}
          onClick={() => router.push('/dashboard/hr/employees')}
        />
        <StatCard
          label="Present Today"
          value={metricValue(overview?.present_today ?? overview?.attendance_today?.present ?? 0)}
          sub={`of ${overview?.attendance_workforce_total ?? overview?.total_employees ?? 0} active workforce`}
          gradient="card-gradient-emerald"
          icon={CalendarCheck}
          onClick={() => router.push('/dashboard/hr/employees?attendance=present_today')}
        />
        <StatCard
          label="Pending Leaves"
          value={metricValue(overview?.leave_requests?.pending ?? 0)}
          sub="Awaiting approval"
          gradient="card-gradient-amber"
          icon={Clock}
          trend={
            (overview?.leave_requests?.pending ?? 0) > 0
              ? { dir: 'up', label: 'Action needed' }
              : undefined
          }
          onClick={() => router.push('/dashboard/hr/leave')}
        />
        <StatCard
          label="Total Expenses"
          value={metricValue(fmt(overview?.total_expenses ?? 0))}
          sub="All time"
          gradient="card-gradient-rose"
          icon={CreditCard}
          onClick={() => router.push('/dashboard/finance/expenses')}
        />
      </div>

      {/* ── KPI stat cards row 2 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Biometric Devices"
          value={metricValue(overview?.total_biometric_devices ?? 0)}
          sub="Registered devices"
          gradient="card-gradient-indigo"
          icon={Fingerprint}
        />
        <StatCard
          label="Absent Today"
          value={metricValue(overview?.absent_today ?? 0)}
          sub={`of ${overview?.total_employees ?? 0} employees`}
          gradient="card-gradient-red"
          icon={UserX}
          trend={
            (overview?.absent_today ?? 0) > 0
              ? { dir: 'down', label: 'Absent' }
              : undefined
          }
          onClick={() => router.push('/dashboard/hr/employees?attendance=absent_today')}
        />
        <StatCard
          label="Early Leave"
          value={metricValue(overview?.early_leave_today ?? 0)}
          sub="Left before shift end"
          gradient="card-gradient-orange"
          icon={LogOut}
          trend={
            (overview?.early_leave_today ?? 0) > 0
              ? { dir: 'down', label: 'Today' }
              : undefined
          }
          onClick={() => router.push('/dashboard/hr/employees?attendance=early_leave_today')}
        />
        <StatCard
          label="Late Arrivals"
          value={metricValue(overview?.late_arrivals_today ?? 0)}
          sub="Arrived after shift start"
          gradient="card-gradient-teal"
          icon={AlarmClock}
          trend={
            (overview?.late_arrivals_today ?? 0) > 0
              ? { dir: 'down', label: 'Today' }
              : undefined
          }
          onClick={() => router.push('/dashboard/hr/employees?attendance=late_today')}
        />
      </div>

      {/* ── Finance quick stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(265 65% 50%), hsl(275 70% 60%))' }}
          >
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Recent Invoices (30 days)</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">
              {metricValue(financeMetrics?.recent_invoices?.count ?? 0)}
              <span className="text-sm font-medium text-muted-foreground ml-1">invoices</span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Total value</p>
            <p className="text-base font-bold text-foreground">{metricValue(fmt(financeMetrics?.recent_invoices?.total ?? 0))}</p>
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(340 80% 56%), hsl(350 85% 62%))' }}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Pending Expenses</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">
              {metricValue(financeMetrics?.pending_expenses?.count ?? 0)}
              <span className="text-sm font-medium text-muted-foreground ml-1">items</span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Total amount</p>
            <p className="text-base font-bold text-foreground">{metricValue(fmt(financeMetrics?.pending_expenses?.total ?? 0))}</p>
          </div>
        </div>
      </div>

      {/* ── Detail grid: distribution & status ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Department Distribution */}
        <SectionCard title="Department Distribution" action="View All">
          {initialLoading ? (
            <PanelSkeleton />
          ) : !hrMetrics?.by_department?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Building2 className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No department data</p>
            </div>
          ) : (
            <div>
              {hrMetrics.by_department.map((d: any) => (
                <RowItem
                  key={d.name}
                  label={d.name || 'Unassigned'}
                  value={d.count}
                  badge={`${Math.round((d.count / (overview?.total_employees || 1)) * 100)}%`}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Employee Status */}
        <SectionCard title="Employee Status" action="View All">
          {initialLoading ? (
            <PanelSkeleton />
          ) : !hrMetrics?.by_status?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <UserCheck className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No status data</p>
            </div>
          ) : (
            <div>
              {hrMetrics.by_status.map((s: any) => (
                <RowItem
                  key={s.status}
                  label={s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  value={s.count}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Upcoming Probation */}
        <SectionCard title="Upcoming Probation End" action="View All">
          {initialLoading ? (
            <PanelSkeleton />
          ) : !hrMetrics?.upcoming_probation?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No upcoming probation ends</p>
            </div>
          ) : (
            <div>
              {hrMetrics.upcoming_probation.map((e: any) => (
                <PersonRow
                  key={e.probation_end_date + e.first_name}
                  name={`${e.first_name} ${e.last_name}`}
                  date={new Date(e.probation_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  dateLabel="Ends"
                />
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── People lists: Recent Joiners + Recent Resigned ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recent Joiners */}
        <SectionCard title="Recent Joiners" action="View All">
          {initialLoading ? (
            <PanelSkeleton />
          ) : !hrMetrics?.recent_joinees?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <UserPlus className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No recent joiners</p>
            </div>
          ) : (
            <div>
              {hrMetrics.recent_joinees.map((e: any) => (
                <PersonRow
                  key={e.date_of_joining + e.first_name}
                  name={`${e.first_name} ${e.last_name}`}
                  date={new Date(e.date_of_joining).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  dateLabel="Joined"
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recent Resigned */}
        <SectionCard title="Recent Resigned" action="View All">
          {initialLoading ? (
            <PanelSkeleton />
          ) : !hrMetrics?.recent_resigned?.length ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <UserX className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No recent resignations</p>
            </div>
          ) : (
            <div>
              {hrMetrics.recent_resigned.map((e: any) => (
                <PersonRow
                  key={(e.date_of_leaving || e.resigned_date || '') + e.first_name}
                  name={`${e.first_name} ${e.last_name}`}
                  date={new Date(e.date_of_leaving || e.resigned_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  dateLabel="Left on"
                />
              ))}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
