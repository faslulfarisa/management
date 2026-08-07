'use client';

import { Search, X, SlidersHorizontal, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { usePunchFeed } from '@/hooks/use-punch-feed';
import { useBiometricsStore } from '@/store/biometrics.store';

const PROVIDERS = ['easytimepro', 'zkteco'];
const SOURCES = [
  { value: 'biometric_device',   label: 'Biometric' },
  { value: 'face_device',        label: 'Face' },
  { value: 'fingerprint_device', label: 'Fingerprint' },
  { value: 'card_device',        label: 'Card' },
  { value: 'mobile_terminal',    label: 'Mobile' },
  { value: 'laptop_terminal',    label: 'Laptop' },
  { value: 'kiosk_terminal',     label: 'Kiosk' },
];
const VERIFY_METHODS = ['fingerprint', 'face', 'card', 'password', 'hybrid', 'other'];

const selectClass =
  'bg-white border border-slate-200 text-slate-700 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer';

export function PunchFilters() {
  const { filters, setFilter, resetFilters, autoscroll, setAutoscroll } = usePunchFeed();
  const clearPunches = useBiometricsStore((s) => s.clearPunches);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="ops-panel p-3 flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
        <input
          type="text"
          placeholder="Employee, code…"
          value={filters.search ?? ''}
          onChange={(e) => setFilter('search', e.target.value || undefined)}
          className="bg-white border border-slate-200 text-slate-700 text-xs rounded-md pl-7 pr-3 py-1.5 w-44 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-400"
        />
      </div>

      <select
        value={filters.provider ?? ''}
        onChange={(e) => setFilter('provider', e.target.value || undefined)}
        className={selectClass}
      >
        <option value="">All providers</option>
        {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>

      <select
        value={filters.source ?? ''}
        onChange={(e) => setFilter('source', e.target.value || undefined)}
        className={selectClass}
      >
        <option value="">All sources</option>
        {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      <select
        value={filters.verifyMethod ?? ''}
        onChange={(e) => setFilter('verifyMethod', e.target.value || undefined)}
        className={selectClass}
      >
        <option value="">All methods</option>
        {VERIFY_METHODS.map((m) => (
          <option key={m} value={m} className="capitalize">{m}</option>
        ))}
      </select>

      <div className="flex items-center gap-1 ml-auto">
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-600 px-2 py-1 rounded transition-colors"
          >
            <X className="w-3 h-3" /> Filters
          </button>
        )}
        <button
          onClick={() => setAutoscroll(!autoscroll)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded transition-colors"
          title={autoscroll ? 'Pause autoscroll' : 'Resume autoscroll'}
        >
          {autoscroll ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
          {autoscroll ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={clearPunches}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>
  );
}
