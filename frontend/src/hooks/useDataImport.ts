'use client';

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import type {
  ConfirmImportOptions,
  ImportModuleConfig,
  ImportSession,
} from '@/components/import/types';

function getApiError(error: any, fallback: string): string {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

export function useDataImport() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRegistryConfig = useCallback(async (module: string) => {
    const res = await api.get<{ data: ImportModuleConfig }>(`/import/registry/${module}`);
    return res.data.data;
  }, []);

  const createPreview = useCallback(async (file: File, module?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (module) formData.append('module', module);
      const res = await api.post<{ data: ImportSession }>('/import/preview', formData);
      return res.data.data;
    } catch (err: any) {
      const message = getApiError(err, 'Import preview failed');
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remap = useCallback(async (
    sessionId: string,
    mappings: Record<string, string>,
    rows?: Array<Record<string, unknown>>,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: ImportSession }>(`/import/${sessionId}/remap`, { mappings, rows });
      return res.data.data;
    } catch (err: any) {
      const message = getApiError(err, 'Import validation failed');
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const confirm = useCallback(async (sessionId: string, options: ConfirmImportOptions) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<{ data: ImportSession }>(`/import/${sessionId}/confirm`, options);
      return res.data.data;
    } catch (err: any) {
      const message = getApiError(err, 'Import confirmation failed');
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const downloadReport = useCallback(async (sessionId: string) => {
    const response = await api.get(`/import/${sessionId}/report.csv`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_${sessionId}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    createPreview,
    getRegistryConfig,
    remap,
    confirm,
    downloadReport,
    isLoading,
    error,
  };
}
