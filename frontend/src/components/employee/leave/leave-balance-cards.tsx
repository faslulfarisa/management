'use client';

import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '@/lib/employee-api';
import { SkeletonCard } from '@/components/employee/shared/skeleton-card';
import { cn } from '@/lib/utils';

const colors = [
  'from-primary/10 to-primary/5 border-primary/20',
  'from-emerald-50 to-emerald-50/50 border-emerald-200',
  'from-amber-50 to-amber-50/50 border-amber-200',
  'from-purple-50 to-purple-50/50 border-purple-200',
];

const accentColors = ['text-primary', 'text-emerald-700', 'text-amber-700', 'text-purple-700'];
const barColors = ['bg-primary', 'bg-emerald-500', 'bg-amber-400', 'bg-purple-500'];

export function LeaveBalanceCards() {
  const { data: balances, isLoading } = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => employeeApi.getLeaveBalances(),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    );
  }

  if (!balances?.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {balances.map((b, idx) => {
        const pct = b.allocated > 0 ? Math.round((b.available / b.allocated) * 100) : 0;
        const ci = idx % 4;
        return (
          <div
            key={b.leave_type_id}
            className={cn('rounded-2xl border bg-gradient-to-br p-4', colors[ci])}
          >
            <p className="text-[11px] font-medium text-muted-foreground leading-tight mb-2 line-clamp-2">
              {b.leave_type_name}
            </p>
            <p className={cn('text-3xl font-bold leading-none mb-0.5', accentColors[ci])}>
              {b.available}
            </p>
            <p className="text-[11px] text-muted-foreground mb-2">
              of {b.allocated} days
            </p>
            <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barColors[ci])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
