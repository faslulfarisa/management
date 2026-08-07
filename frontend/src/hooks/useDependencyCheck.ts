import { useState, useCallback } from 'react';
import api from '@/lib/api';
import type { DependencyReport } from '@/components/ui/delete-warning-modal';

type EntityType = 'branch' | 'department' | 'area' | 'position' | 'employee' | 'template';

interface UseDependencyCheckReturn {
  report: DependencyReport | null;
  isLoading: boolean;
  error: string | null;
  check: (entityType: EntityType, id: string) => Promise<DependencyReport | null>;
  clear: () => void;
}

export function useDependencyCheck(): UseDependencyCheckReturn {
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (entityType: EntityType, id: string) => {
    setIsLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await api.get(`/dependency-check/${entityType}/${id}`);
      const data: DependencyReport = res.data.data;
      setReport(data);
      return data;
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load dependency report');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setReport(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { report, isLoading, error, check, clear };
}
