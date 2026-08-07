'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { employeeApi } from '@/lib/employee-api';
import { LeaveApplySheet } from '@/components/employee/leave/leave-apply-sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const leaveStatusMap: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-50   text-amber-700',   Icon: Clock        },
  approved:  { label: 'Approved',  cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  rejected:  { label: 'Rejected',  cls: 'bg-red-50     text-red-700',     Icon: XCircle      },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100   text-gray-500',    Icon: AlertCircle  },
};

const balanceColors = [
  { bg: 'bg-blue-50',    bar: 'bg-blue-500',   text: 'text-blue-700'   },
  { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-amber-50',   bar: 'bg-amber-400',   text: 'text-amber-700'  },
  { bg: 'bg-purple-50',  bar: 'bg-purple-500',  text: 'text-purple-700' },
];

export function PortalLeave() {
  const [applyOpen, setApplyOpen] = useState(false);

  const { data: balances, isLoading: loadingBalances } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['employee-leave-history'],
    queryFn: () => employeeApi.getLeaveHistory({ limit: 30 }),
    staleTime: 5 * 60_000,
  });

  const history = historyData?.data ?? [];

  return (
    <div>
      {/* Sticky page header */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
        <h1 className="text-[15px] font-bold text-gray-900">My Leave</h1>
        <Button size="sm" onClick={() => setApplyOpen(true)} className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Apply Leave
        </Button>
      </div>

      <div className="p-6 space-y-5 max-w-[1200px]">
        {/* Leave balance cards */}
        {loadingBalances ? (
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-white border border-gray-200 animate-pulse" />)}
          </div>
        ) : balances?.length ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {balances.map((b, idx) => {
              const pct = b.allocated > 0 ? Math.round((b.available / b.allocated) * 100) : 0;
              const c = balanceColors[idx % balanceColors.length];
              return (
                <div key={b.leave_type_id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-[11px] font-medium text-gray-400 mb-2 line-clamp-2">{b.leave_type_name}</p>
                  <p className={cn('text-3xl font-bold', c.text)}>{b.available}</p>
                  <p className="text-[11px] text-gray-400 mb-2">of {b.allocated} days</p>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div className={cn('h-full rounded-full transition-all', c.bar)} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{b.used} used</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-400">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-gray-800">No leave policy template assigned</p>
            <p className="mt-1 text-xs text-gray-500">
              Please contact HR to assign a leave policy template before applying for leave.
            </p>
          </div>
        )}

        {/* Leave history table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Leave History</p>
            <p className="text-[11px] text-gray-400">{history.length} requests</p>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-6 px-5 py-2 bg-gray-50 border-b border-gray-100">
            {['Type', 'From', 'To', 'Days', 'Reason', 'Status'].map((col) => (
              <p key={col} className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{col}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {loadingHistory ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-6 px-5 py-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ))
            ) : history.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                No leave requests yet
              </div>
            ) : history.map((r) => {
              const s = leaveStatusMap[r.status];
              const Icon = s?.Icon ?? Clock;
              return (
                <div key={r.id} className="grid grid-cols-6 px-5 py-3 hover:bg-gray-50 transition-colors items-center">
                  <p className="text-[12px] font-medium text-gray-800 truncate pr-2">{r.leave_type_name}</p>
                  <p className="text-[12px] text-gray-600">{format(parseISO(r.start_date), 'd MMM yyyy')}</p>
                  <p className="text-[12px] text-gray-600">{format(parseISO(r.end_date), 'd MMM yyyy')}</p>
                  <p className="text-[12px] font-semibold text-gray-800">{r.days}d</p>
                  <p className="text-[12px] text-gray-400 truncate pr-2">{r.reason}</p>
                  <div>
                    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full', s?.cls ?? 'bg-gray-100 text-gray-500')}>
                      <Icon className="h-3 w-3" />
                      {s?.label ?? r.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <LeaveApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
