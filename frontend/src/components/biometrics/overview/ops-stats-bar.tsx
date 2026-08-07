'use client';

import {
  Activity, Server, Monitor, AlertTriangle,
  Zap, Clock, CheckCircle, Radio, Timer,
} from 'lucide-react';
import { OpStatCard } from '@/components/biometrics/ui/op-stat-card';
import { useBiometricsStore } from '@/store/biometrics.store';
import { useQueueHealth } from '@/hooks/use-queue-health';
import { useDeviceStats } from '@/hooks/use-devices';
import { useTerminalStats } from '@/hooks/use-terminals';

function fmtNumber(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function OpsStatsBar() {
  const { punchesToday, punchesPerMinute, wsConnected } = useBiometricsStore();
  const { queueHealth } = useQueueHealth();
  const { stats: deviceStats } = useDeviceStats();
  const { stats: terminalStats } = useTerminalStats();

  const failed = queueHealth?.failed ?? 0;
  const dlq = queueHealth?.dlqCount ?? failed;
  const depth = queueHealth?.depth ?? 0;
  const workers = queueHealth?.workers ?? 0;
  const onlineDevices = deviceStats?.online ?? 0;
  const totalDevices = deviceStats?.total ?? 0;
  const onlineTerminals = terminalStats?.online ?? 0;
  const totalTerminals = terminalStats?.total ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
      <OpStatCard
        title="Punches Today"
        value={fmtNumber(punchesToday)}
        icon={Activity}
        variant={punchesToday > 0 ? 'ok' : 'default'}
        live={wsConnected}
        sub="since midnight"
      />
      <OpStatCard
        title="Punches / Min"
        value={punchesPerMinute}
        icon={Zap}
        variant={punchesPerMinute > 0 ? 'blue' : 'default'}
        live={wsConnected}
        sub="realtime rate"
      />
      <OpStatCard
        title="Devices Online"
        value={`${onlineDevices}/${totalDevices}`}
        icon={Server}
        variant={
          totalDevices === 0 ? 'default'
          : onlineDevices === 0 ? 'danger'
          : onlineDevices < totalDevices ? 'warn'
          : 'ok'
        }
        sub="biometric hardware"
      />
      <OpStatCard
        title="Terminals"
        value={`${onlineTerminals}/${totalTerminals}`}
        icon={Monitor}
        variant={
          totalTerminals === 0 ? 'default'
          : onlineTerminals === 0 ? 'danger'
          : onlineTerminals < totalTerminals ? 'warn'
          : 'ok'
        }
        sub="mobile / laptop / kiosk"
      />
      <OpStatCard
        title="Queue Lag"
        value={depth}
        icon={Clock}
        variant={depth > 5000 ? 'danger' : depth > 1000 ? 'warn' : 'ok'}
        sub="jobs waiting"
      />
      <OpStatCard
        title="Failed Jobs"
        value={failed}
        icon={AlertTriangle}
        variant={failed > 0 ? 'danger' : 'ok'}
        sub="need attention"
      />
      <OpStatCard
        title="DLQ Count"
        value={dlq}
        icon={AlertTriangle}
        variant={dlq > 0 ? 'danger' : 'ok'}
        sub="dead-letter queue"
      />
      <OpStatCard
        title="Workers"
        value={workers}
        icon={Radio}
        variant={workers === 0 ? 'danger' : 'ok'}
        sub="active processors"
      />
      <OpStatCard
        title="Connection"
        value={wsConnected ? 'Live' : 'Offline'}
        icon={CheckCircle}
        variant={wsConnected ? 'ok' : 'danger'}
        live={wsConnected}
        sub="WebSocket status"
      />
    </div>
  );
}
