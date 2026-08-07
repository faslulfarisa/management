'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';
import { jobDescriptionsApi, JobDescription } from '@/lib/job-descriptions-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { JobDescriptionDrawer } from '@/components/recruitment/job-description-drawer';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
};

export default function JobDescriptionsPage() {
  const router = useRouter();
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobDescriptionsApi.list({ q: q || undefined, status: status || undefined, page, limit: PAGE_SIZE });
      setJds(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => { setPage(1); }, [q, status]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showCreate && <JobDescriptionDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Job Descriptions</h2>
          <p className="text-sm text-muted-foreground">JD library, templates, and publishing to the Career Portal</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90 ml-auto">
            <Plus className="w-3.5 h-3.5" /> New Job Description
          </button>
        </Can>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : jds.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No job descriptions yet — create one from an open vacancy.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Linked Vacancy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Template</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jds.map((jd) => (
                <TableRow key={jd.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/job-descriptions/${jd.id}`)}>
                  <TableCell className="font-medium">{jd.title}</TableCell>
                  <TableCell className="text-muted-foreground">{jd.vacancy_title || '—'}</TableCell>
                  <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[jd.status] || 'bg-gray-100'}`}>{jd.status.replace('_', ' ')}</span></TableCell>
                  <TableCell className="text-muted-foreground">v{jd.current_version}</TableCell>
                  <TableCell className="text-muted-foreground">{jd.is_template ? jd.template_name || 'Yes' : '—'}</TableCell>
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
