'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search, Tags, Pencil } from 'lucide-react';
import { candidatesApi, Candidate } from '@/lib/candidates-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CandidateDrawer } from '@/components/recruitment/candidate-drawer';
import { ListPagination } from '@/components/ui/list-pagination';
import { ExportButton } from '@/components/export';
import { ImportButton } from '@/components/import';
import {
  BulkActionBar,
  ContextualHelp,
  GuidedEmptyState,
  QuickFilterButton,
  RecruitmentStepIndicator,
} from '@/components/recruitment/recruitment-ux';

const PAGE_SIZE = 50;

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'new' | 'unassigned' | 'experienced'>('all');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await candidatesApi.list({ q: q || undefined, source: source || undefined, page, limit: PAGE_SIZE });
      setCandidates(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [q, source, page]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [q, source, quickFilter]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCandidates = candidates.filter((candidate) => {
    if (quickFilter === 'new') return new Date(candidate.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (quickFilter === 'unassigned') return !candidate.application_count;
    if (quickFilter === 'experienced') return Number(candidate.experience_years || 0) >= 3;
    return true;
  });

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    const visibleIds = filteredCandidates.map((candidate) => candidate.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    setSelected((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => { if (allVisibleSelected) next.delete(id); else next.add(id); });
      return next;
    });
  };

  const bulkTag = async () => {
    if (!selected.size) return;
    const tag = window.prompt('Add tag to selected candidates');
    if (!tag?.trim()) return;
    if (!window.confirm(`Add "${tag.trim()}" to ${selected.size} selected candidate(s)?`)) return;

    const selectedCandidates = candidates.filter((candidate) => selected.has(candidate.id));
    await Promise.all(selectedCandidates.map((candidate) => {
      const tags = Array.from(new Set([...(candidate.tags || []), tag.trim()]));
      return candidatesApi.update(candidate.id, { tags } as any).catch(() => null);
    }));
    setSelected(new Set());
    await fetchData();
  };

  const steps = [
    { label: 'Source', description: 'Create or import candidate profiles.', status: candidates.length ? 'complete' as const : 'current' as const },
    { label: 'Attach', description: 'Connect candidates to an open vacancy.', status: candidates.some((candidate) => candidate.application_count) ? 'complete' as const : 'current' as const },
    { label: 'Screen', description: 'Move qualified candidates into pipeline review.', status: 'pending' as const },
    { label: 'Communicate', description: 'Use candidate workspace for emails, notes, calls, SMS, and WhatsApp logs.', status: 'pending' as const },
  ];

  return (
    <div className="space-y-4">
      {showCreate && <CandidateDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}
      {editingCandidate && <CandidateDrawer candidate={editingCandidate} onClose={() => setEditingCandidate(null)} onSaved={fetchData} />}

      <RecruitmentStepIndicator steps={steps} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Candidates</h2>
          <p className="text-sm text-muted-foreground">Profiles sourced from the Career Portal, referrals, and walk-ins</p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <ExportButton
            config={{
              module: 'candidates',
              title: 'Recruitment Candidates',
              permission: PERMISSIONS.RECRUITMENT_EXPORT,
              columns: [
                { key: 'first_name', header: 'First Name' },
                { key: 'last_name', header: 'Last Name' },
                { key: 'email', header: 'Email' },
                { key: 'phone', header: 'Phone' },
                { key: 'source', header: 'Source' },
                { key: 'status', header: 'Status' },
                { key: 'created_at', header: 'Applied On', type: 'date' },
              ],
              defaultColumns: ['first_name', 'last_name', 'email', 'phone', 'source', 'status'],
              filenamePrefix: 'candidates',
            }}
            filters={{ q, source }}
            currentPageData={candidates}
            totalRecords={total}
          />
          <ImportButton
            config={{
              module: 'candidates',
              title: 'Recruitment Candidates',
              permission: PERMISSIONS.RECRUITMENT_CREATE,
            }}
          />
          <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> Add Candidate
            </button>
          </Can>
        </div>
      </div>

      <ContextualHelp title="Recruiter focus">
        Start with candidates that have no application, then open a candidate workspace to attach them to a vacancy, communicate, and move them through the pipeline.
      </ContextualHelp>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All sources</option>
          <option value="career_portal">Career Portal</option>
          <option value="employee_referral">Employee Referral</option>
          <option value="walk_in">Walk-in</option>
          <option value="agency">Agency</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <QuickFilterButton active={quickFilter === 'all'} label="All" count={candidates.length} onClick={() => setQuickFilter('all')} />
        <QuickFilterButton active={quickFilter === 'new'} label="New this week" count={candidates.filter((candidate) => new Date(candidate.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length} onClick={() => setQuickFilter('new')} title="Candidates created in the last 7 days" />
        <QuickFilterButton active={quickFilter === 'unassigned'} label="Needs application" count={candidates.filter((candidate) => !candidate.application_count).length} onClick={() => setQuickFilter('unassigned')} title="Candidates not attached to a vacancy yet" />
        <QuickFilterButton active={quickFilter === 'experienced'} label="3+ yrs experience" count={candidates.filter((candidate) => Number(candidate.experience_years || 0) >= 3).length} onClick={() => setQuickFilter('experienced')} />
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <button onClick={bulkTag} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            <Tags className="h-3.5 w-3.5" /> Add Tag
          </button>
        </Can>
      </BulkActionBar>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : filteredCandidates.length === 0 ? (
        <GuidedEmptyState
          title="No candidates match this view"
          description="Clear filters or add a candidate. The next step is to attach each candidate to an open vacancy so they enter the ATS workflow."
          action={(
            <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Add Candidate
              </button>
            </Can>
          )}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><input type="checkbox" checked={filteredCandidates.length > 0 && filteredCandidates.every((candidate) => selected.has(candidate.id))} onChange={toggleVisible} /></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Company</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/candidates/${c.id}`)}>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                  </TableCell>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground">{c.current_company || '—'}</TableCell>
                  <TableCell>{c.experience_years ? `${c.experience_years} yrs` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{(c.source || '—').replace('_', ' ')}</TableCell>
                  <TableCell>{c.application_count ?? 0}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
                      <button onClick={() => setEditingCandidate(c)} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted" title="Edit Candidate">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ListPagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
