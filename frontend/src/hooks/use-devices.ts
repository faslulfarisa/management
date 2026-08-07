'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBiometricsStore } from '@/store/biometrics.store';
import { devicesApi } from '@/lib/biometrics-api';

export function useDeviceStats() {
  const setDeviceStats = useBiometricsStore((s) => s.setDeviceStats);
  const deviceStats = useBiometricsStore((s) => s.deviceStats);

  const query = useQuery({
    queryKey: ['biometrics', 'device-stats'],
    queryFn: async () => {
      const stats = await devicesApi.getStats();
      setDeviceStats(stats);
      return stats;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  return {
    stats: deviceStats ?? query.data ?? null,
    loading: query.isLoading,
    error: query.error,
  };
}

export function useDeviceList(params?: Parameters<typeof devicesApi.list>[0]) {
  return useQuery({
    queryKey: ['biometrics', 'devices', params],
    queryFn: () => devicesApi.list(params),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useDevice(id: string) {
  return useQuery({
    queryKey: ['biometrics', 'device', id],
    queryFn: () => devicesApi.get(id),
    staleTime: 15_000,
    enabled: Boolean(id),
  });
}

export function useDeactivateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => devicesApi.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometrics', 'devices'] });
      qc.invalidateQueries({ queryKey: ['biometrics', 'device-stats'] });
    },
  });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => devicesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometrics', 'devices'] });
      qc.invalidateQueries({ queryKey: ['biometrics', 'device-stats'] });
    },
  });
}
