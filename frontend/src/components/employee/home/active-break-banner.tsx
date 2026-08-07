'use client';

import { useEffect, useState } from 'react';
import { LogIn, Coffee, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CurrentBreakSession } from '@/types/employee';

interface ActiveBreakBannerProps {
  currentBreak: CurrentBreakSession;
  onReturn: () => void;
  isSubmitting?: boolean;
}

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ActiveBreakBanner({ currentBreak, onReturn, isSubmitting }: ActiveBreakBannerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startedAt = new Date(currentBreak.started_at).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const allowedSeconds = currentBreak.allowed_minutes != null ? currentBreak.allowed_minutes * 60 : null;
  const remainingSeconds = allowedSeconds != null ? allowedSeconds - elapsedSeconds : null;
  const isOverdue = remainingSeconds != null && remainingSeconds < 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 mb-4',
        isOverdue ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : (
            <Coffee className="h-4 w-4 text-amber-600" />
          )}
          <span className={cn('text-sm font-semibold', isOverdue ? 'text-red-700' : 'text-amber-700')}>
            On {currentBreak.reason_label}
          </span>
        </div>
        <span className={cn('text-lg font-bold tabular-nums', isOverdue ? 'text-red-700' : 'text-amber-700')}>
          {formatDuration(elapsedSeconds)}
        </span>
      </div>

      {currentBreak.note && (
        <p className="text-xs text-muted-foreground mb-2">"{currentBreak.note}"</p>
      )}

      <p className={cn('text-xs mb-3', isOverdue ? 'text-red-600' : 'text-amber-600')}>
        {allowedSeconds == null
          ? 'No time limit for this break type.'
          : isOverdue
            ? `Over the allowed ${currentBreak.allowed_minutes}m limit by ${formatDuration(-remainingSeconds!)}`
            : `${formatDuration(remainingSeconds!)} remaining of ${currentBreak.allowed_minutes}m allowed`}
      </p>

      <button
        onClick={onReturn}
        disabled={isSubmitting}
        className={cn(
          'w-full flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm transition-all active:scale-95',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          isSubmitting && 'opacity-70 cursor-not-allowed',
        )}
      >
        {isSubmitting ? (
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            <span>Back from Break</span>
          </>
        )}
      </button>
    </div>
  );
}
