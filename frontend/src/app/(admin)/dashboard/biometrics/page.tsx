'use client';

import { useMemo, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  Filter,
  HeartPulse,
  HelpCircle,
  History,
  Loader2,
  Monitor,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useBiometricsSocket } from '@/hooks/use-biometrics-socket';
import { useDeviceList, useDeviceStats } from '@/hooks/use-devices';
import { useTerminalStats } from '@/hooks/use-terminals';
import { useQueueHealth } from '@/hooks/use-queue-health';
import { useProviderList, useProviderHealth } from '@/hooks/use-providers';
import { usePunchFeed } from '@/hooks/use-punch-feed';
import { queueApi, devicesApi } from '@/lib/biometrics-api';
import { useBiometricsStore } from '@/store/biometrics.store';
import { cn } from '@/lib/utils';
import type { BiometricsAlert, BiometricDevice, DeviceCommand, ProviderInfo } from '@/types/biometrics';

type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'idle';

const toneStyles: Record<StatusTone, { panel: string; text: string; icon: string; bar: string; label: string }> = {
  ok: {
    panel: 'border-emerald-200 bg-emerald-50',
    text: 'text-emerald-700',
    icon: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
    label: 'Good',
  },
  warn: {
    panel: 'border-amber-200 bg-amber-50',
    text: 'text-amber-700',
    icon: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-500',
    label: 'Watch',
  },
  danger: {
    panel: 'border-red-200 bg-red-50',
    text: 'text-red-700',
    icon: 'bg-red-100 text-red-700',
    bar: 'bg-red-500',
    label: 'Action',
  },
  info: {
    panel: 'border-blue-200 bg-blue-50',
    text: 'text-blue-700',
    icon: 'bg-blue-100 text-blue-700',
    bar: 'bg-blue-500',
    label: 'Live',
  },
  idle: {
    panel: 'border-slate-200 bg-white',
    text: 'text-slate-600',
    icon: 'bg-slate-100 text-slate-600',
    bar: 'bg-slate-300',
    label: 'Idle',
  },
};

function numberText(value: number | undefined | null) {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-IN').format(value);
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function timeAgo(value?: string | null) {
  if (!value) return 'No recent update';
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

function recordText(row: Record<string, unknown>, key: string, fallback = '-') {
  const value = row[key];
  if (value == null || value === '') return fallback;
  return String(value);
}

function recordTime(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === 'string' ? timeAgo(value) : '-';
}

function PanelTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function TooltipHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
      <span className="pointer-events-none absolute right-0 top-5 z-30 hidden w-56 rounded-md border border-slate-200 bg-white p-2 text-[11px] font-normal leading-relaxed text-slate-600 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const styles = toneStyles[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', styles.panel, styles.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', styles.bar)} />
      {children}
    </span>
  );
}

function ProgressLine({ value, tone }: { value: number; tone: StatusTone }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full transition-all', toneStyles[tone].bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  tone,
  progress,
  tooltip,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: ElementType;
  tone: StatusTone;
  progress?: number;
  tooltip?: string;
}) {
  const styles = toneStyles[tone];
  return (
    <div className="ops-panel p-4 min-h-[132px]">
      <div className="flex items-start justify-between gap-2">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', styles.icon)}>
          <Icon className="w-4 h-4" />
        </div>
        {tooltip && <TooltipHint text={tooltip} />}
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{title}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', styles.text)}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>
      {progress != null && <div className="mt-3"><ProgressLine value={progress} tone={tone} /></div>}
    </div>
  );
}

