'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import {
  ReportPageShell,
  ReportTable,
  BranchComparisonChart,
} from '@/components/reports';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '@/lib/report-export';
import type { FilterState, FilterField, TabDef, BranchDataPoint } from '@/components/reports';
import { cn } from '@/lib/utils';
import { useCanAll } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

const fmtCur = (v: any) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
const fmtPct = (v: any) => v != null ? `${v}%` : '—';
const c      = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

function col(header: string, key: string, cell?: (v: any) => React.ReactNode): ColumnDef<any> {
  return { header, accessorKey: key, cell: cell ? ({ getValue }) => cell(getValue()) : ({ getValue }) => c(getValue()) };
}

interface TabCfg {
  label: string;
  filterFields: FilterField[];
  columns: ColumnDef<any>[];
  exportCols: string[];
  exportKeys: string[];
  chartMetric?: string;
  chartLabel?: string;
  chartColor?: string;
}

const TAB_CONFIG: Record<string, TabCfg> = {
  'attendance-summary': {
    label: 'Attendance Summary',
    filterFields: ['date_range', 'branch'],
    chartMetric: 'present_count',
    chartLabel: 'Present',
    chartColor: '#2563eb',
    columns: [
      col('Branch',       'branch'),
      col('Total Emps',   'total_employees'),
      col('Present',      'present_count'),
      col('Absent',       'absent_count'),
      col('Late',         'late_count'),
      col('Att %',        'attendance_pct',  fmtPct),
      col('Avg Late Mins','avg_late_mins'),
      col('Total OT Hrs', 'total_ot_hours'),
    ],
    exportCols: ['Branch','Total Emps','Present','Absent','Late','Att %','Avg Late Mins','Total OT Hrs'],
    exportKeys: ['branch','total_employees','present_count','absent_count','late_count','attendance_pct','avg_late_mins','total_ot_hours'],
  },
  'payroll-summary': {
    label: 'Payroll Summary',
    filterFields: ['date_range', 'branch', 'payroll_cycle'],
    chartMetric: 'total_gross',
    chartLabel: 'Total Gross (₹)',
    chartColor: '#16a34a',
    columns: [
      col('Branch',       'branch'),
      col('Month',        'payroll_month'),
      col('Headcount',    'headcount'),
      col('Total Gross',  'total_gross',        fmtCur),
      col('Total Net',    'total_net',          fmtCur),
      col('OT Cost',      'total_overtime_cost',fmtCur),
      col('Avg Gross',    'avg_gross',          fmtCur),
    ],
    exportCols: ['Branch','Month','Headcount','Total Gross','Total Net','OT Cost','Avg Gross'],
    exportKeys: ['branch','payroll_month','headcount','total_gross','total_net','total_overtime_cost','avg_gross'],
  },
  'workforce-comparison': {
    label: 'Workforce Comparison',
    filterFields: ['branch'],
    chartMetric: 'total',
    chartLabel: 'Total Employees',
    chartColor: '#7c3aed',
    columns: [
      col('Branch',     'branch'),
      col('Total',      'total'),
      col('Male',       'male'),
      col('Female',     'female'),
      col('Full Time',  'full_time'),
      col('Part Time',  'part_time'),
      col('Contract',   'contract'),
      col('Avg Tenure', 'avg_tenure'),
    ],
    exportCols: ['Branch','Total','Male','Female','Full Time','Part Time','Contract','Avg Tenure'],
    exportKeys: ['branch','total','male','female','full_time','part_time','contract','avg_tenure'],
  },
  'overtime-comparison': {
    label: 'OT Comparison',
    filterFields: ['date_range', 'branch'],
    chartMetric: 'total_ot_hours',
    chartLabel: 'OT Hours',
    chartColor: '#d97706',
    columns: [
      col('Branch',      'branch'),
      col('Month',       'month'),
      col('OT Employees','ot_employee_count'),
      col('Total OT Hrs','total_ot_hours'),
      col('OT Cost',     'total_ot_cost',  fmtCur),
      col('Avg OT/Emp',  'avg_ot_per_emp'),
    ],
    exportCols: ['Branch','Month','OT Employees','Total OT Hrs','OT Cost','Avg OT/Emp'],
    exportKeys: ['branch','month','ot_employee_count','total_ot_hours','total_ot_cost','avg_ot_per_emp'],
  },
  'leave-comparison': {
    label: 'Leave Comparison',
    filterFields: ['date_range', 'branch'],
    chartMetric: 'total_days',
    chartLabel: 'Leave Days',
    chartColor: '#2563eb',
    columns: [
      col('Branch',       'branch'),
      col('Total Days',   'total_days'),
      col('Applications', 'applications'),
      col('Approved',     'approved'),
      col('Pending',      'pending'),
      col('Utilization',  'utilization_pct', fmtPct),
    ],
    exportCols: ['Branch','Total Days','Applications','Approved','Pending','Utilization %'],
    exportKeys: ['branch','total_days','applications','approved','pending','utilization_pct'],
  },
  'operational-kpis': {
    label: 'Operational KPIs',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Branch',       'branch'),
      col('Headcount',    'headcount'),
      col('Att %',        'attendance_pct',  fmtPct),
      col('Late %',       'late_pct',        fmtPct),
      col('OT Hrs',       'total_ot_hours'),
      col('Leave Days',   'leave_days'),
      col('Corrections',  'correction_count'),
      col('Payroll Cost', 'payroll_cost',    fmtCur),
    ],
    exportCols: ['Branch','Headcount','Att %','Late %','OT Hrs','Leave Days','Corrections','Payroll Cost'],
    exportKeys: ['branch','headcount','attendance_pct','late_pct','total_ot_hours','leave_days','correction_count','payroll_cost'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function BranchReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_VIEW]);
  const [tab,     setTab]     = useState('attendance-summary');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 100, ...filters };
      const res = await api.get(`/reports/branch/${tab}`, { params });
      setRows(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [tab, page, filters]);

  useEffect(() => { setPage(1); setRows([]); }, [tab, filters]);
  useEffect(() => { load(); }, [load]);

  const cfg = TAB_CONFIG[tab];
  function buildExportData() {
    return { columns: cfg.exportCols, rows: rows.map(r => cfg.exportKeys.map(k => String(r[k] ?? ''))) };
  }

  const chartData: BranchDataPoint[] = cfg.chartMetric
    ? rows.map(r => ({ branch: r.branch ?? '', [cfg.chartMetric!]: r[cfg.chartMetric!] ?? 0 }))
    : [];

  return (
    <ReportPageShell
      title="Branch Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `branch_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `branch_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `branch_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`branch/${tab}`}
    >
      <div className="space-y-4">
        {/* Branch comparison chart — shown when data available */}
        {cfg.chartMetric && chartData.length > 0 && (
          <BranchComparisonChart
            data={chartData}
            metric={cfg.chartMetric}
            metricLabel={cfg.chartLabel}
            title={`${cfg.label} — Branch Comparison`}
            color={cfg.chartColor}
          />
        )}
        <ReportTable
          columns={cfg.columns}
          data={rows}
          total={total}
          page={page}
          onPageChange={setPage}
          loading={loading}
          stickyFirstCol
        />
      </div>
    </ReportPageShell>
  );
}
