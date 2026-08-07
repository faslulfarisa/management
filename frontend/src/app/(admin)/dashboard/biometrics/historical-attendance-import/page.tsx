'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileSpreadsheet,
  History,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS } from '@/lib/permissions';
import {
  autoMatchHistoricalImportBatch,
  commitHistoricalAttendanceRebuild,
  createHistoricalImportBatch,
  createHistoricalAttendanceRebuildSummary,
  createHistoricalImportSource,
  getHistoricalAttendanceDependencyProgress,
  getHistoricalImportPreview,
  getHistoricalImportDashboard,
  HISTORICAL_IMPORT_SOURCE_TYPES,
  cancelHistoricalImportBatch,
  listHistoricalImportBatches,
  listHistoricalImportHistory,
  listHistoricalImportUnknownUsers,
  reconcileHistoricalImportBatch,
  listHistoricalImportSources,
  pauseHistoricalImportBatch,
  resumeHistoricalImportBatch,
  retryHistoricalImportBatch,
  rollbackHistoricalImportBatch,
  saveManualHistoricalImportMapping,
  searchHistoricalImportEmployees,
  validateHistoricalImportBatch,
  type HistoricalImportBatch,
  type HistoricalImportDashboard,
  type HistoricalImportEmployee,
  type HistoricalImportHistoryItem,
  type HistoricalImportPreview,
  type HistoricalAttendanceDependencyRebuildRun,
  type HistoricalAttendanceRebuildSummary,
  type HistoricalImportSource,
  type HistoricalImportSourceType,
  type HistoricalUnknownUser,
} from '@/lib/historical-attendance-import-api';
import { cn } from '@/lib/utils';

const sourceLabels: Record<HistoricalImportSourceType, string> = {
  device: 'Device',
  vendor_software: 'Vendor Software',
  easytime_pro: 'EasyTime Pro',
  zkteco: 'ZKTeco',
  sql_database: 'SQL Database',
  sql_server: 'SQL Server',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  rest_api: 'REST API',
  csv: 'CSV',
  sdk: 'SDK',
};

function StatusPill({ status }: { status: string }) {
  const classes =
    status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'failed' ? 'bg-red-50 text-red-700 border-red-200'
    : status === 'cancelled' ? 'bg-slate-100 text-slate-600 border-slate-200'
    : status === 'ready' ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize', classes)}>
      {status}
    </span>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-md', tone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs) return '-';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function getHistoricalImportErrorMessage(error: any) {
  const status = error?.response?.status;
  const backendMessage = error?.response?.data?.message;
  const message = Array.isArray(backendMessage) ? backendMessage.join(', ') : backendMessage;

  if (status === 403) {
    return message || 'Historical attendance import is not enabled for this organization, or your user does not have permission. Ask platform operations to enable it and assign Historical Attendance Import access.';
  }
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 400) {
    return message || 'The request could not be completed. Check the entered details and try again.';
  }
  if (status === 404) {
    return message || 'The selected historical import record could not be found.';
  }
  if (status >= 500) {
    return 'Historical attendance import service is temporarily unavailable. Please try again shortly.';
  }

  return message || error?.message || 'Historical attendance import action failed.';
}

