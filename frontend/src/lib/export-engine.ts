/**
 * Client-side export engine — thin wrapper around the existing report-export
 * utilities that adds column filtering, data formatting, branding injection,
 * and filter summary for PDFs.
 *
 * Reuses exportReportCsv, exportReportXlsx from report-export.ts and
 * exportPdf from export-pdf.ts — no duplication.
 */

import { exportReportCsv, exportReportXlsx } from './report-export';
import { exportPdf, type PdfBrandingOptions } from './export-pdf';
import type { ExportColumnDef, ExportFormat, ActiveFilter } from '@/components/export/types';

export interface ClientExportOptions {
  /** File format to generate. */
  format: ExportFormat;
  /** Report title (used in PDF/XLSX headers). */
  title: string;
  /** Filename prefix (date stamp is appended automatically). */
  filenamePrefix: string;
  /** The full set of available column definitions. */
  columns: ExportColumnDef[];
  /** The subset of column keys the user selected for export. */
  selectedColumns: string[];
  /** The raw data rows (array of objects). */
  data: any[];
  /** Optional PDF branding options (logo, company name, etc.). */
  brandingOptions?: PdfBrandingOptions;
  /** Optional active filters to show in the PDF header area. */
  activeFilters?: ActiveFilter[];
}

/**
 * Generate and download a file client-side from in-memory data.
 */
export async function generateClientExport(opts: ClientExportOptions): Promise<void> {
  const { format, title, filenamePrefix, columns, selectedColumns, data, brandingOptions, activeFilters } = opts;

  // ── Resolve columns in selection order ──────────────────────────────────
  const resolvedCols = selectedColumns
    .map((key) => columns.find((c) => c.key === key))
    .filter((c): c is ExportColumnDef => !!c);

  if (resolvedCols.length === 0) {
    throw new Error('No columns selected for export');
  }

  // ── Extract headers and formatted rows ──────────────────────────────────
  const headers = resolvedCols.map((c) => c.header);
  const rows = data.map((row) =>
    resolvedCols.map((col) => formatCellValue(row[col.key], col.type)),
  );

  // ── Generate file ───────────────────────────────────────────────────────
  switch (format) {
    case 'csv':
      exportReportCsv({ columns: headers, rows }, filenamePrefix);
      break;

    case 'xlsx': {
      const sheetName = title.length > 31 ? title.slice(0, 31) : title;
      await exportReportXlsx({ columns: headers, rows }, filenamePrefix, sheetName, title);
      break;
    }

    case 'pdf': {
      // Build a subtitle with applied filters
      const filterLine = activeFilters?.length
        ? `Filters: ${activeFilters.map((f) => `${f.label}: ${f.value}`).join(' | ')}`
        : undefined;

      await exportPdf({
        title,
        columns: headers,
        rows,
        filename: filenamePrefix,
        brandingOptions,
      });
      break;
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCellValue(value: any, type?: string): string {
  if (value == null || value === '') return '';

  switch (type) {
    case 'date':
      try {
        return new Date(value).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        return String(value);
      }

    case 'currency':
      return typeof value === 'number'
        ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(value);

    case 'number':
      return typeof value === 'number' ? value.toLocaleString('en-IN') : String(value);

    case 'boolean':
      return value ? 'Yes' : 'No';

    default:
      return String(value);
  }
}
