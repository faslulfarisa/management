'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { employeeApi } from '@/lib/employee-api';

export function LeaveBalanceStrip() {
  const { data: balances, isLoading } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-shrink-0 w-28 h-20 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (!balances?.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-semibold text-foreground">Leave Balance</p>
        <Link href="/leave" className="text-xs font-medium text-primary hover:underline">
          Apply leave
        </Link>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {balances.map((b) => (
          <div
            key={b.leave_type_id}
            className="flex-shrink-0 w-28 rounded-xl border border-border bg-card p-3 space-y-1.5"
          >
            <p className="text-[11px] font-medium text-muted-foreground leading-tight line-clamp-2">
              {b.leave_type_name}
            </p>
            <p className="text-2xl font-bold text-foreground leading-none">{b.available}</p>
            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${b.allocated > 0 ? Math.round((b.available / b.allocated) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{b.used}/{b.allocated} used</p>
          </div>
        ))}
      </div>
    </div>
  );
}