export default function HistoricalAttendanceImportPage() {
  const { userType, permissions } = useAuthStore();
  const canAccess = userType === 'org_admin' || permissions.includes(PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_MANAGE);
  const [dashboard, setDashboard] = useState<HistoricalImportDashboard | null>(null);
  const [sources, setSources] = useState<HistoricalImportSource[]>([]);
  const [batches, setBatches] = useState<HistoricalImportBatch[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoricalImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSource, setSavingSource] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState<HistoricalImportSourceType>('csv');
  const [sourceName, setSourceName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [unknownUsers, setUnknownUsers] = useState<HistoricalUnknownUser[]>([]);
  const [selectedUnknownId, setSelectedUnknownId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeResults, setEmployeeResults] = useState<HistoricalImportEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [preview, setPreview] = useState<HistoricalImportPreview | null>(null);
  const [previewBucket, setPreviewBucket] = useState<string>('');
  const [toleranceMinutes, setToleranceMinutes] = useState(5);
  const [rebuildSummary, setRebuildSummary] = useState<HistoricalAttendanceRebuildSummary | null>(null);
  const [dependencyProgress, setDependencyProgress] = useState<HistoricalAttendanceDependencyRebuildRun | null>(null);

  const activeSources = useMemo(() => sources.filter((source) => source.is_active), [sources]);
  const selectedUnknown = useMemo(
    () => unknownUsers.find((user) => user.id === selectedUnknownId) || null,
    [unknownUsers, selectedUnknownId],
  );

  const refresh = async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, sourceData, batchData, historyData] = await Promise.all([
        getHistoricalImportDashboard(),
        listHistoricalImportSources(),
        listHistoricalImportBatches(),
        listHistoricalImportHistory(),
      ]);
      setDashboard(dashboardData);
      setSources(sourceData);
      setBatches(batchData);
      setHistoryItems(historyData);
      if (!selectedSourceId && sourceData[0]) setSelectedSourceId(sourceData[0].id);
      if (!selectedBatchId && batchData[0]) setSelectedBatchId(batchData[0].id);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [canAccess]);

  const handleCreateSource = async () => {
    if (!sourceName.trim()) return;
    setSavingSource(true);
    setError(null);
    try {
      await createHistoricalImportSource({ source_type: sourceType, name: sourceName.trim() });
      setSourceName('');
      await refresh();
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setSavingSource(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!selectedSourceId || !dateFrom || !dateTo) return;
    setSavingBatch(true);
    setError(null);
    try {
      await createHistoricalImportBatch({ source_id: selectedSourceId, date_from: dateFrom, date_to: dateTo });
      setDateFrom('');
      setDateTo('');
      await refresh();
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setSavingBatch(false);
    }
  };

  const refreshWizard = async (batchId = selectedBatchId, bucket = previewBucket) => {
    if (!batchId) return;
    try {
      const [unknownData, previewData, dependencyData] = await Promise.all([
        listHistoricalImportUnknownUsers(batchId),
        getHistoricalImportPreview(batchId, bucket || undefined),
        getHistoricalAttendanceDependencyProgress(batchId),
      ]);
      setUnknownUsers(unknownData);
      setPreview(previewData);
      setDependencyProgress(dependencyData);
      setRebuildSummary(null);
      if (!selectedUnknownId && unknownData[0]) setSelectedUnknownId(unknownData[0].id);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    }
  };

  useEffect(() => {
    if (selectedBatchId) {
      refreshWizard(selectedBatchId);
    }
  }, [selectedBatchId, previewBucket]);

  const handleAutoMatch = async () => {
    if (!selectedBatchId) return;
    setMappingLoading(true);
    setError(null);
    try {
      await autoMatchHistoricalImportBatch(selectedBatchId, true);
      await Promise.all([refresh(), refreshWizard()]);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setMappingLoading(false);
    }
  };

  const handleSearchEmployees = async () => {
    if (!employeeSearch.trim()) return;
    setError(null);
    try {
      setEmployeeResults(await searchHistoricalImportEmployees(employeeSearch.trim()));
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    }
  };

  const handleSaveManualMapping = async () => {
    if (!selectedBatchId || !selectedUnknown || !selectedEmployeeId) return;
    setMappingLoading(true);
    setError(null);
    try {
      await saveManualHistoricalImportMapping(selectedBatchId, {
        source_identifier_type: selectedUnknown.source_identifier_type,
        source_identifier: selectedUnknown.source_identifier,
        employee_id: selectedEmployeeId,
      });
      setSelectedEmployeeId('');
      await Promise.all([refresh(), refreshWizard()]);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setMappingLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedBatchId) return;
    setValidationLoading(true);
    setError(null);
    try {
      await validateHistoricalImportBatch(selectedBatchId);
      await Promise.all([refresh(), refreshWizard()]);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setValidationLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedBatchId) return;
    setReconciliationLoading(true);
    setError(null);
    try {
      await reconcileHistoricalImportBatch(selectedBatchId, {
        toleranceMinutes,
        sourcePriority: ['existing_attendance', 'device', 'vendor_software', 'rest_api', 'csv', 'sql_database', 'sdk'],
      });
      setRebuildSummary(null);
      await Promise.all([refresh(), refreshWizard()]);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setReconciliationLoading(false);
    }
  };

  const handleCreateRebuildSummary = async () => {
    if (!selectedBatchId) return;
    setRebuildLoading(true);
    setError(null);
    try {
      setRebuildSummary(await createHistoricalAttendanceRebuildSummary(selectedBatchId));
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setRebuildLoading(false);
    }
  };

  const handleCommitRebuild = async () => {
    if (!selectedBatchId || !rebuildSummary?.id) return;
    setCommitLoading(true);
    setError(null);
    try {
      const result = await commitHistoricalAttendanceRebuild(selectedBatchId, rebuildSummary.id);
      await Promise.all([refresh(), refreshWizard()]);
      setRebuildSummary(result);
      setDependencyProgress(result.dependencyRebuild ?? null);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setCommitLoading(false);
    }
  };

  const handleHistoryAction = async (
    batchId: string,
    action: 'pause' | 'resume' | 'cancel' | 'retry' | 'rollback',
  ) => {
    setHistoryActionId(`${action}:${batchId}`);
    setError(null);
    try {
      if (action === 'pause') await pauseHistoricalImportBatch(batchId);
      if (action === 'resume') await resumeHistoricalImportBatch(batchId);
      if (action === 'cancel') await cancelHistoricalImportBatch(batchId);
      if (action === 'retry') await retryHistoricalImportBatch(batchId);
      if (action === 'rollback') await rollbackHistoricalImportBatch(batchId);
      await refresh();
      if (selectedBatchId === batchId) await refreshWizard(batchId);
    } catch (err: any) {
      setError(getHistoricalImportErrorMessage(err));
    } finally {
      setHistoryActionId(null);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-3 text-lg font-bold text-red-900">Access restricted</h1>
          <p className="mt-1 text-sm text-red-700">Historical attendance imports are limited to organization super admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historical Attendance Import</h1>
          <p className="mt-1 text-sm text-slate-500">Migration batches and normalized raw punch staging</p>
        </div>
        <Button onClick={refresh} variant="outline" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Batches" value={dashboard?.stats.total_batches ?? 0} icon={UploadCloud} tone="bg-blue-50 text-blue-700" />
        <Metric label="Active" value={dashboard?.stats.active_batches ?? 0} icon={Clock3} tone="bg-amber-50 text-amber-700" />
        <Metric label="Imported Records" value={dashboard?.stats.imported_records ?? 0} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
        <Metric label="Failed Records" value={dashboard?.stats.failed_records ?? 0} icon={AlertTriangle} tone="bg-red-50 text-red-700" />
        <Metric label="Warnings" value={dashboard?.stats.warnings ?? 0} icon={AlertTriangle} tone="bg-orange-50 text-orange-700" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900">Import Sources</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
            <select
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value as HistoricalImportSourceType)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {HISTORICAL_IMPORT_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>{sourceLabels[type]}</option>
              ))}
            </select>
            <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Source name" />
            <Button onClick={handleCreateSource} disabled={savingSource || !sourceName.trim()} className="gap-2">
              {savingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {sources.map((source) => (
              <span key={source.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {source.name} - {sourceLabels[source.source_type]}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900">New Batch</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto]">
            <select
              value={selectedSourceId}
              onChange={(event) => setSelectedSourceId(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Select source</option>
              {activeSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button onClick={handleCreateBatch} disabled={savingBatch || !selectedSourceId || !dateFrom || !dateTo} className="gap-2">
              {savingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900">Mapping Wizard</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedBatchId}
              onChange={(event) => setSelectedBatchId(event.target.value)}
              className="h-9 min-w-48 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Select batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.id.slice(0, 8)} - {batch.source_name || 'Source'}
                </option>
              ))}
            </select>
            <Button onClick={handleAutoMatch} disabled={!selectedBatchId || mappingLoading} className="gap-2">
              {mappingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Auto Match
            </Button>
            <Button onClick={handleValidate} disabled={!selectedBatchId || validationLoading} variant="outline" className="gap-2">
              {validationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Validate
            </Button>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2">
              <Clock3 className="h-4 w-4 text-slate-400" />
              <Input
                type="number"
                min={0}
                max={120}
                value={toleranceMinutes}
                onChange={(event) => setToleranceMinutes(Math.max(0, Math.min(120, Number(event.target.value) || 0)))}
                className="h-8 w-16 border-0 px-1"
                aria-label="Tolerance minutes"
              />
            </div>
            <Button onClick={handleReconcile} disabled={!selectedBatchId || reconciliationLoading} variant="outline" className="gap-2">
              {reconciliationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Preview
            </Button>
            <Button onClick={handleCreateRebuildSummary} disabled={!selectedBatchId || rebuildLoading} variant="outline" className="gap-2">
              {rebuildLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Summary
            </Button>
            <Button
              onClick={handleCommitRebuild}
              disabled={!selectedBatchId || !rebuildSummary?.summary.canCommit || commitLoading || rebuildSummary.status === 'committed'}
              className="gap-2"
            >
              {commitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Commit
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-bold uppercase text-slate-400">Unknown User Queue</p>
            </div>
            <Table containerClassName="max-h-[320px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unknownUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-400">No unknown users for this batch</TableCell>
                  </TableRow>
                ) : unknownUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    onClick={() => setSelectedUnknownId(user.id)}
                    className={cn('cursor-pointer', selectedUnknownId === user.id && 'bg-blue-50')}
                  >
                    <TableCell className="font-mono text-xs">{user.source_identifier}</TableCell>
                    <TableCell className="text-slate-600">{user.source_identifier_type}</TableCell>
                    <TableCell>{user.row_count}</TableCell>
                    <TableCell>{user.best_confidence ? `${Math.round(Number(user.best_confidence) * 100)}%` : '-'}</TableCell>
                    <TableCell><StatusPill status={user.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-bold uppercase text-slate-400">Resolve Mapping</p>
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">{selectedUnknown?.source_identifier || 'Select an unknown user'}</p>
              <p className="text-xs text-slate-500">{selectedUnknown?.source_identifier_type || 'No identifier selected'}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <Input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Search employee" />
              <Button variant="outline" size="icon" onClick={handleSearchEmployees} disabled={!employeeSearch.trim()}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Select employee</option>
              {employeeResults.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.employee_code} - {employee.first_name} {employee.last_name}
                </option>
              ))}
            </select>
            <Button
              onClick={handleSaveManualMapping}
              disabled={!selectedBatchId || !selectedUnknown || !selectedEmployeeId || mappingLoading}
              className="mt-3 w-full gap-2"
            >
              {mappingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Mapping
            </Button>
          </div>
        </div>
      </section>

      {rebuildSummary && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Production Rebuild Summary</h2>
              <p className="text-xs text-slate-500">Run {rebuildSummary.id.slice(0, 8)} - {rebuildSummary.status}</p>
            </div>
            <StatusPill status={rebuildSummary.summary.canCommit ? 'ready' : 'blocked'} />
          </div>
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4 xl:grid-cols-8">
            <Metric label="Accepted" value={rebuildSummary.summary.acceptedPunches} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
            <Metric label="Create" value={rebuildSummary.summary.attendanceToCreate} icon={Plus} tone="bg-emerald-50 text-emerald-700" />
            <Metric label="Update" value={rebuildSummary.summary.attendanceToUpdate} icon={FileSpreadsheet} tone="bg-blue-50 text-blue-700" />
            <Metric label="Missing" value={rebuildSummary.summary.missingPunches} icon={AlertTriangle} tone="bg-amber-50 text-amber-700" />
            <Metric label="Breaks" value={rebuildSummary.summary.breakSessions} icon={Clock3} tone="bg-slate-100 text-slate-700" />
            <Metric label="Overtime" value={rebuildSummary.summary.overtimeDays} icon={Clock3} tone="bg-purple-50 text-purple-700" />
            <Metric label="Applied" value={rebuildSummary.summary.alreadyAppliedPunches} icon={CheckCircle2} tone="bg-slate-100 text-slate-700" />
            <Metric label="Blockers" value={rebuildSummary.summary.blockers} icon={ShieldAlert} tone="bg-red-50 text-red-700" />
          </div>
          {(rebuildSummary.blockers.length > 0 || rebuildSummary.warnings.length > 0) && (
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-xs font-bold uppercase text-red-700">Blockers</p>
                <div className="mt-2 space-y-2">
                  {rebuildSummary.blockers.length === 0 ? (
                    <p className="text-sm text-red-700">No blockers</p>
                  ) : rebuildSummary.blockers.slice(0, 6).map((blocker, index) => (
                    <p key={`${blocker.code}-${index}`} className="text-sm text-red-800">{blocker.message}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                <p className="text-xs font-bold uppercase text-amber-700">Warnings</p>
                <div className="mt-2 space-y-2">
                  {rebuildSummary.warnings.length === 0 ? (
                    <p className="text-sm text-amber-700">No warnings</p>
                  ) : rebuildSummary.warnings.slice(0, 6).map((warning, index) => (
                    <p key={`${warning.code}-${index}`} className="text-sm text-amber-800">{warning.message}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
          {rebuildSummary.plans?.length ? (
            <Table containerClassName="max-h-[320px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>Breaks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rebuildSummary.plans.slice(0, 20).map((plan) => (
                  <TableRow key={`${plan.employeeId}-${plan.date}`}>
                    <TableCell className="font-medium text-slate-900">{plan.employeeCode}</TableCell>
                    <TableCell>{plan.date}</TableCell>
                    <TableCell><StatusPill status={plan.operation} /></TableCell>
                    <TableCell>{plan.clockIn ? new Date(plan.clockIn).toLocaleString() : '-'}</TableCell>
                    <TableCell>{plan.clockOut ? new Date(plan.clockOut).toLocaleString() : '-'}</TableCell>
                    <TableCell>{plan.lateMinutes}</TableCell>
                    <TableCell>{plan.overtimeMinutes}</TableCell>
                    <TableCell>{plan.breakSessions}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </section>
      )}

      {dependencyProgress && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Dependent Module Rebuild</h2>
              <p className="text-xs text-slate-500">
                {dependencyProgress.affected_employees?.length ?? 0} employees - {dependencyProgress.affected_ranges?.length ?? 0} affected ranges
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-32 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{ width: `${Number(dependencyProgress.progress_percent ?? 0)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-500">{Number(dependencyProgress.progress_percent ?? 0)}%</span>
              <StatusPill status={dependencyProgress.status} />
            </div>
          </div>
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4 xl:grid-cols-6">
            <Metric label="Employees" value={dependencyProgress.affected_employees?.length ?? 0} icon={UserCheck} tone="bg-blue-50 text-blue-700" />
            <Metric label="Ranges" value={dependencyProgress.affected_ranges?.length ?? 0} icon={FileSpreadsheet} tone="bg-slate-100 text-slate-700" />
            <Metric label="Steps" value={dependencyProgress.completed_steps ?? 0} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
            <Metric label="Warnings" value={dependencyProgress.warnings?.length ?? 0} icon={AlertTriangle} tone="bg-amber-50 text-amber-700" />
            <Metric label="Total Steps" value={dependencyProgress.total_steps ?? 0} icon={Database} tone="bg-slate-100 text-slate-700" />
            <Metric label="Progress" value={Math.round(Number(dependencyProgress.progress_percent ?? 0))} icon={Clock3} tone="bg-blue-50 text-blue-700" />
          </div>
          <Table containerClassName="max-h-[320px]">
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Done</TableHead>
                <TableHead>Skipped</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dependencyProgress.steps?.map((step) => (
                <TableRow key={step.key}>
                  <TableCell className="font-medium text-slate-900">{step.label}</TableCell>
                  <TableCell><StatusPill status={step.status} /></TableCell>
                  <TableCell>{step.completed ?? 0}{step.total ? ` / ${step.total}` : ''}</TableCell>
                  <TableCell>{step.skipped ?? 0}</TableCell>
                  <TableCell className="max-w-sm truncate text-sm text-slate-600">
                    {step.warnings?.[0] || String(step.details?.note || step.details?.source || '-')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-bold text-slate-900">Import Preview</h2>
          <select
            value={previewBucket}
            onChange={(event) => setPreviewBucket(event.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">All rows</option>
            <option value="valid">Valid rows</option>
            <option value="warnings">Warnings</option>
            <option value="errors">Errors</option>
            <option value="create">Will create</option>
            <option value="update">Will update</option>
            <option value="unchanged">Unchanged</option>
            <option value="duplicates">Duplicates</option>
            <option value="unknown">Unknown employees</option>
            <option value="mapped">Mapped employees</option>
            <option value="rejected">Rejected rows</option>
            <option value="conflicts">Conflicts</option>
          </select>
        </div>
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Will Create" value={preview?.counts.attendance_to_create ?? 0} icon={Plus} tone="bg-emerald-50 text-emerald-700" />
          <Metric label="Will Update" value={preview?.counts.attendance_to_update ?? 0} icon={FileSpreadsheet} tone="bg-blue-50 text-blue-700" />
          <Metric label="Unchanged" value={preview?.counts.attendance_unchanged ?? 0} icon={CheckCircle2} tone="bg-slate-100 text-slate-700" />
          <Metric label="Duplicates" value={preview?.counts.duplicate_punches ?? preview?.counts.duplicate_rows ?? 0} icon={FileSpreadsheet} tone="bg-orange-50 text-orange-700" />
          <Metric label="Rejected" value={preview?.counts.rejected_punches ?? preview?.counts.rejected_rows ?? 0} icon={AlertTriangle} tone="bg-red-50 text-red-700" />
          <Metric label="Unknown" value={preview?.counts.unknown_employees ?? 0} icon={UserCheck} tone="bg-amber-50 text-amber-700" />
          <Metric label="Conflicts" value={preview?.counts.conflicts ?? 0} icon={AlertTriangle} tone="bg-red-50 text-red-700" />
        </div>
        <Table containerClassName="max-h-[420px]">
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Punch</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Validation</TableHead>
              <TableHead>Suggestion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!preview?.rows.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-slate-400">No preview rows</TableCell>
              </TableRow>
            ) : preview.rows.map((row) => {
              const issue = row.validation_errors[0] || row.validation_warnings[0];
              const suggestion = row.merge_suggestion?.reason || row.reconciliation_details?.reason || issue?.message || '-';
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.row_number ?? row.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-900">{row.employee_code || row.raw_employee_identifier || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{row.first_name ? `${row.first_name} ${row.last_name}` : ''}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-slate-700">{row.punched_at ? new Date(row.punched_at).toLocaleString() : '-'}</p>
                    <p className="text-xs text-slate-400">{row.punch_direction || 'unknown'}</p>
                  </TableCell>
                  <TableCell className="text-slate-600">{row.device_identifier || '-'}</TableCell>
                  <TableCell><StatusPill status={row.reconciliation_action || row.attendance_impact || row.mapping_status} /></TableCell>
                  <TableCell><StatusPill status={row.validation_status} /></TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{String(suggestion)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Import History</h2>
        </div>
        <Table containerClassName="max-h-[60vh]">
          <TableHeader>
            <TableRow>
              <TableHead>Imported By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead>Attendance Records</TableHead>
              <TableHead>Rollback Status</TableHead>
              <TableHead>Warnings</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-slate-400">No historical import batches</TableCell>
              </TableRow>
            ) : historyItems.map((batch) => {
              const canPause = ['uploading', 'processing', 'validation', 'ready'].includes(batch.status);
              const canResume = batch.status === 'paused';
              const canCancel = !['completed', 'rolling_back', 'rolled_back', 'cancelled'].includes(batch.status);
              const canRetry = ['failed', 'cancelled', 'paused'].includes(batch.status);
              const canRollback = batch.rollback_status === 'available' || batch.import_commit_status === 'rollback_failed';
              return (
              <TableRow key={batch.id}>
                <TableCell>
                  <p className="max-w-40 truncate font-medium text-slate-900">{batch.imported_by}</p>
                  <p className="font-mono text-xs text-slate-400">{batch.id.slice(0, 8)}</p>
                </TableCell>
                <TableCell className="text-slate-600">{batch.import_date ? new Date(batch.import_date).toLocaleString() : '-'}</TableCell>
                <TableCell>
                  <p className="font-medium text-slate-900">{batch.source_name || 'Source removed'}</p>
                  <p className="text-xs text-slate-400">{batch.source_type ? sourceLabels[batch.source_type] : ''}</p>
                </TableCell>
                <TableCell><StatusPill status={batch.status} /></TableCell>
                <TableCell>{formatDuration(batch.duration_ms)}</TableCell>
                <TableCell>{batch.employees ?? 0}</TableCell>
                <TableCell>{batch.attendance_records ?? 0}</TableCell>
                <TableCell><StatusPill status={batch.latest_rollback_status || batch.rollback_status || 'not_started'} /></TableCell>
                <TableCell>{batch.warnings ?? 0}</TableCell>
                <TableCell>{batch.errors ?? 0}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {canPause && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleHistoryAction(batch.id, 'pause')}
                        disabled={historyActionId === `pause:${batch.id}`}
                        title="Pause"
                      >
                        {historyActionId === `pause:${batch.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                      </Button>
                    )}
                    {canResume && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleHistoryAction(batch.id, 'resume')}
                        disabled={historyActionId === `resume:${batch.id}`}
                        title="Resume"
                      >
                        {historyActionId === `resume:${batch.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </Button>
                    )}
                    {canRetry && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleHistoryAction(batch.id, 'retry')}
                        disabled={historyActionId === `retry:${batch.id}`}
                        title="Retry"
                      >
                        {historyActionId === `retry:${batch.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    )}
                    {canRollback && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleHistoryAction(batch.id, 'rollback')}
                        disabled={historyActionId === `rollback:${batch.id}`}
                        title="Rollback"
                      >
                        {historyActionId === `rollback:${batch.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleHistoryAction(batch.id, 'cancel')}
                        disabled={historyActionId === `cancel:${batch.id}`}
                        title="Cancel"
                      >
                        {historyActionId === `cancel:${batch.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
