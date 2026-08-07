'use client';

import { useQuery } from '@tanstack/react-query';
import { useBiometricsStore } from '@/store/biometrics.store';
import { queueApi } from '@/lib/biometrics-api';

export function useQueueHealth() {
  const { queueHealth, setQueueHealth } = useBiometricsStore();

  const query = useQuery({
    queryKey: ['biometrics', 'queue-health'],
    queryFn: async () => {
      const snapshot = await queueApi.getHealth();
      setQueueHealth(snapshot);
      return snapshot;
    },
    refetchInterval: 12_000,
    staleTime: 8_000,
  });

  return {
    queueHealth: queueHealth ?? query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
