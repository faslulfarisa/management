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

const fmtCur = (v: any) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
const fmtPct = (v: any) => v != null ? `${v}%`    : '—';
const c      = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    completed: 'bg-green-50 text-green-700 border-green-200',
    pending:   'bg-amber-50 text-amber-700 border-amber-200',
    draft:     'bg-gray-50 text-gray-700 border-gray-200',
    processing:'bg-blue-50 text-blue-700 border-blue-200',
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
  'monthly-summary': {
    label: 'Monthly Summary',
    filterFields: ['date_range', 'branch', 'department', 'payroll_cycle'],
    columns: [
      col('Month',        'payroll_month'),
      col('Branch',       'branch'),
      col('Department',   'department'),
      col('Headcount',    'headcount'),
      col('Total Gross',  'total_gross',        fmtCur),
      col('Total Net',    'total_net',          fmtCur),
      col('Deductions',   'total_deductions',   fmtCur),
      col('OT Cost',      'total_overtime_cost',fmtCur),
      col('Avg Gross',    'avg_gross',          fmtCur),
      col('Status',       'run_status',         statusBadge),
    ],
    exportCols: ['Month','Branch','Department','Headcount','Total Gross','Total Net','Deductions','OT Cost','Avg Gross','Status'],
    exportKeys: ['payroll_month','branch','department','headcount','total_gross','total_net','total_deductions','total_overtime_cost','avg_gross','run_status'],
  },
  'payslip-detail': {
    label: 'Payslip Detail',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'payroll_cycle'],
    columns: [
      col('Month',        'payroll_month'),
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('Department',   'department'),
      col('Branch',       'branch'),
      col('Gross',        'gross_salary',    fmtCur),
      col('Net',          'net_salary',      fmtCur),
      col('Deductions',   'total_deductions',fmtCur),
      col('OT Amount',    'overtime_amount', fmtCur),
      col('Present Days', 'present_days'),
      col('Working Days', 'total_working_days'),
      col('Status',       'status',          statusBadge),
    ],
    exportCols: ['Month','Code','Employee','Department','Branch','Gross','Net','Deductions','OT Amount','Present Days','Working Days','Status'],
    exportKeys: ['payroll_month','employee_code','employee_name','department','branch','gross_salary','net_salary','total_deductions','overtime_amount','present_days','total_working_days','status'],
  },
  'overtime-cost': {
    label: 'Overtime Cost',
    filterFields: ['date_range', 'branch', 'department', 'payroll_cycle'],
    columns: [
      col('Month',           'payroll_month'),
      col('Department',      'department'),
      col('Branch',          'branch'),
      col('Employees w/ OT', 'employees_with_ot'),
      col('Total OT Cost',   'total_ot_cost', fmtCur),
      col('Avg OT Cost',     'avg_ot_cost',   fmtCur),
    ],
    exportCols: ['Month','Department','Branch','Employees w/ OT','Total OT Cost','Avg OT Cost'],
    exportKeys: ['payroll_month','department','branch','employees_with_ot','total_ot_cost','avg_ot_cost'],
  },
  'deduction-analysis': {
    label: 'Deduction Analysis',
    filterFields: ['date_range', 'branch', 'payroll_cycle'],
    columns: [
      col('Month',       'payroll_month'),
      col('Branch',      'branch'),
      col('Headcount',   'headcount'),
      col('Deductions',  'total_deductions',  fmtCur),
      col('Total Gross', 'total_gross',       fmtCur),
      col('Deduction %', 'deduction_pct',     fmtPct),
    ],
    exportCols: ['Month','Branch','Headcount','Deductions','Total Gross','Deduction %'],
    exportKeys: ['payroll_month','branch','headcount','total_deductions','total_gross','deduction_pct'],
  },
  // ── New reports ──
  'salary-sheet': {
    label: 'Salary Sheet',
    filterFields: ['branch', 'department', 'payroll_cycle'],
    columns: [
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('Designation',  'designation'),
      col('Department',   'department'),
      col('Branch',       'branch'),
      col('Basic',        'basic_salary',     fmtCur),
      col('HRA',          'hra',              fmtCur),
      col('Allowances',   'other_allowances', fmtCur),
      col('Gross',        'gross_salary',     fmtCur),
      col('Deductions',   'total_deductions', fmtCur),
      col('Net Pay',      'net_salary',       fmtCur),
      col('Present Days', 'present_days'),
    ],
    exportCols: ['Code','Employee','Designation','Department','Branch','Basic','HRA','Allowances','Gross','Deductions','Net Pay','Present Days'],
    exportKeys: ['employee_code','employee_name','designation','department','branch','basic_salary','hra','other_allowances','gross_salary','total_deductions','net_salary','present_days'],
  },
  'payroll-audit': {
    label: 'Payroll Audit',
    filterFields: ['date_range', 'branch', 'employee', 'payroll_cycle'],
    columns: [
      col('Month',          'payroll_month'),
      col('Code',           'employee_code'),
      col('Employee',       'employee_name'),
      col('Branch',         'branch'),
      col('Prev Gross',     'prev_gross',       fmtCur),
      col('Curr Gross',     'curr_gross',       fmtCur),
      col('Variance',       'variance',         fmtCur),
      col('Variance %',     'variance_pct',     fmtPct),
      col('Changed By',     'changed_by'),
    ],
    exportCols: ['Month','Code','Employee','Branch','Prev Gross','Curr Gross','Variance','Variance %','Changed By'],
    exportKeys: ['payroll_month','employee_code','employee_name','branch','prev_gross','curr_gross','variance','variance_pct','changed_by'],
  },
  'fine-deduction-report': {
    label: 'Fine Deductions',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'payroll_cycle'],
    columns: [
      col('Month',      'payroll_month'),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Category',   'category'),
      col('Fine Amount','fine_amount',  fmtCur),
      col('Deducted',   'deducted',    fmtCur),
      col('Reason',     'reason'),
    ],
    exportCols: ['Month','Code','Employee','Branch','Category','Fine Amount','Deducted','Reason'],
    exportKeys: ['payroll_month','employee_code','employee_name','branch','category','fine_amount','deducted','reason'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function PayrollReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_PAYROLL]);
  const [tab,     setTab]     = useState('monthly-summary');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/payroll/${tab}`, { params });
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
      title="Payroll Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `payroll_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `payroll_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `payroll_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`payroll/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['payslip-detail','salary-sheet','payroll-audit','fine-deduction-report'].includes(tab)}
      />
    </ReportPageShell>
  );
}
