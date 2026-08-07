'use client';

import { useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { ReportFilters } from './ReportFilters';
import { MobileFilterSheet } from './MobileFilterSheet';
import { ReportExportBar } from './ReportExportBar';
import type { FilterField, FilterOptions, FilterState, TabDef } from './types';

export interface ReportPageShellProps {
  title: string;
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
  filterFields: FilterField[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  filterOptions?: FilterOptions;
  children: React.ReactNode;
  onExportCsv?: () => void;
  onExportXlsx?: () => void;
  onExportPdf?: () => void;
  onRefresh?: () => void;
  total: number;
  loading: boolean;
  reportKey?: string;
}

function countActiveFilters(f: FilterState): number {
  const dateKeys: (keyof FilterState)[] = ['date_from', 'date_to'];
  const otherKeys = Object.keys(f) as (keyof FilterState)[];
  return otherKeys.filter(k => !dateKeys.includes(k) && f[k] != null && f[k] !== '').length
    + (f.date_from || f.date_to ? 1 : 0);
}

const STORAGE_PREFIX = 'report-filters:';

// ─── Shell ────────────────────────────────────────────────────────────────────

export function ReportPageShell({
  title,
  tabs,
  activeTab,
  onTabChange,
  filterFields,
  filters,
  onFiltersChange,
  filterOptions,
  children,
  onExportCsv,
  onExportXlsx,
  onExportPdf,
  onRefresh,
  total,
  loading,
  reportKey,
}: ReportPageShellProps) {
  // Initialise tab from ?tab= URL param on first render (client-only, no Suspense needed)
  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab && tabs.some(t => t.key === urlTab) && urlTab !== activeTab) {
      onTabChange(urlTab);
    }
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore filters from localStorage on mount
  useEffect(() => {
    if (!reportKey) return;
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${reportKey}`);
      if (saved) onFiltersChange(JSON.parse(saved));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  // Persist filters on change
  useEffect(() => {
    if (!reportKey) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${reportKey}`, JSON.stringify(filters));
    } catch {}
  }, [filters, reportKey]);

  const handleReset = useCallback(() => {
    onFiltersChange({});
    if (reportKey) {
      try { localStorage.removeItem(`${STORAGE_PREFIX}${reportKey}`); } catch {}
    }
  }, [onFiltersChange, reportKey]);

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>

        <div className="flex items-center gap-2">
          {/* Mobile filter trigger */}
          <div className="md:hidden">
            <MobileFilterSheet
              value={filters}
              onChange={onFiltersChange}
              fields={filterFields}
              options={filterOptions}
              onReset={handleReset}
              activeFilterCount={activeFilterCount}
            />
          </div>
        </div>
      </div>

      {/* Desktop filters */}
      {filterFields.length > 0 && (
        <div className="hidden md:block">
          <ReportFilters
            value={filters}
            onChange={onFiltersChange}
            fields={filterFields}
            options={filterOptions}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit overflow-x-auto max-w-full [&::-webkit-scrollbar]:hidden">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5',
                t.key === activeTab
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.count != null && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full leading-none tabular-nums',
                  t.key === activeTab ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Export bar + mobile save */}
      {(onExportCsv || onExportXlsx || onExportPdf || onRefresh) && (
        <ReportExportBar
          onExportCsv={onExportCsv}
          onExportXlsx={onExportXlsx}
          onExportPdf={onExportPdf}
          onRefresh={onRefresh}
          loading={loading}
          total={total}
        />
      )}

      {/* Content */}
      {children}
    </div>
  );
}
