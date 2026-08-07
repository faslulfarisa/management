// ─── Shared types for the centralized Data Export Framework ───────────────────

export interface ExportColumnDef {
  /** Stable key matching the backend registry column key. */
  key: string;
  /** Human-readable header displayed in column selector and export files. */
  header: string;
  /** Hint for client-side value formatting. */
  type?: 'string' | 'number' | 'date' | 'currency' | 'boolean';
  /** Whether the column is currently visible in the table (for "visible columns" scope). */
  visible?: boolean;
  /** If true, this column contains sensitive data and may be hidden from non-admin users. */
  sensitive?: boolean;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ExportScope = 'current_page' | 'all' | 'selected' | 'filtered';

export interface ExportConfig {
  /** Module key matching backend registry, e.g. `'employees'`. */
  module: string;
  /** Report title used in PDF header and XLSX worksheet title. */
  title: string;
  /** RBAC permission string — export button is hidden if the user lacks this. */
  permission?: string;
  /** All available columns for this module. */
  columns: ExportColumnDef[];
  /** Column keys selected by default when the dialog opens. */
  defaultColumns?: string[];
  /** Filename prefix for downloads, e.g. `'employees'` → `employees_2026-07-05.csv`. */
  filenamePrefix: string;
}

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}
