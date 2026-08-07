'use client';

import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isToday, isTomorrow, addDays } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { ShiftWeekView } from '@/components/employee/shifts/shift-week-view';
import { cn } from '@/lib/utils';

function fmtShiftTime(t: string) {
  try { return format(parseISO(`1970-01-01T${t}`), 'hh:mm a'); } catch { return t; }
}

function dayLabel(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, d MMM');
  } catch { return dateStr; }
}

export function PortalShifts() {
  const now = new Date();

  const { data: upcoming, isLoading } = useQuery({
    queryKey: ['employee-shift-schedule-14'],
    queryFn: () => employeeApi.getShiftSchedule({
      from: format(now, 'yyyy-MM-dd'),
      to:   format(addDays(now, 14), 'yyyy-MM-dd'),
    }),
    staleTime: 5 * 60_000,
  });

  const shifts = upcoming ?? [];

  const statusMap: Record<string, { label: string; cls: string }> = {
    scheduled: { label: 'Scheduled', cls: 'bg-gray-100   text-gray-600'   },
    completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
    absent:    { label: 'Absent',    cls: 'bg-red-50     text-red-600'     },
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex h-14 items-center border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Schedule</h1>
      </div>

      <div className="p-6 space-y-5 max-w-[1100px]">
        {/* Week view widget */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-4">This Week</p>
          <ShiftWeekView />
        </div>

        {/* Upcoming shifts table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Upcoming — Next 14 Days
            </p>
          </div>

          <div className="grid grid-cols-5 px-5 py-2 bg-gray-50 border-b border-gray-100">
            {['Day', 'Date', 'Shift', 'Hours', 'Status'].map((col) => (
              <p key={col} className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{col}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 px-5 py-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ))
            ) : shifts.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                No upcoming shifts scheduled
              </div>
            ) : shifts.map((s) => {
              const st = statusMap[s.status] ?? { label: s.status, cls: 'bg-gray-100 text-gray-500' };
              const d = parseISO(s.date);
              const todayRow = isToday(d);
              return (
                <div
                  key={s.id}
                  className={cn(
                    'grid grid-cols-5 px-5 py-3 items-center',
                    todayRow ? 'bg-primary/5' : 'hover:bg-gray-50',
                  )}
                >
                  <p className={cn('text-[12px] font-semibold', todayRow ? 'text-primary' : 'text-gray-700')}>
                    {format(d, 'EEEE')}
                    {todayRow && <span className="ml-1.5 text-[10px] bg-primary text-white px-1.5 py-0.5 rounded">Today</span>}
                  </p>
                  <p className="text-[12px] text-gray-600">{format(d, 'd MMM yyyy')}</p>
                  <p className="text-[12px] font-medium text-gray-800 truncate pr-2">{s.shift_name}</p>
                  <p className="text-[12px] text-gray-500">
                    {fmtShiftTime(s.start_time)} – {fmtShiftTime(s.end_time)}
                  </p>
                  <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full w-fit', st.cls)}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
