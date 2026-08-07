'use client';

import { useBiometricsStore } from '@/store/biometrics.store';
import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LiveIndicator() {
  const wsConnected = useBiometricsStore((s) => s.wsConnected);
  const punchesPerMinute = useBiometricsStore((s) => s.punchesPerMinute);

  return (
    <div className="flex items-center gap-3">
      {wsConnected && punchesPerMinute > 0 && (
        <span className="text-xs text-slate-500 tabular-nums">
          <span className="text-emerald-600 font-semibold">{punchesPerMinute}</span> /min
        </span>
      )}
      <div
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
          wsConnected
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-slate-100 text-slate-500 border border-slate-200',
        )}
      >
        {wsConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
            <Wifi className="w-3 h-3" />
            Live
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            Offline
          </>
        )}
      </div>
    </div>
  );
}
