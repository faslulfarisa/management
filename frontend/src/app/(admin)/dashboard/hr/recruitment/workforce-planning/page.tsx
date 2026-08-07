'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { workforcePlansApi, WorkforcePlan } from '@/lib/workforce-plans-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { WorkforcePlanDrawer } from '@/components/recruitment/workforce-plan-drawer';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  active: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function WorkforcePlanningPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<WorkforcePlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workforcePlansApi.list({ status: status || undefined, year: year ? parseInt(year, 10) : undefined, page, limit: PAGE_SIZE });
      setPlans(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, [status, year, page]);

  useEffect(() => { setPage(1); }, [status, year]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showCreate && <WorkforcePlanDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Workforce Planning</h2>
          <p className="text-sm text-muted-foreground">Annual headcount &amp; budget planning across branch/department/position</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New Plan
          </button>
        </Can>
      </div>

      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {['draft', 'pending_approval', 'approved', 'rejected', 'active', 'closed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" type="number" className="w-28 border border-border rounded-xl px-3 py-2 text-sm" />
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : plans.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No workforce plans yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Planned Hires</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/workforce-planning/${p.id}`)}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-muted-foreground">{p.branch_name || 'Org-wide'}</TableCell>
                  <TableCell>{p.year}</TableCell>
                  <TableCell>{p.total_planned_hires ?? 0}</TableCell>
                  <TableCell>{p.total_budget_amount ? p.total_budget_amount.toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[p.status] || 'bg-gray-100'}`}>{p.status.replace('_', ' ')}</span>
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
