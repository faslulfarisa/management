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

const fmtCur  = (v: any) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';
const fmtPct  = (v: any) => v != null ? `${v}%` : '—';
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const c       = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

const agingBadge = (v: any) => {
  const map: Record<string, string> = {
    'current':    'bg-emerald-50 text-emerald-700 border-emerald-200',
    '1-30 days':  'bg-amber-50 text-amber-700 border-amber-200',
    '31-60 days': 'bg-orange-50 text-orange-700 border-orange-200',
    '61-90 days': 'bg-red-50 text-red-700 border-red-200',
    '90+ days':   'bg-red-100 text-red-800 border-red-300',
  };
  const cls = map[String(v ?? '').toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', cls)}>{v ?? '—'}</span>;
};

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    active:   'bg-blue-50 text-blue-700 border-blue-200',
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
  'expense-breakdown': {
    label: 'Expense Breakdown',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Category',       'category'),
      col('Month',          'month'),
      col('Count',          'count'),
      col('Total Amount',   'total_amount',    fmtCur),
      col('Approved Count', 'approved_count'),
      col('Approved Amount','approved_amount', fmtCur),
      col('Pending Count',  'pending_count'),
    ],
    exportCols: ['Category','Month','Count','Total Amount','Approved Count','Approved Amount','Pending Count'],
    exportKeys: ['category','month','count','total_amount','approved_count','approved_amount','pending_count'],
  },
  'invoice-aging': {
    label: 'Invoice Aging',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Invoice #',    'invoice_number'),
      col('Client',       'client_name'),
      col('Issue Date',   'issue_date',    fmtDate),
      col('Due Date',     'due_date',      fmtDate),
      col('Total',        'total_amount',  fmtCur),
      col('Paid',         'paid_amount',   fmtCur),
      col('Outstanding',  'outstanding',   fmtCur),
      col('Days Overdue', 'days_overdue'),
      col('Aging Bucket', 'aging_bucket',  agingBadge),
      col('Status',       'status',        statusBadge),
    ],
    exportCols: ['Invoice #','Client','Issue Date','Due Date','Total','Paid','Outstanding','Days Overdue','Aging Bucket','Status'],
    exportKeys: ['invoice_number','client_name','issue_date','due_date','total_amount','paid_amount','outstanding','days_overdue','aging_bucket','status'],
  },
  'budget-vs-actual': {
    label: 'Budget vs Actual',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Budget',        'budget_name'),
      col('Category',      'category'),
      col('Period',        'period'),
      col('Budgeted',      'budgeted',       fmtCur),
      col('Actual',        'actual',         fmtCur),
      col('Variance',      'variance',       fmtCur),
      col('Utilization %', 'utilization_pct',fmtPct),
      col('Start',         'start_date',     fmtDate),
      col('End',           'end_date',       fmtDate),
      col('Status',        'status',         statusBadge),
    ],
    exportCols: ['Budget','Category','Period','Budgeted','Actual','Variance','Utilization %','Start','End','Status'],
    exportKeys: ['budget_name','category','period','budgeted','actual','variance','utilization_pct','start_date','end_date','status'],
  },
  'reimbursements': {
    label: 'Reimbursements',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Category',   'category'),
      col('Amount',     'amount',       fmtCur),
      col('Description','description'),
      col('Status',     'status',       statusBadge),
      col('Date',       'created_at',   fmtDate),
    ],
    exportCols: ['Code','Employee','Department','Category','Amount','Description','Status','Date'],
    exportKeys: ['employee_code','employee_name','department','category','amount','description','status','created_at'],
  },
  // ── New reports ──
  'payroll-cost-analysis': {
    label: 'Payroll Cost Analysis',
    filterFields: ['date_range', 'branch', 'department', 'payroll_cycle'],
    columns: [
      col('Month',        'payroll_month'),
      col('Branch',       'branch'),
      col('Department',   'department'),
      col('Base Salary',  'total_gross',        fmtCur),
      col('OT Cost',      'total_overtime_cost',fmtCur),
      col('Deductions',   'total_deductions',   fmtCur),
      col('Net Cost',     'total_net',          fmtCur),
      col('Headcount',    'headcount'),
      col('Cost/Head',    'cost_per_head',      fmtCur),
    ],
    exportCols: ['Month','Branch','Department','Base Salary','OT Cost','Deductions','Net Cost','Headcount','Cost/Head'],
    exportKeys: ['payroll_month','branch','department','total_gross','total_overtime_cost','total_deductions','total_net','headcount','cost_per_head'],
  },
  'branch-expense-summary': {
    label: 'Branch Expense Summary',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Branch',          'branch'),
      col('Month',           'month'),
      col('Total Expenses',  'total_expenses',  fmtCur),
      col('Reimbursements',  'reimbursements',  fmtCur),
      col('Payroll Cost',    'payroll_cost',    fmtCur),
      col('OT Cost',         'overtime_cost',   fmtCur),
      col('Pending Items',   'pending_count'),
    ],
    exportCols: ['Branch','Month','Total Expenses','Reimbursements','Payroll Cost','OT Cost','Pending Items'],
    exportKeys: ['branch','month','total_expenses','reimbursements','payroll_cost','overtime_cost','pending_count'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function FinanceReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_VIEW]);
  const [tab,     setTab]     = useState('expense-breakdown');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/finance/${tab}`, { params });
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
      title="Finance Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `finance_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `finance_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `finance_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`finance/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
      />
    </ReportPageShell>
  );
}
