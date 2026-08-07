'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { DlqTable } from '@/components/biometrics/dlq/dlq-table';
import { useQueueHealth } from '@/hooks/use-queue-health';

export default function DlqPage() {
  useBiometricsSocket();
  const { queueHealth } = useQueueHealth();
  const failedCount = queueHealth?.failed ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Dead Letter Queue</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Punches that still need retry, review, or safe removal from processing
          </p>
        </div>
        {failedCount > 0 && (
          <span className="badge-offline px-3 py-1 rounded-full text-xs font-bold tabular-nums">
            {failedCount} need review
          </span>
        )}
      </div>
      <DlqTable />
    </div>
  );
}
