'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueApi } from '@/lib/biometrics-api';
import { StatusBadge } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import {
  RefreshCw, RotateCcw, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, CheckSquare, Square, Code,
} from 'lucide-react';
import { format } from 'date-fns';
import type { DlqJob } from '@/types/biometrics';

const LIMIT = 25;

function StacktraceDrawer({ job, onClose }: { job: DlqJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="ops-panel w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div>
            <p className="text-sm font-semibold text-slate-800">Job #{job.id}</p>
            <p className="text-xs text-slate-500 mt-0.5">{job.provider} · {job.punchCount} punches · {job.attemptsMade} attempts</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors text-xs px-2 py-1 ops-surface rounded">
            Close
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Failure Reason</p>
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {job.failedReason}
            </p>
          </div>

          {job.stacktrace && job.stacktrace.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Stack Trace</p>
              <pre className="text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto leading-relaxed">
                {job.stacktrace.join('\n')}
              </pre>
            </div>
          )}

          {job.data && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Job Payload</p>
              <pre className="text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto leading-relaxed max-h-48">
                {JSON.stringify(job.data, null, 2)}
              </pre>
            </div>
          )}
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
        'grid items-center gap-3 px-4 py-3 border-b border-slate-100 text-xs',
        'hover:bg-slate-50 transition-colors group',
        selected && 'bg-blue-50',
      )}
      style={{ gridTemplateColumns: '32px 1.5fr 80px 60px 60px 130px 120px' }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded border-slate-300 bg-white accent-blue-500 cursor-pointer"
      />

      <div className="min-w-0">
        <p className="font-mono text-[10px] text-slate-400 truncate">#{job.id}</p>
        <p className="text-slate-700 font-medium truncate">{job.provider}</p>
        <p className="text-slate-500 text-[10px] truncate mt-0.5">{job.failedReason}</p>
      </div>

      <StatusBadge label={job.provider} status="offline" dot={false} />

      <span className="text-slate-600 tabular-nums">{job.punchCount}</span>

      <span className={cn(
        'tabular-nums font-semibold',
        job.attemptsMade >= 3 ? 'text-red-600' : 'text-amber-600',
      )}>
        {job.attemptsMade}/3
      </span>

      <span className="text-slate-400 text-[10px] tabular-nums">
        {format(new Date(job.timestamp), 'MMM d HH:mm:ss')}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onInspect(job)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Code className="w-3 h-3" /> Inspect
        </button>
        <button
          onClick={() => onRetry(job.id)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Retry
        </button>
        <button
          onClick={() => onDiscard(job.id)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Discard
        </button>
      </div>
    </div>
  );
}

const HEADERS = ['', 'Job / Provider', 'Provider', 'Punches', 'Attempts', 'Failed At', 'Actions'];
const GRID = '32px 1.5fr 80px 60px 60px 130px 120px';

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
    if (!confirm('Permanently discard this job? This cannot be undone.')) return;
    await discardMut.mutateAsync(id);
  };

  return (
    <>
      {inspecting && <StacktraceDrawer job={inspecting} onClose={() => setInspecting(null)} />}

      <div className="space-y-3">
        {/* Toolbar */}
        <div className="ops-panel p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold text-slate-700 tabular-nums">
              {total} failed job{total !== 1 ? 's' : ''}
            </span>
          </div>

          {selected.size > 0 && (
            <button
              onClick={() => bulkRetryMut.mutate([...selected])}
              disabled={bulkRetryMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={cn('w-3 h-3', bulkRetryMut.isPending && 'animate-spin')} />
              Retry {selected.size} selected
            </button>
          )}

          {total > 0 && (
            <button
              onClick={() => { if (confirm(`Retry all ${total} failed jobs?`)) retryAllMut.mutate(); }}
              disabled={retryAllMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 border border-amber-200 rounded hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={cn('w-3 h-3', retryAllMut.isPending && 'animate-spin')} />
              Retry all
            </button>
          )}

          <button
            onClick={() => refetch()}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="ops-panel overflow-hidden">
          <div
            className="sticky top-0 z-20 grid items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white text-[10px] font-semibold uppercase tracking-widest text-slate-500 shadow-[0_1px_2px_-1px_rgb(0_0_0_/_0.08)]"
            style={{ gridTemplateColumns: GRID }}
          >
            <button onClick={toggleAll} className="text-slate-500 hover:text-slate-700">
              {selected.size === jobs.length && jobs.length > 0
                ? <CheckSquare className="w-3.5 h-3.5" />
                : <Square className="w-3.5 h-3.5" />}
            </button>
            {HEADERS.slice(1).map((h, i) => <span key={i}>{h}</span>)}
          </div>

          {isLoading ? (
            <div className="space-y-px">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
                  <div className="w-3.5 h-3.5 bg-slate-200 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-slate-200 rounded w-1/4" />
                    <div className="h-2 bg-slate-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm text-slate-600">No failed jobs</p>
              <p className="text-xs text-slate-400">Queue is healthy</p>
            </div>
          ) : (
            jobs.map((job) => (
              <DlqRow
                key={job.id}
                job={job}
                selected={selected.has(job.id)}
                onToggle={() => setSelected((s) => {
                  const n = new Set(s);
                  n.has(job.id) ? n.delete(job.id) : n.add(job.id);
                  return n;
                })}
                onRetry={(id) => retryMut.mutate(id)}
                onDiscard={handleDiscard}
                onInspect={setInspecting}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="px-3 py-1 ops-surface rounded disabled:opacity-30 hover:text-slate-700 transition-colors"
              >
                Prev
              </button>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                className="px-3 py-1 ops-surface rounded disabled:opacity-30 hover:text-slate-700 transition-colors"
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
