'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { employeeApi } from '@/lib/employee-api';

export function ShiftSummaryCard() {
  const { data: shift, isLoading } = useQuery({
    queryKey: ['employee-today-shift'],
    queryFn: () => employeeApi.getTodayShift(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 animate-pulse">
        <div className="h-3.5 w-1/4 rounded bg-muted mb-3" />
        <div className="h-5 w-1/2 rounded bg-muted mb-2" />
        <div className="h-3.5 w-3/5 rounded bg-muted" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <Calendar className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No shift today</p>
          <p className="text-xs text-muted-foreground">Enjoy your day off</p>
        </div>
      </div>
    );
  }

  const fmt = (t: string) => {
    try {
      return format(parseISO(`1970-01-01T${t}`), 'hh:mm a');
    } catch {
      return t;
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
        <Clock className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Shift</p>
        <p className="text-sm font-semibold text-foreground truncate mt-0.5">{shift.shift_name}</p>
        <p className="text-xs text-muted-foreground">
          {fmt(shift.start_time)} – {fmt(shift.end_time)}
          {shift.break_minutes ? ` · ${shift.break_minutes}m break` : ''}
        </p>
      </div>
      {shift.grace_period_minutes != null && shift.grace_period_minutes > 0 && (
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Grace</p>
          <p className="text-sm font-semibold text-foreground">{shift.grace_period_minutes}m</p>
        </div>
      )}
    </div>
  );
}
