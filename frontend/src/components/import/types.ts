export type ImportFieldType = 'string' | 'number' | 'date' | 'currency' | 'boolean' | 'email' | 'phone' | 'enum' | 'uuid';
export type ImportSeverity = 'warning' | 'error';
export type ImportRowStatus = 'valid' | 'warning' | 'error';
export type ImportSessionStatus = 'preview' | 'ready' | 'processing' | 'completed' | 'failed';
export type DuplicateStrategy = 'skip' | 'update' | 'insert' | 'merge';

export interface ImportFieldDef {
  key: string;
  header: string;
  type?: ImportFieldType;
  required?: boolean;
  unique?: boolean;
  sensitive?: boolean;
  aliases?: string[];
  enumValues?: string[];
}

export interface ImportModuleConfig {
  module: string;
  title: string;
  fields: ImportFieldDef[];
  requiredFields: string[];
  uniqueKeys: string[];
  duplicateStrategy: DuplicateStrategy;
  supportsExecution: boolean;
}

export interface ImportConfig {
  module?: string;
  title?: string;
  permission?: string;
}

export interface ImportValidationIssue {
  severity: ImportSeverity;
  column: string;
  field?: string;
  value?: unknown;
  expected?: string;
  reason: string;
  suggestedFix?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  original: Record<string, unknown>;
  mapped: Record<string, unknown>;
  status: ImportRowStatus;
  issues: ImportValidationIssue[];
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  skippedRows: number;
  duplicateRows: number;
  newRecords: number;
  updatedRecords: number;
  deletedRecords: number;
}

export interface ImportSession {
  id: string;
  module: string;
  title: string;
  fileName: string;
  format: 'csv' | 'xlsx' | 'pdf';
  sheetName?: string;
  detectedColumns: string[];
  mappings: Record<string, string>;
  rows: ImportPreviewRow[];
  summary: ImportSummary;
  warnings: string[];
  status: ImportSessionStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
  execution?: {
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    warnings: number;
    errors: ImportValidationIssue[];
  };
}

export interface ConfirmImportOptions {
  conflictStrategy?: DuplicateStrategy;
  ignoreEmptyValues?: boolean;
  overwriteExisting?: boolean;
}
