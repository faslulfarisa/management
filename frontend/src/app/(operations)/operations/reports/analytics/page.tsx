'use client';

import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { ORG_LIFECYCLE_LABELS, ORG_LIFECYCLE_BADGE_CLASSES, ORG_LIFECYCLE_STAGES } from '@/lib/organization-lifecycle';
import { getOpsAnalytics, type OpsAnalytics } from '@/lib/operations-api';

export default function OrganizationAnalyticsPage() {
  const [analytics, setAnalytics] = useState<OpsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOpsAnalytics().then(setAnalytics).finally(() => setLoading(false));
  }, []);

  const maxStageCount = analytics ? Math.max(1, ...ORG_LIFECYCLE_STAGES.map((s) => analytics.byStage[s] ?? 0)) : 1;
  const maxMonthCount = analytics ? Math.max(1, ...analytics.monthlyRegistrations.map((m) => m.count)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization Analytics</h1>
        <p className="text-muted-foreground">Stage distribution and registration trend across all organizations</p>
      </div>

      <div className="ops-panel p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-violet-500" /> Organizations by Stage
        </h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && analytics && (
          <div className="space-y-3">
            {ORG_LIFECYCLE_STAGES.map((stage) => {
              const count = analytics.byStage[stage] ?? 0;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className={`w-32 shrink-0 inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${ORG_LIFECYCLE_BADGE_CLASSES[stage]}`}>
                    {ORG_LIFECYCLE_LABELS[stage]}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full ops-accent-bg rounded-full" style={{ width: `${(count / maxStageCount) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold text-slate-700">{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ops-panel p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">New Registrations (last 6 months)</h2>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && analytics?.monthlyRegistrations.length === 0 && (
          <p className="text-sm text-slate-400">No registrations in this period.</p>
        )}
        {!loading && analytics && analytics.monthlyRegistrations.length > 0 && (
          <div className="flex items-end gap-4 h-40">
            {analytics.monthlyRegistrations.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-xs font-semibold text-slate-700">{m.count}</span>
                <div className="w-full rounded-t-md ops-accent-bg" style={{ height: `${(m.count / maxMonthCount) * 100}%`, minHeight: m.count > 0 ? '4px' : 0 }} />
                <span className="text-[10px] text-slate-400">{m.month}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
