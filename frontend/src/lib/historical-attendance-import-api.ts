import api from '@/lib/api';

export const HISTORICAL_IMPORT_SOURCE_TYPES = [
  'device',
  'vendor_software',
  'easytime_pro',
  'zkteco',
  'sql_database',
  'sql_server',
  'postgresql',
  'mysql',
  'rest_api',
  'csv',
  'sdk',
] as const;

export type HistoricalImportSourceType = (typeof HISTORICAL_IMPORT_SOURCE_TYPES)[number];

export const HISTORICAL_IMPORT_STATUSES = [
  'draft',
  'uploading',
  'processing',
  'validation',
  'ready',
  'paused',
  'completed',
  'rolling_back',
  'rolled_back',
  'cancelled',
  'failed',
] as const;

export type HistoricalImportStatus = (typeof HISTORICAL_IMPORT_STATUSES)[number];

export interface HistoricalImportSource {
  id: string;
  source_type: HistoricalImportSourceType;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface HistoricalImportConnector {
  type: HistoricalImportSourceType;
  label: string;
  capabilities: {
    dateRange: boolean;
    pagination: boolean;
    chunkedImport: boolean;
    resume: boolean;
    retry: boolean;
    progress: boolean;
    largeDatasets: boolean;
    connectionValidation: boolean;
    credentialTesting: boolean;
    preview: boolean;
  };
}

export interface HistoricalImportBatch {
  id: string;
  status: HistoricalImportStatus;
  date_from: string;
  date_to: string;
  source_name?: string | null;
  source_type?: HistoricalImportSourceType | null;
  statistics?: {
    totalRecords?: number;
    stagedRecords?: number;
    importedRecords?: number;
    failedRecords?: number;
    warnings?: number;
    attendanceToCreate?: number;
    attendanceToUpdate?: number;
    attendanceUnchanged?: number;
    duplicatePunches?: number;
    rejectedPunches?: number;
    unknownEmployees?: number;
    conflicts?: number;
    previewOnly?: boolean;
  };
  total_rows?: number;
  processed_rows?: number;
  imported_records?: number;
  failed_records?: number;
  warning_count?: number;
  progress_percent?: string | number;
  phase?: string;
  message?: string | null;
  rollback_status?: 'not_started' | 'available' | 'in_progress' | 'rolled_back' | 'failed' | 'not_applicable';
  rollback_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface HistoricalImportHistoryItem extends HistoricalImportBatch {
  imported_by: string;
  import_date: string;
  duration_ms?: number | null;
  employees: number;
  attendance_records: number;
  warnings: number;
  errors: number;
  import_commit_id?: string | null;
  import_commit_status?: 'committing' | 'committed' | 'rolling_back' | 'rolled_back' | 'rollback_failed' | null;
  latest_rollback_status?: string | null;
  rolled_back_at?: string | null;
}

export interface HistoricalUnknownUser {
  id: string;
  source_identifier_type: string;
  source_identifier: string;
  row_count: number;
  candidate_count: number;
  best_candidate_employee_id?: string | null;
  best_confidence?: string | number | null;
  status: 'open' | 'resolved' | 'ignored';
  best_employee_code?: string | null;
  best_first_name?: string | null;
  best_last_name?: string | null;
}

export interface HistoricalImportEmployee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  status: string;
  biometric_employee_id?: string | null;
  device_code?: string | null;
  card_number?: string | null;
  employee_card_number?: string | null;
}

export interface HistoricalImportPreview {
  counts: {
    total_rows?: number;
    attendance_create_rows?: number;
    attendance_update_rows?: number;
    attendance_unchanged_rows?: number;
    attendance_to_create?: number;
    attendance_to_update?: number;
    attendance_unchanged?: number;
    duplicate_punches?: number;
    rejected_punches?: number;
    conflicts?: number;
    valid_rows: number;
    warning_rows: number;
    error_rows: number;
    duplicate_rows: number;
    unknown_employees: number;
    mapped_employees: number;
    rejected_rows: number;
  };
  issues: Array<{ severity: string; code: string; count: number }>;
  rows: Array<{
    id: string;
    row_number?: number | null;
    raw_employee_identifier?: string | null;
    punched_at?: string | null;
    punch_direction?: string | null;
    device_identifier?: string | null;
    mapping_status: string;
    validation_status: string;
    validation_errors: Array<{ code: string; message: string }>;
    validation_warnings: Array<{ code: string; message: string }>;
    duplicate_of_row_id?: string | null;
    rejected_reason?: string | null;
    employee_code?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    reconciliation_action?: 'create' | 'update' | 'unchanged' | 'duplicate' | 'rejected' | 'unknown_employee' | 'conflict' | null;
    attendance_impact?: 'create' | 'update' | 'unchanged' | 'none' | null;
    conflict_type?: string | null;
    existing_attendance_record_id?: string | null;
    duplicate_of_staging_row_id?: string | null;
    duplicate_of_attendance_record_id?: string | null;
    merge_suggestion?: Record<string, unknown>;
    reconciliation_details?: Record<string, unknown>;
    tolerance_minutes?: number | null;
  }>;
  meta?: {
    page: number;
    limit: number;
    reconciled?: boolean;
  };
}

export interface HistoricalAttendanceRebuildSummary {
  id: string;
  status: 'summary' | 'committing' | 'committed' | 'failed' | 'cancelled';
  summary: {
    acceptedPunches: number;
    pendingPunches: number;
    alreadyAppliedPunches: number;
    attendanceToCreate: number;
    attendanceToUpdate: number;
    attendanceUnchanged: number;
    multiplePunchDays: number;
    nightShiftDays: number;
    lateArrivals: number;
    earlyDepartures: number;
    overtimeDays: number;
    missingPunches: number;
    breakSessions: number;
    holidayWorkDays: number;
    weeklyOffWorkDays: number;
    leaveOverlapDays: number;
    noShiftDays: number;
    blockers: number;
    canCommit: boolean;
    recordsCreated?: number;
    recordsUpdated?: number;
    punchesLinked?: number;
    breakSessionsCreated?: number;
  };
  blockers: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  dependencyRebuild?: HistoricalAttendanceDependencyRebuildRun | null;
  plans?: Array<{
    employeeId: string;
    employeeCode: string;
    date: string;
    operation: 'create' | 'update' | 'unchanged';
    punchCount: number;
    clockIn?: string | null;
    clockOut?: string | null;
    status: string;
    lateMinutes: number;
    earlyDepartureMinutes: number;
    overtimeMinutes: number;
    breakSessions: number;
    dayClassification: string;
    leaveOverlap: boolean;
    blockers: Array<{ code: string; message: string }>;
    warnings: string[];
  }>;
}

export interface HistoricalAttendanceDependencyRebuildRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'completed_with_warnings' | 'failed';
  total_steps: number;
  completed_steps: number;
  progress_percent: string | number;
  affected_employees: Array<{
    employeeId: string;
    employeeCode: string;
    branchId?: string | null;
    departmentId?: string | null;
  }>;
  affected_ranges: Array<{
    employeeId: string;
    employeeCode: string;
    dateFrom: string;
    dateTo: string;
  }>;
  steps: Array<{
    key: string;
    label: string;
    status: 'pending' | 'running' | 'completed' | 'skipped' | 'warning' | 'failed';
    total?: number;
    completed?: number;
    skipped?: number;
    warnings?: string[];
    details?: Record<string, unknown>;
  }>;
  summary: Record<string, unknown>;
  warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface HistoricalImportDashboard {
  stats: {
    total_batches: number;
    active_batches: number;
    imported_records: number;
    failed_records: number;
    warnings: number;
  };
  recentBatches: HistoricalImportBatch[];
  sourcesByType: Array<{ source_type: HistoricalImportSourceType; count: number }>;
  recentWarnings: Array<{ id: string; level: string; message: string; created_at: string }>;
  supportedSourceTypes: string[];
}

export interface HistoricalImportExecutionStatus {
  id: string;
  batch_id: string;
  queue_job_id?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  records_processed: number;
  records_staged: number;
  records_failed: number;
  chunks_processed: number;
  connector_cursor?: string | null;
  connector_has_more?: boolean | null;
  total_rows?: number | null;
  processed_rows?: number | null;
  failed_records?: number | null;
  warning_count?: number | null;
  progress_percent?: string | number | null;
  throughput_records_per_min?: string | number | null;
  phase?: string | null;
  message?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface HistoricalImportAnalytics {
  overview: {
    total_batches: number;
    total_records: number;
    staged_records: number;
    failed_records: number;
    warnings: number;
    avg_records_per_minute?: string | number | null;
  };
  bySource: Array<{ source_type: string; batches: number; records: number }>;
  byStatus: Array<{ status: HistoricalImportStatus; count: number }>;
  volumeBands: { over_100k: number; over_500k: number; over_1m: number };
}

export interface HistoricalImportMonitoring {
  queue: {
    waiting: number;
    active: number;
    failed: number;
    delayed: number;
    workers: number;
  };
  recentJobs: HistoricalImportExecutionStatus[];
}

export interface HistoricalImportProductionValidation {
  rollbackCapable: boolean;
  auditLogs: boolean;
  liveBiometricSyncUnchanged: boolean;
  integrations: Record<string, boolean>;
  scaleReadiness: {
    over100k: boolean;
    over500k: boolean;
    over1m: boolean;
    notes: string;
  };
  scenarios: {
    deviceOnly: boolean;
    vendorSoftwareOnly: boolean;
    deviceAndVendor: boolean;
    mixedSources: boolean;
  };
}

export async function getHistoricalImportDashboard() {
  const res = await api.get<{ data: HistoricalImportDashboard }>('/historical-attendance-import/dashboard');
  return res.data.data;
}

export async function getHistoricalImportAnalytics() {
  const res = await api.get<{ data: HistoricalImportAnalytics }>('/historical-attendance-import/analytics');
  return res.data.data;
}

export async function getHistoricalImportMonitoring() {
  const res = await api.get<{ data: HistoricalImportMonitoring }>('/historical-attendance-import/monitoring');
  return res.data.data;
}

export async function getHistoricalImportProductionValidation() {
  const res = await api.get<{ data: HistoricalImportProductionValidation }>(
    '/historical-attendance-import/production-validation',
  );
  return res.data.data;
}

export async function listHistoricalImportSources() {
  const res = await api.get<{ data: HistoricalImportSource[] }>('/historical-attendance-import/sources');
  return res.data.data || [];
}

export async function listHistoricalImportConnectors() {
  const res = await api.get<{ data: HistoricalImportConnector[] }>('/historical-attendance-import/connectors');
  return res.data.data || [];
}

export async function createHistoricalImportSource(payload: {
  source_type: HistoricalImportSourceType;
  name: string;
  description?: string;
}) {
  const res = await api.post('/historical-attendance-import/sources', payload);
  return res.data.data;
}

export async function createHistoricalImportBatch(payload: {
  source_id: string;
  date_from: string;
  date_to: string;
  notes?: string;
}) {
  const res = await api.post('/historical-attendance-import/batches', payload);
  return res.data.data;
}

export async function validateHistoricalImportConnector(sourceId: string, configOverride?: Record<string, unknown>) {
  const res = await api.post(`/historical-attendance-import/sources/${sourceId}/connectors/validate`, { configOverride });
  return res.data.data;
}

export async function testHistoricalImportConnector(sourceId: string, configOverride?: Record<string, unknown>) {
  const res = await api.post(`/historical-attendance-import/sources/${sourceId}/connectors/test`, { configOverride });
  return res.data.data;
}

export async function previewHistoricalImportConnector(sourceId: string, payload: {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
  csvContent?: string;
  records?: Record<string, unknown>[];
  configOverride?: Record<string, unknown>;
}) {
  const res = await api.post(`/historical-attendance-import/sources/${sourceId}/connectors/preview`, payload);
  return res.data.data;
}

export async function importHistoricalConnectorChunk(batchId: string, payload: {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
  csvContent?: string;
  records?: Record<string, unknown>[];
  configOverride?: Record<string, unknown>;
}) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/connectors/import-chunk`, payload);
  return res.data.data;
}

export async function importHistoricalConnector(batchId: string, payload: {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
  maxChunks?: number;
  csvContent?: string;
  records?: Record<string, unknown>[];
  configOverride?: Record<string, unknown>;
}) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/connectors/import`, payload);
  return res.data.data;
}