function MetricGroupCard({
  title,
  description,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  description: string;
  icon: ElementType;
  tone: StatusTone;
  items: Array<{ label: string; value: string | number; note?: string }>;
}) {
  return (
    <div className="ops-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneStyles[tone].icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <StatusPill tone={tone}>{toneStyles[tone].label}</StatusPill>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400">{item.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{item.value}</p>
            {item.note && <p className="mt-1 text-[11px] leading-snug text-slate-500">{item.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryList({
  title,
  description,
  icon,
  rows,
  columns,
  empty,
}: {
  title: string;
  description: string;
  icon: ElementType;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ label: string; render: (row: Record<string, unknown>) => ReactNode }>;
  empty: string;
}) {
  return (
    <div className="ops-panel p-4">
      <PanelTitle icon={icon} title={title} description={description} />
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((column) => <span key={column.label}>{column.label}</span>)}
        </div>
        {rows.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">{empty}</div>
        ) : rows.slice(0, 6).map((row, index) => (
          <div key={recordText(row, 'id', String(index))} className="grid gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {columns.map((column) => (
              <span key={column.label} className="min-w-0 truncate text-slate-600">
                {column.render(row)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertToast({ alert, onDismiss }: { alert: BiometricsAlert; onDismiss: () => void }) {
  const tone = alert.level === 'error' ? 'danger' : alert.level === 'warn' ? 'warn' : 'info';
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3', toneStyles[tone].panel)}>
      <span className={cn('mt-1 h-2 w-2 rounded-full shrink-0 animate-live', toneStyles[tone].bar)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-800">{alert.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{alert.message}</p>
      </div>
      <button type="button" onClick={onDismiss} className="text-slate-400 transition-colors hover:text-slate-700" aria-label="Dismiss alert">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ProviderStatusCard({ provider }: { provider: ProviderInfo }) {
  const { data: health, isFetching, refetch } = useProviderHealth(provider.name);
  const tone: StatusTone = !health ? 'idle' : health.healthy ? 'ok' : 'danger';
  const label = provider.name.replace(/_/g, ' ');

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold capitalize text-slate-800">{label}</p>
          <p className="text-[11px] text-slate-500">
            {health?.lastSyncAt ? `Synced ${timeAgo(health.lastSyncAt)}` : 'Waiting for first sync'}
          </p>
        </div>
        <StatusPill tone={tone}>{health?.healthy ? 'Connected' : health ? 'Needs attention' : 'Unknown'}</StatusPill>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-[10px] uppercase text-slate-400">Response</p>
          <p className="mt-1 font-semibold text-slate-700">{health?.latencyMs != null ? `${health.latencyMs} ms` : '-'}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-[10px] uppercase text-slate-400">Result</p>
          <p className={cn('mt-1 font-semibold', toneStyles[tone].text)}>{toneStyles[tone].label}</p>
        </div>
      </div>

      {health?.error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{health.error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Diagnostics
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700">
          <PlayCircle className="h-3.5 w-3.5" />
          Use top manual sync
        </span>
      </div>
    </div>
  );
}

function DeviceCommandPanel({ devices }: { devices: BiometricDevice[] }) {
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '');
  const [command, setCommand] = useState('INFO');

  const activeDeviceId = deviceId || devices[0]?.id || '';
  const activeDevice = devices.find((device) => device.id === activeDeviceId);

  const commandsQuery = useQuery({
    queryKey: ['biometrics', 'device-commands', activeDeviceId],
    queryFn: () => devicesApi.listCommands(activeDeviceId, 12),
    enabled: Boolean(activeDeviceId),
    refetchInterval: 15_000,
  });

  const queueCommand = useMutation({
    mutationFn: () => devicesApi.queueCommand(activeDeviceId, { commandType: 'diagnostic', command, priority: 50 }),
    onSuccess: () => {
      setCommand('INFO');
      queryClient.invalidateQueries({ queryKey: ['biometrics', 'device-commands', activeDeviceId] });
    },
  });

  const commands = commandsQuery.data ?? [];

  return (
    <div className="ops-panel p-4">
      <PanelTitle
        icon={Send}
        title="Device Commands"
        description="Queue safe diagnostic commands and review device responses."
        action={<StatusPill tone={commands.some((item) => item.status === 'pending') ? 'warn' : 'ok'}>{commands.filter((item) => item.status === 'pending').length} pending</StatusPill>}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
        <select
          value={activeDeviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {devices.length === 0 ? (
            <option value="">No devices available</option>
          ) : devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name || device.serialNumber} - {device.isOnline ? 'online' : 'offline'}
            </option>
          ))}
        </select>
        <select
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="INFO">Read device status</option>
          <option value="CHECK">Check connection</option>
          <option value="LOG">Request recent logs</option>
          <option value="REBOOT">Restart device</option>
        </select>
        <button
          type="button"
          onClick={() => queueCommand.mutate()}
          disabled={!activeDeviceId || queueCommand.isPending}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          title="Send a device command through the normal ADMS queue."
        >
          {queueCommand.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Queue
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[1fr_96px_120px_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Command Queue</span>
          <span>Status</span>
          <span>Queued</span>
          <span>Command Responses</span>
        </div>
        {commandsQuery.isLoading ? (
          <div className="p-4 text-xs text-slate-500">Loading command queue...</div>
        ) : commands.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">No commands have been sent to this device yet.</div>
        ) : commands.map((item: DeviceCommand) => (
          <div key={item.id} className="grid grid-cols-[1fr_96px_120px_1fr] gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
            <span className="truncate font-medium text-slate-700">{item.command_type}</span>
            <span className={cn('font-semibold capitalize', item.status === 'succeeded' || item.status === 'acknowledged' ? 'text-emerald-700' : item.status === 'failed' ? 'text-red-700' : 'text-amber-700')}>{item.status}</span>
            <span className="text-slate-500">{item.queued_at ? format(new Date(item.queued_at), 'MMM d HH:mm') : '-'}</span>
            <span className="truncate text-slate-500">{item.result_message || item.result_code || item.return_code || 'Awaiting device response'}</span>
          </div>
        ))}
      </div>

      {activeDevice && (
        <p className="mt-3 text-[11px] text-slate-500">
          Selected device heartbeat: {timeAgo(activeDevice.lastSeenAt)}. HR action: if a device is offline, ask the branch to check power and network before retrying punches.
        </p>
      )}
    </div>
  );
}

function TimelinePanel() {
  const { punches } = usePunchFeed();
  const latest = punches.slice(0, 8);

  return (
    <div className="ops-panel p-4">
      <PanelTitle
        icon={History}
        title="Attendance Timeline"
        description="Latest employee punch activity in plain order."
        action={<Link href="/dashboard/biometrics/live-attendance" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">Open feed <ArrowRight className="h-3 w-3" /></Link>}
      />
      <div className="mt-4 space-y-3">
        {latest.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
            Waiting for realtime punches. When employees punch in or out, they will appear here.
          </div>
        ) : latest.map((punch, index) => (
          <div key={`${punch.recordId ?? punch.employeeCode}-${punch.timestamp}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('h-2.5 w-2.5 rounded-full', punch.punchType === 'IN' ? 'bg-emerald-500' : punch.punchType === 'OUT' ? 'bg-blue-500' : 'bg-slate-400')} />
              {index < latest.length - 1 && <span className="mt-1 h-full w-px bg-slate-200" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">{punch.employeeName || punch.employeeCode}</p>
                <StatusPill tone={punch.punchType === 'UNKNOWN' ? 'warn' : 'ok'}>{punch.punchType}</StatusPill>
                {punch.isLate && <StatusPill tone="warn">Late</StatusPill>}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {punch.employeeCode} via {punch.provider} - {timeAgo(punch.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterBar({ providers }: { providers: ProviderInfo[] }) {
  const { filters, setFilter, resetFilters } = usePunchFeed();

  return (
    <div className="ops-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <Filter className="h-3.5 w-3.5" />
          Filtering
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            value={filters.search ?? ''}
            onChange={(event) => setFilter('search', event.target.value || undefined)}
            placeholder="Search employee, code, or provider"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <select
          value={filters.provider ?? ''}
          onChange={(event) => setFilter('provider', event.target.value || undefined)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All providers</option>
          {providers.map((provider) => <option key={provider.name} value={provider.name}>{provider.name}</option>)}
        </select>
        <select
          value={filters.source ?? ''}
          onChange={(event) => setFilter('source', event.target.value || undefined)}
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">All punch sources</option>
          <option value="biometric_device">Biometric device</option>
          <option value="face_device">Face device</option>
          <option value="fingerprint_device">Fingerprint device</option>
          <option value="card_device">Card device</option>
          <option value="mobile_terminal">Mobile terminal</option>
          <option value="laptop_terminal">Laptop terminal</option>
          <option value="kiosk_terminal">Kiosk terminal</option>
        </select>
        <button type="button" onClick={resetFilters} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:bg-slate-50">
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
    </div>
  );
}

export default function BiometricsOverviewPage() {
  useBiometricsSocket();

  const queryClient = useQueryClient();
  const { wsConnected, alerts, dismissAlert, punchesToday, punchesPerMinute } = useBiometricsStore();
  const { punches } = usePunchFeed();
  const { queueHealth, refetch: refetchQueue } = useQueueHealth();
  const { stats: deviceStats, loading: deviceLoading } = useDeviceStats();
  const { stats: terminalStats } = useTerminalStats();
  const { data: providers = [] } = useProviderList();
  const { data: deviceList } = useDeviceList({ limit: 12, is_active: true });
  const { data: onlineDevices } = useDeviceList({ limit: 8, is_active: true, is_online: true });
  const { data: offlineDevices } = useDeviceList({ limit: 8, is_active: true, is_online: false });

  const diagnostics = useQuery({
    queryKey: ['biometrics', 'queue-diagnostics'],
    queryFn: queueApi.getDiagnostics,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const operationsSummary = useQuery({
    queryKey: ['biometrics', 'operations-summary'],
    queryFn: queueApi.getOperationsSummary,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const syncDlq = useQuery({
    queryKey: ['biometrics', 'sync-dlq', 0],
    queryFn: () => queueApi.getSyncDlq(0, 8),
    refetchInterval: 25_000,
    staleTime: 15_000,
  });

  const retryFailed = useMutation({
    mutationFn: queueApi.retryAllFailed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biometrics', 'dlq'] });
      queryClient.invalidateQueries({ queryKey: ['biometrics', 'queue-health'] });
      queryClient.invalidateQueries({ queryKey: ['biometrics', 'operations-summary'] });
    },
  });

  const retryUnknownEmployees = useMutation({
    mutationFn: () => queueApi.retryUnknownEmployees({ limit: 100 }),
    onSuccess: () => {
      operationsSummary.refetch();
      diagnostics.refetch();
    },
  });

  const replayOffline = useMutation({
    mutationFn: () => queueApi.replayOfflineBuffer({ limit: 100 }),
    onSuccess: () => {
      diagnostics.refetch();
      operationsSummary.refetch();
      refetchQueue();
    },
  });

  const retrySync = useMutation({
    mutationFn: (jobId: string) => queueApi.retrySyncJob(jobId),
    onSuccess: () => {
      syncDlq.refetch();
      diagnostics.refetch();
    },
  });

  const allDevices = deviceList?.items ?? [];
  const opSummary = operationsSummary.data;
  const totalDevices = deviceStats?.total ?? 0;
  const onlineDeviceCount = deviceStats?.online ?? 0;
  const offlineDeviceCount = deviceStats?.offline ?? 0;
  const availability = percent(onlineDeviceCount, totalDevices);
  const queueDepth = queueHealth?.depth ?? 0;
  const failedPunches = queueHealth?.failed ?? 0;
  const syncFailed = opSummary?.system.failedSyncs ?? diagnostics.data?.queues.biometricSync.failed ?? syncDlq.data?.total ?? 0;
  const offlineBufferTotal = Number(diagnostics.data?.offlineBuffer.total ?? 0);
  const unknownEmployees = opSummary?.tenant.unknownEmployees ?? 0;
  const rejectedPunches = opSummary?.tenant.rejectedPunches ?? 0;
  const replayAttacks = opSummary?.platform.replayAttacksBlocked24h ?? 0;

  const heartbeatTone: StatusTone = totalDevices === 0 ? 'idle' : offlineDeviceCount === 0 ? 'ok' : availability >= 70 ? 'warn' : 'danger';
  const queueTone: StatusTone = failedPunches > 0 ? 'danger' : queueDepth > 1000 ? 'warn' : 'ok';
  const syncTone: StatusTone = syncFailed > 0 ? 'danger' : offlineBufferTotal > 0 ? 'warn' : 'ok';
  const overallTone: StatusTone = !wsConnected || heartbeatTone === 'danger' || queueTone === 'danger' || syncTone === 'danger'
    ? 'danger'
    : heartbeatTone === 'warn' || queueTone === 'warn' || syncTone === 'warn'
      ? 'warn'
      : 'ok';

  const hrSummary = useMemo(() => {
    if (overallTone === 'ok') return 'Attendance capture is running normally. HR can trust live punch data.';
    if (overallTone === 'warn') return 'Attendance is flowing, but one area needs watching. Review the highlighted panel before payroll cutoff.';
    return 'Attendance capture needs action. Start with offline devices, failed punches, and sync retry controls below.';
  }, [overallTone]);

  return (
    <div className="space-y-6">
      <div className={cn('rounded-xl border p-4', toneStyles[overallTone].panel)}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', toneStyles[overallTone].icon)}>
              {overallTone === 'ok' ? <CheckCircle className="h-5 w-5" /> : overallTone === 'warn' ? <AlertTriangle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Biometrics Command Center</h1>
                <StatusPill tone={overallTone}>{overallTone === 'ok' ? 'System healthy' : overallTone === 'warn' ? 'Needs review' : 'Action required'}</StatusPill>
                <StatusPill tone={wsConnected ? 'info' : 'danger'}>{wsConnected ? 'Realtime updates on' : 'Realtime disconnected'}</StatusPill>
              </div>
              <p className="mt-1 text-sm text-slate-600">{hrSummary}</p>
              <p className="mt-1 text-xs text-slate-500">
                Last diagnostics: {diagnostics.data?.timestamp ? format(new Date(diagnostics.data.timestamp), 'MMM d, h:mm:ss a') : 'loading'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { refetchQueue(); diagnostics.refetch(); operationsSummary.refetch(); syncDlq.refetch(); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (diagnostics.isFetching || operationsSummary.isFetching || syncDlq.isFetching) && 'animate-spin')} />
              Refresh diagnostics
            </button>
            <button
              type="button"
              onClick={() => retryFailed.mutate()}
              disabled={failedPunches === 0 || retryFailed.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              title="Bulk retry all failed punch jobs."
            >
              {retryFailed.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Bulk retry
            </button>
            <button
              type="button"
              onClick={() => retryUnknownEmployees.mutate()}
              disabled={unknownEmployees === 0 || retryUnknownEmployees.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Retry unmapped employee punches after HR updates employee codes or mappings."
            >
              {retryUnknownEmployees.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
              Retry unknowns
            </button>
            <button
              type="button"
              onClick={() => replayOffline.mutate()}
              disabled={offlineBufferTotal === 0 || replayOffline.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              title="Manual sync for punches buffered while systems were offline."
            >
              {replayOffline.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
              Manual sync
            </button>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2 lg:grid-cols-3">
          {alerts.slice(0, 3).map((alert) => <AlertToast key={alert.id} alert={alert} onDismiss={() => dismissAlert(alert.id)} />)}
        </div>
      )}

      <FilterBar providers={providers} />

      <section className="grid gap-4 xl:grid-cols-4">
        <MetricGroupCard
          title="Platform Metrics"
          description="Connectivity and processing across biometric integrations."
          icon={SlidersHorizontal}
          tone={(opSummary?.platform.failedQueueItems ?? failedPunches) > 0 ? 'danger' : queueDepth > 0 ? 'warn' : 'ok'}
          items={[
            { label: 'Integrations', value: `${opSummary?.platform.activeIntegrations ?? providers.length}/${opSummary?.platform.integrations ?? providers.length}`, note: 'Active connections' },
            { label: 'Queue Depth', value: numberText(opSummary?.platform.queueDepth ?? queueDepth), note: 'Waiting to process' },
            { label: 'Queue Throughput', value: numberText(opSummary?.system.syncedRecords24h ?? punchesToday), note: 'Synced in 24 hours' },
            { label: 'Replay Attacks', value: numberText(replayAttacks), note: 'Blocked in 24 hours' },
          ]}
        />
        <MetricGroupCard
          title="Tenant Metrics"
          description="Items HR can resolve for the selected organization."
          icon={Users}
          tone={unknownEmployees > 0 || rejectedPunches > 0 ? 'warn' : 'ok'}
          items={[
            { label: 'Unknown Employees', value: numberText(unknownEmployees), note: `${opSummary?.tenant.affectedEmployees ?? 0} employee codes affected` },
            { label: 'Rejected Punches', value: numberText(rejectedPunches), note: 'Need HR review' },
            { label: 'Recovered Punches', value: numberText(opSummary?.tenant.recoveredPunches ?? 0), note: 'Processed after retry' },
            { label: 'Punches Today', value: numberText(punchesToday), note: 'Realtime activity' },
          ]}
        />
        <MetricGroupCard
          title="System Metrics"
          description="Sync, retry, and exception queues in plain status."
          icon={Database}
          tone={(opSummary?.system.deadLetterQueueDepth ?? failedPunches) > 0 || syncFailed > 0 ? 'danger' : offlineBufferTotal > 0 ? 'warn' : 'ok'}
          items={[
            { label: 'Failed Syncs', value: numberText(syncFailed), note: `${opSummary?.system.failedSyncRecords ?? 0} records affected` },
            { label: 'Retry Queue', value: numberText(opSummary?.system.retryQueueDepth ?? queueHealth?.active ?? 0), note: 'Being processed now' },
            { label: 'Dead Letter Queue', value: numberText(opSummary?.system.deadLetterQueueDepth ?? failedPunches), note: 'Needs retry or review' },
            { label: 'Buffered Punches', value: numberText(opSummary?.system.offlineBufferDepth ?? offlineBufferTotal), note: 'Ready for replay' },
          ]}
        />
        <MetricGroupCard
          title="Device Metrics"
          description="Physical devices and software terminals at branches."
          icon={BarChart3}
          tone={offlineDeviceCount > 0 || (opSummary?.terminals.offlineTerminals ?? 0) > 0 ? 'danger' : (opSummary?.devices.staleHeartbeats ?? 0) > 0 ? 'warn' : 'ok'}
          items={[
            { label: 'Device Health', value: `${availability}%`, note: `${onlineDeviceCount}/${totalDevices} devices online` },
            { label: 'Terminal Health', value: `${opSummary?.terminals.onlineTerminals ?? terminalStats?.online ?? 0}/${opSummary?.terminals.totalTerminals ?? terminalStats?.total ?? 0}`, note: 'Trusted terminals online' },
            { label: 'Offline Devices', value: numberText(offlineDeviceCount), note: 'Check branch power or network' },
            { label: 'Heartbeats', value: numberText(opSummary?.devices.staleHeartbeats ?? 0), note: 'Stale device check-ins' },
          ]}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard
          title="Device Health"
          value={`${availability}%`}
          note={`${onlineDeviceCount} online, ${offlineDeviceCount} offline`}
          icon={HeartPulse}
          tone={heartbeatTone}
          progress={availability}
          tooltip="Shows whether physical biometric devices are reachable and recently sending heartbeats."
        />
        <MetricCard
          title="Online Devices"
          value={`${onlineDeviceCount}/${totalDevices}`}
          note={deviceLoading ? 'Checking device registry' : 'Ready to capture punches'}
          icon={Wifi}
          tone={onlineDeviceCount > 0 || totalDevices === 0 ? 'ok' : 'danger'}
          progress={availability}
        />
        <MetricCard
          title="Offline Devices"
          value={offlineDeviceCount}
          note={offlineDeviceCount > 0 ? 'Ask branch to check power or internet' : 'No branch device is offline'}
          icon={WifiOff}
          tone={offlineDeviceCount > 0 ? 'danger' : 'ok'}
        />
        <MetricCard
          title="Heartbeat"
          value={onlineDeviceCount > 0 || (terminalStats?.online ?? 0) > 0 ? 'Active' : 'Quiet'}
          note={`${terminalStats?.online ?? 0}/${terminalStats?.total ?? 0} terminals online`}
          icon={Monitor}
          tone={onlineDeviceCount > 0 || (terminalStats?.online ?? 0) > 0 ? 'ok' : 'idle'}
          tooltip="Heartbeat means devices or terminals have checked in recently."
        />
        <MetricCard
          title="Sync Status"
          value={syncTone === 'ok' ? 'Clear' : syncTone === 'warn' ? 'Waiting' : 'Failed'}
          note={`${syncFailed} sync failures, ${offlineBufferTotal} buffered punches`}
          icon={ShieldCheck}
          tone={syncTone}
        />
        <MetricCard
          title="Queue Status"
          value={numberText(queueDepth)}
          note={`${queueHealth?.active ?? 0} active, ${queueHealth?.workers ?? 0} workers`}
          icon={Cpu}
          tone={queueTone}
          progress={queueDepth > 0 ? Math.min(100, queueDepth / 20) : 100}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="ops-panel p-4 xl:col-span-2">
          <PanelTitle
            icon={Activity}
            title="Realtime Updates"
            description="Live punch, retry, sync, and queue status in one HR-readable view."
            action={<StatusPill tone={wsConnected ? 'info' : 'danger'}>{wsConnected ? `${punchesPerMinute}/min` : 'Polling fallback'}</StatusPill>}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard title="Pending Punches" value={numberText(queueDepth)} note="Punches waiting to be processed" icon={Clock} tone={queueDepth > 1000 ? 'warn' : 'ok'} />
            <MetricCard title="Failed Punches" value={failedPunches} note="Need retry or inspection" icon={AlertTriangle} tone={failedPunches > 0 ? 'danger' : 'ok'} />
            <MetricCard title="Retry Queue" value={numberText(queueHealth?.active ?? 0)} note="Punches being processed now" icon={RotateCcw} tone={(queueHealth?.active ?? 0) > 0 ? 'info' : 'idle'} />
            <MetricCard title="Punches Today" value={numberText(punchesToday)} note={`${punches.length} visible after filters`} icon={Users} tone={punchesToday > 0 ? 'ok' : 'idle'} />
          </div>
        </div>

        <div className="ops-panel p-4">
          <PanelTitle icon={Zap} title="Diagnostics" description="What HR should check first." />
          <div className="mt-4 space-y-3">
            {[
              {
                label: 'Device activity',
                tone: heartbeatTone,
                text: offlineDeviceCount > 0 ? `${offlineDeviceCount} devices are offline. Contact the branch and verify power and internet.` : 'Devices are reachable.',
              },
              {
                label: 'Punch processing',
                tone: queueTone,
                text: failedPunches > 0 ? 'Some punches failed. Use bulk retry, then inspect remaining failures.' : 'Punch queue is processing normally.',
              },
              {
                label: 'Integration status',
                tone: syncTone,
                text: syncTone === 'ok' ? 'External sync is clear.' : 'Run manual sync and review sync history below.',
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{item.label}</p>
                  <StatusPill tone={item.tone}>{toneStyles[item.tone].label}</StatusPill>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="ops-panel p-4">
          <PanelTitle icon={Server} title="Online Devices" description="Devices currently expected to capture punches." />
          <div className="mt-4 space-y-2">
            {(onlineDevices?.items ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">No online devices found.</p>
            ) : onlineDevices!.items.map((device) => (
              <div key={device.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{device.name || device.serialNumber}</p>
                  <p className="text-xs text-slate-500">{device.providerName} - seen {timeAgo(device.lastSeenAt)}</p>
                </div>
                <StatusPill tone="ok">Online</StatusPill>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-panel p-4">
          <PanelTitle icon={WifiOff} title="Offline Devices" description="Devices that may stop attendance capture at a branch." />
          <div className="mt-4 space-y-2">
            {(offlineDevices?.items ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">No offline devices. Nothing for HR to chase right now.</p>
            ) : offlineDevices!.items.map((device) => (
              <div key={device.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{device.name || device.serialNumber}</p>
                  <p className="text-xs text-red-700">Last heartbeat {timeAgo(device.lastSeenAt)}</p>
                </div>
                <StatusPill tone="danger">Check branch</StatusPill>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="ops-panel p-4 xl:col-span-2">
          <PanelTitle
            icon={ShieldCheck}
            title="Integration Status"
            description="Manual sync and provider health without needing technical logs."
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {providers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">No integrations registered.</p>
            ) : providers.map((provider) => <ProviderStatusCard key={provider.name} provider={provider} />)}
          </div>
        </div>

        <div className="ops-panel p-4">
          <PanelTitle icon={Timer} title="Sync History" description="Recent sync failures or partial runs." />
          <div className="mt-4 space-y-3">
            {syncDlq.isLoading ? (
              <p className="text-xs text-slate-500">Loading sync history...</p>
            ) : (syncDlq.data?.jobs ?? []).length === 0 && (diagnostics.data?.recentSyncFailures ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">No recent sync failures.</p>
            ) : (
              <>
                {(syncDlq.data?.jobs ?? []).map((job) => (
                  <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{job.provider || 'Sync job'}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{job.failedReason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => retrySync.mutate(job.id)}
                        disabled={retrySync.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <RotateCcw className={cn('h-3 w-3', retrySync.isPending && 'animate-spin')} />
                        Retry
                      </button>
                    </div>
                  </div>
                ))}
                {(diagnostics.data?.recentSyncFailures ?? []).slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-800">{item.provider_name || 'Provider'} - {item.status}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.error_summary || 'Partial sync completed with exceptions.'}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TimelinePanel />
        <div className="ops-panel p-4">
          <PanelTitle
            icon={Users}
            title="Employee Punch History"
            description="Filtered employee events from the realtime buffer."
            action={<TooltipHint text="Use the filters above to narrow this list by employee, code, provider, or punch source." />}
          />
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1fr_90px_100px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Employee</span>
              <span>Punch</span>
              <span>When</span>
            </div>
            {punches.slice(0, 10).length === 0 ? (
              <div className="p-4 text-xs text-slate-500">No punches match the current filters.</div>
            ) : punches.slice(0, 10).map((punch, index) => (
              <div key={`${punch.employeeCode}-${punch.timestamp}-${index}`} className="grid grid-cols-[1fr_90px_100px] gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{punch.employeeName || punch.employeeCode}</p>
                  <p className="truncate text-[11px] text-slate-500">{punch.employeeCode} - {punch.provider}</p>
                </div>
                <span className={cn('font-semibold', punch.punchType === 'IN' ? 'text-emerald-700' : 'text-blue-700')}>{punch.punchType}</span>
                <span className="text-slate-500">{timeAgo(punch.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <HistoryList
          title="Sync History"
          description="Recent provider sync results and recovery progress."
          icon={ShieldCheck}
          rows={opSummary?.history.sync ?? []}
          empty="No sync activity has been recorded yet."
          columns={[
            { label: 'Provider', render: (row) => recordText(row, 'provider_name', 'Provider') },
            { label: 'Result', render: (row) => <span className={cn('font-semibold', recordText(row, 'status') === 'success' ? 'text-emerald-700' : recordText(row, 'status') === 'failed' ? 'text-red-700' : 'text-amber-700')}>{recordText(row, 'status')}</span> },
            { label: 'When', render: (row) => recordTime(row, 'started_at') },
          ]}
        />
        <HistoryList
          title="Command History"
          description="Recent device commands and branch-facing result messages."
          icon={Send}
          rows={opSummary?.history.commands ?? []}
          empty="No recent device commands."
          columns={[
            { label: 'Device', render: (row) => recordText(row, 'device_serial_number', 'Device') },
            { label: 'Command', render: (row) => recordText(row, 'command_type') },
            { label: 'Status', render: (row) => <span className="font-semibold capitalize text-slate-700">{recordText(row, 'status')}</span> },
          ]}
        />
        <HistoryList
          title="Punch History"
          description="Recent attendance punches after processing."
          icon={History}
          rows={opSummary?.history.punches ?? []}
          empty="No processed punches found."
          columns={[
            { label: 'Employee', render: (row) => recordText(row, 'employee_name', recordText(row, 'employee_code')) },
            { label: 'Punches', render: (row) => numberText(Number(row.punch_count ?? 0)) },
            { label: 'Source', render: (row) => recordText(row, 'attendance_source') },
          ]}
        />
      </section>

      <DeviceCommandPanel devices={allDevices} />
    </div>
  );
}
