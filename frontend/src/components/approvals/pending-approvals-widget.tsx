'use client';

import { useQuery } from '@tanstack/react-query';
import { approvalsApi } from '@/lib/approvals-api';
import { useAuthStore } from '@/store/auth.store';

export function PendingApprovalsWidget() {
  const { accessToken } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['approvals-count'],
    queryFn: () => approvalsApi.getPendingCount(),
    enabled: !!accessToken,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const count = data?.count ?? 0;
  if (count === 0) return null;

  return (
    <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
      {count > 99 ? '99+' : count}
    </span>
  );
}