export async function enqueueHistoricalConnectorImport(batchId: string, payload: {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
  offset?: number;
  maxChunks?: number;
  csvContent?: string;
  records?: Record<string, unknown>[];
  configOverride?: Record<string, unknown>;
}) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/connectors/enqueue`, payload);
  return res.data.data;
}

export async function getHistoricalImportExecution(batchId: string) {
  const res = await api.get<{ data: HistoricalImportExecutionStatus | null }>(
    `/historical-attendance-import/batches/${batchId}/execution`,
  );
  return res.data.data;
}

export async function listHistoricalImportBatches() {
  const res = await api.get<{ data: HistoricalImportBatch[] }>('/historical-attendance-import/batches', {
    params: { limit: 50 },
  });
  return res.data.data || [];
}

export async function listHistoricalImportHistory() {
  const res = await api.get<{ data: HistoricalImportHistoryItem[] }>('/historical-attendance-import/history', {
    params: { limit: 50 },
  });
  return res.data.data || [];
}

export async function pauseHistoricalImportBatch(batchId: string, reason?: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/pause`, { reason });
  return res.data.data;
}

export async function resumeHistoricalImportBatch(batchId: string, reason?: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/resume`, { reason });
  return res.data.data;
}

export async function cancelHistoricalImportBatch(batchId: string, reason?: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/cancel`, { reason });
  return res.data.data;
}

