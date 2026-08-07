'use client';

import { useState, useEffect } from 'react';
import { useDeviceList, useDeactivateDevice } from '@/hooks/use-devices';
import { OnlineDot, StatusBadge } from '@/components/biometrics/ui/status-badge';
import { Server, Wifi, WifiOff, MoreHorizontal, Trash2, RefreshCw, Plus, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import type { BiometricDevice } from '@/types/biometrics';
import { AddDeviceDrawer } from '@/components/biometrics/devices/add-device-drawer';
import api from '@/lib/api';

const HARDWARE_ICONS: Record<string, string> = {
  fingerprint: '👆',
  face: '👤',
  card: '💳',
  hybrid: '🔀',
  unknown: '🖥️',
};

const CAPABILITY_BADGE: Record<string, string> = {
  fingerprint: 'FP',
  face: 'Face',
  card: 'Card',
  nfc: 'NFC',
};

function DeviceRow({ device, onDeactivate }: { device: BiometricDevice; onDeactivate: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const lastSeen = device.lastSeenAt
    ? formatDistanceToNowStrict(new Date(device.lastSeenAt), { addSuffix: true })
    : 'Never';

  return (
    <div className="grid items-center gap-3 px-4 py-3 border-b border-slate-100 text-xs hover:bg-slate-50 transition-colors group relative"
      style={{ gridTemplateColumns: '40px 1.5fr 100px 80px 100px 120px 80px 36px' }}
    >
      {/* Icon + online */}
      <div className="flex items-center justify-center">
        <span className="text-lg relative">
          {HARDWARE_ICONS[device.hardwareType] ?? '🖥️'}
          <span className="absolute -bottom-0.5 -right-0.5">
            <OnlineDot online={device.isOnline} />
          </span>
        </span>
      </div>

      {/* Name + serial */}
      <div className="min-w-0">
        <p className="font-medium text-slate-800 truncate">{device.name ?? device.serialNumber}</p>
        <p className="text-[10px] text-slate-400 font-mono truncate">{device.serialNumber}</p>
      </div>

      {/* Provider */}
      <span className="text-slate-600 capitalize truncate">{device.providerName}</span>

      {/* Hardware type */}
      <span className="text-slate-500 capitalize">{device.hardwareType}</span>

      {/* Status */}
      <StatusBadge
        label={device.isOnline ? 'Online' : 'Offline'}
        status={device.isOnline ? 'online' : 'offline'}
      />

      {/* Last seen */}
      <span className="text-slate-400 text-[10px] truncate">{lastSeen}</span>

      {/* Firmware */}
      <span className="text-slate-400 text-[10px] font-mono truncate">
        {device.firmwareVersion ?? '—'}
      </span>

      {/* Actions */}
      <div className="relative flex justify-end">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 ops-panel w-36 p-1 shadow-xl">
            <button
              onClick={() => { onDeactivate(device.id); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Deactivate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const HEADER_COLS = [
  { label: '' },
  { label: 'Device' },
  { label: 'Provider' },
  { label: 'Type' },
  { label: 'Status' },
  { label: 'Last Seen' },
  { label: 'Firmware' },
  { label: '' },
];

const GRID = '40px 1.5fr 100px 80px 100px 120px 80px 36px';

export function DeviceList() {
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const params = {
    is_online: filter === 'all' ? undefined : filter === 'online',
    branch_id: branchFilter || undefined,
    page,
    limit: 25,
  };

  const { data, isLoading, refetch } = useDeviceList(params);
  const deactivate = useDeactivateDevice();

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this device? It will no longer appear in active listings.')) return;
    await deactivate.mutateAsync(id);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="ops-panel p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
          {(['all', 'online', 'offline'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={cn(
                'px-3 py-1 text-xs rounded font-medium capitalize transition-colors',
                filter === f
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {f === 'online' && <Wifi className="w-3 h-3 inline mr-1" />}
              {f === 'offline' && <WifiOff className="w-3 h-3 inline mr-1" />}
              {f}
            </button>
          ))}
        </div>

        {branches.length > 0 && (
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3 h-3 text-slate-400" />
            <select
              value={branchFilter}
              onChange={e => { setBranchFilter(e.target.value); setPage(1); }}
              className="bg-slate-100 border-0 rounded-md text-xs text-slate-600 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <button
          onClick={() => setDrawerOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Device
        </button>

        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="ops-panel overflow-hidden">
        <div
          className="grid items-center gap-3 px-4 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
          style={{ gridTemplateColumns: GRID }}
        >
          {HEADER_COLS.map((c, i) => <span key={i}>{c.label}</span>)}
        </div>

        {isLoading && !data ? (
          <div className="space-y-px">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-200 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-slate-200 rounded w-1/3" />
                  <div className="h-2 bg-slate-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Server className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">No devices found</p>
          </div>
        ) : (
          data?.items.map((device) => (
            <DeviceRow key={device.id} device={device} onDeactivate={handleDeactivate} />
          ))
        )}
      </div>

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{data.total} total devices</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 ops-surface rounded disabled:opacity-30 hover:text-slate-700 transition-colors"
            >
              Prev
            </button>
            <span className="tabular-nums">
              {page} / {Math.ceil(data.total / data.limit)}
            </span>
            <button
              disabled={page >= Math.ceil(data.total / data.limit)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 ops-surface rounded disabled:opacity-30 hover:text-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      {drawerOpen && (
        <AddDeviceDrawer onClose={() => setDrawerOpen(false)} onSaved={() => refetch()} />
      )}
    </div>
  );
}
