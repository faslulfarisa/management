'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search } from 'lucide-react';
import { offersApi, Offer } from '@/lib/offers-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { OfferDrawer } from '@/components/recruitment/offer-drawer';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  sent: 'bg-violet-50 text-violet-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-600',
};

export default function OffersPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await offersApi.list({ q: q || undefined, status: status || undefined, page, limit: PAGE_SIZE });
      setOffers(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, [q, status, page]);

  useEffect(() => { setPage(1); }, [q, status]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showCreate && <OfferDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Offer Management</h2>
          <p className="text-sm text-muted-foreground">Compensation, approval workflow, and acceptance tracking</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New Offer
          </button>
        </Can>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by candidate or job title…"
            className="w-full border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'declined', 'withdrawn', 'expired'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : offers.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No offers yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>CTC</TableHead>
                <TableHead>Joining Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/offers/${o.id}`)}>
                  <TableCell className="font-medium">{o.first_name} {o.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.designation || o.job_title || '—'}</TableCell>
                  <TableCell>{o.ctc ? `${o.currency} ${o.ctc}` : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{o.joining_date ? new Date(o.joining_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[o.status] || 'bg-gray-100'}`}>{o.status.replace('_', ' ')}</span>
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
