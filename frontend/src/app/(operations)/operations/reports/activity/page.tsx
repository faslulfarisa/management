'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { getOpsActivityLog, type OpsActivityEntry } from '@/lib/operations-api';

export default function ActivityLogsPage() {
  const [entries, setEntries] = useState<OpsActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOpsActivityLog({ limit: 50 })
      .then(({ data }) => setEntries(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity Logs</h1>
        <p className="text-muted-foreground">Recent organization management activity across all organizations</p>
      </div>

      <div className="ops-panel p-5">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && entries.length === 0 && <p className="text-sm text-slate-400">No recorded activity yet.</p>}
        {!loading && entries.length > 0 && (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full ops-accent-bg mt-1.5 shrink-0" />
                <div>
                  <p className="text-slate-700 font-medium">
                    <span className="capitalize">{entry.action.replace(/_/g, ' ')}</span>
                    {entry.organization_name && <span className="text-slate-400"> · {entry.organization_name}</span>}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <History className="w-3 h-3" /> {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
