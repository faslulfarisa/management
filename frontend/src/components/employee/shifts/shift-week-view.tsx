'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfWeek, parseISO, isToday } from 'date-fns';
import { employeeApi } from '@/lib/employee-api';
import type { EmployeeShift } from '@/types/employee';
import { cn } from '@/lib/utils';

export function ShiftWeekView() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['employee-shifts-week', from, to],
    queryFn: () => employeeApi.getShiftSchedule({ from, to }),
    staleTime: 10 * 60_000,
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const shiftByDate: Record<string, EmployeeShift> = {};
  (shifts ?? []).forEach((s) => { shiftByDate[s.date] = s; });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This Week</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">
          {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM yyyy')}
        </p>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const shift = shiftByDate[dateStr];
            const todayDay = isToday(day);

            const fmtTime = (t: string) => {
              try { return format(parseISO(`1970-01-01T${t}`), 'h:mma'); }
              catch { return t; }
            };

            return (
              <div
                key={dateStr}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  todayDay && 'bg-primary/5',
                )}
              >
                <div className={cn(
                  'flex flex-col items-center w-10 flex-shrink-0',
                  todayDay ? 'text-primary' : 'text-muted-foreground',
                )}>
                  <p className="text-[10px] font-medium uppercase">{format(day, 'EEE')}</p>
                  <p className={cn('text-base font-bold leading-tight', todayDay && 'text-primary')}>
                    {format(day, 'd')}
                  </p>
                </div>

                {shift ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{shift.shift_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(shift.start_time)} – {fmtTime(shift.end_time)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/60">Off</p>
                )}

                {shift?.status && (
                  <div className={cn(
                    'h-2 w-2 rounded-full flex-shrink-0',
                    shift.status === 'completed' ? 'bg-emerald-500'
                    : shift.status === 'absent'   ? 'bg-red-400'
                    : 'bg-muted',
                  )} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
