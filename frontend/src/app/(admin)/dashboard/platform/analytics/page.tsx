'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  GitBranch, Users, CalendarDays, Banknote, Fingerprint,
  Wifi, WifiOff, TrendingUp, AlertCircle, ChevronDown,
  RefreshCw, Building2, Clock, BarChart3, Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BranchOverview {
  id: string;
  name: string;
  code: string;
  display_name: string | null;
  branch_type: string;
  status: string;
  employee_count: number;
  present_today: number;
  absent_today: number;
  devices_online: number;
  devices_offline: number;
  devices_total: number;
  payroll_net_month: number;
  payslip_count: number;
}

interface AttendanceSummary {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  headcount: number;
  total_records: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  on_leave: number;
  avg_late_minutes: number | null;
  avg_overtime_minutes: number | null;
}

interface PayrollSummary {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  headcount: number;
  payslip_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_pf: number;
  total_esi: number;
}

interface DeviceInfo {
  id: string;
  name: string;
  serial_number: string;
  hardware_type: string;
  is_online: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  ip_address: string | null;
}

interface BranchDeviceHealth {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  total_devices: number;
  online: number;
  offline: number;
  active_devices: number;
  latest_heartbeat: string | null;
  devices: DeviceInfo[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-IN').format(Number(n) || 0);

const fmtCurrency = (n: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

const TYPE_COLORS: Record<string, string> = {
  main:      'bg-blue-100 text-blue-700',
  regional:  'bg-purple-100 text-purple-700',
  satellite: 'bg-cyan-100 text-cyan-700',
  franchise: 'bg-orange-100 text-orange-700',
  warehouse: 'bg-yellow-100 text-yellow-700',
  admin:     'bg-gray-100 text-gray-700',
};

function pct(num: number, denom: number) {
  if (!denom) return '—';
  return `${Math.round((num / denom) * 100)}%`;
}

function timeSince(iso: string | null) {
  if (!iso) return 'Never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)  return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, gradient }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; gradient: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gradient} text-white shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sub && <p className="text-xs text-muted-foreground/70 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-bold flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Overview Section ───────────────────────────────────────────────────────────

function OverviewSection({ data }: { data: BranchOverview[] }) {
  const totalEmployees  = data.reduce((s, b) => s + Number(b.employee_count  || 0), 0);
  const totalPresent    = data.reduce((s, b) => s + Number(b.present_today   || 0), 0);
  const totalOnline     = data.reduce((s, b) => s + Number(b.devices_online  || 0), 0);
  const totalPayroll    = data.reduce((s, b) => s + Number(b.payroll_net_month || 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users}       label="Total Employees"   value={fmt(totalEmployees)} gradient="card-gradient-blue" />
        <StatCard icon={CalendarDays} label="Present Today"    value={fmt(totalPresent)}   sub={`${pct(totalPresent, totalEmployees)} attendance`} gradient="card-gradient-emerald" />
        <StatCard icon={Wifi}         label="Devices Online"   value={fmt(totalOnline)}    gradient="card-gradient-amber" />
        <StatCard icon={Banknote}     label="Payroll This Month" value={fmtCurrency(totalPayroll)} gradient="card-gradient-purple" />
      </div>

      <Card className="border-0 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeader icon={GitBranch} title="Branch Comparison" />
        </div>
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</TableHead>
              <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employees</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Present Today</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance %</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Devices</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payroll (Net)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No branch data available</TableCell>
              </TableRow>
            ) : data.map((b, i) => {
              const attPct = b.employee_count > 0
                ? Math.round((Number(b.present_today) / Number(b.employee_count)) * 100)
                : 0;
              return (
                <TableRow key={b.id} className="hover:bg-muted/30 transition-colors"
                  style={{ animation: `slideUp 0.3s ease ${i * 0.03}s both` }}>
                  <TableCell className="px-4 py-3">
                    <p className="text-sm font-semibold">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.code}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[b.branch_type] || 'bg-gray-100 text-gray-600'}`}>
                      {b.branch_type}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm">{fmt(b.employee_count)}</TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm">{fmt(b.present_today)}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${attPct >= 80 ? 'bg-emerald-500' : attPct >= 60 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${attPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{attPct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm">
                    <span className="text-emerald-600 font-medium">{fmt(b.devices_online)}</span>
                    <span className="text-muted-foreground">/{fmt(b.devices_total)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm font-medium">{fmtCurrency(b.payroll_net_month)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

// ── Attendance Section ─────────────────────────────────────────────────────────

function AttendanceSection() {
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo,   setDateTo]   = useState(today);
  const [data,     setData]     = useState<AttendanceSummary[]>([]);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/branch-analytics/attendance-summary', {
        params: { date_from: dateFrom, date_to: dateTo },
      });
      setData(res.data.data || []);
    } catch { /* no-op */ }
    finally  { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const inputCls = 'border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <Card className="border-0 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-border">
        <SectionHeader icon={CalendarDays} title="Attendance Summary">
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className={inputCls} />
            <button onClick={load} disabled={loading}
              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={`/api/branch-analytics/export?type=attendance&date_from=${dateFrom}&date_to=${dateTo}`}
              download
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </a>
          </div>
        </SectionHeader>
      </div>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Headcount</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-green-600 uppercase tracking-wider">Present</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wider">Absent</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider">Late</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Half Day</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Leave</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance %</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Late (min)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border">
          {loading ? (
            <TableRow><TableCell colSpan={9} className="text-center py-10">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </TableCell></TableRow>
          ) : data.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">No attendance data for this range</TableCell></TableRow>
          ) : data.map(b => {
            const attPct = Number(b.total_records) > 0
              ? Math.round((Number(b.present) / Number(b.total_records)) * 100)
              : 0;
            return (
              <TableRow key={b.branch_id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="px-4 py-3">
                  <p className="text-sm font-medium">{b.branch_name}</p>
                  <p className="text-xs text-muted-foreground">{b.branch_code}</p>
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm">{fmt(b.headcount)}</TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-emerald-600 font-medium">{fmt(b.present)}</TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-red-500">{fmt(b.absent)}</TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-amber-600">{fmt(b.late)}</TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">{fmt(b.half_day)}</TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">{fmt(b.on_leave)}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <span className={`text-sm font-medium ${attPct >= 80 ? 'text-emerald-600' : attPct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {attPct}%
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">
                  {b.avg_late_minutes ? `${b.avg_late_minutes} min` : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {data.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="px-4 py-3 text-xs font-bold uppercase text-muted-foreground">Totals</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">{fmt(data.reduce((s,b)=>s+Number(b.headcount||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{fmt(data.reduce((s,b)=>s+Number(b.present||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-red-500">{fmt(data.reduce((s,b)=>s+Number(b.absent||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-amber-600">{fmt(data.reduce((s,b)=>s+Number(b.late||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-muted-foreground">{fmt(data.reduce((s,b)=>s+Number(b.half_day||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-muted-foreground">{fmt(data.reduce((s,b)=>s+Number(b.on_leave||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">—</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">—</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}

// ── Payroll Section ────────────────────────────────────────────────────────────

function PayrollSection() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [data,  setData]  = useState<PayrollSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/branch-analytics/payroll-summary', { params: { month, year } });
      setData(res.data.data || []);
    } catch { /* no-op */ }
    finally  { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const inputCls = 'border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30';
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <Card className="border-0 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-border">
        <SectionHeader icon={Banknote} title="Payroll Summary">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-border rounded-lg px-2 bg-white">
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
              <select value={month} onChange={e => setMonth(+e.target.value)} className="py-1.5 text-xs bg-transparent focus:outline-none">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1 border border-border rounded-lg px-2 bg-white">
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
              <select value={year} onChange={e => setYear(+e.target.value)} className="py-1.5 text-xs bg-transparent focus:outline-none">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={load} disabled={loading}
              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={`/api/branch-analytics/export?type=payroll&month=${month}&year=${year}`}
              download
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </a>
          </div>
        </SectionHeader>
      </div>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Headcount</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payslips</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-red-500 uppercase tracking-wider">Deductions</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider">Net Pay</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PF</TableHead>
            <TableHead className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">ESI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border">
          {loading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-10">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </TableCell></TableRow>
          ) : data.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">No payroll data for {MONTHS[month - 1]} {year}</TableCell></TableRow>
          ) : data.map(b => (
            <TableRow key={b.branch_id} className="hover:bg-muted/30 transition-colors">
              <TableCell className="px-4 py-3">
                <p className="text-sm font-medium">{b.branch_name}</p>
                <p className="text-xs text-muted-foreground">{b.branch_code}</p>
              </TableCell>
              <TableCell className="px-4 py-3 text-right text-sm">{fmt(b.headcount)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm">{fmt(b.payslip_count)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm">{fmtCurrency(b.total_gross)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm text-red-500">{fmtCurrency(b.total_deductions)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{fmtCurrency(b.total_net)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">{fmtCurrency(b.total_pf)}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">{fmtCurrency(b.total_esi)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        {data.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="px-4 py-3 text-xs font-bold uppercase text-muted-foreground">Totals</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">{fmt(data.reduce((s,b)=>s+Number(b.headcount||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">{fmt(data.reduce((s,b)=>s+Number(b.payslip_count||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold">{fmtCurrency(data.reduce((s,b)=>s+Number(b.total_gross||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-red-500">{fmtCurrency(data.reduce((s,b)=>s+Number(b.total_deductions||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-emerald-600">{fmtCurrency(data.reduce((s,b)=>s+Number(b.total_net||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-muted-foreground">{fmtCurrency(data.reduce((s,b)=>s+Number(b.total_pf||0),0))}</TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-bold text-muted-foreground">{fmtCurrency(data.reduce((s,b)=>s+Number(b.total_esi||0),0))}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Card>
  );
}

// ── Device Health Section ──────────────────────────────────────────────────────

function DeviceHealthSection() {
  const [data,     setData]     = useState<BranchDeviceHealth[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get('/branch-analytics/device-health')
      .then(res => setData(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalOnline  = data.reduce((s, b) => s + Number(b.online  || 0), 0);
  const totalDevices = data.reduce((s, b) => s + Number(b.total_devices || 0), 0);

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <SectionHeader icon={Fingerprint} title="Device Health">
          <div className="flex items-center gap-2">
            {totalDevices > 0 && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                totalOnline === totalDevices ? 'bg-emerald-100 text-emerald-700' :
                totalOnline > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
              }`}>
                {totalOnline}/{totalDevices} online
              </span>
            )}
          </div>
        </SectionHeader>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-2">
          <Fingerprint className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No biometric devices registered</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.map(b => (
            <div key={b.branch_id}>
              {/* Branch row */}
              <button
                onClick={() => setExpanded(prev => prev === b.branch_id ? null : b.branch_id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{b.branch_name}</p>
                    <p className="text-xs text-muted-foreground">{b.branch_code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Online indicator */}
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-600">{fmt(b.online)}</span>
                    <span className="text-xs text-muted-foreground">/ {fmt(b.total_devices)}</span>
                  </div>
                  {Number(b.offline) > 0 && (
                    <div className="flex items-center gap-1">
                      <WifiOff className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-xs text-red-500">{fmt(b.offline)} offline</span>
                    </div>
                  )}
                  {b.latest_heartbeat && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{timeSince(b.latest_heartbeat)}</span>
                    </div>
                  )}
                  {b.total_devices === 0 && (
                    <span className="text-xs text-muted-foreground italic">No devices</span>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded === b.branch_id ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Expanded device list */}
              {expanded === b.branch_id && (
                <div className="bg-muted/20 border-t border-border px-4 py-3">
                  {!b.devices || b.devices.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">No devices for this branch</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {b.devices.map(d => (
                        <div key={d.id}
                          className={`rounded-xl border p-3 flex items-start gap-3 ${d.is_online ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-white'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${d.is_online ? 'bg-emerald-100' : 'bg-gray-100'}`}>
                            <Fingerprint className={`w-4 h-4 ${d.is_online ? 'text-emerald-600' : 'text-gray-400'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{d.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.serial_number}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {d.hardware_type && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {d.hardware_type}
                                </span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${d.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                {d.is_online ? 'Online' : 'Offline'}
                              </span>
                            </div>
                            {d.ip_address && (
                              <p className="text-xs text-muted-foreground mt-1 font-mono">{d.ip_address}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Last seen: {timeSince(d.last_seen_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'attendance' | 'payroll' | 'devices';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',   label: 'Overview',   icon: BarChart3 },
  { id: 'attendance', label: 'Attendance', icon: CalendarDays },
  { id: 'payroll',    label: 'Payroll',    icon: Banknote },
  { id: 'devices',    label: 'Devices',    icon: Fingerprint },
];

export default function BranchAnalyticsPage() {
  const [tab,      setTab]      = useState<Tab>('overview');
  const [overview, setOverview] = useState<BranchOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError,   setOverviewError]   = useState(false);

  useEffect(() => {
    setLoadingOverview(true);
    api.get('/branch-analytics/overview')
      .then(res => { setOverview(res.data.data || []); setOverviewError(false); })
      .catch(() => setOverviewError(true))
      .finally(() => setLoadingOverview(false));
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branch Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-branch performance — attendance, payroll, and device health at a glance
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Live data</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Loading / error state for overview data */}
      {loadingOverview && tab === 'overview' ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading branch data...</p>
        </div>
      ) : overviewError && tab === 'overview' ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle className="w-10 h-10 text-destructive/40" />
          <p className="text-sm text-muted-foreground">Failed to load branch analytics</p>
        </div>
      ) : (
        <>
          {tab === 'overview'   && <OverviewSection data={overview} />}
          {tab === 'attendance' && <AttendanceSection />}
          {tab === 'payroll'    && <PayrollSection />}
          {tab === 'devices'    && <DeviceHealthSection />}
        </>
      )}
    </div>
  );
}
