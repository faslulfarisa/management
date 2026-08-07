'use client';

import { useState, useRef } from 'react';
import { X, Download, Plus, Trash2, Loader2, CheckCircle2, XCircle, FileSpreadsheet } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export interface BulkColumn {
  key: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'date' | 'select' | 'email';
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
  width?: string;
}

interface RowResult {
  status: 'pending' | 'success' | 'error';
  message?: string;
}

interface BulkImportDrawerProps {
  title: string;
  subtitle?: string;
  columns: BulkColumn[];
  onClose: () => void;
  onSubmitRow: (row: Record<string, any>) => Promise<void>;
  onAllDone?: () => void;
}

function makeEmptyRow(columns: BulkColumn[]): Record<string, any> {
  const row: Record<string, any> = {};
  columns.forEach(c => { row[c.key] = c.defaultValue ?? ''; });
  return row;
}

function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result;
  });
}

export default function BulkImportDrawer({
  title, subtitle, columns, onClose, onSubmitRow, onAllDone,
}: BulkImportDrawerProps) {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [rows, setRows] = useState<Record<string, any>[]>([makeEmptyRow(columns)]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [csvError, setCsvError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addRow = () => setRows(r => [...r, makeEmptyRow(columns)]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const setCell = (rowIdx: number, key: string, value: string) =>
    setRows(r => r.map((row, idx) => idx === rowIdx ? { ...row, [key]: value } : row));

  const downloadTemplate = () => {
    const header = columns.map(c => c.label).join(',');
    const example = columns.map(c => {
      if (c.type === 'date') return new Date().toISOString().split('T')[0];
      if (c.type === 'number') return '0';
      if (c.options?.length) return c.options[0];
      return '';
    }).join(',');
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length < 2) { setCsvError('CSV must have at least one data row'); return; }
        const headers = parsed[0].map(h => h.toLowerCase().trim());
        const dataRows = parsed.slice(1);
        const mapped = dataRows.map(row => {
          const obj = makeEmptyRow(columns);
          columns.forEach(col => {
            const idx = headers.findIndex(
              h => h === col.label.toLowerCase() || h === col.key.toLowerCase()
            );
            if (idx >= 0 && row[idx] !== undefined) obj[col.key] = row[idx];
          });
          return obj;
        });
        setRows(mapped);
        setSubmitted(false);
        setResults([]);
      } catch {
        setCsvError('Failed to parse CSV file. Ensure it matches the template format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setResults(rows.map(() => ({ status: 'pending' })));
    for (let i = 0; i < rows.length; i++) {
      // Validate required fields client-side first
      const missingFields = columns
        .filter(c => c.required && !String(rows[i][c.key] ?? '').trim())
        .map(c => c.label);
      if (missingFields.length > 0) {
        setResults(r => r.map((res, idx) =>
          idx === i ? { status: 'error', message: `Missing required fields: ${missingFields.join(', ')}` } : res
        ));
        continue;
      }
      try {
        await onSubmitRow(rows[i]);
        setResults(r => r.map((res, idx) => idx === i ? { status: 'success' } : res));
      } catch (err: any) {
        const msg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          (Array.isArray(err.response?.data?.message)
            ? err.response.data.message[0]
            : 'Failed to import');
        setResults(r => r.map((res, idx) => idx === i ? { status: 'error', message: msg } : res));
      }
    }
    setSubmitting(false);
    setSubmitted(true);
    onAllDone?.();
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
      />
      <div className="w-full max-w-5xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Bulk Import — {title}</h2>
            <p className="text-xs text-muted-foreground">
              {subtitle || `Add multiple ${title.toLowerCase()} records at once`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border/50 bg-muted/20 shrink-0">
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(['manual', 'csv'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === m
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'manual' ? 'Manual Entry' : 'CSV Upload'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="w-3 h-3" />
            Download Template
          </button>
        </div>

        {/* CSV Upload Zone */}
        {mode === 'csv' && (
          <div className="px-6 pt-4 shrink-0">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <FileSpreadsheet className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Click to upload a CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">
                Download the template above for the correct column format
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            {csvError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                {csvError}
              </p>
            )}
            {rows.length > 0 && !csvError && (
              <p className="text-xs text-muted-foreground mt-2">
                {rows.length} row{rows.length !== 1 ? 's' : ''} loaded — review below before importing
              </p>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto p-6 pt-4">
          <div className="rounded-xl border border-border overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 shrink-0">
                    #
                  </TableHead>
                  {columns.map(col => (
                    <TableHead
                      key={col.key}
                      style={col.width ? { minWidth: col.width } : undefined}
                    >
                      {col.label}
                      {col.required && <span className="text-red-500 ml-0.5">*</span>}
                    </TableHead>
                  ))}
                  <TableHead className="w-14 text-center">
                    {submitted ? 'Status' : 'Del'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIdx) => {
                  const res = results[rowIdx];
                  return (
                    <TableRow
                      key={rowIdx}
                      className={
                        res?.status === 'success'
                          ? 'bg-emerald-50/40'
                          : res?.status === 'error'
                          ? 'bg-red-50/40'
                          : ''
                      }
                    >
                      <TableCell className="px-3 py-1.5 text-muted-foreground text-center shrink-0">
                        {rowIdx + 1}
                      </TableCell>
                      {columns.map(col => (
                        <TableCell key={col.key} className="px-1 py-1">
                          {col.type === 'select' ? (
                            <select
                              value={row[col.key]}
                              onChange={e => setCell(rowIdx, col.key, e.target.value)}
                              disabled={submitting || submitted}
                              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
                              style={col.width ? { minWidth: col.width } : { minWidth: '110px' }}
                            >
                              <option value="">-- select --</option>
                              {col.options?.map(o => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={
                                col.type === 'number' ? 'number'
                                  : col.type === 'date' ? 'date'
                                  : col.type === 'email' ? 'email'
                                  : 'text'
                              }
                              value={row[col.key]}
                              onChange={e => setCell(rowIdx, col.key, e.target.value)}
                              disabled={submitting || submitted}
                              placeholder={col.placeholder || col.label}
                              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                              style={col.width ? { minWidth: col.width } : { minWidth: '110px' }}
                            />
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="px-3 py-1.5 text-center">
                        {res?.status === 'success' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        )}
                        {res?.status === 'error' && (
                          <div title={res.message} className="cursor-help">
                            <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                          </div>
                        )}
                        {res?.status === 'pending' && submitting && (
                          <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
                        )}
                        {!submitting && !submitted && (
                          <button
                            onClick={() => removeRow(rowIdx)}
                            disabled={rows.length === 1}
                            className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center mx-auto text-muted-foreground hover:text-red-500 disabled:opacity-30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {!submitted && !submitting && (
            <button
              onClick={addRow}
              className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
          )}

          {submitted && (
            <div
              className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
                errorCount === 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {successCount} record{successCount !== 1 ? 's' : ''} imported successfully
                {errorCount > 0
                  ? `. ${errorCount} failed — hover the × icon on each row for the error detail.`
                  : '.'}
              </span>
            </div>
          )}

          {submitting && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Importing row {successCount + errorCount + 1} of {rows.length}…
              {pendingCount > 0 && ` (${pendingCount} remaining)`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <span className="text-xs text-muted-foreground">
            {rows.length} row{rows.length !== 1 ? 's' : ''} ready
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
            >
              {submitted ? 'Close' : 'Cancel'}
            </button>
            {!submitted && (
              <button
                onClick={handleSubmit}
                disabled={submitting || rows.length === 0}
                className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors font-medium"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Importing…
                  </>
                ) : (
                  `Import ${rows.length} Record${rows.length !== 1 ? 's' : ''}`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
