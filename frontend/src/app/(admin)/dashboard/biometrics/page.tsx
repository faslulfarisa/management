'use client';

import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { OpsStatsBar } from '@/components/biometrics/overview/ops-stats-bar';
import { RecentPunchStrip } from '@/components/biometrics/overview/recent-punch-strip';
import { DeviceHealthStrip } from '@/components/biometrics/overview/device-health-strip';
import { useBiometricsStore } from '@/store/biometrics.store';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Bell, X } from 'lucide-react';
import type { BiometricsAlert } from '@/types/biometrics';

function AlertToast({ alert, onDismiss }: { alert: BiometricsAlert; onDismiss: () => void }) {
  const levelClass =
    alert.level === 'error' ? 'border-red-200 bg-red-50'
    : alert.level === 'warn' ? 'border-amber-200 bg-amber-50'
    : 'border-blue-200 bg-blue-50';
  const dotClass =
    alert.level === 'error' ? 'bg-red-500'
    : alert.level === 'warn' ? 'bg-amber-500'
    : 'bg-blue-500';

  return (
    <div className={cn('ops-panel border p-3 flex items-start gap-3', levelClass)}>
      <span className={cn('w-2 h-2 rounded-full mt-1 shrink-0 animate-live', dotClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800">{alert.title}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{alert.message}</p>
      </div>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function BiometricsOverviewPage() {
  useBiometricsSocket();
  const { wsConnected, alerts, dismissAlert } = useBiometricsStore();

  return (
    <div className="space-y-6">
      {/* Connection banner */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border transition-colors',
          wsConnected
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700',
        )}
      >
        {wsConnected ? (
          <>
            <Wifi className="w-3.5 h-3.5" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-live" />
            WebSocket connected — realtime events active
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5" />
            WebSocket disconnected — polling fallback active
          </>
        )}
      </div>

      {/* Operational alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Bell className="w-3.5 h-3.5" />
            <span>{alerts.length} operational alert{alerts.length !== 1 ? 's' : ''}</span>
          </div>
          {alerts.slice(0, 3).map((a) => (
            <AlertToast key={a.id} alert={a} onDismiss={() => dismissAlert(a.id)} />
          ))}
        </div>
      )}

      {/* 9-stat top bar */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Operational Metrics
        </h2>
        <OpsStatsBar />
      </section>

      {/* Main content: punch feed + device health */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Live Punch Stream
          </h2>
          <RecentPunchStrip />
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Device Health
          </h2>
          <DeviceHealthStrip />
        </div>
      </div>
    </div>
  );
}
