// ── Enums ────────────────────────────────────────────────────────────────────

export enum PunchDirection {
  IN = 'IN',
  OUT = 'OUT',
  UNKNOWN = 'UNKNOWN',
}

export enum VerifyMethod {
  FINGERPRINT = 'fingerprint',
  FACE = 'face',
  CARD = 'card',
  PASSWORD = 'password',
  HYBRID = 'hybrid',
  OTHER = 'other',
}

export enum AttendanceSource {
  BIOMETRIC_DEVICE = 'biometric_device',
  FACE_DEVICE = 'face_device',
  FINGERPRINT_DEVICE = 'fingerprint_device',
  CARD_DEVICE = 'card_device',
  MOBILE_TERMINAL = 'mobile_terminal',
  LAPTOP_TERMINAL = 'laptop_terminal',
  KIOSK_TERMINAL = 'kiosk_terminal',
}

export enum HardwareType {
  FINGERPRINT = 'fingerprint',
  FACE = 'face',
  CARD = 'card',
  HYBRID = 'hybrid',
  UNKNOWN = 'unknown',
}

export enum TerminalDeviceType {
  LAPTOP = 'laptop',
  TABLET = 'tablet',
  MOBILE = 'mobile',
  KIOSK = 'kiosk',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  OFFLINE = 'offline',
}

// ── WebSocket Events ──────────────────────────────────────────────────────────

export interface PunchBroadcast {
  tenantId: string;
  branchId?: string;
  employeeCode: string;
  employeeName?: string;
  department?: string;
  timestamp: string;
  punchType: PunchDirection;
  verifyMethod?: VerifyMethod;
  attendanceSource?: AttendanceSource;
  provider: string;
  deviceId?: string;
  terminalId?: string;
  recordId?: string;
  isLate?: boolean;
  isOvertime?: boolean;
}

export interface QueueHealthSnapshot {
  depth: number;
  active: number;
  failed: number;
  workers: number;
  dlqCount?: number;
  syncLag?: number;
  timestamp: string;
}

export interface QueueSnapshot {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  completed: number;
  paused: boolean;
  workers: number;
  depth: number;
}

export interface OfflineBufferSummary {
  total: number;
  [key: string]: unknown;
}

export interface SyncFailureSummary {
  id: string;
  tenant_id?: string;
  provider_name?: string;
  cursor_type?: string;
  status: 'failed' | 'partial' | string;
  error_summary?: string | null;
  started_at?: string;
  completed_at?: string | null;
  records_fetched?: number;
  records_synced?: number;
  records_failed?: number;
}

export interface QueueDiagnostics {
  status: 'healthy' | 'degraded' | 'critical';
  queues: {
    punchIngestion: QueueSnapshot;
    biometricSync: QueueSnapshot;
  };
  offlineBuffer: OfflineBufferSummary;
  recentSyncFailures: SyncFailureSummary[];
  timestamp: string;
}

export interface BiometricsOperationsSummary {
  status: 'healthy' | 'needs_review' | 'action_required';
  generatedAt: string;
  platform: {
    integrations: number;
    activeIntegrations: number;
    providerTypes: number;
    queueDepth: number;
    failedQueueItems: number;
    protectedSubmissions24h: number;
    replayAttacksBlocked24h: number;
  };
  tenant: {
    unknownEmployees: number;
    rejectedPunches: number;
    recoveredPunches: number;
    affectedEmployees: number;
  };
  system: {
    failedSyncs: number;
    failedSyncRecords: number;
    syncedRecords24h: number;
    lastSuccessfulSyncAt?: string | null;
    retryQueueDepth: number;
    deadLetterQueueDepth: number;
    offlineBufferDepth: number;
  };
  devices: {
    totalDevices: number;
    onlineDevices: number;
    offlineDevices: number;
    staleHeartbeats: number;
    lastHeartbeatAt?: string | null;
  };
  terminals: {
    totalTerminals: number;
    onlineTerminals: number;
    offlineTerminals: number;
    lastHeartbeatAt?: string | null;
  };
  history: {
    sync: Array<Record<string, unknown>>;
    commands: Array<Record<string, unknown>>;
    punches: Array<Record<string, unknown>>;
  };
}

export interface BiometricsAlert {
  id: string;
  level: 'info' | 'warn' | 'error';
  title: string;
  message: string;
  timestamp: string;
  category: 'device' | 'terminal' | 'queue' | 'provider' | 'sync';
}

// ── API Response Types ────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Device Types ──────────────────────────────────────────────────────────────

export interface BiometricDevice {
  id: string;
  tenantId: string;
  serialNumber: string;
  providerName: string;
  providerDeviceId?: string;
  name?: string;
  ipAddress?: string;
  firmwareVersion?: string;
  hardwareType: HardwareType;
  capabilities: string[];
  platform?: string;
  isOnline: boolean;
  isActive: boolean;
  lastSeenAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCommand {
  id: string;
  tenant_id: string;
  integration_id?: string | null;
  biometric_device_id?: string | null;
  provider_name: string;
  device_serial_number: string;
  command_key: string;
  command_type: string;
  command_payload?: Record<string, unknown> | null;
  priority: number;
  status: 'pending' | 'sent' | 'acknowledged' | 'succeeded' | 'failed' | 'expired' | string;
  queued_at?: string;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  result_code?: string | null;
  return_code?: string | null;
  result_message?: string | null;
  result_payload?: Record<string, unknown> | null;
  expires_at?: string | null;
  created_by?: string | null;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  byProvider: Array<{ provider: string; total: number; online: number }>;
  byHardwareType: Array<{ hardwareType: string; count: number }>;
}

// ── Terminal Types ────────────────────────────────────────────────────────────

export interface AttendanceTerminal {
  id: string;
  tenantId: string;
  branchId?: string;
  deviceName: string;
  deviceType: TerminalDeviceType;
  allowedIps: string[];
  isActive: boolean;
  isOnline: boolean;
  lastPingAt?: string;
  lastPunchAt?: string;
  registeredBy: string;
  expiresAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalStats {
  total: number;
  online: number;
  offline: number;
  byType: {
    laptops: number;
    tablets: number;
    mobiles: number;
    kiosks: number;
  };
}

export interface RegisterTerminalPayload {
  deviceName: string;
  deviceType: TerminalDeviceType;
  branchId?: string;
  allowedIps?: string[];
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TerminalRegistrationResult {
  terminal: AttendanceTerminal;
  rawToken: string;
}

// ── Provider Types ────────────────────────────────────────────────────────────

export interface ProviderInfo {
  name: string;
}

export interface ProviderHealthResult {
  healthy: boolean;
  providerName: string;
  latencyMs?: number;
  lastSyncAt?: string;
  details?: Record<string, unknown>;
  error?: string;
}

// ── Queue / DLQ Types ─────────────────────────────────────────────────────────

export interface DlqJob {
  id: string;
  provider: string;
  tenant: string;
  punchCount: number;
  failedReason: string;
  stacktrace?: string[];
  attemptsMade: number;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface DlqResponse {
  total: number;
  offset: number;
  limit: number;
  jobs: DlqJob[];
}

// ── Correction Types ──────────────────────────────────────────────────────────

export interface CorrectionRequest {
  id: string;
  tenantId: string;
  attendanceRecordId: string;
  correctionType: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  reviewedBy?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCorrectionPayload {
  attendance_record_id: string;
  correction_type: string;
  requested_clock_in?: string;
  requested_clock_out?: string;
  reason: string;
}

// ── Audit Types ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  recordId: string;
  action: string;
  performedBy: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
