'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { SkeletonRow } from '@/components/employee/shared/skeleton-card';
import { EmptyState } from '@/components/employee/shared/empty-state';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

const statusStyle: Record<string, { dot: string; label: string; text: string }> = {
  present:  { dot: 'bg-emerald-500', label: 'Present',  text: 'text-emerald-700' },
  late:     { dot: 'bg-orange-400',  label: 'Late',     text: 'text-orange-700'  },
  half_day: { dot: 'bg-amber-400',   label: 'Half Day', text: 'text-amber-700'   },
  absent:   { dot: 'bg-red-500',     label: 'Absent',   text: 'text-red-700'     },
};

export function AttendanceHistoryList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['employee-attendance-history', 'infinite'],
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

  const fmt = (t: string | null | undefined) =>
    t ? format(parseISO(t), 'hh:mm a') : '--:--';

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4">
            <SkeletonRow />
          </div>
        ))}
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState title="No records found" subtitle="Your attendance history will appear here." />
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {records.map((r) => {
          const s = statusStyle[r.status] ?? { dot: 'bg-muted', label: r.status, text: 'text-muted-foreground' };
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', s.dot)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {format(parseISO(r.date), 'EEE, d MMM')}
                </p>
                {r.shift_name && (
                  <p className="text-[11px] text-muted-foreground">{r.shift_name}</p>
                )}
              </div>
              <div className="text-right">
                <p className={cn('text-xs font-semibold', s.text)}>{s.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmt(r.clock_in)} – {fmt(r.clock_out)}
                </p>
              </div>
              {r.late_minutes > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <AlertCircle className="h-3 w-3 text-orange-400" />
                  <span className="text-[10px] text-orange-600">{r.late_minutes}m</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full mt-3 h-10 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
