'use client';

import { ChangeEvent, useCallback, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDataImport } from '@/hooks/useDataImport';
import type {
  ConfirmImportOptions,
  DuplicateStrategy,
  ImportConfig,
  ImportModuleConfig,
  ImportPreviewRow,
  ImportSession,
} from './types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: ImportConfig;
}

const CONFLICT_OPTIONS: { value: DuplicateStrategy; label: string }[] = [
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'update', label: 'Update existing' },
  { value: 'merge', label: 'Merge values' },
  { value: 'insert', label: 'Insert new' },
];

const STATUS_STYLES = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function ImportDialog({ open, onOpenChange, config }: ImportDialogProps) {
  const {
    createPreview,
    getRegistryConfig,
    remap,
    confirm,
    downloadReport,
    isLoading,
  } = useDataImport();

  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [registry, setRegistry] = useState<ImportModuleConfig | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [editedRows, setEditedRows] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<DuplicateStrategy>('skip');
  const [ignoreEmptyValues, setIgnoreEmptyValues] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const title = session?.title || config?.title || 'Data';
  const canConfirm = Boolean(session && session.summary.errorRows === 0 && registry?.supportsExecution);
  const previewRows = session?.rows.slice(0, 25) ?? [];

  const summaryItems = useMemo(() => {
    if (!session) return [];
    return [
      { label: 'Total', value: session.summary.totalRows },
      { label: 'Valid', value: session.summary.validRows },
      { label: 'Warnings', value: session.summary.warningRows },
      { label: 'Errors', value: session.summary.errorRows },
      { label: 'Existing', value: session.summary.duplicateRows },
    ];
  }, [session]);

  const reset = useCallback(() => {
    setFile(null);
    setSession(null);
    setRegistry(null);
    setMappings({});
    setEditedRows([]);
    setError(null);
    setConflictStrategy('skip');
    setIgnoreEmptyValues(true);
    setOverwriteExisting(false);
  }, []);

  const handleClose = useCallback((nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }, [onOpenChange, reset]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    try {
      const nextSession = await createPreview(file, config?.module);
      const nextRegistry = await getRegistryConfig(nextSession.module);
      setSession(nextSession);
      setRegistry(nextRegistry);
      setMappings(nextSession.mappings);
      setEditedRows(nextSession.rows.map((row) => ({ ...row.original })));
      setConflictStrategy(nextRegistry.duplicateStrategy);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMappingChange = (sourceColumn: string, fieldKey: string) => {
    setMappings((current) => {
      const next = { ...current };
      if (!fieldKey) delete next[sourceColumn];
      else next[sourceColumn] = fieldKey;
      return next;
    });
  };

  const handleCellChange = (rowIndex: number, sourceColumn: string, value: string) => {
    setEditedRows((rows) => rows.map((row, index) => (
      index === rowIndex ? { ...row, [sourceColumn]: value } : row
    )));
  };

  const handleRevalidate = async () => {
    if (!session) return;
    try {
      const nextSession = await remap(session.id, mappings, editedRows);
      setSession(nextSession);
      setEditedRows(nextSession.rows.map((row) => ({ ...row.original })));
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleConfirm = async () => {
    if (!session) return;
    const options: ConfirmImportOptions = {
      conflictStrategy,
      ignoreEmptyValues,
      overwriteExisting,
    };
    try {
      const nextSession = await confirm(session.id, options);
      setSession(nextSession);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Import {title}
          </DialogTitle>
          <DialogDescription>
            Upload a CSV, XLSX, or text-based PDF file, review mappings and validation results, then confirm processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {!session && (
            <div className="border border-dashed border-border rounded-lg p-5">
              <label className="flex flex-col items-center justify-center gap-3 text-center cursor-pointer">
                <FileSpreadsheet className="w-9 h-9 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Choose import file</p>
                  <p className="text-xs text-muted-foreground">CSV, XLSX, or text-based PDF, up to 10 MB</p>
                </div>
                <Input type="file" accept=".csv,.xlsx,.pdf,application/pdf" className="max-w-sm" onChange={handleFile} />
              </label>
              {file && (
                <p className="mt-3 text-xs text-center text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{file.name}</span>
                </p>
              )}
            </div>
          )}

          {session && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {summaryItems.map((item) => (
                  <div key={item.label} className="border border-border rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{item.value.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>

              {session.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {session.warnings.join(' ')}
                </div>
              )}

              {session.summary.duplicateRows > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {session.summary.duplicateRows.toLocaleString('en-IN')} row(s) already exist. Use conflict resolution to keep existing records, update them, or merge values before confirming.
                </div>
              )}

              <section>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold">Column Mapping</h3>
                  <Button variant="outline" size="sm" onClick={handleRevalidate} disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Revalidate
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {session.detectedColumns.map((column) => (
                    <label key={column} className="text-xs">
                      <span className="block text-muted-foreground mb-1">{column}</span>
                      <select
                        value={mappings[column] ?? ''}
                        onChange={(event) => handleMappingChange(column, event.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                      >
                        <option value="">Ignore column</option>
                        {registry?.fields.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.header}{field.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <PreviewTable
                rows={previewRows}
                sourceColumns={session.detectedColumns}
                editedRows={editedRows}
                onCellChange={handleCellChange}
              />

              {session.rows.length > previewRows.length && (
                <p className="text-xs text-muted-foreground">
                  Showing first {previewRows.length} rows of {session.rows.length.toLocaleString('en-IN')}.
                </p>
              )}

              <section className="grid md:grid-cols-3 gap-3">
                <label className="text-xs">
                  <span className="block text-muted-foreground mb-1">Conflict resolution for existing data</span>
                  <select
                    value={conflictStrategy}
                    onChange={(event) => setConflictStrategy(event.target.value as DuplicateStrategy)}
                    className="w-full rounded-lg border border-border bg-white px-2 py-2 text-xs"
                  >
                    {CONFLICT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs border border-border rounded-lg px-3 py-2">
                  <input type="checkbox" checked={ignoreEmptyValues} onChange={(event) => setIgnoreEmptyValues(event.target.checked)} />
                  Ignore empty values
                </label>
                <label className="flex items-center gap-2 text-xs border border-border rounded-lg px-3 py-2">
                  <input type="checkbox" checked={overwriteExisting} onChange={(event) => setOverwriteExisting(event.target.checked)} />
                  Overwrite existing values
                </label>
              </section>

              {registry && !registry.supportsExecution && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This module is registered for upload, mapping, preview, and validation. Processing is disabled until its business-service execution hook is registered.
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {session?.status === 'completed' && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Import completed. Imported {session.execution?.imported ?? 0}, updated {session.execution?.updated ?? 0}, skipped {session.execution?.skipped ?? 0}.</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {session && (
            <Button variant="outline" onClick={() => downloadReport(session.id)}>
              <Download className="w-4 h-4 mr-2" />
              Report
            </Button>
          )}
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isLoading}>
            {session?.status === 'completed' ? 'Close' : 'Cancel'}
          </Button>
          {!session ? (
            <Button onClick={handlePreview} disabled={!file || isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Preview
            </Button>
          ) : (
            <Button onClick={handleConfirm} disabled={!canConfirm || isLoading || session.status === 'completed'}>
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirm Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({
  rows,
  sourceColumns,
  editedRows,
  onCellChange,
}: {
  rows: ImportPreviewRow[];
  sourceColumns: string[];
  editedRows: Array<Record<string, unknown>>;
  onCellChange: (rowIndex: number, sourceColumn: string, value: string) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold mb-2">Preview</h3>
      <div className="overflow-auto border border-border rounded-lg">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-20">Row</th>
              <th className="px-2 py-2 text-left font-medium w-24">Status</th>
              {sourceColumns.slice(0, 8).map((column) => (
                <th key={column} className="px-2 py-2 text-left font-medium min-w-36">{column}</th>
              ))}
              <th className="px-2 py-2 text-left font-medium min-w-64">Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.rowNumber} className="border-t border-border align-top">
                <td className="px-2 py-2 tabular-nums">{row.rowNumber}</td>
                <td className="px-2 py-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 capitalize', STATUS_STYLES[row.status])}>
                    {row.status === 'error' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {row.status}
                  </span>
                </td>
                {sourceColumns.slice(0, 8).map((column) => (
                  <td key={column} className="px-2 py-2">
                    <Input
                      value={String(editedRows[rowIndex]?.[column] ?? '')}
                      onChange={(event) => onCellChange(rowIndex, column, event.target.value)}
                      className="h-8 text-xs"
                    />
                  </td>
                ))}
                <td className="px-2 py-2">
                  {row.issues.length ? (
                    <div className="space-y-1">
                      {row.issues.slice(0, 3).map((issue, index) => (
                        <p key={`${issue.field}-${index}`} className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}>
                          {issue.column}: {issue.reason}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No issues</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
