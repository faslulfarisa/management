'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { ReportPageShell, ReportTable, TrendChart } from '@/components/reports';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '@/lib/report-export';
import type { TabDef } from '@/components/reports';
import { useCan } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

const fmtPct = (v: any) => (v != null ? `${v}%` : '—');
const c = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

function col(header: string, key: string, cell?: (v: any) => React.ReactNode): ColumnDef<any> {
  return { header, accessorKey: key, cell: cell ? ({ getValue }) => cell(getValue()) : ({ getValue }) => c(getValue()) };
}

interface TabCfg {
  label: string;
  endpoint: string;
  columns: ColumnDef<any>[];
  exportCols: string[];
  exportKeys: string[];
  chartKey?: string;
  chartLabel?: string;
}

const TAB_CONFIG: Record<string, TabCfg> = {
  'attendance-behaviour': {
    label: 'Attendance Performance',
    endpoint: 'performance/attendance-behaviour',
    columns: [
      col('Employee', 'employee_code'),
      col('First Name', 'first_name'),
      col('Last Name', 'last_name'),
      col('Branch', 'branch'),
      col('Department', 'department'),
      col('Cycle', 'cycle_name'),
      col('BWD', 'business_working_days'),
      col('Present', 'present_days'),
      col('Half Days', 'half_day_count'),
      col('Late', 'late_count'),
      col('Unapproved Absence', 'unapproved_absence_days'),
      col('Attendance %', 'attendance_percentage', fmtPct),
      col('Compliance %', 'attendance_compliance_percentage', fmtPct),
      col('Behaviour Score', 'behaviour_score'),
      col('Rating', 'behaviour_rating'),
    ],
    exportCols: ['Employee Code', 'First Name', 'Last Name', 'Branch', 'Department', 'Cycle', 'BWD', 'Present', 'Half Days', 'Late', 'Unapproved Absence', 'Attendance %', 'Compliance %', 'Behaviour Score', 'Rating'],
    exportKeys: ['employee_code', 'first_name', 'last_name', 'branch', 'department', 'cycle_name', 'business_working_days', 'present_days', 'half_day_count', 'late_count', 'unapproved_absence_days', 'attendance_percentage', 'attendance_compliance_percentage', 'behaviour_score', 'behaviour_rating'],
    chartKey: 'behaviour_score', chartLabel: 'Behaviour Score',
  },
  department: {
    label: 'Department Performance',
    endpoint: 'performance/department',
    columns: [
      col('Department', 'department'),
      col('Employees', 'employee_count'),
      col('Avg Score', 'avg_behaviour_score'),
      col('Avg Attendance %', 'avg_attendance_pct', fmtPct),
      col('Avg Compliance %', 'avg_compliance_pct', fmtPct),
      col('Total Late', 'total_late_count'),
      col('Total Unapproved Absence', 'total_unapproved_absence'),
    ],
    exportCols: ['Department', 'Employees', 'Avg Score', 'Avg Attendance %', 'Avg Compliance %', 'Total Late', 'Total Unapproved Absence'],
    exportKeys: ['department', 'employee_count', 'avg_behaviour_score', 'avg_attendance_pct', 'avg_compliance_pct', 'total_late_count', 'total_unapproved_absence'],
    chartKey: 'avg_behaviour_score', chartLabel: 'Avg Score',
  },
  branch: {
    label: 'Branch Performance',
    endpoint: 'performance/branch',
    columns: [
      col('Branch', 'branch'),
      col('Employees', 'employee_count'),
      col('Avg Score', 'avg_behaviour_score'),
      col('Avg Attendance %', 'avg_attendance_pct', fmtPct),
      col('Avg Compliance %', 'avg_compliance_pct', fmtPct),
      col('Total Late', 'total_late_count'),
      col('Total Unapproved Absence', 'total_unapproved_absence'),
    ],
    exportCols: ['Branch', 'Employees', 'Avg Score', 'Avg Attendance %', 'Avg Compliance %', 'Total Late', 'Total Unapproved Absence'],
    exportKeys: ['branch', 'employee_count', 'avg_behaviour_score', 'avg_attendance_pct', 'avg_compliance_pct', 'total_late_count', 'total_unapproved_absence'],
    chartKey: 'avg_behaviour_score', chartLabel: 'Avg Score',
  },
  employee: {
    label: 'Employee Performance',
    endpoint: 'performance/employee',
    columns: [
      col('Employee', 'employee_code'),
      col('First Name', 'first_name'),
      col('Last Name', 'last_name'),
      col('Branch', 'branch'),
      col('Department', 'department'),
      col('Cycle', 'cycle_name'),
      col('KRA', 'kra_score'),
      col('KPI', 'kpi_score'),
      col('Attendance', 'attendance_score'),
      col('Overall', 'overall_score'),
      col('Rating', 'rating'),
      col('Status', 'status'),
    ],
    exportCols: ['Employee Code', 'First Name', 'Last Name', 'Branch', 'Department', 'Cycle', 'KRA', 'KPI', 'Attendance', 'Overall', 'Rating', 'Status'],
    exportKeys: ['employee_code', 'first_name', 'last_name', 'branch', 'department', 'cycle_name', 'kra_score', 'kpi_score', 'attendance_score', 'overall_score', 'rating', 'status'],
  },
  'review-cycle': {
    label: 'Review Cycle Summary',
    endpoint: 'performance/review-cycle',
    columns: [
      col('Cycle', 'name'),
      col('Type', 'type'),
      col('Start', 'start_date'),
      col('End', 'end_date'),
      col('Status', 'status'),
      col('Reviews', 'review_count'),
      col('Snapshots', 'snapshot_count'),
      col('Avg Overall Score', 'avg_overall_score'),
      col('Avg Attendance Score', 'avg_attendance_score'),
    ],
    exportCols: ['Cycle', 'Type', 'Start', 'End', 'Status', 'Reviews', 'Snapshots', 'Avg Overall Score', 'Avg Attendance Score'],
    exportKeys: ['name', 'type', 'start_date', 'end_date', 'status', 'review_count', 'snapshot_count', 'avg_overall_score', 'avg_attendance_score'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function PerformanceReportsPage() {
  const canExport = useCan(PERMISSIONS.PERFORMANCE_EXPORT);
  const [tab, setTab] = useState('attendance-behaviour');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cycleId, setCycleId] = useState('');
  const [cycles, setCycles] = useState<any[]>([]);

  useEffect(() => {
    api.get('/performance/cycles').then((r) => setCycles(r.data.data ?? []));
  }, []);

  const cfg = TAB_CONFIG[tab];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 100 };
      if (cycleId) params.cycle_id = cycleId;
      const res = await api.get(`/reports/${cfg.endpoint}`, { params });
      setRows(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint, page, cycleId]);

  useEffect(() => { setPage(1); setRows([]); }, [tab, cycleId]);
  useEffect(() => { load(); }, [load]);

  function buildExportData() {
    return { columns: cfg.exportCols, rows: rows.map((r) => cfg.exportKeys.map((k) => String(r[k] ?? ''))) };
  }

  const chartData = cfg.chartKey
    ? rows.slice(0, 20).map((r) => ({ name: r.first_name ? `${r.first_name} ${r.last_name}` : (r.department ?? r.branch ?? r.name ?? ''), value: parseFloat(r[cfg.chartKey!]) || 0 }))
    : [];

  return (
    <ReportPageShell
      title="Performance Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={[]}
      filters={{}}
      onFiltersChange={() => {}}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `performance_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `performance_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `performance_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`performance/${tab}`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">Review Cycle:</label>
          <select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="border border-border rounded-xl px-3 py-1.5 text-sm bg-white">
            <option value="">All Cycles</option>
            {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {cfg.chartKey && chartData.length > 0 && (
          <TrendChart title={`${cfg.label} — ${cfg.chartLabel}`} type="bar" xKey="name" data={chartData} series={[{ key: 'value', label: cfg.chartLabel! }]} />
        )}

        <ReportTable columns={cfg.columns} data={rows} total={total} page={page} onPageChange={setPage} loading={loading} stickyFirstCol />
      </div>
    </ReportPageShell>
  );
}
