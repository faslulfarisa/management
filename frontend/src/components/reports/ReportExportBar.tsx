'use client';

import { FileText, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReportExportBarProps {
  onExportCsv?: () => void;
  onExportXlsx?: () => void;
  onExportPdf?: () => void;
  onRefresh?: () => void;
  disabled?: boolean;
  loading?: boolean;
  total?: number;
  className?: string;
}

export function ReportExportBar({
  onExportCsv,
  onExportXlsx,
  onExportPdf,
  onRefresh,
  disabled,
  loading,
  total,
  className,
}: ReportExportBarProps) {
  const btnCls = cn(
    'flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-xl px-3 py-1.5 transition-all',
    'hover:text-primary hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed',
  );
  const isDisabled = disabled || !total;

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {total != null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString('en-IN')} record{total !== 1 ? 's' : ''}
        </span>
      )}

      <div className="flex-1" />

      {onExportXlsx && (
        <button onClick={onExportXlsx} disabled={isDisabled} className={btnCls}>
          <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
          <span className="hidden sm:inline">Excel</span>
        </button>
      )}

      {onExportCsv && (
        <button onClick={onExportCsv} disabled={isDisabled} className={btnCls}>
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      )}

      {onExportPdf && (
        <button onClick={onExportPdf} disabled={isDisabled} className={btnCls}>
          <FileText className="w-3.5 h-3.5 text-red-500" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          className={cn(btnCls, loading && 'opacity-60')}
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      )}
    </div>
  );
}
