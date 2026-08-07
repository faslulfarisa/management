'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import {
  X, Plus, Trash2, Loader2, CheckCircle2, XCircle, FileSpreadsheet, Download,
  AlertTriangle, ChevronRight, ChevronLeft, Sparkles, FileDown, FileText, Table2,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { exportReportCsv, exportReportXlsx, exportReportPdf } from '@/lib/report-export';

interface RawRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  departmentId: string;
  positionId: string;
  employeeCode: string;
}

interface PreviewRow extends RawRow {
  index: number;
  username: string;
  password: string;
  status: 'valid' | 'error';
  errors: string[];
  usernameChecking?: boolean;
  suggestions?: string[];
}

interface ImportResult {
  status: 'pending' | 'success' | 'error';
  message?: string;
}

interface Credential {
  name: string;
  email: string;
  username: string;
  password: string;
}

type RefData = { id: string; name: string };
type Step = 'input' | 'preview' | 'result';

function makeEmptyRow(): RawRow {
  return { firstName: '', lastName: '', email: '', phone: '', departmentId: '', positionId: '', employeeCode: '' };
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

export default function UserBulkImportDrawer({
  onClose, onAllDone,
}: { onClose: () => void; onAllDone?: () => void }) {
  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [rows, setRows] = useState<RawRow[]>([makeEmptyRow()]);
  const [departments, setDepartments] = useState<RefData[]>([]);
  const [positions, setPositions] = useState<RefData[]>([]);
  const [csvError, setCsvError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const usernameTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Record<number, ImportResult>>({});
  const [credentials, setCredentials] = useState<Credential[]>([]);

  useEffect(() => {
    Promise.all([api.get('/departments'), api.get('/positions')])
      .then(([d, p]) => { setDepartments(d.data.data ?? []); setPositions(p.data.data ?? []); })
      .catch(() => { /* dept/position are optional context — non-fatal if unavailable */ });
  }, []);

  useEffect(() => () => {
    // Clear any pending debounce timers — and let plaintext credentials in
    // state be garbage-collected the instant the drawer unmounts.
    Object.values(usernameTimers.current).forEach(clearTimeout);
  }, []);

  /* ── Step 1: input rows (manual or CSV) ──────────────────────────── */

  const addRow = () => setRows(r => [...r, makeEmptyRow()]);
  const removeRow = (i: number) => setRows(r => r.filter((_, idx) => idx !== i));
  const setCell = (i: number, key: keyof RawRow, value: string) =>
    setRows(r => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const downloadTemplate = () => {
    const header = 'First Name,Last Name,Email,Phone,Department,Position,Employee Code';
    const example = 'Rahul,Joy,rahul.joy@example.com,+919900112233,,,';
    const csv = `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_user_import_template.csv';
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
        const colIndex = (label: string) => headers.findIndex(h => h === label.toLowerCase());
        const fi = colIndex('first name');
        const li = colIndex('last name');
        const ei = colIndex('email');
        const pi = colIndex('phone');
        const di = colIndex('department');
        const gi = colIndex('position');
        const ci = colIndex('employee code');

        const findRefId = (list: RefData[], name: string) =>
          list.find(item => item.name.toLowerCase() === name.toLowerCase())?.id || '';

        const mapped: RawRow[] = parsed.slice(1).map(r => ({
          firstName: fi >= 0 ? (r[fi] || '') : '',
          lastName: li >= 0 ? (r[li] || '') : '',
          email: ei >= 0 ? (r[ei] || '') : '',
          phone: pi >= 0 ? (r[pi] || '') : '',
          departmentId: di >= 0 && r[di] ? findRefId(departments, r[di]) : '',
          positionId: gi >= 0 && r[gi] ? findRefId(positions, r[gi]) : '',
          employeeCode: ci >= 0 ? (r[ci] || '') : '',
        }));
        setRows(mapped);
      } catch {
        setCsvError('Failed to parse CSV file. Ensure it matches the template format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generatePreview = async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const payload = rows.map(r => ({
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim(),
        email: r.email.trim(),
        phone: r.phone.trim() || undefined,
        departmentId: r.departmentId || undefined,
        positionId: r.positionId || undefined,
        employeeCode: r.employeeCode.trim() || undefined,
      }));
      const res = await api.post('/users/bulk-import/preview', { rows: payload });
      const enriched: PreviewRow[] = (res.data.data ?? []).map((row: any, i: number) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: rows[i]?.phone || '',
        departmentId: rows[i]?.departmentId || '',
        positionId: rows[i]?.positionId || '',
        employeeCode: row.employeeCode || '',
        index: row.index,
        username: row.username,
        password: row.password,
        status: row.status,
        errors: row.errors,
      }));
      setPreviewRows(enriched);
      setResults({});
      setStep('preview');
    } catch (err: any) {
      setPreviewError(
        err.response?.data?.message ?? err.response?.data?.error?.message ?? 'Failed to generate preview',
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ── Step 2: preview table — editable username + real-time validation ─ */

  const checkUsername = async (index: number, username: string) => {
    if (!username) {
      setPreviewRows(rs => rs.map(r => r.index === index
        ? { ...r, usernameChecking: false, status: 'error', errors: withUsernameError(r.errors, 'Username is required'), suggestions: undefined }
        : r));
      return;
    }
    try {
      const res = await api.get('/users/check-username', { params: { username } });
      const { available, reason } = res.data.data;
      setPreviewRows(rs => rs.map((r) => {
        if (r.index !== index) return r;
        const errors = available ? withoutUsernameError(r.errors) : withUsernameError(r.errors, reason || 'Username already exists');
        return { ...r, usernameChecking: false, errors, status: errors.length ? 'error' : 'valid', suggestions: available ? undefined : r.suggestions };
      }));
      if (!available) generateSuggestions(index, username);
    } catch {
      setPreviewRows(rs => rs.map(r => (r.index === index ? { ...r, usernameChecking: false } : r)));
    }
  };

  const setUsername = (index: number, rawValue: string) => {
    const normalized = rawValue.toLowerCase().replace(/[^a-z0-9]/g, '');
    setPreviewRows(rs => rs.map(r => (r.index === index ? { ...r, username: normalized, usernameChecking: true, suggestions: undefined } : r)));
    clearTimeout(usernameTimers.current[index]);
    usernameTimers.current[index] = setTimeout(() => checkUsername(index, normalized), 400);
  };

  const generateSuggestions = (index: number, base: string) => {
    const suggestions = [1, 2, 3].map(n => `${base}${n}`);
    setPreviewRows(rs => rs.map(r => (r.index === index ? { ...r, suggestions } : r)));
  };

  const applySuggestion = (index: number, suggestion: string) => {
    clearTimeout(usernameTimers.current[index]);
    setPreviewRows(rs => rs.map(r => (r.index === index ? { ...r, username: suggestion, usernameChecking: true, suggestions: undefined } : r)));
    checkUsername(index, suggestion);
  };

  const allValid = previewRows.length > 0 && previewRows.every(r => r.status === 'valid' && !r.usernameChecking);
  const errorCount = previewRows.filter(r => r.status === 'error').length;

  /* ── Step 3: import + credentials export ─────────────────────────── */

  const handleImport = async () => {
    setImporting(true);
    const pending: Record<number, ImportResult> = {};
    previewRows.forEach(r => { pending[r.index] = { status: 'pending' }; });
    setResults(pending);

    const created: Credential[] = [];
    for (const row of previewRows) {
      try {
        await api.post('/users', {
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          phone: row.phone || undefined,
          department_id: row.departmentId || undefined,
          position_id: row.positionId || undefined,
          username: row.username,
          password: row.password,
          must_change_password: true,
        });
        setResults(rs => ({ ...rs, [row.index]: { status: 'success' } }));
        created.push({ name: `${row.firstName} ${row.lastName}`.trim(), email: row.email, username: row.username, password: row.password });
      } catch (err: any) {
        const msg = err.response?.data?.message ?? err.response?.data?.error?.message ?? 'Failed to import';
        setResults(rs => ({ ...rs, [row.index]: { status: 'error', message: Array.isArray(msg) ? msg[0] : msg } }));
      }
    }

    setCredentials(created);
    setImporting(false);
    setStep('result');
    onAllDone?.();
  };

  const successCount = Object.values(results).filter(r => r.status === 'success').length;
  const failedCount = Object.values(results).filter(r => r.status === 'error').length;

  const exportData = () => ({
    columns: ['Employee Name', 'Username', 'Temporary Password'],
    rows: credentials.map(c => [c.name, c.username, c.password]),
  });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={!importing ? onClose : undefined} />
      <div className="w-full max-w-6xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Bulk Import — Users</h2>
            <p className="text-xs text-muted-foreground">
              {step === 'input' && 'Add employees to import. Usernames and passwords are generated automatically.'}
              {step === 'preview' && 'Review generated usernames & passwords before importing.'}
              {step === 'result' && 'Import complete.'}
            </p>
          </div>
          <button onClick={onClose} disabled={importing} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'input' && (
          <InputStep
            mode={mode} setMode={setMode}
            rows={rows} addRow={addRow} removeRow={removeRow} setCell={setCell}
            departments={departments} positions={positions}
            downloadTemplate={downloadTemplate}
            handleFileUpload={handleFileUpload}
            fileRef={fileRef}
            csvError={csvError}
            previewLoading={previewLoading}
            previewError={previewError}
            onClose={onClose}
            onGeneratePreview={generatePreview}
          />
        )}

        {step === 'preview' && (
          <PreviewStep
            previewRows={previewRows}
            departments={departments}
            positions={positions}
            allValid={allValid}
            errorCount={errorCount}
            importing={importing}
            onUsernameChange={setUsername}
            onApplySuggestion={applySuggestion}
            onBack={() => setStep('input')}
            onImport={handleImport}
          />
        )}

        {step === 'result' && (
          <ResultStep
            previewRows={previewRows}
            results={results}
            successCount={successCount}
            failedCount={failedCount}
            credentials={credentials}
            onClose={onClose}
            onExportCsv={() => exportReportCsv(exportData(), 'user_import_credentials')}
            onExportXlsx={() => exportReportXlsx(exportData(), 'user_import_credentials', 'Credentials', 'New User Credentials')}
            onExportPdf={() => exportReportPdf('New User Credentials', exportData(), 'user_import_credentials')}
          />
        )}
      </div>
    </div>
  );
}

function withUsernameError(errors: string[], message: string): string[] {
  return [...errors.filter(e => !e.startsWith('Username')), message];
}
function withoutUsernameError(errors: string[]): string[] {
  return errors.filter(e => !e.startsWith('Username'));
}

/* ─── Step 1: Input ───────────────────────────────────────────────────── */

function InputStep({
  mode, setMode, rows, addRow, removeRow, setCell, departments, positions,
  downloadTemplate, handleFileUpload, fileRef, csvError, previewLoading, previewError,
  onClose, onGeneratePreview,
}: {
  mode: 'manual' | 'csv';
  setMode: (m: 'manual' | 'csv') => void;
  rows: RawRow[];
  addRow: () => void;
  removeRow: (i: number) => void;
  setCell: (i: number, key: keyof RawRow, value: string) => void;
  departments: RefData[];
  positions: RefData[];
  downloadTemplate: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  csvError: string;
  previewLoading: boolean;
  previewError: string;
  onClose: () => void;
  onGeneratePreview: () => void;
}) {
  const hasMinimumData = rows.some(r => r.firstName.trim() && r.lastName.trim() && r.email.trim());

  return (
    <>
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border/50 bg-muted/20 shrink-0">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {(['manual', 'csv'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${mode === m ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
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

      {mode === 'csv' && (
        <div className="px-6 pt-4 shrink-0">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <FileSpreadsheet className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Click to upload a CSV file</p>
            <p className="text-xs text-muted-foreground mt-1">Download the template above for the correct column format</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          {csvError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{csvError}</p>
          )}
          {rows.length > 0 && !csvError && (
            <p className="text-xs text-muted-foreground mt-2">{rows.length} row{rows.length !== 1 ? 's' : ''} loaded — review below, then generate the preview</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 pt-4">
        {previewError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{previewError}</p>
        )}
        <div className="rounded-xl border border-border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 shrink-0">#</TableHead>
                <TableHead style={{ minWidth: '120px' }}>First Name<span className="text-red-500 ml-0.5">*</span></TableHead>
                <TableHead style={{ minWidth: '120px' }}>Last Name<span className="text-red-500 ml-0.5">*</span></TableHead>
                <TableHead style={{ minWidth: '190px' }}>Email<span className="text-red-500 ml-0.5">*</span></TableHead>
                <TableHead style={{ minWidth: '130px' }}>Phone</TableHead>
                <TableHead style={{ minWidth: '140px' }}>Department</TableHead>
                <TableHead style={{ minWidth: '140px' }}>Position</TableHead>
                <TableHead className="w-12 text-center">Del</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="px-3 py-1.5 text-muted-foreground text-center shrink-0">{i + 1}</TableCell>
                  <TableCell className="px-1 py-1">
                    <input value={row.firstName} onChange={e => setCell(i, 'firstName', e.target.value)} placeholder="First name" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <input value={row.lastName} onChange={e => setCell(i, 'lastName', e.target.value)} placeholder="Last name" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <input type="email" value={row.email} onChange={e => setCell(i, 'email', e.target.value)} placeholder="name@company.com" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <input value={row.phone} onChange={e => setCell(i, 'phone', e.target.value)} placeholder="+91…" className="w-full border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <select value={row.departmentId} onChange={e => setCell(i, 'departmentId', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                      <option value="">—</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell className="px-1 py-1">
                    <select value={row.positionId} onChange={e => setCell(i, 'positionId', e.target.value)} className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary/30">
                      <option value="">—</option>
                      {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </TableCell>
                  <TableCell className="px-3 py-1.5 text-center">
                    <button onClick={() => removeRow(i)} disabled={rows.length === 1} className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center mx-auto text-muted-foreground hover:text-red-500 disabled:opacity-30">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {mode === 'manual' && (
          <button onClick={addRow} className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? 's' : ''} ready</span>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={onGeneratePreview}
            disabled={!hasMinimumData || previewLoading}
            className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors font-medium"
          >
            {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Generate Preview
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Step 2: Preview ─────────────────────────────────────────────────── */

function PreviewStep({
  previewRows, departments, positions, allValid, errorCount, importing,
  onUsernameChange, onApplySuggestion, onBack, onImport,
}: {
  previewRows: PreviewRow[];
  departments: RefData[];
  positions: RefData[];
  allValid: boolean;
  errorCount: number;
  importing: boolean;
  onUsernameChange: (index: number, value: string) => void;
  onApplySuggestion: (index: number, suggestion: string) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const deptName = (id: string) => departments.find(d => d.id === id)?.name || '—';
  const positionName = (id: string) => positions.find(p => p.id === id)?.name || '—';

  return (
    <>
      <div className="flex-1 overflow-auto p-6">
        {errorCount > 0 && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorCount} row{errorCount !== 1 ? 's' : ''} need attention before you can import — fix the username or duplicate field flagged below.</span>
          </div>
        )}
        <div className="rounded-xl border border-border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 shrink-0">#</TableHead>
                <TableHead style={{ minWidth: '160px' }}>Employee</TableHead>
                <TableHead style={{ minWidth: '180px' }}>Email</TableHead>
                <TableHead style={{ minWidth: '120px' }}>Department</TableHead>
                <TableHead style={{ minWidth: '120px' }}>Position</TableHead>
                <TableHead style={{ minWidth: '170px' }}>Username</TableHead>
                <TableHead style={{ minWidth: '150px' }}>Password</TableHead>
                <TableHead className="w-10 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map(row => (
                <TableRow key={row.index} className={row.status === 'error' ? 'bg-red-50/40' : 'bg-emerald-50/20'}>
                  <TableCell className="px-3 py-1.5 text-muted-foreground text-center shrink-0">{row.index + 1}</TableCell>
                  <TableCell className="px-3 py-1.5 font-medium text-foreground whitespace-nowrap">{row.firstName} {row.lastName}</TableCell>
                  <TableCell className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{row.email}</TableCell>
                  <TableCell className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{deptName(row.departmentId)}</TableCell>
                  <TableCell className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{positionName(row.positionId)}</TableCell>
                  <TableCell className="px-1 py-1">
                    <div className="space-y-1">
                      <input
                        value={row.username}
                        onChange={e => onUsernameChange(row.index, e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/30 ${
                          row.status === 'error' && row.errors.some(e => e.startsWith('Username')) ? 'border-red-300' : 'border-border'
                        }`}
                      />
                      {row.usernameChecking ? (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Checking…</p>
                      ) : row.errors.some(e => e.startsWith('Username')) ? (
                        <p className="text-[11px] text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3 shrink-0" />{row.errors.find(e => e.startsWith('Username'))}</p>
                      ) : (
                        <p className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 shrink-0" />Username available</p>
                      )}
                      {row.suggestions && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {row.suggestions.map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => onApplySuggestion(row.index, s)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-primary/30 text-primary text-[11px] hover:bg-primary/5 transition-colors font-mono"
                            >
                              <Sparkles className="w-2.5 h-2.5" />{s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{row.password}</TableCell>
                  <TableCell className="px-3 py-1.5 text-center">
                    {row.status === 'valid' && !row.usernameChecking ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <div title={row.errors.join(', ')} className="cursor-help">
                        <XCircle className="w-4 h-4 text-red-500 mx-auto" />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
        <button onClick={onBack} disabled={importing} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50">
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to Edit
        </button>
        <div className="flex items-center gap-3">
          {!allValid && <span className="text-xs text-muted-foreground">Resolve all errors to enable import</span>}
          <button
            onClick={onImport}
            disabled={!allValid || importing}
            className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 transition-colors font-medium"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {importing ? 'Importing…' : `Import ${previewRows.length} User${previewRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Step 3: Result + credentials export ────────────────────────────── */

function ResultStep({
  previewRows, results, successCount, failedCount, credentials,
  onClose, onExportCsv, onExportXlsx, onExportPdf,
}: {
  previewRows: PreviewRow[];
  results: Record<number, ImportResult>;
  successCount: number;
  failedCount: number;
  credentials: Credential[];
  onClose: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onExportPdf: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${failedCount === 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>
          {successCount} user{successCount !== 1 ? 's' : ''} imported successfully
          {failedCount > 0 ? `. ${failedCount} failed — see details below.` : '.'}
        </span>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 shrink-0">#</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="w-10 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map(row => {
              const r = results[row.index];
              return (
                <TableRow key={row.index} className={r?.status === 'success' ? 'bg-emerald-50/40' : 'bg-red-50/40'}>
                  <TableCell className="px-3 py-1.5 text-muted-foreground text-center shrink-0">{row.index + 1}</TableCell>
                  <TableCell className="px-3 py-1.5 font-medium text-foreground">{row.firstName} {row.lastName}</TableCell>
                  <TableCell className="px-3 py-1.5 font-mono text-muted-foreground">{row.username}</TableCell>
                  <TableCell className="px-3 py-1.5 text-center">
                    {r?.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : (
                      <div title={r?.message} className="cursor-help"><XCircle className="w-4 h-4 text-red-500 mx-auto" /></div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {credentials.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>These are temporary credentials. Users should change their password on first login. This list only exists in your browser — closing this drawer discards it.</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onExportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              <FileDown className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={onExportXlsx} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              <Table2 className="w-3.5 h-3.5" /> Export Excel
            </button>
            <button onClick={onExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              <FileText className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button onClick={onClose} className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium">
          Close
        </button>
      </div>
    </div>
  );
}
