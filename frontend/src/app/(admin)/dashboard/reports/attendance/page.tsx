'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import api from '@/lib/api';
import {
  ReportPageShell,
  ReportTable,
  AttendanceMatrix,
} from '@/components/reports';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '@/lib/report-export';
import type { FilterState, FilterField, TabDef, MatrixRow } from '@/components/reports';
import { cn } from '@/lib/utils';
import { useCanAll } from '@/hooks/use-permissions';
import { PERMISSIONS } from '@/lib/permissions';

// ─── Cell helpers ──────────────────────────────────────────────────────────────
const nil    = () => <span className="text-muted-foreground">—</span>;
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (v: any) => { if (!v) return '—'; try { return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return String(v); } };
const fmtMins = (v: any) => v != null ? `${v} min` : '—';
const fmtHrs  = (v: any) => v != null ? `${v} hr`  : '—';
const fmtPct  = (v: any) => v != null ? `${v}%`    : '—';
const c = (v: any) => (v == null ? nil() : String(v));

const statusBadge = (v: any) => {
  const map: Record<string, string> = {
    present: 'bg-green-50 text-green-700 border-green-200',
    late:    'bg-amber-50 text-amber-700 border-amber-200',
    absent:  'bg-red-50 text-red-700 border-red-200',
    half_day:'bg-orange-50 text-orange-700 border-orange-200',
    on_leave:'bg-blue-50 text-blue-700 border-blue-200',
    approved:'bg-green-50 text-green-700 border-green-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    rejected:'bg-red-50 text-red-700 border-red-200',
  };
  const cls = map[String(v).toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize border', cls)}>{v ?? '—'}</span>;
};

function col(header: string, key: string, cell?: (v: any) => React.ReactNode): ColumnDef<any> {
  return {
    header,
    accessorKey: key,
    cell: cell ? ({ getValue }) => cell(getValue()) : ({ getValue }) => c(getValue()),
  };
}

// ─── Tab configs ────────────────────────────────────────────────────────────────
interface TabCfg {
  label: string;
  filterFields: FilterField[];
  columns: ColumnDef<any>[];
  exportCols: string[];
  exportKeys: string[];
}

const TAB_CONFIG: Record<string, TabCfg> = {
  'daily-summary': {
    label: 'Daily Summary',
    filterFields: ['date_range', 'branch', 'department'],
    columns: [
      col('Date',          'date',                fmtDate),
      col('Branch',        'branch'),
      col('Department',    'department'),
      col('Total',         'total'),
      col('Present',       'present'),
      col('Absent',        'absent'),
      col('Late',          'late'),
      col('Half Day',      'half_day'),
      col('Avg Late Mins', 'avg_late_mins',       fmtMins),
      col('OT Mins',       'total_overtime_mins', fmtMins),
    ],
    exportCols: ['Date','Branch','Department','Total','Present','Absent','Late','Half Day','Avg Late Mins','OT Mins'],
    exportKeys: ['date','branch','department','total','present','absent','late','half_day','avg_late_mins','total_overtime_mins'],
  },
  'late-arrivals': {
    label: 'Late Arrivals',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'shift'],
    columns: [
      col('Date',       'date',          fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Check In',   'check_in',      fmtTime),
      col('Late Mins',  'late_minutes',  fmtMins),
      col('Shift',      'shift_name'),
      col('Source',     'source'),
    ],
    exportCols: ['Date','Code','Employee','Department','Branch','Check In','Late Mins','Shift','Source'],
    exportKeys: ['date','employee_code','employee_name','department','branch','check_in','late_minutes','shift_name','source'],
  },
  'overtime': {
    label: 'Overtime',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',       'date',             fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Check In',   'check_in',         fmtTime),
      col('Check Out',  'check_out',         fmtTime),
      col('OT Mins',    'overtime_minutes',  fmtMins),
      col('OT Hours',   'overtime_hours',    fmtHrs),
    ],
    exportCols: ['Date','Code','Employee','Department','Branch','Check In','Check Out','OT Mins','OT Hours'],
    exportKeys: ['date','employee_code','employee_name','department','branch','check_in','check_out','overtime_minutes','overtime_hours'],
  },
  'absenteeism': {
    label: 'Absenteeism',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('Department',   'department'),
      col('Branch',       'branch'),
      col('Absent Days',  'absent_days'),
      col('Present Days', 'present_days'),
      col('Total Days',   'total_days'),
      col('Absence %',    'absenteeism_pct', fmtPct),
    ],
    exportCols: ['Code','Employee','Department','Branch','Absent Days','Present Days','Total Days','Absence %'],
    exportKeys: ['employee_code','employee_name','department','branch','absent_days','present_days','total_days','absenteeism_pct'],
  },
  'source-analytics': {
    label: 'Source Analytics',
    filterFields: ['date_range', 'branch'],
    columns: [
      col('Source',  'source'),
      col('Punches', 'punch_count'),
      col('%',       'pct', fmtPct),
    ],
    exportCols: ['Source','Punches','%'],
    exportKeys: ['source','punch_count','pct'],
  },
  'corrections': {
    label: 'Corrections',
    filterFields: ['date_range', 'branch', 'employee'],
    columns: [
      col('Date',           'date',               fmtDate),
      col('Code',           'employee_code'),
      col('Employee',       'employee_name'),
      col('Type',           'correction_type'),
      col('Orig Check In',  'original_check_in',  fmtTime),
      col('New Check In',   'corrected_check_in', fmtTime),
      col('Orig Check Out', 'original_check_out', fmtTime),
      col('New Check Out',  'corrected_check_out',fmtTime),
      col('Reason',         'reason'),
      col('Status',         'status',             statusBadge),
    ],
    exportCols: ['Date','Code','Employee','Type','Orig Check In','New Check In','Orig Check Out','New Check Out','Reason','Status'],
    exportKeys: ['date','employee_code','employee_name','correction_type','original_check_in','corrected_check_in','original_check_out','corrected_check_out','reason','status'],
  },
  'work-hours': {
    label: 'Work Hours',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Code',         'employee_code'),
      col('Employee',     'employee_name'),
      col('Department',   'department'),
      col('Branch',       'branch'),
      col('Present Days', 'present_days'),
      col('Absent Days',  'absent_days'),
      col('Late Days',    'late_days'),
      col('Total Hrs',    'total_hours',    fmtHrs),
      col('OT Hrs',       'overtime_hours', fmtHrs),
    ],
    exportCols: ['Code','Employee','Department','Branch','Present Days','Absent Days','Late Days','Total Hrs','OT Hrs'],
    exportKeys: ['employee_code','employee_name','department','branch','present_days','absent_days','late_days','total_hours','overtime_hours'],
  },
  // ── New reports ──
  'monthly-matrix': {
    label: 'Monthly Matrix',
    filterFields: ['date_range', 'branch', 'department'],
    columns: [],
    exportCols: [],
    exportKeys: [],
  },
  'punch-logs': {
    label: 'Punch Logs',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'verification_method'],
    columns: [
      col('Date',        'date',         fmtDate),
      col('Code',        'employee_code'),
      col('Employee',    'employee_name'),
      col('Branch',      'branch'),
      col('Punch Time',  'punch_time',   fmtTime),
      col('Direction',   'direction',    (v) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', v === 'IN' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200')}>
          {v ?? '—'}
        </span>
      )),
      col('Method',      'verify_method'),
      col('Device',      'device_id'),
      col('Duplicate',   'is_duplicate', (v) => v ? <span className="text-xs text-red-600 font-medium">Yes</span> : <span className="text-xs text-muted-foreground">No</span>),
    ],
    exportCols: ['Date','Code','Employee','Branch','Punch Time','Direction','Method','Device','Duplicate'],
    exportKeys: ['date','employee_code','employee_name','branch','punch_time','direction','verify_method','device_id','is_duplicate'],
  },
  'missed-punch': {
    label: 'Missed Punch',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',       'date',          fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Check In',   'clock_in',      fmtTime),
      col('Source',     'attendance_source'),
      col('Status',     'status',        statusBadge),
    ],
    exportCols: ['Date','Code','Employee','Department','Branch','Check In','Source','Status'],
    exportKeys: ['date','employee_code','employee_name','department','branch','clock_in','attendance_source','status'],
  },
  'shift-attendance': {
    label: 'Shift Attendance',
    filterFields: ['date_range', 'branch', 'department', 'shift', 'attendance_status'],
    columns: [
      col('Date',       'date',          fmtDate),
      col('Shift',      'shift_name'),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Department', 'department'),
      col('Branch',     'branch'),
      col('Check In',   'clock_in',      fmtTime),
      col('Check Out',  'clock_out',     fmtTime),
      col('Status',     'status',        statusBadge),
      col('Late Mins',  'late_minutes',  fmtMins),
    ],
    exportCols: ['Date','Shift','Code','Employee','Department','Branch','Check In','Check Out','Status','Late Mins'],
    exportKeys: ['date','shift_name','employee_code','employee_name','department','branch','clock_in','clock_out','status','late_minutes'],
  },
  'overnight': {
    label: 'Overnight',
    filterFields: ['date_range', 'branch', 'department', 'employee', 'shift'],
    columns: [
      col('Date',       'date',           fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Shift',      'shift_name'),
      col('Check In',   'clock_in',       fmtTime),
      col('Check Out',  'clock_out',      fmtTime),
      col('Total Hrs',  'total_hours',    fmtHrs),
      col('OT Hrs',     'overtime_hours', fmtHrs),
    ],
    exportCols: ['Date','Code','Employee','Branch','Shift','Check In','Check Out','Total Hrs','OT Hrs'],
    exportKeys: ['date','employee_code','employee_name','branch','shift_name','clock_in','clock_out','total_hours','overtime_hours'],
  },
  'regularization': {
    label: 'Regularization',
    filterFields: ['date_range', 'branch', 'department', 'employee'],
    columns: [
      col('Date',       'date',          fmtDate),
      col('Code',       'employee_code'),
      col('Employee',   'employee_name'),
      col('Branch',     'branch'),
      col('Type',       'correction_type'),
      col('Reason',     'reason'),
      col('Status',     'status',        statusBadge),
      col('Approved By','approved_by'),
      col('Approved At','approved_at',   fmtDate),
    ],
    exportCols: ['Date','Code','Employee','Branch','Type','Reason','Status','Approved By','Approved At'],
    exportKeys: ['date','employee_code','employee_name','branch','correction_type','reason','status','approved_by','approved_at'],
  },
  'verification-method': {
    label: 'Verification Method',
    filterFields: ['date_range', 'branch', 'verification_method'],
    columns: [
      col('Branch',      'branch'),
      col('Method',      'verify_method'),
      col('Punches',     'punch_count'),
      col('%',           'pct',           fmtPct),
      col('Unique Emp.', 'unique_employees'),
    ],
    exportCols: ['Branch','Method','Punches','%','Unique Employees'],
    exportKeys: ['branch','verify_method','punch_count','pct','unique_employees'],
  },
};

