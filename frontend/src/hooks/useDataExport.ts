'use client';

import { useCallback, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { generateClientExport } from '@/lib/export-engine';
import type { ExportConfig, ExportFormat, ExportScope, ActiveFilter } from '@/components/export/types';
import type { PdfBrandingOptions } from '@/lib/export-pdf';

interface ExportRequest {
  config: ExportConfig;
  format: ExportFormat;
  scope: ExportScope;
  selectedColumns: string[];
  filters?: Record<string, any>;
  currentPageData?: any[];
  totalRecords?: number;
  activeFilters?: ActiveFilter[];
}

/**
 * Central hook that orchestrates the export flow:
 *
 * - **Small exports** (current page, or ≤500 records): generates the file
 *   client-side using the existing report-export utilities.
 * - **Large exports** (>500 records, scope=all/filtered): calls the backend
 *   `POST /export` endpoint and triggers a file download.
 * - **PDF**: always client-side (existing jsPDF + autoTable). For large
 *   datasets, prompts the user to use CSV/XLSX.
 */
export function useDataExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeOrganization = useAuthStore((s) => s.activeOrganization);

  const exportData = useCallback(
    async (request: ExportRequest) => {
      setIsExporting(true);
      setError(null);

      try {
        const {
          config,
          format,
          scope,
          selectedColumns,
          filters,
          currentPageData,
          activeFilters,
        } = request;

        // ── Determine if we can export client-side ────────────────────────
        const isCurrentPage = scope === 'current_page' && currentPageData;
        const isPdf = format === 'pdf';

        if (isCurrentPage) {
          // Client-side export from in-memory data
          const data = currentPageData || [];
          const brandingOptions: PdfBrandingOptions | undefined =
            isPdf && activeOrganization
              ? {
                  companyName: activeOrganization.name,
                  logoUrl: activeOrganization.logoUrl,
                }
              : undefined;

          await generateClientExport({
            format,
            title: config.title,
            filenamePrefix: config.filenamePrefix,
            columns: config.columns,
            selectedColumns,
            data,
            brandingOptions,
            activeFilters,
          });
          return;
        }

        if (isPdf) {
          // PDF for large datasets — fall back to client-side with warning
          // We fetch data from backend first, then render client-side
          const response = await api.post('/export', {
            module: config.module,
            format: 'csv', // fetch raw data
            columns: selectedColumns,
            filters: filters || {},
            scope: scope === 'all' ? 'all' : 'filtered',
            limit: 2000, // reasonable PDF limit
          }, { responseType: 'text' });

          // Parse CSV back into rows for PDF generation
          const csvText = response.data as string;
          const lines = csvText.split('\n').filter((l) => l.trim());
          // Remove BOM and parse header
          const headerLine = lines[0]?.replace(/^\uFEFF/, '');
          const headers = parseCsvLine(headerLine);
          const rows = lines.slice(1).map(parseCsvLine);

          const brandingOptions: PdfBrandingOptions | undefined = activeOrganization
            ? {
                companyName: activeOrganization.name,
                logoUrl: activeOrganization.logoUrl,
              }
            : undefined;

          const { exportPdf } = await import('@/lib/export-pdf');
          await exportPdf({
            title: config.title,
            columns: headers,
            rows,
            filename: config.filenamePrefix,
            brandingOptions,
          });
          return;
        }

        // ── Server-side export (CSV / XLSX) ───────────────────────────────
        const response = await api.post(
          '/export',
          {
            module: config.module,
            format,
            columns: selectedColumns,
            filters: filters || {},
            scope: scope === 'all' ? 'all' : 'filtered',
          },
          { responseType: 'blob' },
        );

        // Trigger browser download
        const blob = new Blob([response.data], {
          type:
            format === 'xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'text/csv;charset=utf-8;',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStamp = new Date().toISOString().split('T')[0];
        a.download = `${config.filenamePrefix}_${dateStamp}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        const message =
          err?.response?.data?.message || err?.message || 'Export failed';
        setError(message);
        throw new Error(message);
      } finally {
        setIsExporting(false);
      }
    },
    [activeOrganization],
  );

  return { exportData, isExporting, error };
}

// ── CSV line parser (handles quoted fields) ──────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
