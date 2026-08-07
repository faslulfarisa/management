'use client';

import { useQueueHealth } from '@/hooks/use-queue-health';
import { Radio, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function WorkerStatusList() {
  const { queueHealth: h, loading, refetch } = useQueueHealth();

  const workers = h?.workers ?? 0;
  const active  = h?.active  ?? 0;
  const lastUpdated = h?.timestamp ? format(new Date(h.timestamp), 'HH:mm:ss') : '—';

  return (
    <div className="ops-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Worker Pool</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-400">Updated {lastUpdated}</span>
          <button
            onClick={() => refetch()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Worker slot visualization */}
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: Math.max(workers, 8) }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-8 rounded flex items-center justify-center text-[10px] font-bold transition-colors',
              i < workers
                ? i < active
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-slate-100 text-slate-400 border border-slate-200',
            )}
            title={i < workers ? (i < active ? 'Processing' : 'Idle') : 'Offline'}
          >
            {i < workers ? (i < active ? '●' : '○') : '·'}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-6 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> {active} processing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> {Math.max(0, workers - active)} idle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" /> {Math.max(0, 8 - workers)} slots offline
        </span>
      </div>

      {workers === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-live" />
          <span className="text-xs text-red-700">No workers active — queue processing is stalled</span>
        </div>
      )}
    </div>
  );
}
