import { useQuery } from '@tanstack/react-query';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isFuture,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { employeeApi } from '@/lib/employee-api';

function dateKey(date: string) {
  try {
    return format(parseISO(date), 'yyyy-MM-dd');
  } catch {
    return date.split('T')[0];
  }
}

function resolveSummaryStatus(record: any | undefined, inferredAbsent: boolean) {
  if (!record?.status) return inferredAbsent ? 'absent' : null;
  if (record.status === 'absent' || record.status === 'half_day') return record.status;
  if (record.status === 'late' || Number(record.late_minutes ?? 0) > 0) return 'late';
  return 'present';
}

export function useEmployeeAttendanceStats(month: number, year: number) {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const dateFrom = format(monthStart, 'yyyy-MM-dd');
  const dateTo = format(monthEnd, 'yyyy-MM-dd');

  const { data: apiSummary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['employee-attendance-summary', month, year],
    queryFn: () => employeeApi.getAttendanceSummary(month, year),
    staleTime: 5 * 60_000,
  });

  const { data: monthHistory, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['employee-attendance-history', dateFrom, dateTo],
    queryFn: () => employeeApi.getAttendanceHistory({ date_from: dateFrom, date_to: dateTo, limit: 31 }),
    staleTime: 5 * 60_000,
  });

  const { data: employeeProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: employeeApi.getProfile,
    staleTime: 5 * 60_000,
  });

  const { data: holidays, isLoading: isHolidaysLoading } = useQuery({
    queryKey: ['employee-holidays', dateFrom, dateTo],
    queryFn: () => employeeApi.getHolidays({ date_from: dateFrom, date_to: dateTo }),
    staleTime: 5 * 60_000,
  });

  const isLoading = isSummaryLoading || isHistoryLoading || isProfileLoading || isHolidaysLoading;

  const summary = (() => {
    const recordsByDate = new Map((monthHistory?.data ?? []).map((record) => [dateKey(record.date), record]));
    const holidaysByDate = new Set((holidays ?? []).map((holiday) => dateKey(holiday.date)));
    let joiningDate: Date | null = null;

    try {
      joiningDate = employeeProfile?.date_of_joining
        ? startOfDay(parseISO(employeeProfile.date_of_joining))
        : null;
    } catch {
      joiningDate = null;
    }

    const counts = eachDayOfInterval({ start: monthStart, end: monthEnd }).reduce(
      (acc, day) => {
        const key = format(day, 'yyyy-MM-dd');
        const record = recordsByDate.get(key);
        const holiday = holidaysByDate.has(key);
        const weeklyOff = getDay(day) === 0; // Only Sundays are Weekly Off
        const future = isFuture(day) && !isToday(day);
        const todayDay = isToday(day);
        const beforeJoining = joiningDate ? isBefore(startOfDay(day), joiningDate) : false;

        let status: string | null = null;

        if (record?.status) {
          // 1. Present (Green): Attendance record exists
          status = resolveSummaryStatus(record, false);
        } else if (future || beforeJoining) {
          // 5. Future/Inactive: Should remain faded/null and not affect stats
          status = null;
        } else if (holiday) {
          // 2. Holiday (Cyan): No record, but exists in Holiday Policy
          // Saturdays only become holiday if explicitly configured in policy (caught by 'holiday')
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
        if (status === 'half_day') acc.half_day += 1;
        acc.overtime_hours += Number(record?.overtime_minutes ?? 0) / 60;
        return acc;
      },
      { present: 0, late: 0, absent: 0, half_day: 0, overtime_hours: 0 },
    );

    const totalWorkingDays = counts.present + counts.absent + counts.half_day;
    return {
      present: counts.present,
      late: counts.late,
      absent: counts.absent || apiSummary?.absent || 0,
      half_day: counts.half_day,
      total_working_days: totalWorkingDays || apiSummary?.total_working_days || 0,
      overtime_hours: counts.overtime_hours || apiSummary?.overtime_hours || 0,
      total_work_hours: apiSummary?.total_work_hours || 0,
    };
  })();

  const pct = summary && summary.total_working_days > 0
    ? Math.round(((summary.present) / summary.total_working_days) * 100)
    : 0;

  return { summary, pct, isLoading };
}
