'use client';

import { useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Filter, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExportConfig, ExportFormat, ExportScope, ActiveFilter } from './types';
import { ColumnSelector } from './ColumnSelector';
import { FormatSelector } from './FormatSelector';
import { ExportProgress, type ExportStatus } from './ExportProgress';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ExportConfig;
  filters?: Record<string, any>;
  activeFilters?: ActiveFilter[];
  currentPageData?: any[];
  totalRecords?: number;
  onExport: (opts: {
    format: ExportFormat;
    scope: ExportScope;
    selectedColumns: string[];
    ignoreFilters?: boolean;
  }) => Promise<void>;
}

const SCOPE_OPTIONS: { value: ExportScope; label: string; desc: string }[] = [
  { value: 'filtered', label: 'Filtered Records', desc: 'Export data matching current filters' },
  { value: 'current_page', label: 'Current Page', desc: 'Export only the rows visible on this page' },
  { value: 'all', label: 'All Records', desc: 'Export all records (ignoring filters)' },
];

export function ExportDialog({
  open,
  onOpenChange,
  config,
  activeFilters,
  currentPageData,
  totalRecords,
  onExport,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [scope, setScope] = useState<ExportScope>('filtered');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    config.defaultColumns || config.columns.map((c) => c.key),
  );
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const hasFilters = activeFilters && activeFilters.length > 0;
  const recordLabel = totalRecords != null ? `${totalRecords.toLocaleString('en-IN')} total records` : null;
  const pageLabel = currentPageData ? `${currentPageData.length} rows on this page` : null;

  const handleExport = useCallback(async () => {
    if (selectedColumns.length === 0) return;
    setStatus('preparing');
    setError(null);
    try {
      await onExport({
        format,
        scope,
        selectedColumns,
        ignoreFilters: scope === 'all',
      });
      setStatus('success');
    } catch (err: any) {
      setError(err?.message || 'Export failed');
      setStatus('error');
    }
  }, [format, scope, selectedColumns, onExport]);

  const handleClose = () => {
    setStatus('idle');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            Export {config.title}
          </DialogTitle>
          <DialogDescription>
            Choose format, scope, and columns for your export.
            {recordLabel && <span className="ml-1 tabular-nums">({recordLabel})</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Export Scope ─────────────────────────────────────────── */}
          <fieldset>
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Export Scope
            </legend>
            <div className="space-y-1.5">
              {SCOPE_OPTIONS.map((opt) => {
                const disabled = opt.value === 'current_page' && !currentPageData;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setScope(opt.value)}
                    className={cn(
                      'flex items-start gap-3 w-full text-left px-3 py-2 rounded-xl border transition-all',
                      scope === opt.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/20',
                      disabled && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all',
                        scope === opt.value
                          ? 'border-primary bg-primary'
                          : 'border-border',
                      )}
                    >
                      {scope === opt.value && (
                        <span className="block w-1.5 h-1.5 rounded-full bg-white mx-auto mt-[3px]" />
                      )}
                    </span>
                    <div>
                      <p className="text-xs font-medium">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                      {opt.value === 'current_page' && pageLabel && (
                        <p className="text-[10px] text-muted-foreground/70 tabular-nums">{pageLabel}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* ── Active Filters ──────────────────────────────────────── */}
          {hasFilters && scope !== 'all' && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/60">
              <Filter className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-amber-800">Active Filters Applied</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {activeFilters!.map((f) => (
                    <span
                      key={f.key}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium"
                    >
                      {f.label}: {f.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── File Format ─────────────────────────────────────────── */}
          <fieldset>
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              File Format
            </legend>
            <FormatSelector value={format} onChange={setFormat} />
          </fieldset>

          {/* ── Column Selection ────────────────────────────────────── */}
          <fieldset>
            <legend className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Columns
            </legend>
            <ColumnSelector
              columns={config.columns}
              selected={selectedColumns}
              onChange={setSelectedColumns}
              defaultColumns={config.defaultColumns}
            />
          </fieldset>

          {/* ── Progress / Status ───────────────────────────────────── */}
          <ExportProgress
            status={status}
            error={error}
            recordCount={scope === 'current_page' ? currentPageData?.length : totalRecords}
            onRetry={handleExport}
            onClose={handleClose}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={status === 'preparing'}>
            {status === 'success' ? 'Close' : 'Cancel'}
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedColumns.length === 0 || status === 'preparing' || status === 'success'}
          >
            {status === 'preparing' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" /> Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
