'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  format, isSameMonth, isToday, isFuture, parseISO, startOfDay, isBefore,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import type { EmployeeAttendanceRecord } from '@/types/employee';
import { cn } from '@/lib/utils';

interface CalendarProps {
  onDayPress?: (date: string) => void;
}

export function AttendanceCalendar({ onDayPress }: CalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(today);

  const month = viewDate.getMonth() + 1;
  const year = viewDate.getFullYear();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['employee-attendance-history', month, year],
    queryFn: () => employeeApi.getAttendanceHistory({ month, year, limit: 31 }),
    staleTime: 5 * 60_000,
  });

  const { data: employeeProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: employeeApi.getProfile,
    staleTime: 5 * 60_000,
  });

  const recordsByDate = useMemo(() => {
    const map: Record<string, EmployeeAttendanceRecord> = {};
    (historyData?.data ?? []).forEach((r) => { map[r.date] = r; });
    return map;
  }, [historyData]);

  const days = eachDayOfInterval({ start: startOfMonth(viewDate), end: endOfMonth(viewDate) });
  const startPad = getDay(startOfMonth(viewDate)); // 0 = Sun

  const statusStyle: Record<string, string> = {
    present:  'bg-emerald-500 text-white',
    late:     'bg-orange-400 text-white',
    half_day: 'bg-amber-400 text-white',
    absent:   'bg-red-400 text-white',
  };

  const joiningDate = useMemo(() => {
    if (!employeeProfile?.date_of_joining) return null;

    try {
      return startOfDay(parseISO(employeeProfile.date_of_joining));
    } catch {
      return null;
    }
  }, [employeeProfile?.date_of_joining]);

  const prev = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const next = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  // Summary counts
  const summary = useMemo(() => {
    const list = historyData?.data ?? [];
    return {
      present: list.filter(r => r.status === 'present').length,
      late:    list.filter(r => r.status === 'late').length,
      absent:  list.filter(r => r.status === 'absent').length,
      half:    list.filter(r => r.status === 'half_day').length,
    };
  }, [historyData]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={prev} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-foreground">{format(viewDate, 'MMMM yyyy')}</p>
        <button
          onClick={next}
          disabled={isSameMonth(viewDate, today)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground pb-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading || isProfileLoading ? (
        <div className="h-40 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1 px-2 pb-3">
          {/* Leading empty cells */}
          {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}

          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const record = recordsByDate[dateStr];
            const future = isFuture(day) && !isToday(day);
            const todayDay = isToday(day);
            const beforeJoining = joiningDate ? isBefore(startOfDay(day), joiningDate) : false;
            const inferredAbsent = !record?.status && !future && !todayDay && !beforeJoining;
            const disabled = future || beforeJoining;
            const ariaLabel = beforeJoining
              ? `${format(day, 'd MMM yyyy')} - before joining`
              : record?.status
                ? `${format(day, 'd MMM yyyy')} - ${record.status.replace('_', ' ')}`
                : inferredAbsent
                  ? `${format(day, 'd MMM yyyy')} - absent`
                  : format(day, 'd MMM yyyy');

            return (
              <button
                key={dateStr}
                onClick={() => !disabled && onDayPress?.(dateStr)}
                disabled={disabled}
                aria-label={ariaLabel}
                title={ariaLabel}
                className={cn(
                  'relative flex items-center justify-center h-8 w-full rounded-lg text-xs font-medium transition-colors',
                  record?.status ? statusStyle[record.status] : '',
                  inferredAbsent ? 'bg-red-50 text-red-500 hover:bg-red-100' : '',
                  !record?.status && todayDay ? 'ring-2 ring-primary text-primary' : '',
                  !record?.status && !inferredAbsent && !future && !todayDay && !beforeJoining ? 'text-foreground hover:bg-muted' : '',
                  disabled ? 'text-muted-foreground/30 cursor-default bg-muted/30' : '',
                )}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-4 border-t border-border divide-x divide-border">
        {[
          { label: 'Present', value: summary.present, color: 'text-emerald-600' },
          { label: 'Late',    value: summary.late,    color: 'text-orange-500'  },
          { label: 'Absent',  value: summary.absent,  color: 'text-red-500'     },
          { label: 'Half',    value: summary.half,    color: 'text-amber-500'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center py-2.5">
            <p className={cn('text-base font-bold', color)}>{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
