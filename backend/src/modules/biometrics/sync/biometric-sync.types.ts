export const BIOMETRIC_SYNC_QUEUE = 'biometric-sync';
export const BIOMETRIC_SYNC_JOB = 'sync-run';

export type SyncCursorType = 'attendance_logs' | 'devices' | 'employees';

export interface BiometricSyncJobData {
  tenantId: string;
  integrationId: string;
  providerName: string;
  /** Which cursor types to process in this run */
  cursorTypes: SyncCursorType[];
  triggeredAt: string;
  /** Bypass per-integration interval guard */
  manual?: boolean;
  correlationId?: string;
}

/** Normalized device record produced by a sync adapter before DB upsert */
export interface DeviceSyncRecord {
  /** Provider-assigned device ID (e.g. MachineNumber from ETP) */
  providerDeviceId: string;
  /** Physical serial number — used as the deduplication key */
  serialNumber: string;
  name: string;
  ipAddress?: string;
  hardwareType: 'fingerprint' | 'face' | 'card' | 'hybrid' | 'unknown';
  /** e.g. ['fingerprint', 'card'] */
  capabilities: string[];
  /** e.g. 'ZEM800', 'ProBio' */
  platform?: string;
  firmwareVersion?: string;
  isOnline: boolean;
  lastSeenAt?: Date;
  /** Opaque provider-specific metadata stored for dashboards */
  metadata: Record<string, unknown>;
}

export interface SyncFetchResult<T> {
  records: T[];
  /** ISO-8601 timestamp or provider-native sequence value; null when no records */
  latestCursor: string | null;
  fetchedCount: number;
}

/** Normalized employee record produced by a sync adapter before DB upsert */
export interface EmployeeSyncRecord {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  gender?: string;
  dateOfJoining?: Date;
}
