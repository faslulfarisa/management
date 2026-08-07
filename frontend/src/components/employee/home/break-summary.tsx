'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PUNCH_OUT_REASON_MAP } from '@/lib/punch-out-reasons';
import type { BreakLimit, BreakSession } from '@/types/employee';

interface BreakSummaryProps {
  breaks: BreakSession[];
  limits: Record<string, BreakLimit>;
}

interface BreakUsage {
  code: string;
  label: string;
  usedMinutes: number;
  allowedMinutes: number | null;
  overdueMinutes: number;
}

export function BreakSummary({ breaks, limits }: BreakSummaryProps) {
  const completed = breaks.filter((b) => b.status === 'completed');
  if (!completed.length) return null;

  const usageByCode = new Map<string, BreakUsage>();
  for (const b of completed) {
    const existing = usageByCode.get(b.break_code);
    const usedMinutes = b.duration_minutes ?? 0;
    if (existing) {
      existing.usedMinutes += usedMinutes;
      existing.overdueMinutes += b.overdue_minutes;
    } else {
      usageByCode.set(b.break_code, {
        code: b.break_code,
        label: limits[b.break_code]?.name ?? b.reason_label,
        usedMinutes,
        allowedMinutes: limits[b.break_code]?.allowed_minutes ?? b.allowed_minutes ?? null,
        overdueMinutes: b.overdue_minutes,
      });
    }
  }

  const usages = Array.from(usageByCode.values());

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Today's Break Usage
      </p>
      <div className="space-y-3">
        {usages.map((usage) => {
          const isOverdue = usage.overdueMinutes > 0;
          const pct = usage.allowedMinutes
            ? Math.min(100, Math.round((usage.usedMinutes / usage.allowedMinutes) * 100))
            : 0;
          return (
            <div key={usage.code}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-foreground">
                  {usage.label ?? PUNCH_OUT_REASON_MAP[usage.code]?.label ?? usage.code}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {usage.usedMinutes}m
                  {usage.allowedMinutes != null ? ` / ${usage.allowedMinutes}m` : ' (no limit)'}
                </span>
              </div>
              {usage.allowedMinutes != null && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', isOverdue ? 'bg-red-500' : 'bg-emerald-500')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {isOverdue ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  Exceeded by {usage.overdueMinutes}m
                </p>
              ) : usage.allowedMinutes != null ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Within allowed limit
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
