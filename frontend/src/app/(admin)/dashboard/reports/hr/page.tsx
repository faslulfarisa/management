'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, FileText, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';
import { exportPdf } from '@/lib/export-pdf';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TABS = [
  { key: 'headcount',           label: 'Headcount' },
  { key: 'joining-trend',       label: 'Joining Trend' },
  { key: 'resignation-trend',   label: 'Resignation Trend' },
  { key: 'leave-utilization',   label: 'Leave Utilization' },
  { key: 'workforce-statistics',label: 'Workforce Stats' },
  { key: 'account-status',      label: 'Account Status' },
];

const COLUMNS: Record<string, string[]> = {
  'headcount':            ['Department', 'Branch', 'Total', 'Male', 'Female', 'Full Time', 'Part Time', 'Contract'],
  'joining-trend':        ['Month', 'Joinings', 'Full Time', 'Contract'],
  'resignation-trend':    ['Month', 'Resignations', 'Department'],
  'leave-utilization':    ['Code', 'Employee', 'Department', 'Leave Type', 'Applications', 'Days Taken', 'Approved', 'Rejected', 'Pending'],
  'workforce-statistics': ['Total Active', 'Male', 'Female', 'Full Time', 'Part Time', 'Contract', 'Avg Tenure (yrs)', 'New Hires (90d)'],
  'account-status':       ['Employee', 'Email', 'Branch', 'Status', 'Reason', 'Notes', 'Deactivated By', 'Deactivated At', 'Reactivated At'],
};

const KEYS: Record<string, string[]> = {
  'headcount':            ['department', 'branch', 'headcount', 'male', 'female', 'full_time', 'part_time', 'contract'],
  'joining-trend':        ['month', 'joinings', 'full_time', 'contract'],
  'resignation-trend':    ['month', 'resignations', 'department'],
  'leave-utilization':    ['employee_code', 'employee_name', 'department', 'leave_type', 'applications', 'total_days_taken', 'approved', 'rejected', 'pending'],
  'workforce-statistics': ['total_active', 'male', 'female', 'full_time', 'part_time', 'contract', 'avg_tenure_years', 'new_hires_90d'],
  'account-status':       ['employee_name', 'email', 'branch', 'status', 'deactivation_reason', 'deactivation_notes', 'deactivated_by', 'deactivated_at', 'reactivated_at'],
};

function formatCell(val: any): string {
  if (val === null || val === undefined) return '—';
  return String(val);
}

function exportPdfReport(tab: string, rows: any[]) {
  const tabLabel = TABS.find(t => t.key === tab)?.label ?? tab;
  exportPdf({
    title: `HR Report — ${tabLabel}`,
    columns: COLUMNS[tab],
    rows: rows.map(r => KEYS[tab].map(k => formatCell(r[k]))),
    filename: `hr_${tab}`,
  });
}

function exportCsv(tab: string, rows: any[]) {
  const cols = COLUMNS[tab];
  const keys = KEYS[tab];
  const header = cols.join(',');
  const body = rows.map(r => keys.map(k => `"${formatCell(r[k])}"`).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hr_${tab}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

export default function HrReportsPage() {
  const [tab, setTab] = useState('headcount');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;
      const res = await api.get(`/reports/hr/${tab}`, { params });
      setRows(res.data.data ?? []);
      setTotal(res.data.meta?.total ?? 0);
    } catch (e) { console.error(e); setRows([]); }
    finally { setLoading(false); }
  }, [tab, page, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [tab, dateFrom, dateTo]);
  useEffect(() => { fetch(); }, [fetch]);

  const cols = COLUMNS[tab];
  const keys = KEYS[tab];
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => { setDateFrom(''); setDateTo(''); }}
          className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all">
          Reset
        </button>
        <div className="flex-1" />
        <button onClick={() => exportPdfReport(tab, rows)} disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all disabled:opacity-40">
          <FileText className="w-3.5 h-3.5" /> Export PDF
        </button>
        <button onClick={() => exportCsv(tab, rows)} disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <button onClick={fetch}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border rounded-xl px-3 py-1.5 hover:bg-muted transition-all">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${tab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm">No data for the selected filters</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {cols.map(c => <TableHead key={c}>{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {keys.map(k => (
                      <TableCell key={k}>{formatCell(row[k])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">{total} records</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="text-xs border border-border rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-muted">Prev</button>
                  <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="text-xs border border-border rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-muted">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
