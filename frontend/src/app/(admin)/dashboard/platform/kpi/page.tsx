'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import {
  Loader2, Users, CalendarDays, Banknote, Fingerprint,
  TrendingUp, TrendingDown, Minus, RefreshCw, GitBranch,
  Clock, ArrowRightLeft,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface KpiRow {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  branch_type: string;
  status: string;
  month: number;
  year: number;
  headcount: number;
  attendance_rate: number | null;
  present_count: number;
  total_attendance_records: number;
  leave_days_taken: number;
  leave_requests: number;
  pending_leave_requests: number;
  net_payroll: number;
  payslip_count: number;
  avg_net_pay: number;
  payroll_per_head: number;
  devices_online: number;
  devices_total: number;
  device_uptime_pct: number | null;
  pending_transfers: number;
}

interface Branch { id: string; name: string; code: string; }

const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
];

function RateBar({ value, max = 100, color }: { value: number | null; max?: number; color: string }) {
  const pct = value == null ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">
        {value == null ? '—' : `${value}%`}
      </span>
    </div>
  );
}

function Trend({ value, benchmark }: { value: number | null; benchmark: number }) {
  if (value == null) return <Minus className="w-3.5 h-3.5 text-gray-300" />;
  if (value >= benchmark) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (value >= benchmark * 0.8) return <Minus className="w-3.5 h-3.5 text-amber-500" />;
  return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
}

function fmt(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function KpiPage() {
  const [kpis, setKpis]         = useState<KpiRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const now   = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [branchId, setBranchId] = useState('');

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set('branch_id', branchId);
      params.set('month', String(month));
      params.set('year',  String(year));

      const [kpiRes, branchRes] = await Promise.all([
        api.get(`/branch-kpi?${params}`),
        api.get('/branches'),
      ]);
      setKpis(kpiRes.data.data || []);
      setBranches(branchRes.data.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [month, year, branchId]);

  // Aggregate totals
  const totals = kpis.reduce(
    (acc, r) => ({
      headcount:    acc.headcount    + r.headcount,
      net_payroll:  acc.net_payroll  + r.net_payroll,
      payslip_count:acc.payslip_count+ r.payslip_count,
      present_count:acc.present_count+ r.present_count,
      total_records:acc.total_records+ r.total_attendance_records,
      devices_online: acc.devices_online + r.devices_online,
      devices_total:  acc.devices_total  + r.devices_total,
    }),
    { headcount: 0, net_payroll: 0, payslip_count: 0, present_count: 0, total_records: 0, devices_online: 0, devices_total: 0 },
  );
  const overallAttendance = totals.total_records > 0
    ? Math.round((totals.present_count / totals.total_records) * 100) : null;
  const overallDeviceUptime = totals.devices_total > 0
    ? Math.round((totals.devices_online / totals.devices_total) * 100) : null;

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branch KPI Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Key performance indicators per branch for {MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-500">Total Headcount</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totals.headcount}</p>
            <p className="text-xs text-gray-400">{kpis.length} branch{kpis.length !== 1 ? 'es' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-gray-500">Attendance Rate</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {overallAttendance != null ? `${overallAttendance}%` : '—'}
            </p>
            <p className="text-xs text-gray-400">{totals.present_count} present / {totals.total_records} records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-4 h-4 text-violet-500" />
              <span className="text-xs text-gray-500">Net Payroll</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">₹{fmt(totals.net_payroll)}</p>
            <p className="text-xs text-gray-400">{totals.payslip_count} payslips</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint className="w-4 h-4 text-cyan-500" />
              <span className="text-xs text-gray-500">Device Uptime</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {overallDeviceUptime != null ? `${overallDeviceUptime}%` : '—'}
            </p>
            <p className="text-xs text-gray-400">{totals.devices_online} / {totals.devices_total} online</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : kpis.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No KPI data found for the selected period.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="text-left px-4 py-3 font-semibold">Branch</TableHead>
                <TableHead className="text-right px-4 py-3 font-semibold">Headcount</TableHead>
                <TableHead className="px-4 py-3 font-semibold w-48">Attendance</TableHead>
                <TableHead className="px-4 py-3 font-semibold w-40">Device Uptime</TableHead>
                <TableHead className="text-right px-4 py-3 font-semibold">Net Payroll</TableHead>
                <TableHead className="text-right px-4 py-3 font-semibold">Pay/Head</TableHead>
                <TableHead className="text-right px-4 py-3 font-semibold">
                  <span className="flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" /> Pending Leaves
                  </span>
                </TableHead>
                <TableHead className="text-right px-4 py-3 font-semibold">
                  <span className="flex items-center gap-1 justify-end">
                    <ArrowRightLeft className="w-3 h-3" /> Pending Txfr
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y">
              {kpis.map(row => (
                <TableRow key={row.branch_id} className="hover:bg-gray-50 transition-colors">
                  <TableCell className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.branch_name}</p>
                    <p className="text-xs text-gray-400">{row.branch_code} · {row.branch_type}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-semibold text-gray-800">{row.headcount}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Trend value={row.attendance_rate} benchmark={85} />
                      <div className="flex-1">
                        <RateBar value={row.attendance_rate} color="bg-emerald-500" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Trend value={row.device_uptime_pct} benchmark={90} />
                      <div className="flex-1">
                        <RateBar value={row.device_uptime_pct} color="bg-cyan-500" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-semibold text-gray-800">₹{fmt(row.net_payroll)}</span>
                    <p className="text-xs text-gray-400">{row.payslip_count} slips</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-gray-700">
                    ₹{fmt(row.payroll_per_head)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {row.pending_leave_requests > 0 ? (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {row.pending_leave_requests}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {row.pending_transfers > 0 ? (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {row.pending_transfers}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
