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
const fmtPct  = (v: any) => v != null ? `${v}%` : '—';
const nil = () => <span className="text-muted-foreground">—</span>;
const c   = (v: any) => (v == null ? nil() : String(v));

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    active:   'bg-green-50 text-green-700 border-green-200',
    inactive: 'bg-red-50 text-red-700 border-red-200',
    resigned: 'bg-gray-50 text-gray-700 border-gray-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
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
  'headcount': {
    label: 'Headcount',
    filterFields: ['date_range', 'branch', 'department', 'designation'],
    columns: [
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Total',      'headcount'),
      col('Male',       'male'),
      col('Female',     'female'),
      col('Full Time',  'full_time'),
      col('Part Time',  'part_time'),
      col('Contract',   'contract'),
    ],
    exportCols: ['Department','Branch','Total','Male','Female','Full Time','Part Time','Contract'],
    exportKeys: ['department','branch','headcount','male','female','full_time','part_time','contract'],
  },
  'joining-trend': {
    label: 'Joining Trend',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Month',     'month'),
      col('Joinings',  'joinings'),
      col('Full Time', 'full_time'),
      col('Contract',  'contract'),
      col('Branch',    'branch'),
    ],
    exportCols: ['Month','Joinings','Full Time','Contract','Branch'],
    exportKeys: ['month','joinings','full_time','contract','branch'],
  },
  'resignation-trend': {
    label: 'Resignation Trend',
    filterFields: ['date_range', 'branch', 'department'],
    columns: [
      col('Month',        'month'),
      col('Resignations', 'resignations'),
      col('Department',   'department'),
      col('Branch',       'branch'),
    ],
    exportCols: ['Month','Resignations','Department','Branch'],
    exportKeys: ['month','resignations','department','branch'],
  },
  'leave-utilization': {
    label: 'Leave Utilization',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'leave_type'],
    columns: [
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('Department',   'department'),
      col('Leave Type',   'leave_type'),
      col('Applications', 'applications'),
      col('Days Taken',   'total_days_taken'),
      col('Approved',     'approved'),
      col('Rejected',     'rejected'),
      col('Pending',      'pending'),
    ],
    exportCols: ['Code','Employee','Department','Leave Type','Applications','Days Taken','Approved','Rejected','Pending'],
    exportKeys: ['employee_code','employee_name','department','leave_type','applications','total_days_taken','approved','rejected','pending'],
  },
  'workforce-statistics': {
    label: 'Workforce Stats',
    filterFields: ['branch', 'department'],
    columns: [
      col('Total Active',      'total_active'),
      col('Male',              'male'),
      col('Female',            'female'),
      col('Full Time',         'full_time'),
      col('Part Time',         'part_time'),
      col('Contract',          'contract'),
      col('Avg Tenure (yrs)',  'avg_tenure_years'),
      col('New Hires (90d)',   'new_hires_90d'),
    ],
    exportCols: ['Total Active','Male','Female','Full Time','Part Time','Contract','Avg Tenure (yrs)','New Hires (90d)'],
    exportKeys: ['total_active','male','female','full_time','part_time','contract','avg_tenure_years','new_hires_90d'],
  },
  // ── New reports ──
  'employee-directory': {
    label: 'Employee Directory',
    filterFields: ['branch', 'department', 'designation'],
    columns: [
      col('Code',        'employee_code'),
      col('Name',        'employee_name'),
      col('Department',  'department'),
      col('Designation', 'designation'),
      col('Branch',      'branch'),
      col('Mobile',      'mobile'),
      col('Email',       'email'),
      col('Joined',      'joining_date',  fmtDate),
      col('Status',      'status',        statusBadge),
    ],
    exportCols: ['Code','Name','Department','Designation','Branch','Mobile','Email','Joined','Status'],
    exportKeys: ['employee_code','employee_name','department','designation','branch','mobile','email','joining_date','status'],
  },
  'transfer-history': {
    label: 'Transfer History',
    filterFields: ['date_range', 'branch', 'employee'],
    columns: [
      col('Date',         'transfer_date',  fmtDate),
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('From Branch',  'from_branch'),
      col('To Branch',    'to_branch'),
      col('Reason',       'reason'),
      col('Approved By',  'approved_by'),
      col('Status',       'status',         statusBadge),
    ],
    exportCols: ['Date','Code','Employee','From Branch','To Branch','Reason','Approved By','Status'],
    exportKeys: ['transfer_date','employee_code','employee_name','from_branch','to_branch','reason','approved_by','status'],
  },
  'fine-deductions': {
    label: 'Fine & Deductions',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',       'issued_date',   fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Category',   'category'),
      col('Amount',     'amount',        (v) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'),
      col('Reason',     'reason'),
      col('Status',     'status',        statusBadge),
    ],
    exportCols: ['Date','Code','Employee','Branch','Category','Amount','Reason','Status'],
    exportKeys: ['issued_date','employee_code','employee_name','branch','category','amount','reason','status'],
  },
  'tenure-analysis': {
    label: 'Tenure Analysis',
    filterFields: ['branch', 'department'],
    columns: [
      col('Tenure Bucket',    'tenure_bucket'),
      col('Employees',        'employee_count'),
      col('% of Workforce',   'pct',           fmtPct),
      col('Avg Salary',       'avg_gross',      (v) => v != null ? `₹${parseFloat(String(v)).toLocaleString('en-IN')}` : '—'),
      col('Department',       'department'),
    ],
    exportCols: ['Tenure Bucket','Employees','% of Workforce','Avg Salary','Department'],
    exportKeys: ['tenure_bucket','employee_count','pct','avg_gross','department'],
  },
  'department-demographics': {
    label: 'Dept Demographics',
    filterFields: ['branch', 'department'],
    columns: [
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Total',      'total'),
      col('Male',       'male'),
      col('Female',     'female'),
      col('Full Time',  'full_time'),
      col('Part Time',  'part_time'),
      col('Contract',   'contract'),
      col('Avg Age',    'avg_age'),
    ],
    exportCols: ['Department','Branch','Total','Male','Female','Full Time','Part Time','Contract','Avg Age'],
    exportKeys: ['department','branch','total','male','female','full_time','part_time','contract','avg_age'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function EmployeeReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_VIEW]);
  const [tab,     setTab]     = useState('headcount');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/hr/${tab}`, { params });
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
      title="Employee Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `employee_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `employee_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `employee_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`employee/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['employee-directory','fine-deductions','transfer-history'].includes(tab)}
      />
    </ReportPageShell>
  );
}
