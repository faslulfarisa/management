'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, FileText, Loader2, Briefcase } from 'lucide-react';
import api from '@/lib/api';
import { exportPdf } from '@/lib/export-pdf';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const TABS = [
  { key: 'recruiter-performance', label: 'Recruiter Performance' },
  { key: 'source-performance',    label: 'Source Performance' },
  { key: 'hiring-cost',           label: 'Hiring Cost' },
  { key: 'time-to-hire',          label: 'Time to Hire' },
  { key: 'offer-acceptance',      label: 'Offer Acceptance' },
  { key: 'joining-ratio',         label: 'Joining Ratio' },
  { key: 'campaign-roi',          label: 'Campaign ROI' },
];

const COLUMNS: Record<string, string[]> = {
  'recruiter-performance': ['First Name', 'Last Name', 'Code', 'Vacancies Handled', 'Vacancies Filled', 'Applications Reviewed', 'Hires', 'Offers Extended', 'Offers Accepted', 'Avg Days to Fill'],
  'source-performance':    ['Source', 'Applications', 'Shortlisted', 'Hires', 'Conversion Rate %'],
  'hiring-cost':           ['Campaign', 'Type', 'Budget', 'Actual Spend', 'Applications', 'Hires', 'Cost per Hire'],
  'time-to-hire':          ['Department', 'Job Title', 'Hires', 'Avg Days Applied→Join', 'Avg Days Applied→Decision'],
  'offer-acceptance':      ['Sent', 'Accepted', 'Declined', 'Withdrawn', 'Expired', 'Acceptance Rate %'],
  'joining-ratio':         ['Accepted Offers', 'Actually Joined', 'Joining Ratio %'],
  'campaign-roi':          ['Campaign', 'Type', 'Budget', 'Actual Spend', 'Applications', 'Hires', 'Cost per Hire'],
};

const KEYS: Record<string, string[]> = {
  'recruiter-performance': ['first_name', 'last_name', 'employee_code', 'vacancies_handled', 'vacancies_filled', 'applications_reviewed', 'hires', 'offers_extended', 'offers_accepted', 'avg_days_to_fill'],
  'source-performance':    ['source', 'applications', 'shortlisted', 'hires', 'conversion_rate_pct'],
  'hiring-cost':           ['name', 'campaign_type', 'budget_amount', 'actual_spend', 'applications', 'hires', 'cost_per_hire'],
  'time-to-hire':          ['department', 'job_title', 'hires', 'avg_days_applied_to_join', 'avg_days_applied_to_decision'],
  'offer-acceptance':      ['sent', 'accepted', 'declined', 'withdrawn', 'expired', 'acceptance_rate_pct'],
  'joining-ratio':         ['accepted_offers', 'actually_joined', 'joining_ratio_pct'],
  'campaign-roi':          ['name', 'campaign_type', 'budget_amount', 'actual_spend', 'applications', 'hires', 'cost_per_hire'],
};

function formatCell(val: any): string {
  if (val === null || val === undefined) return '—';
  return String(val);
}

function exportPdfReport(tab: string, rows: any[]) {
  const tabLabel = TABS.find(t => t.key === tab)?.label ?? tab;
  exportPdf({
    title: `Recruitment Report — ${tabLabel}`,
    columns: COLUMNS[tab],
    rows: rows.map(r => KEYS[tab].map(k => formatCell(r[k]))),
    filename: `recruitment_${tab}`,
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
  a.download = `recruitment_${tab}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

export default function RecruitmentReportsPage() {
  const [tab, setTab] = useState('recruiter-performance');
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
      const res = await api.get(`/reports/recruitment/${tab}`, { params });
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
            <Briefcase className="w-10 h-10 mb-3 opacity-20" />
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