export async function retryHistoricalImportBatch(batchId: string, reason?: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/retry`, { reason });
  return res.data.data;
}

export async function rollbackHistoricalImportBatch(batchId: string, reason?: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/rollback`, { reason });
  return res.data.data;
}

export async function autoMatchHistoricalImportBatch(batchId: string, approveHighConfidence = false) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/mapping/auto-match`, {
    approveHighConfidence,
  });
  return res.data.data;
}

export async function listHistoricalImportUnknownUsers(batchId: string) {
  const res = await api.get<{ data: HistoricalUnknownUser[] }>(
    `/historical-attendance-import/batches/${batchId}/mapping/unknown-users`,
  );
  return res.data.data || [];
}

export async function searchHistoricalImportEmployees(search: string) {
  const res = await api.get<{ data: HistoricalImportEmployee[] }>('/historical-attendance-import/employees/search', {
    params: { search, limit: 12 },
  });
  return res.data.data || [];
}

export async function saveManualHistoricalImportMapping(batchId: string, payload: {
  source_identifier_type: string;
  source_identifier: string;
  employee_id: string;
  notes?: string;
}) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/mapping/manual`, payload);
  return res.data.data;
}

export async function validateHistoricalImportBatch(batchId: string) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/validate`);
  return res.data.data;
}

export async function reconcileHistoricalImportBatch(batchId: string, payload?: {
  toleranceMinutes?: number;
  sourcePriority?: string[];
}) {
  const res = await api.post(`/historical-attendance-import/batches/${batchId}/reconcile`, payload || {});
  return res.data.data;
}

export async function getHistoricalImportPreview(batchId: string, bucket?: string) {
  const res = await api.get<{ data: HistoricalImportPreview }>(`/historical-attendance-import/batches/${batchId}/preview`, {
    params: { limit: 50, bucket },
  });
  return res.data.data;
}

export async function createHistoricalAttendanceRebuildSummary(batchId: string) {
  const res = await api.post<{ data: HistoricalAttendanceRebuildSummary }>(
    `/historical-attendance-import/batches/${batchId}/rebuild/summary`,
    {},
  );
  return res.data.data;
}

export async function commitHistoricalAttendanceRebuild(batchId: string, summaryRunId: string) {
  const res = await api.post<{ data: HistoricalAttendanceRebuildSummary }>(
    `/historical-attendance-import/batches/${batchId}/rebuild/commit`,
    { summaryRunId },
  );
  return res.data.data;
}

export async function getHistoricalAttendanceDependencyProgress(batchId: string) {
  const res = await api.get<{ data: HistoricalAttendanceDependencyRebuildRun | null }>(
    `/historical-attendance-import/batches/${batchId}/dependencies/progress`,
  );
  return res.data.data;
}

export async function listHistoricalImportJobs() {
  const res = await api.get<{ data: HistoricalImportBatch[] }>('/operations/historical-attendance-import/jobs', {
    params: { limit: 50 },
  });
  return res.data.data || [];
}

export async function getHistoricalImportCapability(tenantId: string) {
  const res = await api.get<{ data: { historical_attendance_import_enabled: boolean } }>(
    `/operations/historical-attendance-import/organizations/${tenantId}/capability`,
  );
  return res.data.data;
}

export async function updateHistoricalImportCapability(tenantId: string, enabled: boolean) {
  const res = await api.put(`/operations/historical-attendance-import/organizations/${tenantId}/capability`, { enabled });
  return res.data.data;
}
