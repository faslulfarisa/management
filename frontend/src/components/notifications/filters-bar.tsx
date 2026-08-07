'use client';

import { Search, X, RefreshCw, Loader2 } from 'lucide-react';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES, NOTIFICATION_SOURCE_MODULES, NotificationListFilters } from '@/lib/notifications-api';

interface FiltersBarProps {
  filters: NotificationListFilters;
  onChange: (filters: NotificationListFilters) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const selectClass = 'text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-ring';

export function FiltersBar({ filters, onChange, onRefresh, refreshing }: FiltersBarProps) {
  const update = (patch: Partial<NotificationListFilters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search title or message…"
          value={filters.search ?? ''}
          onChange={(e) => update({ search: e.target.value || undefined })}
        />
        {filters.search && (
          <button onClick={() => update({ search: undefined })} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <select className={selectClass} value={filters.type ?? ''} onChange={(e) => update({ type: e.target.value || undefined })}>
        <option value="">All types</option>
        {NOTIFICATION_TYPES.map((t) => (
          <option key={t} value={t} className="capitalize">{t}</option>
        ))}
      </select>

      <select className={selectClass} value={filters.priority ?? ''} onChange={(e) => update({ priority: e.target.value || undefined })}>
        <option value="">All priorities</option>
        {NOTIFICATION_PRIORITIES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <select className={selectClass} value={filters.source_module ?? ''} onChange={(e) => update({ source_module: e.target.value || undefined })}>
        <option value="">All sources</option>
        {NOTIFICATION_SOURCE_MODULES.map((m) => (
          <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
        ))}
      </select>

      <select className={selectClass} value={filters.status ?? 'active'} onChange={(e) => update({ status: e.target.value || undefined })}>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>

      <input
        type="date"
        className={selectClass}
        value={filters.date_from ?? ''}
        onChange={(e) => update({ date_from: e.target.value || undefined })}
      />
      <input
        type="date"
        className={selectClass}
        value={filters.date_to ?? ''}
        onChange={(e) => update({ date_to: e.target.value || undefined })}
      />

      {onRefresh && (
        <button onClick={onRefresh} className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
