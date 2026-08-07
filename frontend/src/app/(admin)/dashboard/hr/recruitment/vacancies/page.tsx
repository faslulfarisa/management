'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Loader2, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { vacanciesApi, Vacancy, vacancyFullName } from '@/lib/vacancies-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { VacancyStatusBadge } from '@/components/recruitment/vacancy-status-badge';
import { VacancyDrawer } from '@/components/recruitment/vacancy-drawer';
import {
  ContextualHelp,
  GuidedEmptyState,
  QuickFilterButton,
  RecruitmentStepIndicator,
} from '@/components/recruitment/recruitment-ux';

const STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'open', 'on_hold', 'closed', 'reopened', 'archived', 'cancelled'];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'created_at', label: 'Created Date' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'number_of_positions', label: 'Positions' },
  { value: 'target_close_date', label: 'Target Close' },
];

export default function VacanciesPage() {
  const router = useRouter();
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'draft' | 'approval' | 'open' | 'closing'>('all');
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([api.get('/departments', { params: { limit: 200 } }), api.get('/branches', { params: { limit: 200 } })])
      .then(([d, b]) => { setDepartments(d.data.data ?? []); setBranches(b.data.data ?? []); })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vacanciesApi.list({
        q: q || undefined, status: status || undefined, department_id: departmentId || undefined, branch_id: branchId || undefined,
        sortBy, sortDir, page, limit,
      });
      setVacancies(res.data);
      setTotal(res.total);
    } catch {
      setVacancies([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, status, departmentId, branchId, sortBy, sortDir, page, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [q, status, departmentId, branchId, quickFilter]);

  const visibleVacancies = vacancies.filter((vacancy) => {
    if (quickFilter === 'draft') return ['draft', 'rejected'].includes(vacancy.status);
    if (quickFilter === 'approval') return vacancy.status === 'pending_approval' || vacancy.approval_status === 'pending';
    if (quickFilter === 'open') return vacancy.status === 'open';
    if (quickFilter === 'closing') {
      if (!vacancy.target_close_date || !['open', 'reopened', 'approved'].includes(vacancy.status)) return false;
      const closeDate = new Date(vacancy.target_close_date).getTime();
      return closeDate >= Date.now() && closeDate <= Date.now() + 7 * 24 * 60 * 60 * 1000;
    }
    return true;
  });

  const quickCounts = {
    draft: vacancies.filter((vacancy) => ['draft', 'rejected'].includes(vacancy.status)).length,
    approval: vacancies.filter((vacancy) => vacancy.status === 'pending_approval' || vacancy.approval_status === 'pending').length,
    open: vacancies.filter((vacancy) => vacancy.status === 'open').length,
    closing: vacancies.filter((vacancy) => {
      if (!vacancy.target_close_date || !['open', 'reopened', 'approved'].includes(vacancy.status)) return false;
      const closeDate = new Date(vacancy.target_close_date).getTime();
      return closeDate >= Date.now() && closeDate <= Date.now() + 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkAction = async (action: 'close' | 'archive') => {
    if (!selected.size) return;
    if (!confirm(`${action === 'close' ? 'Close' : 'Archive'} ${selected.size} selected vacancy(ies)?`)) return;
    await Promise.all(Array.from(selected).map((id) => (action === 'close' ? vacanciesApi.close(id) : vacanciesApi.archive(id)).catch(() => null)));
    setSelected(new Set());
    fetchData();
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {showCreate && <VacancyDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <RecruitmentStepIndicator steps={[
        { label: 'Draft', description: 'Capture role, headcount, budget, and justification.', status: quickCounts.draft ? 'current' : 'complete' },
        { label: 'Approve', description: 'Submit requisitions into the existing approval workflow.', status: quickCounts.approval ? 'current' : 'pending' },
        { label: 'Open', description: 'Publish or source candidates against approved vacancies.', status: quickCounts.open ? 'current' : 'pending' },
        { label: 'Close', description: 'Close or archive filled, cancelled, or expired vacancies.', status: quickCounts.closing ? 'current' : 'pending' },
      ]} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Vacancies</h2>
          <p className="text-sm text-muted-foreground">Raise, approve, and manage vacancy requisitions</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 ml-auto">
            <Plus className="w-3.5 h-3.5" /> New Vacancy
          </button>
        </Can>
      </div>

      <ContextualHelp title="Vacancy next action">
        Draft and rejected vacancies should be completed and submitted. Open vacancies should have candidates attached and pipeline movement monitored.
      </ContextualHelp>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm ml-auto">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <button onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} className="border border-border rounded-xl px-2.5 py-2 text-sm">
          {sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <QuickFilterButton active={quickFilter === 'all'} label="All" count={vacancies.length} onClick={() => setQuickFilter('all')} />
        <QuickFilterButton active={quickFilter === 'draft'} label="Needs submission" count={quickCounts.draft} onClick={() => setQuickFilter('draft')} />
        <QuickFilterButton active={quickFilter === 'approval'} label="Pending approval" count={quickCounts.approval} onClick={() => setQuickFilter('approval')} />
        <QuickFilterButton active={quickFilter === 'open'} label="Open roles" count={quickCounts.open} onClick={() => setQuickFilter('open')} />
        <QuickFilterButton active={quickFilter === 'closing'} label="Closing soon" count={quickCounts.closing} onClick={() => setQuickFilter('closing')} />
      </div>

      {selected.size > 0 && (
        <Can permission={PERMISSIONS.RECRUITMENT_CLOSE}>
          <div className="flex items-center gap-3 bg-muted/50 rounded-xl px-4 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <button onClick={() => bulkAction('close')} className="text-sm font-medium text-foreground hover:underline">Close Selected</button>
            <Can permission={PERMISSIONS.RECRUITMENT_ARCHIVE}>
              <button onClick={() => bulkAction('archive')} className="text-sm font-medium text-foreground hover:underline">Archive Selected</button>
            </Can>
            <button onClick={() => setSelected(new Set())} className="text-sm text-muted-foreground hover:underline ml-auto">Clear</button>
          </div>
        </Can>
      )}

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : visibleVacancies.length === 0 ? (
        <GuidedEmptyState
          title="No vacancies match this view"
          description="Clear filters or create a vacancy draft. The workflow starts with a complete requisition, then moves through approval and sourcing."
          action={(
            <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> New Vacancy
              </button>
            </Can>
          )}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><input type="checkbox" disabled /></TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('title')}>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('number_of_positions')}>Positions</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>Status</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('target_close_date')}>Target Close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleVacancies.map((v) => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/vacancies/${v.id}`)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelected(v.id)} />
                  </TableCell>
                  <TableCell className="font-medium">{v.title}</TableCell>
                  <TableCell className="text-muted-foreground">{v.department_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{v.branch_name || '—'}</TableCell>
                  <TableCell>{v.number_of_positions}</TableCell>
                  <TableCell className="text-muted-foreground">{vacancyFullName('recruiter', v) || '—'}</TableCell>
                  <TableCell><VacancyStatusBadge status={v.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{v.target_close_date || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border border-border rounded-lg px-3 py-1.5 disabled:opacity-40">Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border border-border rounded-lg px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
