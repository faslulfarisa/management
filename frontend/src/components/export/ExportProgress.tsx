'use client';

import { Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ExportStatus = 'idle' | 'preparing' | 'success' | 'error';

interface ExportProgressProps {
  status: ExportStatus;
  error?: string | null;
  recordCount?: number;
  onRetry?: () => void;
  onClose?: () => void;
}

export function ExportProgress({ status, error, recordCount, onRetry, onClose }: ExportProgressProps) {
  if (status === 'idle') return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all',
        status === 'preparing' && 'bg-blue-50/50 border-blue-200',
        status === 'success' && 'bg-green-50/50 border-green-200',
        status === 'error' && 'bg-red-50/50 border-red-200',
      )}
    >
      {status === 'preparing' && (
        <>
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-800">Preparing Export...</p>
            <p className="text-[11px] text-blue-600/80">
              {recordCount ? `Exporting ${recordCount.toLocaleString('en-IN')} records` : 'Please wait'}
            </p>
          </div>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-800">Export Complete</p>
            <p className="text-[11px] text-green-600/80">
              {recordCount
                ? `${recordCount.toLocaleString('en-IN')} records exported successfully`
                : 'Your download should begin shortly'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-medium text-green-700 hover:text-green-900 px-2 py-1 rounded-md hover:bg-green-100 transition-colors"
            >
              Done
            </button>
          )}
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-800">Export Failed</p>
            <p className="text-[11px] text-red-600/80 truncate">{error || 'An unexpected error occurred'}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1 text-[11px] font-medium text-red-700 hover:text-red-900 px-2 py-1 rounded-md hover:bg-red-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}
