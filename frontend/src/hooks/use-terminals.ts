'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBiometricsStore } from '@/store/biometrics.store';
import { terminalsApi } from '@/lib/biometrics-api';
import type { RegisterTerminalPayload } from '@/types/biometrics';

export function useTerminalStats() {
  const setTerminalStats = useBiometricsStore((s) => s.setTerminalStats);
  const terminalStats = useBiometricsStore((s) => s.terminalStats);

  const query = useQuery({
    queryKey: ['biometrics', 'terminal-stats'],
    queryFn: async () => {
      const stats = await terminalsApi.getStats();
      setTerminalStats(stats);
      return stats;
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  return {
    stats: terminalStats ?? query.data ?? null,
    loading: query.isLoading,
  };
}

export function useTerminalList(params?: Parameters<typeof terminalsApi.list>[0]) {
  return useQuery({
    queryKey: ['biometrics', 'terminals', params],
    queryFn: () => terminalsApi.list(params),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useRegisterTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterTerminalPayload) => terminalsApi.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometrics', 'terminals'] });
      qc.invalidateQueries({ queryKey: ['biometrics', 'terminal-stats'] });
    },
  });
}

export function useRotateTerminalToken() {
  return useMutation({
    mutationFn: (id: string) => terminalsApi.rotateToken(id),
  });
}

export function useDeactivateTerminal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => terminalsApi.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biometrics', 'terminals'] });
      qc.invalidateQueries({ queryKey: ['biometrics', 'terminal-stats'] });
    },
  });
}
