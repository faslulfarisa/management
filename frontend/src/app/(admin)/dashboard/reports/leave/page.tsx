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
const c       = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    approved: 'bg-green-50 text-green-700 border-green-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    cancelled:'bg-gray-50 text-gray-600 border-gray-200',
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
  'balance': {
    label: 'Leave Balance',
    filterFields: ['branch', 'department', 'employee', 'leave_type'],
    columns: [
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Department',  'department'),
      col('Branch',      'branch'),
      col('Leave Type',  'leave_type'),
      col('Entitled',    'entitled_days'),
      col('Taken',       'days_taken'),
      col('Pending',     'pending_days'),
      col('Balance',     'balance_days'),
    ],
    exportCols: ['Code','Employee','Department','Branch','Leave Type','Entitled','Taken','Pending','Balance'],
    exportKeys: ['employee_code','employee_name','department','branch','leave_type','entitled_days','days_taken','pending_days','balance_days'],
  },
  'utilization': {
    label: 'Leave Utilization',
    filterFields: ['date_range', 'branch', 'department', 'leave_type'],
    columns: [
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Department',  'department'),
      col('Branch',      'branch'),
      col('Leave Type',  'leave_type'),
      col('Entitled',    'entitled_days'),
      col('Used',        'days_taken'),
      col('Utilization', 'utilization_pct', fmtPct),
    ],
    exportCols: ['Code','Employee','Department','Branch','Leave Type','Entitled','Used','Utilization %'],
    exportKeys: ['employee_code','employee_name','department','branch','leave_type','entitled_days','days_taken','utilization_pct'],
  },
  'approval-status': {
    label: 'Approval Status',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'leave_type'],
    columns: [
      col('Applied',    'created_at',  fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Leave Type', 'leave_type'),
      col('From',       'from_date',   fmtDate),
      col('To',         'to_date',     fmtDate),
      col('Days',       'total_days'),
      col('Status',     'status',      statusBadge),
      col('Reviewed By','reviewed_by'),
    ],
    exportCols: ['Applied','Code','Employee','Department','Branch','Leave Type','From','To','Days','Status','Reviewed By'],
    exportKeys: ['created_at','employee_code','employee_name','department','branch','leave_type','from_date','to_date','total_days','status','reviewed_by'],
  },
  'calendar': {
    label: 'Leave Calendar',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'leave_type'],
    columns: [
      col('From',       'from_date',   fmtDate),
      col('To',         'to_date',     fmtDate),
      col('Days',       'total_days'),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Leave Type', 'leave_type'),
      col('Status',     'status',      statusBadge),
    ],
    exportCols: ['From','To','Days','Code','Employee','Department','Branch','Leave Type','Status'],
    exportKeys: ['from_date','to_date','total_days','employee_code','employee_name','department','branch','leave_type','status'],
  },
  'department-analytics': {
    label: 'Dept Analytics',
    filterFields: ['date_range', 'branch', 'department', 'leave_type'],
    columns: [
      col('Department',  'department'),
      col('Branch',      'branch'),
      col('Leave Type',  'leave_type'),
      col('Total Days',  'total_days'),
      col('Applications','applications'),
      col('Employees',   'unique_employees'),
      col('Avg Days/Emp','avg_days_per_emp'),
    ],
    exportCols: ['Department','Branch','Leave Type','Total Days','Applications','Employees','Avg Days/Emp'],
    exportKeys: ['department','branch','leave_type','total_days','applications','unique_employees','avg_days_per_emp'],
  },
  'branch-analytics': {
    label: 'Branch Analytics',
    filterFields: ['date_range', 'branch', 'leave_type'],
    columns: [
      col('Branch',      'branch'),
      col('Leave Type',  'leave_type'),
      col('Total Days',  'total_days'),
      col('Applications','applications'),
      col('Approved',    'approved'),
      col('Pending',     'pending'),
      col('Rejected',    'rejected'),
      col('Avg Days',    'avg_days'),
    ],
    exportCols: ['Branch','Leave Type','Total Days','Applications','Approved','Pending','Rejected','Avg Days'],
    exportKeys: ['branch','leave_type','total_days','applications','approved','pending','rejected','avg_days'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function LeaveReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_VIEW]);
  const [tab,     setTab]     = useState('balance');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/leave/${tab}`, { params });
      setRows(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [tab, page, filters]);

  useEffect(() => { setPage(1); setRows([]); }, [tab, filters]);
  useEffect(() => { load(); }, [load]);

  const cfg = TAB_CONFIG[tab];
  function buildExportData() {
    return {
      columns: cfg.exportCols,
      rows: rows.map(r => cfg.exportKeys.map(k => {
        const v = r[k];
        const formatted = (() => {
          if (['created_at', 'from_date', 'to_date'].includes(k)) return fmtDate(v);
          if (k === 'utilization_pct') return fmtPct(v);
          return v != null ? String(v) : '';
        })();
        return formatted === '—' ? '' : formatted;
      })),
    };
  }

  return (
    <ReportPageShell
      title="Leave Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `leave_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `leave_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `leave_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`leave/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['balance','utilization','approval-status'].includes(tab)}
      />
    </ReportPageShell>
  );
}
