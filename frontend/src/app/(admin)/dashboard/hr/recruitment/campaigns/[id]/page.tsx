'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { campaignsApi, Campaign, CampaignStats } from '@/lib/campaigns-api';
import { Card, CardContent } from '@/components/ui/card';
import { Can } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/permissions';
import { CampaignDrawer } from '@/components/recruitment/campaign-drawer';

const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  completed: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const load = () => {
    Promise.all([campaignsApi.get(id), campaignsApi.stats(id)])
      .then(([c, s]) => { setCampaign(c); setStats(s); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  if (loading || !campaign) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {showEdit && <CampaignDrawer campaign={campaign} onClose={() => setShowEdit(false)} onSaved={load} />}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push('/dashboard/hr/recruitment/campaigns')} className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[campaign.status] || 'bg-gray-100'}`}>{campaign.status}</span>
            </div>
            <p className="text-sm text-muted-foreground capitalize">{campaign.campaign_type.replace('_', ' ')}</p>
          </div>
        </div>

        <Can permission={PERMISSIONS.RECRUITMENT_EDIT}>
          <button onClick={() => setShowEdit(true)} className="flex items-center gap-1.5 border border-border rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </Can>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total Applications" value={stats?.total_applications ?? 0} />
        <StatBox label="Hired" value={stats?.hired ?? 0} />
        <StatBox label="Conversion Rate" value={`${stats?.conversion_rate ?? 0}%`} />
        <StatBox label="Cost per Hire" value={stats?.cost_per_hire != null ? stats.cost_per_hire.toLocaleString() : '—'} />
      </div>

      <Card>
        <CardContent className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><p className="text-xs text-muted-foreground">Start Date</p><p className="text-sm font-medium">{campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">End Date</p><p className="text-sm font-medium">{campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Budget</p><p className="text-sm font-medium">{campaign.budget_amount?.toLocaleString() ?? '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Actual Spend</p><p className="text-sm font-medium">{campaign.actual_spend?.toLocaleString() ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Target Vacancies</p><p className="text-sm font-medium">{campaign.vacancy_ids?.length ?? 0}</p></div>
          {campaign.description && <div className="col-span-full"><p className="text-xs text-muted-foreground">Description</p><p className="text-sm font-medium">{campaign.description}</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}
