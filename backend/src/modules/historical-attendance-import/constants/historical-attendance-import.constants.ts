export const HISTORICAL_ATTENDANCE_IMPORT_PERMISSION = 'historical_attendance_import:manage';

export const HISTORICAL_ATTENDANCE_IMPORT_STATUSES = [
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

export type HistoricalAttendanceImportStatus = (typeof HISTORICAL_ATTENDANCE_IMPORT_STATUSES)[number];

export const HISTORICAL_ATTENDANCE_IMPORT_SOURCE_TYPES = [
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

export type HistoricalAttendanceImportSourceType = (typeof HISTORICAL_ATTENDANCE_IMPORT_SOURCE_TYPES)[number];

export const CANONICAL_RAW_PUNCH_SCHEMA_VERSION = 'v1';

export const HISTORICAL_ATTENDANCE_EMPLOYEE_IDENTIFIER_TYPES = [
  'employee_code',
  'device_user_id',
  'card_number',
  'biometric_employee_id',
  'pin',
  'device_code',
  'manual',
] as const;

export type HistoricalAttendanceEmployeeIdentifierType =
  (typeof HISTORICAL_ATTENDANCE_EMPLOYEE_IDENTIFIER_TYPES)[number];

export const HISTORICAL_ATTENDANCE_VALIDATION_CODES = [
  'invalid_timestamp',
  'missing_employee',
  'invalid_device',
  'invalid_date',
  'duplicate_punch',
  'unknown_user',
  'payroll_locked_date',
  'attendance_conflict',
  'invalid_shift',
] as const;

export interface CanonicalRawPunch {
  schemaVersion: typeof CANONICAL_RAW_PUNCH_SCHEMA_VERSION;
  sourceType: HistoricalAttendanceImportSourceType;
  sourceId: string;
  sourceRecordId: string | null;
  employeeIdentifier: string;
  punchTimestamp: string;
  punchDirection: 'in' | 'out' | 'break_in' | 'break_out' | 'unknown';
  deviceIdentifier: string | null;
  locationIdentifier: string | null;
  verifyMethod: string | null;
  timezone: string | null;
  metadata: Record<string, unknown>;
}
