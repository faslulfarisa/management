'use client';

import { Server, Wifi, WifiOff } from 'lucide-react';
import { useDeviceStats } from '@/hooks/use-devices';
import { cn } from '@/lib/utils';

const HARDWARE_ICONS: Record<string, string> = {
  fingerprint: '👆',
  face: '👤',
  card: '💳',
  hybrid: '🔀',
};

export function DeviceHealthStrip() {
  const { stats, loading } = useDeviceStats();

  if (loading && !stats) {
    return (
      <div className="ops-panel p-4 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-32 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const offlinePct = stats.total > 0 ? Math.round((stats.offline / stats.total) * 100) : 0;

  return (
    <div className="ops-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Device Health</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <Wifi className="w-3 h-3" /> {stats.online} online
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <WifiOff className="w-3 h-3" /> {stats.offline} offline
          </span>
        </div>
      </div>

      {/* Online bar */}
      <div>
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Availability</span>
          <span>{stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}%</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              offlinePct > 50 ? 'bg-red-500' : offlinePct > 20 ? 'bg-amber-500' : 'bg-emerald-500',
            )}
            style={{ width: `${stats.total > 0 ? (stats.online / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* By hardware type */}
      {stats.byHardwareType.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {stats.byHardwareType.slice(0, 4).map((ht) => (
            <div key={ht.hardwareType} className="ops-surface px-3 py-2 flex items-center gap-2">
              <span className="text-base">{HARDWARE_ICONS[ht.hardwareType] ?? '🖥️'}</span>
              <div>
                <p className="text-xs font-medium text-slate-700 capitalize">{ht.hardwareType}</p>
                <p className="text-[10px] text-slate-500">{ht.count} device{ht.count !== 1 ? 's' : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* By provider */}
      {stats.byProvider.length > 0 && (
        <div className="space-y-1.5">
          {stats.byProvider.map((pv) => (
            <div key={pv.provider} className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 capitalize w-24 truncate">{pv.provider}</span>
              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: pv.total > 0 ? `${(pv.online / pv.total) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-slate-500 tabular-nums w-16 text-right">
                {pv.online}/{pv.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
