'use client';

import { Button } from '@/components/ui/button';

interface Job {
  id: string;
  provider: string;
  tenant: string;
  punchCount: number;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: string;
  data: Record<string, unknown>;
}

interface Props {
  job: Job;
  onClose: () => void;
}

export function JobInspectorDrawer({ job, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Job Inspector</h3>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</h4>
            <Row label="Job ID" value={String(job.id)} mono />
            <Row label="Provider" value={job.provider} />
            <Row label="Tenant" value={job.tenant} mono />
            <Row label="Punch count" value={String(job.punchCount)} />
            <Row label="Attempts" value={String(job.attemptsMade)} />
            <Row label="Failed at" value={new Date(job.timestamp).toLocaleString()} />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Error</h4>
            <p className="font-mono text-xs bg-red-50 text-red-800 rounded-md p-3 break-words">
              {job.failedReason}
            </p>
          </section>

          {job.stacktrace?.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Stack trace</h4>
              <pre className="font-mono text-xs bg-gray-900 text-gray-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                {job.stacktrace.join('\n')}
              </pre>
            </section>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Payload</h4>
            <pre className="font-mono text-xs bg-gray-50 text-gray-800 rounded-md p-3 overflow-x-auto whitespace-pre-wrap border border-gray-200">
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 text-gray-500 shrink-0">{label}</span>
      <span className={`text-gray-900 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
