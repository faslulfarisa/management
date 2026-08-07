'use client';

import { useState } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
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
import { FilePen, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { AttendanceCalendar } from '@/components/employee/attendance/attendance-calendar';
import { CorrectionRequestSheet } from '@/components/employee/attendance/correction-request-sheet';
import { AttendanceTimeline } from '@/components/employee/home/attendance-timeline';
import { BreakSummary } from '@/components/employee/home/break-summary';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const statusMap: Record<string, { label: string; dot: string; text: string; Icon: React.ElementType }> = {
  present:  { label: 'Present',  dot: 'bg-emerald-500', text: 'text-emerald-600', Icon: CheckCircle2 },
  late:     { label: 'Late',     dot: 'bg-amber-400',   text: 'text-amber-600',   Icon: AlertCircle  },
  half_day: { label: 'Half Day', dot: 'bg-orange-400',  text: 'text-orange-600',  Icon: Clock        },
  absent:   { label: 'Absent',   dot: 'bg-red-500',     text: 'text-red-600',     Icon: XCircle      },
};

function fmtTime(t: string | null | undefined) {
  if (!t) return '—';
  try { return format(parseISO(t), 'hh:mm a'); } catch { return '—'; }
}

function dateKey(date: string) {
  return date.split('T')[0];
}

function resolveSummaryStatus(record: any | undefined, inferredAbsent: boolean) {
  if (!record?.status) return inferredAbsent ? 'absent' : null;
  if (record.status === 'absent' || record.status === 'half_day') return record.status;
  if (record.status === 'late' || Number(record.late_minutes ?? 0) > 0) return 'late';
  return 'present';
}

import { useEmployeeAttendanceStats } from '@/hooks/use-employee-attendance-stats';

export function PortalAttendance() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const { summary, pct } = useEmployeeAttendanceStats(month, year);

  const { data: today } = useQuery({
    queryKey: ['employee-today-attendance'],
    queryFn: () => employeeApi.getTodayAttendance(),
    staleTime: 30_000,
  });

  const { data: breaksData } = useQuery({
    queryKey: ['employee-today-breaks'],
    queryFn: () => employeeApi.getTodayBreaks(),
    staleTime: 30_000,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['employee-attendance-history-desktop'],
      queryFn: ({ pageParam = 1 }) =>
        employeeApi.getAttendanceHistory({ page: pageParam as number, limit: PAGE_SIZE }),
      getNextPageParam: (last, pages) =>
        last?.total != null && pages != null && last.total > pages.length * PAGE_SIZE
          ? pages.length + 1
          : undefined,
      initialPageParam: 1,
      staleTime: 5 * 60_000,
    });

  const records = data?.pages.flatMap((p) => p?.data ?? []) ?? [];

  return (
    <div>
      {/* Sticky page header */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Attendance</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="h-8 gap-1.5 text-xs"
        >
          <FilePen className="h-3.5 w-3.5" />
          Request Correction
        </Button>
      </div>

      <div className="p-6 space-y-5 max-w-[1200px]">
        {/* Stats row */}
        {summary && (
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'Present',      value: summary.present,             color: 'text-emerald-600', dot: 'bg-emerald-500' },
              { label: 'Late',         value: summary.late,                color: 'text-amber-600',   dot: 'bg-amber-400'   },
              { label: 'Absent',       value: summary.absent,              color: 'text-red-600',     dot: 'bg-red-500'     },
              { label: 'Half Days',    value: summary.half_day,            color: 'text-orange-600',  dot: 'bg-orange-400'  },
              { label: 'OT Hours',     value: `${summary.overtime_hours?.toFixed(1) ?? 0}h`, color: 'text-primary', dot: 'bg-primary' },
            ].map(({ label, value, color, dot }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', dot)} />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                </div>
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
                {label === 'Present' && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{pct}% of {summary.total_working_days} working days</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Today's timeline + break usage */}
        {today && breaksData && (today.is_on_break || today.current_break || (breaksData.breaks?.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AttendanceTimeline today={today} breaks={breaksData.breaks} />
            <BreakSummary breaks={breaksData.breaks} limits={breaksData.limits} />
          </div>
        )}

        {/* Calendar + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                {format(now, 'MMMM yyyy')} Calendar
              </p>
              <AttendanceCalendar
                onDayPress={(date) => { setPrefillDate(date); setSheetOpen(true); }}
              />
            </div>
          </div>

          {/* History table */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Attendance Records</p>
                <p className="text-[11px] text-gray-400">{records.length} records</p>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-5 gap-0 px-4 py-2 bg-gray-50 border-b border-gray-100">
                {['Date', 'Shift', 'In', 'Out', 'Status'].map((col) => (
                  <p key={col} className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{col}</p>
                ))}
              </div>

              {/* Table rows */}
              <div className="divide-y divide-gray-50">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-5 gap-0 px-4 py-2.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <div key={j} className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  ))
                ) : records.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-gray-400">
                    No attendance records found
                  </div>
                ) : records.map((r) => {
                  const s = statusMap[r.status];
                  return (
                    <div key={r.id} className="grid grid-cols-5 gap-0 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                      <p className="text-[12px] font-medium text-gray-800">
                        {format(parseISO(r.date), 'EEE, d MMM')}
                      </p>
                      <p className="text-[12px] text-gray-500 truncate pr-2">{r.shift_name ?? '—'}</p>
                      <p className="text-[12px] text-gray-700">{fmtTime(r.clock_in)}</p>
                      <p className="text-[12px] text-gray-700">{fmtTime(r.clock_out)}</p>
                      <div className="flex items-center gap-1.5">
                        <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', s?.dot ?? 'bg-gray-300')} />
                        <span className={cn('text-[12px] font-medium', s?.text ?? 'text-gray-500')}>
                          {s?.label ?? r.status}
                          {r.late_minutes > 0 && ` +${r.late_minutes}m`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasNextPage && (
                <div className="border-t border-gray-100 p-3">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="w-full h-8 rounded-lg bg-gray-50 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'Loading…' : 'Load more records'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CorrectionRequestSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setPrefillDate(undefined); }}
        prefillDate={prefillDate}
      />
    </div>
  );
}
