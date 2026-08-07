'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { ProviderHealthGrid } from '@/components/biometrics/providers/provider-health-grid';
import { useQueueHealth } from '@/hooks/use-queue-health';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { GitBranch, Cpu, Timer, CheckCircle } from 'lucide-react';

export default function ProvidersPage() {
  useBiometricsSocket();
  const { queueHealth } = useQueueHealth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Provider Health</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          EasyTimePro, ZKTeco, and trusted terminal provider diagnostics
        </p>
      </div>

      {/* Pipeline health overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <OpStatCard
          title="Queue Workers"
          value={queueHealth?.workers ?? '—'}
          icon={Cpu}
          variant={(queueHealth?.workers ?? 0) > 0 ? 'ok' : 'danger'}
          live
        />
        <OpStatCard
          title="Queue Depth"
          value={queueHealth?.depth ?? '—'}
          icon={GitBranch}
          variant={(queueHealth?.depth ?? 0) > 1000 ? 'warn' : 'ok'}
        />
        <OpStatCard
          title="Sync Lag"
          value={queueHealth?.syncLag != null ? `${queueHealth.syncLag}s` : '—'}
          icon={Timer}
          variant={(queueHealth?.syncLag ?? 0) > 300 ? 'danger' : 'ok'}
        />
        <OpStatCard
          title="Active Jobs"
          value={queueHealth?.active ?? '—'}
          icon={CheckCircle}
          variant={(queueHealth?.active ?? 0) > 0 ? 'blue' : 'default'}
        />
      </div>

      {/* Provider cards */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Registered Providers
        </h3>
        <ProviderHealthGrid />
      </section>
    </div>
  );
}
