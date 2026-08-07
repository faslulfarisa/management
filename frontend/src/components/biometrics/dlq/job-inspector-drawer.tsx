'use client';

import { Button } from '@/components/ui/button';

interface Job {
  id: string;
  provider: string;
  tenant: string;
  punchCount: number;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface Props {
  job: Job;
  onClose: () => void;
}

export function JobInspectorDrawer({ job, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="flex w-full max-w-xl flex-col overflow-hidden bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="font-semibold text-gray-900">Punch Processing Review</h3>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</h4>
            <Row label="Provider" value={job.provider} />
            <Row label="Punch count" value={String(job.punchCount)} />
            <Row label="Attempts" value={String(job.attemptsMade)} />
            <Row label="Failed at" value={new Date(job.timestamp).toLocaleString()} />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Failure Reason</h4>
            <p className="break-words rounded-md bg-red-50 p-3 text-xs text-red-800">
              {job.failedReason}
            </p>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recommended Action</h4>
            <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
              Retry this punch after checking employee mapping, device connectivity, and sync status. If it fails again, share the failure reason with support.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className="break-all text-gray-900">{value}</span>
    </div>
  );
}
