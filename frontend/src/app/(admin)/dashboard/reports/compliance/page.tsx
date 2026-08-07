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

const complianceBadge = (v: any) => {
  const val = parseFloat(String(v ?? 0));
  const cls = val >= 90 ? 'bg-green-50 text-green-700 border-green-200'
    : val >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', cls)}>{fmtPct(v)}</span>;
};

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    approved: 'bg-green-50 text-green-700 border-green-200',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
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
  'regularization-rate': {
    label: 'Regularization Rate',
    filterFields: ['date_range', 'branch', 'department'],
    columns: [
      col('Month',            'month'),
      col('Branch',           'branch'),
      col('Department',       'department'),
      col('Total Records',    'total_records'),
      col('Corrections',      'correction_count'),
      col('Regularization %', 'regularization_pct', complianceBadge),
      col('Pending',          'pending_count'),
      col('Approved',         'approved_count'),
    ],
    exportCols: ['Month','Branch','Department','Total Records','Corrections','Regularization %','Pending','Approved'],
    exportKeys: ['month','branch','department','total_records','correction_count','regularization_pct','pending_count','approved_count'],
  },
  'correction-audit': {
    label: 'Correction Audit',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',        'date',          fmtDate),
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Branch',      'branch'),
      col('Type',        'correction_type'),
      col('Requested By','requested_by'),
      col('Approved By', 'approved_by'),
      col('Approved At', 'approved_at',   fmtDate),
      col('Status',      'status',        statusBadge),
    ],
    exportCols: ['Date','Code','Employee','Branch','Type','Requested By','Approved By','Approved At','Status'],
    exportKeys: ['date','employee_code','employee_name','branch','correction_type','requested_by','approved_by','approved_at','status'],
  },
  'overtime-compliance': {
    label: 'OT Compliance',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Month',       'month'),
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Branch',      'branch'),
      col('OT Hours',    'ot_hours'),
      col('OT Limit',    'ot_limit_hours'),
      col('Exceeded',    'limit_exceeded', (v) =>
        v ? <span className="text-xs font-medium text-red-600">Yes</span> : <span className="text-xs text-muted-foreground">No</span>
      ),
      col('Excess Hours','excess_hours'),
    ],
    exportCols: ['Month','Code','Employee','Branch','OT Hours','OT Limit','Exceeded','Excess Hours'],
    exportKeys: ['month','employee_code','employee_name','branch','ot_hours','ot_limit_hours','limit_exceeded','excess_hours'],
  },
  'punch-quality': {
    label: 'Punch Quality',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Branch',         'branch'),
      col('Date',           'date',             fmtDate),
      col('Total Punches',  'total_punches'),
      col('Missed Punches', 'missed_punches'),
      col('Duplicates',     'duplicate_count'),
      col('Manual Entries', 'manual_count'),
      col('Data Quality %', 'quality_pct',      complianceBadge),
    ],
    exportCols: ['Branch','Date','Total Punches','Missed Punches','Duplicates','Manual Entries','Data Quality %'],
    exportKeys: ['branch','date','total_punches','missed_punches','duplicate_count','manual_count','quality_pct'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function ComplianceReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_VIEW]);
  const [tab,     setTab]     = useState('regularization-rate');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/compliance/${tab}`, { params });
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
      title="Compliance Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `compliance_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `compliance_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `compliance_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`compliance/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['correction-audit','overtime-compliance'].includes(tab)}
      />
    </ReportPageShell>
  );
}
