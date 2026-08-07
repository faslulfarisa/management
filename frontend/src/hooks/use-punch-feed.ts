'use client';

import { useBiometricsStore, selectFilteredPunches } from '@/store/biometrics.store';

export function usePunchFeed() {
  const autoscroll = useBiometricsStore((s) => s.autoscroll);
  const setAutoscroll = useBiometricsStore((s) => s.setAutoscroll);
  const setFilter = useBiometricsStore((s) => s.setFilter);
  const resetFilters = useBiometricsStore((s) => s.resetFilters);
  const filters = useBiometricsStore((s) => s.filters);
  const punches = useBiometricsStore(selectFilteredPunches);

  return { punches, autoscroll, setAutoscroll, filters, setFilter, resetFilters };
}
