'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bookmark, Trash2, ExternalLink, Search, Loader2,
  BarChart2, Users, DollarSign, Wallet, CalendarDays, Clock, Fingerprint, GitBranch,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface SavedReport {
  id: string;
  name: string;
  category: string;
  report_key: string;
  filters: Record<string, any>;
  is_shared: boolean;
  created_at: string;
  user_name?: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; base: string }> = {
  attendance:  { label: 'Attendance',  icon: BarChart2,   color: 'text-blue-600',   base: '/dashboard/reports/attendance' },
  hr:          { label: 'Employee',    icon: Users,       color: 'text-violet-600', base: '/dashboard/reports/employee' },
  employee:    { label: 'Employee',    icon: Users,       color: 'text-violet-600', base: '/dashboard/reports/employee' },
  payroll:     { label: 'Payroll',     icon: DollarSign,  color: 'text-emerald-600',base: '/dashboard/reports/payroll' },
  leave:       { label: 'Leave',       icon: CalendarDays,color: 'text-orange-600', base: '/dashboard/reports/leave' },
  shift:       { label: 'Shift',       icon: Clock,       color: 'text-cyan-600',   base: '/dashboard/reports/shift' },
  biometrics:  { label: 'Biometrics', icon: Fingerprint, color: 'text-rose-600',   base: '/dashboard/reports/biometrics' },
  branch:      { label: 'Branch',      icon: GitBranch,   color: 'text-teal-600',   base: '/dashboard/reports/branch' },
  finance:     { label: 'Finance',     icon: Wallet,      color: 'text-amber-600',  base: '/dashboard/reports/finance' },
};

function formatFilterSummary(filters: Record<string, any>): string {
  const parts: string[] = [];
  if (filters.date_from && filters.date_to) parts.push(`${filters.date_from} → ${filters.date_to}`);
  else if (filters.date_from) parts.push(`From ${filters.date_from}`);
  if (filters.branch_id) parts.push('Branch filtered');
  if (filters.department_id) parts.push('Dept filtered');
  if (filters.employee_id) parts.push('Employee filtered');
  return parts.length ? parts.join(' · ') : 'No filters applied';
}

export default function SavedReportsPage() {
  const [reports, setReports]   = useState<SavedReport[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState('');
  const [category, setCategory] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search)   params.search   = search;
      if (category) params.category = category;
      const res = await api.get('/reports/saved', { params });
      setReports(res.data.data ?? res.data ?? []);
    } catch { setReports([]); }
    finally { setLoading(false); }
  }, [search, category]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api.delete(`/reports/saved/${id}`);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch {}
    finally { setDeleting(null); }
  }

  const CATEGORIES = Array.from(new Set(Object.keys(CATEGORY_META)));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Saved Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Reuse saved filter configurations across all report categories</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-xl px-3 py-1.5">
          {reports.length} saved
        </span>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-2xl px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search saved reports..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border border-border rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</option>
          ))}
        </select>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white border border-border rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-border rounded-2xl text-muted-foreground">
          <Bookmark className="w-10 h-10 opacity-20 mb-3" />
          <p className="text-sm font-medium">No saved reports yet</p>
          <p className="text-xs mt-1">Save a report configuration from any report page to see it here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {reports.map(r => {
            const meta = CATEGORY_META[r.category] ?? { label: r.category, icon: Bookmark, color: 'text-muted-foreground', base: '/dashboard/reports' };
            const Icon = meta.icon;
            const [, reportTab] = r.report_key.split('/');
            const href = reportTab ? `${meta.base}?tab=${reportTab}` : meta.base;

            return (
              <div key={r.id} className="bg-white border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted/50 rounded-xl border border-border shrink-0">
                    <Icon className={cn('w-4 h-4', meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      {r.is_shared && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full shrink-0">Shared</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.label} · {r.report_key}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{formatFilterSummary(r.filters)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {r.user_name && ` · ${r.user_name}`}
                  </p>
                  <div className="flex items-center gap-1">
                    <Link
                      href={href}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </Link>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-40"
                    >
                      {deleting === r.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
