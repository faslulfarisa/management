'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '@/lib/api';
import { ReportPageShell, ReportTable } from '@/components/reports';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '@/lib/report-export';
import type { FilterState, FilterField, TabDef } from '@/components/reports';
import { cn } from '@/lib/utils';
import { useCanAll } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (v: any) => v ? String(v) : '—';
const fmtHrs  = (v: any) => v != null ? `${v} hr`  : '—';
const fmtCur  = (v: any) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
const c       = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    covered:    'bg-green-50 text-green-700 border-green-200',
    understaffed:'bg-red-50 text-red-700 border-red-200',
    full:       'bg-green-50 text-green-700 border-green-200',
    partial:    'bg-amber-50 text-amber-700 border-amber-200',
  };
  const cls = map[String(v ?? '').toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize border', cls)}>{v ?? '—'}</span>;
};

function col(header: string, key: string, cell?: (v: any) => React.ReactNode): ColumnDef<any> {
  return { header, accessorKey: key, cell: cell ? ({ getValue }) => cell(getValue()) : ({ getValue }) => c(getValue()) };
}

interface TabCfg {
  label: string;
  filterFields: FilterField[];
  columns: ColumnDef<any>[];
  exportCols: string[];
  exportKeys: string[];
}

const TAB_CONFIG: Record<string, TabCfg> = {
  'allocation': {
    label: 'Shift Allocation',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'shift'],
    columns: [
      col('Effective From','effective_from', fmtDate),
      col('Code',          'employee_code'),
      col('Employee',      'employee_name'),
      col('Department',    'department'),
      col('Branch',        'branch'),
      col('Shift',         'shift_name'),
      col('Start',         'shift_start',   fmtTime),
      col('End',           'shift_end',     fmtTime),
      col('Type',          'shift_type'),
    ],
    exportCols: ['Effective From','Code','Employee','Department','Branch','Shift','Start','End','Type'],
    exportKeys: ['effective_from','employee_code','employee_name','department','branch','shift_name','shift_start','shift_end','shift_type'],
  },
  'coverage': {
    label: 'Shift Coverage',
    filterFields: ['date_range', 'branch', 'shift'],
    columns: [
      col('Date',          'date',            fmtDate),
      col('Shift',         'shift_name'),
      col('Branch',        'branch'),
      col('Scheduled',     'scheduled_count'),
      col('Present',       'present_count'),
      col('Absent',        'absent_count'),
      col('Coverage %',    'coverage_pct',    (v) => v != null ? `${v}%` : '—'),
      col('Status',        'status',          statusBadge),
    ],
    exportCols: ['Date','Shift','Branch','Scheduled','Present','Absent','Coverage %','Status'],
    exportKeys: ['date','shift_name','branch','scheduled_count','present_count','absent_count','coverage_pct','status'],
  },
  'changes': {
    label: 'Shift Changes',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',       'change_date',  fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Old Shift',  'old_shift'),
      col('New Shift',  'new_shift'),
      col('Reason',     'reason'),
      col('Changed By', 'changed_by'),
    ],
    exportCols: ['Date','Code','Employee','Branch','Old Shift','New Shift','Reason','Changed By'],
    exportKeys: ['change_date','employee_code','employee_name','branch','old_shift','new_shift','reason','changed_by'],
  },
  'overtime-shifts': {
    label: 'OT Shifts',
    filterFields: ['date_range', 'branch', 'department', 'shift'],
    columns: [
      col('Month',      'month'),
      col('Shift',      'shift_name'),
      col('Branch',     'branch'),
      col('Department', 'department'),
      col('Total OT Hrs','total_ot_hours', fmtHrs),
      col('OT Cost',    'total_ot_cost',  fmtCur),
      col('Employees',  'employee_count'),
    ],
    exportCols: ['Month','Shift','Branch','Department','Total OT Hrs','OT Cost','Employees'],
    exportKeys: ['month','shift_name','branch','department','total_ot_hours','total_ot_cost','employee_count'],
  },
  'overnight': {
    label: 'Overnight Shifts',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'shift'],
    columns: [
      col('Date',       'date',           fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Shift',      'shift_name'),
      col('Start',      'clock_in',       (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
      col('End',        'clock_out',      (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
      col('Total Hrs',  'total_hours',    fmtHrs),
      col('OT Hrs',     'overtime_hours', fmtHrs),
    ],
    exportCols: ['Date','Code','Employee','Branch','Shift','Start','End','Total Hrs','OT Hrs'],
    exportKeys: ['date','employee_code','employee_name','branch','shift_name','clock_in','clock_out','total_hours','overtime_hours'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function ShiftReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_ATTENDANCE]);
  const [tab,     setTab]     = useState('allocation');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/shift/${tab}`, { params });
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

  return (
    <ReportPageShell
      title="Shift & Rota Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `shift_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `shift_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `shift_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`shift/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['allocation','overnight'].includes(tab)}
      />
    </ReportPageShell>
  );
}
