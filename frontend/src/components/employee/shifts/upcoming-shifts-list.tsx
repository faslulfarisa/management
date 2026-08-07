'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { employeeApi } from '@/lib/employee-api';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { Calendar } from 'lucide-react';

export function UpcomingShiftsList() {
  const from = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const to = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['employee-shifts-upcoming', from, to],
    queryFn: () => employeeApi.getShiftSchedule({ from, to }),
    staleTime: 10 * 60_000,
  });

  const fmtTime = (t: string) => {
    try { return format(parseISO(`1970-01-01T${t}`), 'h:mm a'); }
    catch { return t; }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  const upcoming = (shifts ?? []).filter((s: any) => s.status === 'scheduled');

  if (!upcoming.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No upcoming shifts"
          subtitle="Your schedule for the next 14 days is clear."
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
      {upcoming.map((s: any) => (
        <div key={s.id} className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-shrink-0 w-12 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">
              {format(parseISO(s.date), 'EEE')}
            </p>
            <p className="text-base font-bold text-foreground leading-tight">
              {format(parseISO(s.date), 'd')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {format(parseISO(s.date), 'MMM')}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{s.shift_name}</p>
            <p className="text-xs text-muted-foreground">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
