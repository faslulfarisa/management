'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providersApi } from '@/lib/biometrics-api';

export function useProviderList() {
  return useQuery({
    queryKey: ['biometrics', 'providers'],
    queryFn: providersApi.list,
    staleTime: 60_000,
  });
}

export function useProviderHealth(name: string) {
  return useQuery({
    queryKey: ['biometrics', 'provider-health', name],
    queryFn: () => providersApi.getHealth(name),
    refetchInterval: 20_000,
    staleTime: 15_000,
    enabled: Boolean(name),
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => providersApi.triggerSync(integrationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometrics', 'provider-health'] });
    },
  });
}
