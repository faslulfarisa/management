import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  BiometricDevice,
  DeviceStats,
  AttendanceTerminal,
  TerminalStats,
  TerminalRegistrationResult,
  RegisterTerminalPayload,
  ProviderInfo,
  ProviderHealthResult,
  DlqResponse,
  QueueHealthSnapshot,
  CorrectionRequest,
  CreateCorrectionPayload,
  AuditEntry,
} from '@/types/biometrics';

// ── Queue & DLQ ───────────────────────────────────────────────────────────────

export const queueApi = {
  getHealth: (): Promise<QueueHealthSnapshot> =>
    api.get('/biometrics/queue/health').then((r) => r.data.data),

  getDlq: (offset = 0, limit = 50): Promise<DlqResponse> =>
    api.get('/biometrics/queue/dlq', { params: { offset, limit } }).then((r) => r.data.data),

  retryJob: (jobId: string): Promise<ApiResponse<{ retried: string }>> =>
    api.post(`/biometrics/queue/dlq/${jobId}/retry`).then((r) => r.data),

  bulkRetry: (jobIds: string[]): Promise<ApiResponse<{ retried: number }>> =>
    api.post('/biometrics/queue/dlq/bulk-retry', { jobIds }).then((r) => r.data),

  discardJob: (jobId: string): Promise<ApiResponse<{ discarded: string }>> =>
    api.delete(`/biometrics/queue/dlq/${jobId}`).then((r) => r.data),

  retryAllFailed: (): Promise<ApiResponse<{ retried: number }>> =>
    api.post('/biometrics/queue/retry-failed').then((r) => r.data),
};

// ── Corrections ───────────────────────────────────────────────────────────────

export const correctionsApi = {
  listPending: (page = 1, limit = 20): Promise<{ items: CorrectionRequest[]; total: number }> =>
    api.get('/biometrics/corrections/pending', { params: { page, limit } }).then((r) => r.data.data),

  create: (payload: CreateCorrectionPayload): Promise<ApiResponse<CorrectionRequest>> =>
    api.post('/biometrics/corrections', payload).then((r) => r.data),

  approve: (id: string): Promise<ApiResponse<CorrectionRequest>> =>
    api.put(`/biometrics/corrections/${id}/approve`).then((r) => r.data),

  reject: (id: string, notes?: string): Promise<ApiResponse<CorrectionRequest>> =>
    api.put(`/biometrics/corrections/${id}/reject`, { notes }).then((r) => r.data),
};

// ── Audit ─────────────────────────────────────────────────────────────────────

export const auditApi = {
  getEmployeeHistory: (
    employeeId: string,
    from?: string,
    to?: string,
  ): Promise<AuditEntry[]> =>
    api.get(`/biometrics/audit/employee/${employeeId}`, { params: { from, to } }).then((r) => r.data.data),

  getRecordHistory: (recordId: string): Promise<AuditEntry[]> =>
    api.get(`/biometrics/audit/${recordId}`).then((r) => r.data.data),
};

// ── Providers ─────────────────────────────────────────────────────────────────

export const providersApi = {
  list: (): Promise<ProviderInfo[]> =>
    api.get('/biometrics/providers').then((r) => r.data.data),

  getHealth: (name: string): Promise<ProviderHealthResult> =>
    api.get(`/biometrics/providers/${name}/health`).then((r) => r.data.data),

  triggerSync: (integrationId: string): Promise<ApiResponse<unknown>> =>
    api.post(`/biometrics/sync/${integrationId}`).then((r) => r.data),
};

// ── Devices ───────────────────────────────────────────────────────────────────

export const devicesApi = {
  list: (params?: {
    provider?: string;
    hardware_type?: string;
    is_online?: boolean;
    is_active?: boolean;
    branch_id?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<BiometricDevice>> =>
    api.get('/biometrics/devices', { params }).then((r) => r.data.data),

  getStats: (): Promise<DeviceStats> =>
    api.get('/biometrics/devices/stats').then((r) => r.data.data),

  get: (id: string): Promise<BiometricDevice> =>
    api.get(`/biometrics/devices/${id}`).then((r) => r.data.data),

  create: (payload: any): Promise<BiometricDevice> =>
    api.post('/biometrics/devices', payload).then((r) => r.data.data),

  testHandshake: (payload: { ipAddress?: string; port?: number; providerName: string; connectionType: string }): Promise<{
    connected: boolean;
    latencyMs: number | null;
    message: string;
    timestamp: string;
  }> =>
    api.post('/biometrics/devices/test-handshake', payload).then((r) => r.data.data),

  patch: (
    id: string,
    payload: { name?: string; isActive?: boolean; metadata?: Record<string, unknown> },
  ): Promise<BiometricDevice> =>
    api.patch(`/biometrics/devices/${id}`, payload).then((r) => r.data.data),

  deactivate: (id: string): Promise<void> =>
    api.delete(`/biometrics/devices/${id}`).then(() => undefined),
};

// ── Terminals ─────────────────────────────────────────────────────────────────

export const terminalsApi = {
  list: (params?: {
    deviceType?: string;
    is_active?: boolean;
    is_online?: boolean;
    branchId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<AttendanceTerminal>> =>
    api.get('/biometrics/terminals', { params }).then((r) => r.data.data),

  getStats: (): Promise<TerminalStats> =>
    api.get('/biometrics/terminals/stats').then((r) => r.data.data),

  get: (id: string): Promise<AttendanceTerminal> =>
    api.get(`/biometrics/terminals/${id}`).then((r) => r.data.data),

  register: (payload: RegisterTerminalPayload): Promise<TerminalRegistrationResult> =>
    api.post('/biometrics/terminals', payload).then((r) => r.data.data),

  patch: (
    id: string,
    payload: {
      deviceName?: string;
      isActive?: boolean;
      allowedIps?: string[];
      metadata?: Record<string, unknown>;
      expiresAt?: string | null;
    },
  ): Promise<AttendanceTerminal> =>
    api.patch(`/biometrics/terminals/${id}`, payload).then((r) => r.data.data),

  deactivate: (id: string): Promise<void> =>
    api.delete(`/biometrics/terminals/${id}`).then(() => undefined),

  rotateToken: (id: string): Promise<{ rawToken: string }> =>
    api.post(`/biometrics/terminals/${id}/rotate-token`).then((r) => r.data.data),
};

// ── Legacy export for backward compat ────────────────────────────────────────

export const biometricsApi = {
  getQueueHealth: queueApi.getHealth,
  getDlq: queueApi.getDlq,
  retryJob: queueApi.retryJob,
  bulkRetry: queueApi.bulkRetry,
  discardJob: queueApi.discardJob,
  getPendingCorrections: correctionsApi.listPending,
  approveCorrection: correctionsApi.approve,
  rejectCorrection: correctionsApi.reject,
  createCorrection: correctionsApi.create,
  getEmployeeAuditHistory: auditApi.getEmployeeHistory,
  listProviders: providersApi.list,
};
