'use client';

import { useQueueHealth } from '@/hooks/use-queue-health';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { GitBranch, Cpu, AlertTriangle, Radio, Timer, CheckCircle } from 'lucide-react';

export function QueueStatsGrid() {
  const { queueHealth: h, loading } = useQueueHealth();

  const depth   = h?.depth   ?? 0;
  const active  = h?.active  ?? 0;
  const failed  = h?.failed  ?? 0;
  const workers = h?.workers ?? 0;

  if (loading && !h) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="ops-panel h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <OpStatCard
        title="Queue Depth"
        value={depth}
        sub="waiting + delayed"
        icon={GitBranch}
        variant={depth > 5000 ? 'danger' : depth > 1000 ? 'warn' : 'ok'}
      />
      <OpStatCard
        title="Active Jobs"
        value={active}
        sub="being processed"
        icon={Cpu}
        variant={active > 0 ? 'blue' : 'default'}
        live={active > 0}
      />
      <OpStatCard
        title="Failed (DLQ)"
        value={failed}
        sub="need attention"
        icon={AlertTriangle}
        variant={failed > 0 ? 'danger' : 'ok'}
      />
      <OpStatCard
        title="Workers"
        value={workers}
        sub="active processors"
        icon={Radio}
        variant={workers > 0 ? 'ok' : 'danger'}
        live={workers > 0}
      />
      <OpStatCard
        title="Sync Lag"
        value={h?.syncLag != null ? `${h.syncLag}s` : '—'}
        sub="event processing delay"
        icon={Timer}
        variant={(h?.syncLag ?? 0) > 60 ? 'danger' : (h?.syncLag ?? 0) > 10 ? 'warn' : 'ok'}
      />
      <OpStatCard
        title="System"
        value={workers > 0 && failed === 0 ? 'Healthy' : failed > 0 ? 'Degraded' : 'No workers'}
        sub="overall queue status"
        icon={CheckCircle}
        variant={workers > 0 && failed === 0 ? 'ok' : 'danger'}
      />
    </div>
  );
}
