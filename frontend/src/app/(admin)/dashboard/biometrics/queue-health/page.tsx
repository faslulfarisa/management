'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { QueueStatsGrid } from '@/components/biometrics/queue-health/queue-stats-grid';
import { WorkerStatusList } from '@/components/biometrics/queue-health/worker-status-list';

export default function QueueHealthPage() {
  useBiometricsSocket();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Queue Health</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          BullMQ ingestion pipeline — depth, workers, failed jobs, and sync lag
        </p>
      </div>
      <QueueStatsGrid />
      <WorkerStatusList />
    </div>
  );
}
