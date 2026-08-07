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

type CalendarStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday';

const CALENDAR_STATUS_STYLES: Record<CalendarStatus, string> = {
  present: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100',
  absent: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
  late: 'bg-white text-slate-700 border-red-300 hover:bg-red-50',
  half_day: 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100',
  holiday: 'bg-cyan-50 text-cyan-700 border-cyan-100 hover:bg-cyan-100',
};

function getRecordDateKey(date: string) {
  try {
    return format(parseISO(date), 'yyyy-MM-dd');
  } catch {
    return date.split('T')[0];
  }
}

function resolveCalendarStatus(record: EmployeeAttendanceRecord | undefined, inferredAbsent: boolean): CalendarStatus | null {
  if (!record?.status) return inferredAbsent ? 'absent' : null;
  if (record.status === 'absent' || record.status === 'half_day') return record.status;
  if (record.status === 'late' || record.late_minutes > 0) return 'late';
  return 'present';
}

export function AttendanceCalendar({ onDayPress }: CalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(today);

  const monthStart = useMemo(() => startOfMonth(viewDate), [viewDate]);
  const monthEnd = useMemo(() => endOfMonth(viewDate), [viewDate]);
  const dateFrom = format(monthStart, 'yyyy-MM-dd');
  const dateTo = format(monthEnd, 'yyyy-MM-dd');

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['employee-attendance-history', dateFrom, dateTo],
    queryFn: () => employeeApi.getAttendanceHistory({ date_from: dateFrom, date_to: dateTo, limit: 31 }),
    staleTime: 5 * 60_000,
  });

  const { data: employeeProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: employeeApi.getProfile,
    staleTime: 5 * 60_000,
  });

  const { data: holidaysData, isLoading: isHolidaysLoading } = useQuery({
    queryKey: ['employee-holidays', dateFrom, dateTo],
    queryFn: () => employeeApi.getHolidays({ date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60_000,
  });

  const recordsByDate = useMemo(() => {
    const map: Record<string, EmployeeAttendanceRecord> = {};
    (historyData?.data ?? []).forEach((r) => { map[getRecordDateKey(r.date)] = r; });
    return map;
  }, [historyData]);

  const holidaysByDate = useMemo(() => {
    const map: Record<string, { name: string; type: string }> = {};
    (holidaysData ?? []).forEach((holiday) => { map[getRecordDateKey(holiday.date)] = holiday; });
    return map;
  }, [holidaysData]);

  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);
  const startPad = getDay(monthStart); // 0 = Sun

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

  const summary = useMemo(() => {
    return days.reduce(
      (acc, day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const record = recordsByDate[dateStr];
        const holiday = holidaysByDate[dateStr];
        const weeklyOff = getDay(day) === 0; // Only Sundays are Weekly Off
        const future = isFuture(day) && !isToday(day);
        const todayDay = isToday(day);
        const beforeJoining = joiningDate ? isBefore(startOfDay(day), joiningDate) : false;

        let status: CalendarStatus | null = null;
        
        if (record?.status) {
          // 1. Present (Green): Attendance record exists
          status = resolveCalendarStatus(record, false);
        } else if (future || beforeJoining) {
          // 5. Future/Inactive: Should remain faded/null and not affect stats
          status = null;
        } else if (holiday) {
          // 2. Holiday (Cyan): No record, but exists in Holiday Policy
          status = 'holiday';
        } else if (weeklyOff) {
          // 3. Weekly Off (Cyan): Only Sundays
          status = 'holiday';
        } else if (!todayDay) {
          // 4. Absent (Red): Past working day (Mon-Sat), not holiday, after joining, no record
          status = 'absent';
        } else {
          // Today, no record yet
          status = null;
        }

        if (status === 'present' || status === 'late') acc.present += 1;
        if (status === 'late') acc.late += 1;
        if (status === 'absent') acc.absent += 1;
        if (status === 'half_day') acc.half += 1;
        if (status === 'holiday') acc.holiday += 1;

        return acc;
      },
      { present: 0, late: 0, absent: 0, half: 0, holiday: 0 },
    );
  }, [days, holidaysByDate, joiningDate, recordsByDate]);

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
      {isLoading || isProfileLoading || isHolidaysLoading ? (
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
            const holiday = holidaysByDate[dateStr];
            const weeklyOff = getDay(day) === 0; // Only Sundays are Weekly Off
            const future = isFuture(day) && !isToday(day);
            const todayDay = isToday(day);
            const beforeJoining = joiningDate ? isBefore(startOfDay(day), joiningDate) : false;
            
            let calendarStatus: CalendarStatus | null = null;
            if (record?.status) {
              calendarStatus = resolveCalendarStatus(record, false);
            } else if (future || beforeJoining) {
              calendarStatus = null;
            } else if (holiday) {
              calendarStatus = 'holiday';
            } else if (weeklyOff) {
              calendarStatus = 'holiday';
            } else if (!todayDay) {
              calendarStatus = 'absent';
            } else {
              calendarStatus = null;
            }

            const disabled = future || beforeJoining;
            const ariaLabel = beforeJoining
              ? `${format(day, 'd MMM yyyy')} - before joining`
              : holiday && !record?.status
                ? `${format(day, 'd MMM yyyy')} - ${holiday.name}`
              : weeklyOff && !record?.status
                ? `${format(day, 'd MMM yyyy')} - weekly off`
              : calendarStatus
                ? `${format(day, 'd MMM yyyy')} - ${calendarStatus.replace('_', ' ')}`
                : format(day, 'd MMM yyyy');

            return (
              <button
                key={dateStr}
                onClick={() => !disabled && onDayPress?.(dateStr)}
                disabled={disabled}
                aria-label={ariaLabel}
                title={ariaLabel}
                className={cn(
                  'relative flex items-center justify-center h-8 w-full rounded-lg border-2 border-transparent text-xs font-medium transition-colors',
                  calendarStatus ? CALENDAR_STATUS_STYLES[calendarStatus] : '',
                  !record?.status && todayDay ? 'ring-2 ring-primary text-primary' : '',
                  !calendarStatus && !disabled && !todayDay ? 'text-foreground hover:bg-muted' : '',
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
      <div className="grid grid-cols-5 border-t border-border divide-x divide-border">
        {[
          { label: 'Present', value: summary.present, color: 'text-emerald-600' },
          { label: 'Late',    value: summary.late,    color: 'text-red-600'     },
          { label: 'Absent',  value: summary.absent,  color: 'text-red-700'     },
          { label: 'Half',    value: summary.half,    color: 'text-orange-600'  },
          { label: 'Holiday', value: summary.holiday, color: 'text-cyan-600'    },
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
