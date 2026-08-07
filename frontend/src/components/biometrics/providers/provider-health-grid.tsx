'use client';

import { useProviderList, useProviderHealth } from '@/hooks/use-providers';
import { StatusBadge } from '@/components/biometrics/ui/status-badge';
import { cn } from '@/lib/utils';
import { RefreshCw, Zap, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { ProviderHealthResult } from '@/types/biometrics';

const PROVIDER_META: Record<string, { label: string; icon: string; description: string }> = {
  easytimepro: {
    label: 'EasyTimePro',
    icon: '🕐',
    description: 'Polling sync provider — scheduled cursor-based attendance pull',
  },
  zkteco: {
    label: 'ZKTeco',
    icon: '🔐',
    description: 'Push provider — devices call the endpoint directly',
  },
  terminal: {
    label: 'Terminals',
    icon: '📟',
    description: 'Trusted laptop / mobile / kiosk punch endpoints',
  },
};

function HealthCard({ name }: { name: string }) {
  const { data: health, isLoading, refetch, isFetching } = useProviderHealth(name);
  const meta = PROVIDER_META[name] ?? { label: name, icon: '🔌', description: '' };

  const status = health?.healthy ? 'online' : health ? 'offline' : 'idle';
  const latency = health?.latencyMs;
  const lastSync = health?.lastSyncAt
    ? formatDistanceToNowStrict(new Date(health.lastSyncAt), { addSuffix: true })
    : null;

  return (
    <div className={cn('ops-panel p-5 space-y-4', health?.healthy ? 'glow-emerald' : health ? 'glow-red' : '')}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            label={health?.healthy ? 'Healthy' : health ? 'Offline' : 'Unknown'}
            status={status}
          />
          <button
            onClick={() => refetch()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh health check"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-slate-200 rounded w-2/3" />
          <div className="h-3 bg-slate-200 rounded w-1/2" />
        </div>
      ) : health ? (
        <div className="grid grid-cols-2 gap-3">
          {latency !== undefined && (
            <div className="ops-surface px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] text-slate-500">Latency</span>
              </div>
              <p className={cn(
                'text-lg font-bold tabular-nums',
                latency < 200 ? 'text-emerald-600' : latency < 1000 ? 'text-amber-600' : 'text-red-600',
              )}>
                {latency}ms
              </p>
            </div>
          )}

          {lastSync && (
            <div className="ops-surface px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-500">Last Sync</span>
              </div>
              <p className="text-xs text-slate-700">{lastSync}</p>
            </div>
          )}

          {health.error && (
            <div className="col-span-2 ops-surface px-3 py-2.5 border border-red-200">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-3 h-3 text-red-600" />
                <span className="text-[10px] text-red-600">Error</span>
              </div>
              <p className="text-xs text-slate-600">{health.error}</p>
            </div>
          )}

          {/* Details dump */}
          {health.details && Object.keys(health.details).length > 0 && (
            <div className="col-span-2 space-y-1">
              {Object.entries(health.details).slice(0, 4).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-slate-700 font-mono">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <AlertCircle className="w-3.5 h-3.5" />
          No health data available
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px]">
        {health?.healthy ? (
          <CheckCircle className="w-3 h-3 text-emerald-500" />
        ) : (
          <XCircle className="w-3 h-3 text-red-500" />
        )}
        <span className="text-slate-500">
          {health?.healthy ? 'All systems operational' : 'Provider unreachable or degraded'}
        </span>
      </div>
    </div>
  );
}

export function ProviderHealthGrid() {
  const { data: providers, isLoading } = useProviderList();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="ops-panel p-5 animate-pulse h-48" />
        ))}
      </div>
    );
  }

  const names = providers?.map((p) => p.name) ?? [];
  if (names.length === 0) {
    return (
      <div className="ops-panel flex items-center justify-center py-16">
        <p className="text-sm text-slate-500">No providers registered</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {names.map((name) => (
        <HealthCard key={name} name={name} />
      ))}
    </div>
  );
}
