'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { campaignsApi, Campaign } from '@/lib/campaigns-api';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CampaignDrawer } from '@/components/recruitment/campaign-drawer';
import { ListPagination } from '@/components/ui/list-pagination';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [campaignType, setCampaignType] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.list({ q: q || undefined, status: status || undefined, campaign_type: campaignType || undefined, page, limit: PAGE_SIZE });
      setCampaigns(res.data);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, [q, status, campaignType, page]);

  useEffect(() => { setPage(1); }, [q, status, campaignType]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {showCreate && <CampaignDrawer onClose={() => setShowCreate(false)} onSaved={fetchData} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Recruitment Campaigns</h2>
          <p className="text-sm text-muted-foreground">Source/referral/agency/campus/internship initiatives with cost &amp; conversion tracking</p>
        </div>
        <Can permission={PERMISSIONS.RECRUITMENT_CREATE}>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </button>
        </Can>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" className="border border-border rounded-xl px-3 py-2 text-sm flex-1 min-w-[180px]" />
        <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All types</option>
          {['employee_referral', 'agency', 'walk_in', 'campus', 'internship', 'job_board', 'social_media', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm capitalize">
          <option value="">All statuses</option>
          {['planned', 'active', 'paused', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : campaigns.length === 0 ? (
        <Card><div className="p-10 text-center text-muted-foreground text-sm">No campaigns yet.</div></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Hired</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/dashboard/hr/recruitment/campaigns/${c.id}`)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{c.campaign_type.replace('_', ' ')}</TableCell>
                  <TableCell>{c.application_count ?? 0}</TableCell>
                  <TableCell>{c.hired_count ?? 0}</TableCell>
                  <TableCell>{c.budget_amount?.toLocaleString() ?? '—'}</TableCell>
                  <TableCell>{c.actual_spend?.toLocaleString() ?? 0}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[c.status] || 'bg-gray-100'}`}>{c.status}</span>
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