const TABS: TabDef[] = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

// ─── Component ──────────────────────────────────────────────────────────────────
export default function AttendanceReportsPage() {
  const canExport = useCanAll([PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_ATTENDANCE]);
  const [tab,     setTab]     = useState('daily-summary');
  const [rows,    setRows]    = useState<any[]>([]);
  const [matrix,  setMatrix]  = useState<MatrixRow[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  // Matrix needs a month string — default to current month
  const matrixMonth = filters.date_from
    ? filters.date_from.substring(0, 7)
    : format(new Date(), 'yyyy-MM');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50, ...filters };
      if (tab === 'monthly-matrix') {
        // Use start/end of the selected month if date_from not set
        if (!params.date_from) {
          const d = new Date();
          params.date_from = format(startOfMonth(d), 'yyyy-MM-dd');
          params.date_to   = format(endOfMonth(d),   'yyyy-MM-dd');
        }
        const res = await api.get('/reports/attendance/monthly-matrix', { params });
        setMatrix(res.data.data ?? []);
        setTotal(res.data.meta?.total ?? (res.data.data?.length ?? 0));
      } else {
        const res = await api.get(`/reports/attendance/${tab}`, { params });
        setRows(res.data.data ?? []);
        setTotal(res.data.meta?.total ?? 0);
      }
    } catch { setRows([]); setMatrix([]); }
    finally { setLoading(false); }
  }, [tab, page, filters]);

  useEffect(() => { setPage(1); setRows([]); setMatrix([]); }, [tab, filters]);
  useEffect(() => { load(); }, [load]);

  const cfg = TAB_CONFIG[tab];

  function buildExportData() {
    return {
      columns: cfg.exportCols,
      rows: rows.map(r => cfg.exportKeys.map(k => {
        const v = r[k];
        const formatted = (() => {
          if (k === 'date' || k === 'approved_at') return fmtDate(v);
          if ([
            'check_in', 'check_out', 'punch_time', 'clock_in', 'clock_out',
            'original_check_in', 'corrected_check_in', 'original_check_out', 'corrected_check_out'
          ].includes(k)) return fmtTime(v);
          if (['avg_late_mins', 'late_minutes', 'total_overtime_mins', 'overtime_minutes'].includes(k)) return fmtMins(v);
          if (['overtime_hours', 'total_hours'].includes(k)) return fmtHrs(v);
          if (['absenteeism_pct', 'pct'].includes(k)) return fmtPct(v);
          return v != null ? String(v) : '';
        })();
        return formatted === '—' ? '' : formatted;
      })),
    };
  }

  return (
    <ReportPageShell
      title="Attendance Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      filterFields={cfg.filterFields}
      filters={filters}
      onFiltersChange={setFilters}
      onExportCsv={canExport && tab !== 'monthly-matrix' ? () => exportReportCsv(buildExportData(), `attendance_${tab}`) : undefined}
      onExportXlsx={canExport && tab !== 'monthly-matrix' ? () => exportReportXlsx(buildExportData(), `attendance_${tab}`, cfg.label) : undefined}
      onExportPdf={canExport && tab !== 'monthly-matrix' ? () => exportReportPdf(cfg.label, buildExportData(), `attendance_${tab}`) : undefined}
      onRefresh={load}
      total={total}
      loading={loading}
      reportKey={`attendance/${tab}`}
    >
      {tab === 'monthly-matrix' ? (
        <AttendanceMatrix month={matrixMonth} rows={matrix} loading={loading} />
      ) : (
        <ReportTable
          columns={cfg.columns}
          data={rows}
          total={total}
          page={page}
          onPageChange={setPage}
          loading={loading}
          stickyFirstCol={['late-arrivals','overtime','absenteeism','work-hours','punch-logs','shift-attendance','overnight'].includes(tab)}
        />
      )}
    </ReportPageShell>
  );
}
