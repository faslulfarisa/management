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
