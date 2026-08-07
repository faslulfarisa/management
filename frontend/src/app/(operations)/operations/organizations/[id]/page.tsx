'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Mail, Phone, Tag } from 'lucide-react';
import {
  ORG_LIFECYCLE_LABELS, ORG_LIFECYCLE_BADGE_CLASSES, type OrgLifecycleStage,
} from '@/lib/organization-lifecycle';
import { getOpsOrganization, getOpsOrganizationActivity, type OpsOrganization } from '@/lib/operations-api';
import { Button } from '@/components/ui/button';

const VISIBLE_STAGES: OrgLifecycleStage[] = ['pending_review', 'pending_approval', 'onboarding', 'active'];

function LifecycleStepper({ current }: { current: OrgLifecycleStage }) {
  if (current === 'suspended' || current === 'archived') {
    return (
      <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border ${ORG_LIFECYCLE_BADGE_CLASSES[current]}`}>
        {ORG_LIFECYCLE_LABELS[current]}
      </span>
    );
  }

  const currentIdx = VISIBLE_STAGES.indexOf(current);

  return (
    <div className="flex items-center overflow-x-auto">
      {VISIBLE_STAGES.map((stage, idx) => {
        const reached = idx <= currentIdx;
        return (
          <div key={stage} className="flex items-center shrink-0">
            <div className={`flex flex-col items-center gap-1 ${idx > 0 ? 'ml-2' : ''}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${reached ? 'ops-accent-bg' : 'bg-slate-200'}`} />
              <span className={`text-[10px] font-medium whitespace-nowrap ${reached ? 'text-slate-700' : 'text-slate-400'}`}>
                {ORG_LIFECYCLE_LABELS[stage]}
              </span>
            </div>
            {idx < VISIBLE_STAGES.length - 1 && (
              <div className={`w-8 h-px mt-[-14px] ${idx < currentIdx ? 'bg-violet-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OperationsOrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [org, setOrg] = useState<OpsOrganization | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([getOpsOrganization(id), getOpsOrganizationActivity(id, { limit: 30 })])
      .then(([orgData, activityData]) => {
        setOrg(orgData);
        setActivity(activityData.data || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading…</div>;
  }

  if (!org) {
    return <div className="text-center py-20 text-slate-400">Organization not found.</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/operations/organizations')} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Organizations
      </Button>

      <div className="ops-panel p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{org.name}</h1>
              <p className="text-sm text-slate-400">{org.slug}</p>
            </div>
          </div>
          <LifecycleStepper current={org.lifecycle_stage} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail className="w-4 h-4 text-slate-400" /> {org.primary_email || '—'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Phone className="w-4 h-4 text-slate-400" /> {org.phone_number || '—'}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Tag className="w-4 h-4 text-slate-400" /> {org.industry || '—'}
          </div>
        </div>
      </div>

      <div className="ops-panel p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Activity</h2>
        {activity.length === 0 && <p className="text-sm text-slate-400">No recorded activity yet.</p>}
        <ul className="space-y-3">
          {activity.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 text-sm">
              <div className="w-1.5 h-1.5 rounded-full ops-accent-bg mt-1.5 shrink-0" />
              <div>
                <p className="text-slate-700 font-medium capitalize">{entry.action.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
