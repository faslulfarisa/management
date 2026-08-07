'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, UserCheck, UserX, AlertCircle, Timer, Clock, RefreshCw, Activity, Fingerprint } from 'lucide-react';
import api from '@/lib/api';
import { KPICard, TrendChart, BranchComparisonChart } from '@/components/reports';
import { useRealtimeAttendance } from '@/hooks/useRealtimeAttendance';
import { cn } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface Snapshot {
  workforce: { total: number; active: number; on_leave: number };
  today_attendance: { present: number; absent: number; late: number; not_marked: number };
  this_month: { avg_attendance_pct: number; total_ot_hours: number; late_arrivals: number };
  branch_summary: { branch: string; present: number; absent: number; pct: number }[];
  leave_today: number;
  pending_corrections: number;
  active_devices: number;
}

type TrendPoint = Record<string, string | number>;

const DIRECTION_COLOR: Record<string, string> = {
  IN:  'bg-green-50 text-green-700 border-green-200',
  OUT: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function AnalyticsDashboardPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { recentPunches, isConnected } = useRealtimeAttendance();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [snapRes, trendRes] = await Promise.allSettled([
        api.get('/reports/analytics/snapshot'),
        api.get('/reports/analytics/attendance-trend'),
      ]);
      if (snapRes.status === 'fulfilled') setSnap(snapRes.value.data);
      if (trendRes.status === 'fulfilled') setTrend(trendRes.value.data?.data ?? []);
    } catch {}
    finally { setLoading(false); setLastRefresh(new Date()); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const att  = snap?.today_attendance;
  const wf   = snap?.workforce;
  const mon  = snap?.this_month;
  const pct  = att && wf?.total ? Math.round((att.present / wf.total) * 100) : 0;

  const branchChartData = (snap?.branch_summary ?? []).map(b => ({ branch: b.branch, present: b.present, pct: b.pct }));

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Operational Analytics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live snapshot as of {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KPICard
          label="Total Workforce"
          value={wf?.total ?? '—'}
          sub={`${wf?.active ?? 0} active`}
          icon={Users}
          color="blue"
          loading={loading}
        />
        <KPICard
          label="Present Today"
          value={att?.present ?? '—'}
          sub={`${pct}% attendance`}
          icon={UserCheck}
          color="green"
          loading={loading}
        />
        <KPICard
          label="Absent Today"
          value={att?.absent ?? '—'}
          sub={att && wf?.total ? `${Math.round((att.absent / wf.total) * 100)}% of workforce` : undefined}
          icon={UserX}
          color="red"
          loading={loading}
        />
        <KPICard
          label="Late Arrivals"
          value={att?.late ?? '—'}
          sub={mon ? `${mon.late_arrivals} this month` : undefined}
          icon={AlertCircle}
          color="amber"
          loading={loading}
        />
        <KPICard
          label="On Leave"
          value={snap?.leave_today ?? '—'}
          sub={wf?.on_leave != null ? `${wf.on_leave} on roster leave` : undefined}
          icon={Timer}
          color="purple"
          loading={loading}
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Avg Attendance %</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-1">{mon?.avg_attendance_pct ?? '—'}%</p>
          <p className="text-xs text-muted-foreground">This month</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Total OT Hours</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-1">{mon?.total_ot_hours ?? '—'}</p>
          <p className="text-xs text-muted-foreground">This month</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-3 shadow-sm">
          <p className="text-xs text-muted-foreground">Pending Corrections</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-1">{snap?.pending_corrections ?? '—'}</p>
          <p className="text-xs text-muted-foreground">Awaiting approval</p>
        </div>
        <div className="bg-white border border-border rounded-2xl p-3 shadow-sm flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-xl border border-green-200">
            <Fingerprint className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Active Devices</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{snap?.active_devices ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BranchComparisonChart
          data={branchChartData}
          metric="present"
          metricLabel="Present Employees"
          title="Branch Attendance Today"
          color="#2563eb"
        />
        <TrendChart
          data={trend}
          type="line"
          xKey="date"
          series={[
            { key: 'present', label: 'Present', color: '#16a34a' },
            { key: 'late',    label: 'Late',    color: '#d97706' },
            { key: 'absent',  label: 'Absent',  color: '#dc2626' },
          ]}
          title="7-Day Attendance Trend"
        />
      </div>

      {/* Bottom row: live punches + branch table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live punch feed */}
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Live Punch Activity</p>
            </div>
            {isConnected && <span className="flex items-center gap-1 text-xs text-green-600"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Connected</span>}
          </div>
          <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
            {recentPunches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Clock className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-xs">Waiting for punch activity...</p>
              </div>
            ) : (
              recentPunches.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', DIRECTION_COLOR[p.direction] ?? 'bg-muted text-muted-foreground border-border')}>
                    {p.direction}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{p.branch} · {p.verify_method ?? 'Biometric'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(p.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Branch summary table */}
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-sm font-medium text-foreground">Branch Attendance Summary</p>
          </div>
          {(snap?.branch_summary?.length ?? 0) === 0 ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
              {loading ? 'Loading...' : 'No branch data'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Att %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap?.branch_summary.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground">{b.branch}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">{b.present}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{b.absent}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={cn('font-medium', b.pct >= 80 ? 'text-green-600' : b.pct >= 60 ? 'text-amber-600' : 'text-red-600')}>
                        {b.pct}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
