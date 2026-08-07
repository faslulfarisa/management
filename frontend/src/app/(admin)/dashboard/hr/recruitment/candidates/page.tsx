'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';
import { candidatesApi, Candidate } from '@/lib/candidates-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CandidateDrawer } from '@/components/recruitment/candidate-drawer';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

export default function CandidatesPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

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

  useEffect(() => { setPage(1); }, [q, source]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showCreate && <CandidateDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Candidates</h2>
          <p className="text-sm text-muted-foreground">Profiles sourced from the Career Portal, referrals, and walk-ins</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 ml-auto">
            <Plus className="w-3.5 h-3.5" /> Add Candidate
          </button>
        </Can>
      </div>

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

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : candidates.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No candidates yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Company</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Applications</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/candidates/${c.id}`)}>
                  <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground">{c.current_company || '—'}</TableCell>
                  <TableCell>{c.experience_years ? `${c.experience_years} yrs` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{(c.source || '—').replace('_', ' ')}</TableCell>
                  <TableCell>{c.application_count ?? 0}</TableCell>
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
