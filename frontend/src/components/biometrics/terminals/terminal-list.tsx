'use client';

import { useState } from 'react';
import { useTerminalList, useDeactivateTerminal, useRotateTerminalToken } from '@/hooks/use-terminals';
import { OnlineDot, StatusBadge } from '@/components/biometrics/ui/status-badge';
import { Monitor, MoreHorizontal, RefreshCw, RotateCcw, Trash2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict, format } from 'date-fns';
import type { AttendanceTerminal } from '@/types/biometrics';

const TYPE_ICON: Record<string, string> = {
  laptop: '💻',
  tablet: '📱',
  mobile: '📲',
  kiosk:  '🖥️',
};

function TokenRevealModal({ rawToken, onClose }: { rawToken: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(rawToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="ops-panel p-6 w-full max-w-lg space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">New Token Generated</h3>
          <p className="text-xs text-amber-600 mt-1">
            ⚠ This token is shown exactly once. Store it securely and deploy to the device immediately.
          </p>
        </div>
        <div className="ops-surface p-3 font-mono text-xs text-emerald-700 break-all select-all">
          {rawToken}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={copy}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy token'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 ops-surface rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TerminalRow({
  terminal,
  onDeactivate,
  onRotateToken,
}: {
  terminal: AttendanceTerminal;
  onDeactivate: (id: string) => void;
  onRotateToken: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const lastPing = terminal.lastPingAt
    ? formatDistanceToNowStrict(new Date(terminal.lastPingAt), { addSuffix: true })
    : 'Never';
  const expires = terminal.expiresAt
    ? format(new Date(terminal.expiresAt), 'MMM d, yyyy')
    : 'Never';
  const isExpired = terminal.expiresAt
    ? new Date(terminal.expiresAt) < new Date()
    : false;

  return (
    <div
      className="grid items-center gap-3 px-4 py-3 border-b border-slate-100 text-xs hover:bg-slate-50 transition-colors group relative"
      style={{ gridTemplateColumns: '40px 1.5fr 80px 80px 110px 100px 90px 36px' }}
    >
      {/* Icon */}
      <div className="flex items-center justify-center relative">
        <span className="text-lg">
          {TYPE_ICON[terminal.deviceType] ?? '📟'}
          <span className="absolute -bottom-0.5 -right-0.5">
            <OnlineDot online={terminal.isOnline} />
          </span>
        </span>
      </div>

      {/* Name */}
      <div className="min-w-0">
        <p className="font-medium text-slate-800 truncate">{terminal.deviceName}</p>
        <p className="text-[10px] text-slate-400 font-mono truncate">{terminal.id.slice(0, 8)}…</p>
      </div>

      {/* Type */}
      <span className="text-slate-600 capitalize">{terminal.deviceType}</span>

      {/* Status */}
      <StatusBadge
        label={terminal.isOnline ? 'Online' : 'Offline'}
        status={terminal.isOnline ? 'online' : 'offline'}
      />

      {/* Last ping */}
      <span className="text-slate-400 text-[10px]">{lastPing}</span>

      {/* Last punch */}
      <span className="text-slate-400 text-[10px]">
        {terminal.lastPunchAt
          ? formatDistanceToNowStrict(new Date(terminal.lastPunchAt), { addSuffix: true })
          : '—'}
      </span>

      {/* Expiry */}
      <span className={cn('text-[10px]', isExpired ? 'text-red-600' : 'text-slate-400')}>
        {isExpired ? '⚠ Expired' : expires}
      </span>

      {/* Menu */}
      <div className="relative flex justify-end">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 ops-panel w-40 p-1 shadow-xl">
            <button
              onClick={() => { onRotateToken(terminal.id); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 rounded transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Rotate Token
            </button>
            <button
              onClick={() => { onDeactivate(terminal.id); setMenuOpen(false); }}
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

const GRID = '40px 1.5fr 80px 80px 110px 100px 90px 36px';
const HEADERS = ['', 'Terminal', 'Type', 'Status', 'Last Ping', 'Last Punch', 'Expiry', ''];

export function TerminalList() {
  const [page, setPage] = useState(1);
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data, isLoading, refetch } = useTerminalList({ page, limit: 25 });
  const deactivate = useDeactivateTerminal();
  const rotate = useRotateTerminalToken();

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this terminal? It will immediately stop accepting punches.')) return;
    await deactivate.mutateAsync(id);
  };

  const handleRotate = async (id: string) => {
    if (!confirm('Rotate token? The current token will be immediately invalidated.')) return;
    const result = await rotate.mutateAsync(id);
    setNewToken(result.rawToken);
  };

  return (
    <>
      {newToken && <TokenRevealModal rawToken={newToken} onClose={() => setNewToken(null)} />}

      <div className="space-y-3">
        <div className="ops-panel p-3 flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {data?.total ?? '…'} terminals
          </span>
          <button
            onClick={() => refetch()}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="ops-panel overflow-hidden">
          <div
            className="grid items-center gap-3 px-4 py-2 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-widest text-slate-500"
            style={{ gridTemplateColumns: GRID }}
          >
            {HEADERS.map((h, i) => <span key={i}>{h}</span>)}
          </div>

          {isLoading && !data ? (
            <div className="space-y-px">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-200 rounded w-1/3" />
                    <div className="h-2 bg-slate-200 rounded w-1/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Monitor className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-500">No terminals registered</p>
            </div>
          ) : (
            data?.items.map((t) => (
              <TerminalRow
                key={t.id}
                terminal={t}
                onDeactivate={handleDeactivate}
                onRotateToken={handleRotate}
              />
            ))
          )}
        </div>

        {data && data.total > data.limit && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{data.total} total terminals</span>
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
      </div>
    </>
  );
}
