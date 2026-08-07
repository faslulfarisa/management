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
const fmtTime = (v: any) => { if (!v) return '—'; try { return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return String(v); } };
const fmtPct  = (v: any) => v != null ? `${v}%` : '—';
const c       = (v: any) => (v == null ? <span className="text-muted-foreground">—</span> : String(v));

const methodBadge = (v: any) => {
  const map: Record<string, string> = {
    face:        'bg-violet-50 text-violet-700 border-violet-200',
    fingerprint: 'bg-blue-50 text-blue-700 border-blue-200',
    card:        'bg-cyan-50 text-cyan-700 border-cyan-200',
    pin:         'bg-amber-50 text-amber-700 border-amber-200',
    manual:      'bg-gray-50 text-gray-600 border-gray-200',
  };
  const cls = map[String(v ?? '').toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize border', cls)}>{v ?? '—'}</span>;
};

const dirBadge = (v: any) => (
  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border',
    v === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200')}>
    {v ?? '—'}
  </span>
);

const devStatusBadge = (v: any) => {
  const cls = String(v ?? '').toLowerCase() === 'online'
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border capitalize', cls)}>{v ?? '—'}</span>;
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
  'device-activity': {
    label: 'Device Activity',
    filterFields: ['date_range', 'branch', 'device'],
    columns: [
      col('Date',        'date',          fmtDate),
      col('Device ID',   'device_id'),
      col('Device Name', 'device_name'),
      col('Branch',      'branch'),
      col('Punch Count', 'punch_count'),
      col('IN Punches',  'in_count'),
      col('OUT Punches', 'out_count'),
      col('Duplicates',  'duplicate_count'),
    ],
    exportCols: ['Date','Device ID','Device Name','Branch','Punch Count','IN','OUT','Duplicates'],
    exportKeys: ['date','device_id','device_name','branch','punch_count','in_count','out_count','duplicate_count'],
  },
  'verification-breakdown': {
    label: 'Verification Breakdown',
    filterFields: ['date_range', 'branch', 'verification_method'],
    columns: [
      col('Branch',      'branch'),
      col('Method',      'verify_method', methodBadge),
      col('Punches',     'punch_count'),
      col('%',           'pct',           fmtPct),
      col('Unique Emp.', 'unique_employees'),
    ],
    exportCols: ['Branch','Method','Punches','%','Unique Employees'],
    exportKeys: ['branch','verify_method','punch_count','pct','unique_employees'],
  },
  'device-registry': {
    label: 'Device Registry',
    filterFields: ['branch'],
    columns: [
      col('Device ID',   'device_id'),
      col('Device Name', 'device_name'),
      col('Branch',      'branch'),
      col('IP Address',  'ip_address'),
      col('Model',       'model'),
      col('Status',      'status',        devStatusBadge),
      col('Last Sync',   'last_seen',     fmtDate),
      col('Total Punches','total_punches'),
    ],
    exportCols: ['Device ID','Device Name','Branch','IP Address','Model','Status','Last Sync','Total Punches'],
    exportKeys: ['device_id','device_name','branch','ip_address','model','status','last_seen','total_punches'],
  },
  'punch-timeline': {
    label: 'Punch Timeline',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'verification_method', 'device'],
    columns: [
      col('Punch Time',  'punch_time',    fmtTime),
      col('Date',        'date',          fmtDate),
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Branch',      'branch'),
      col('Direction',   'direction',     dirBadge),
      col('Method',      'verify_method', methodBadge),
      col('Device',      'device_id'),
    ],
    exportCols: ['Punch Time','Date','Code','Employee','Branch','Direction','Method','Device'],
    exportKeys: ['punch_time','date','employee_code','employee_name','branch','direction','verify_method','device_id'],
  },
  'duplicate-punches': {
    label: 'Duplicate Punches',
    filterFields: ['date_range', 'branch', 'employee'],
    columns: [
      col('Date',        'date',          fmtDate),
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Branch',      'branch'),
      col('Punch Time',  'punch_time',    fmtTime),
      col('Direction',   'direction',     dirBadge),
      col('Method',      'verify_method', methodBadge),
      col('Device',      'device_id'),
      col('Gap Secs',    'gap_seconds'),
    ],
    exportCols: ['Date','Code','Employee','Branch','Punch Time','Direction','Method','Device','Gap (secs)'],
    exportKeys: ['date','employee_code','employee_name','branch','punch_time','direction','verify_method','device_id','gap_seconds'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function BiometricsReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_ATTENDANCE]);
  const [tab,     setTab]     = useState('device-activity');
  const [rows,    setRows]    = useState<any[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      const res = await api.get(`/reports/biometrics/${tab}`, { params });
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
      title="Biometrics Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport ? () => exportReportCsv(buildExportData(), `biometrics_${tab}`) : undefined}
      onExportXlsx={canExport ? () => exportReportXlsx(buildExportData(), `biometrics_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport ? () => exportReportPdf(cfg.label, buildExportData(), `biometrics_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`biometrics/${tab}`}
    >
      <ReportTable
        columns={cfg.columns}
        data={rows}
        total={total}
        page={page}
        onPageChange={setPage}
        loading={loading}
        stickyFirstCol={['punch-timeline','duplicate-punches'].includes(tab)}
      />
    </ReportPageShell>
  );
}
