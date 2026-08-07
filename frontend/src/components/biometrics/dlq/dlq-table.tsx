'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { queueApi } from '@/lib/biometrics-api';
import { StatusBadge } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import type { DlqJob } from '@/types/biometrics';

const LIMIT = 25;
const GRID = '32px 1.5fr 80px 60px 60px 130px 120px';
const HEADERS = ['', 'Issue / Provider', 'Provider', 'Punches', 'Attempts', 'Failed At', 'Actions'];

function ExceptionDrawer({ job, onClose }: { job: DlqJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="ops-panel flex max-h-[80vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Punch Processing Review</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {job.provider} - {job.punchCount} punches - {job.attemptsMade} attempts
            </p>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-700">
            Close
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Failure Reason</p>
            <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {job.failedReason}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Recommended Action</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Retry this punch after checking employee mapping, device connectivity, and recent sync status. If it fails again, share the failure reason with support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DlqRow({
  job,
  selected,
  onToggle,
  onRetry,
  onDiscard,
  onInspect,
}: {
  job: DlqJob;
  selected: boolean;
  onToggle: () => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onInspect: (job: DlqJob) => void;
}) {
  return (
    <div
      className={cn(
        'group grid items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs transition-colors hover:bg-slate-50',
        selected && 'bg-blue-50',
      )}
      style={{ gridTemplateColumns: GRID }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 bg-white accent-blue-500"
      />

      <div className="min-w-0">
        <p className="truncate text-[10px] text-slate-400">#{job.id}</p>
        <p className="truncate font-medium text-slate-700">{job.provider}</p>
        <p className="mt-0.5 truncate text-[10px] text-slate-500">{job.failedReason}</p>
      </div>

      <StatusBadge label={job.provider} status="offline" dot={false} />
      <span className="tabular-nums text-slate-600">{job.punchCount}</span>
      <span className={cn('font-semibold tabular-nums', job.attemptsMade >= 3 ? 'text-red-600' : 'text-amber-600')}>
        {job.attemptsMade}/3
      </span>
      <span className="tabular-nums text-[10px] text-slate-400">
        {format(new Date(job.timestamp), 'MMM d HH:mm:ss')}
      </span>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onInspect(job)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-blue-600 transition-colors hover:bg-blue-50"
        >
          <Search className="h-3 w-3" /> Review
        </button>
        <button
          onClick={() => onRetry(job.id)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-emerald-600 transition-colors hover:bg-emerald-50"
        >
          <RotateCcw className="h-3 w-3" /> Retry
        </button>
        <button
          onClick={() => onDiscard(job.id)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" /> Discard
        </button>
      </div>
    </div>
  );
}

export function DlqTable() {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspecting, setInspecting] = useState<DlqJob | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['biometrics', 'dlq', offset],
    queryFn: () => queueApi.getDlq(offset, LIMIT),
    staleTime: 10_000,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => queueApi.retryJob(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biometrics', 'dlq'] }); },
  });

  const discardMut = useMutation({
    mutationFn: (id: string) => queueApi.discardJob(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biometrics', 'dlq'] }); },
  });

  const bulkRetryMut = useMutation({
    mutationFn: (ids: string[]) => queueApi.bulkRetry(ids),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['biometrics', 'dlq'] });
    },
  });

  const retryAllMut = useMutation({
    mutationFn: () => queueApi.retryAllFailed(),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['biometrics', 'dlq'] });
    },
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;

  const toggleAll = useCallback(() => {
    setSelected(selected.size === jobs.length && jobs.length > 0
      ? new Set()
      : new Set(jobs.map((j) => j.id)));
  }, [jobs, selected.size]);

  const handleDiscard = async (id: string) => {
    if (!confirm('Permanently remove this punch exception? This cannot be undone.')) return;
    await discardMut.mutateAsync(id);
  };

  return (
    <>
      {inspecting && <ExceptionDrawer job={inspecting} onClose={() => setInspecting(null)} />}

      <div className="space-y-3">
        <div className="ops-panel flex flex-wrap items-center gap-2 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs font-semibold tabular-nums text-slate-700">
              {total} punch exception{total !== 1 ? 's' : ''}
            </span>
          </div>

          {selected.size > 0 && (
            <button
              onClick={() => bulkRetryMut.mutate([...selected])}
              disabled={bulkRetryMut.isPending}
              className="flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              <RotateCcw className={cn('h-3 w-3', bulkRetryMut.isPending && 'animate-spin')} />
              Retry {selected.size} selected
            </button>
          )}

          {total > 0 && (
            <button
              onClick={() => { if (confirm(`Retry all ${total} punch exceptions?`)) retryAllMut.mutate(); }}
              disabled={retryAllMut.isPending}
              className="flex items-center gap-1.5 rounded border border-amber-200 px-3 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
            >
              <RotateCcw className={cn('h-3 w-3', retryAllMut.isPending && 'animate-spin')} />
              Retry all
            </button>
          )}

          <button onClick={() => refetch()} className="ml-auto flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-slate-700">
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="ops-panel overflow-hidden">
          <div
            className="sticky top-0 z-20 grid items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 shadow-[0_1px_2px_-1px_rgb(0_0_0_/_0.08)]"
            style={{ gridTemplateColumns: GRID }}
          >
            <button onClick={toggleAll} className="text-slate-500 hover:text-slate-700">
              {selected.size === jobs.length && jobs.length > 0
                ? <CheckSquare className="h-3.5 w-3.5" />
                : <Square className="h-3.5 w-3.5" />}
            </button>
            {HEADERS.slice(1).map((header) => <span key={header}>{header}</span>)}
          </div>

          {isLoading ? (
            <div className="space-y-px">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="h-3.5 w-3.5 rounded bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-1/4 rounded bg-slate-200" />
                    <div className="h-2 w-1/2 rounded bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <AlertTriangle className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-600">No punch exceptions</p>
              <p className="text-xs text-slate-400">Processing is clear</p>
            </div>
          ) : (
            jobs.map((job) => (
              <DlqRow
                key={job.id}
                job={job}
                selected={selected.has(job.id)}
                onToggle={() => setSelected((current) => {
                  const next = new Set(current);
                  next.has(job.id) ? next.delete(job.id) : next.add(job.id);
                  return next;
                })}
                onRetry={(id) => retryMut.mutate(id)}
                onDiscard={handleDiscard}
                onInspect={setInspecting}
              />
            ))
          )}
        </div>

        {total > LIMIT && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{offset + 1}-{Math.min(offset + LIMIT, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="ops-surface rounded px-3 py-1 transition-colors hover:text-slate-700 disabled:opacity-30"
              >
                Prev
              </button>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                className="ops-surface rounded px-3 py-1 transition-colors hover:text-slate-700 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
