/**
 * punch-event.dto.ts
 *
 * Normalized punch event — the single data currency all biometric providers
 * produce and the attendance engine consumes.
 *
 * No provider-specific fields belong here. Raw payloads go in `rawPayload`.
 */

export enum PunchDirection {
  IN = 'IN',
  OUT = 'OUT',
  UNKNOWN = 'UNKNOWN',
}

export enum VerifyMethod {
  FINGERPRINT = 'fingerprint',
  FACE        = 'face',
  CARD        = 'card',
  PASSWORD    = 'password',
  HYBRID      = 'hybrid',
  OTHER       = 'other',
}

/** Normalized attendance source — maps to attendance_records.attendance_source */
export enum AttendanceSource {
  BIOMETRIC_DEVICE   = 'biometric_device',
  FACE_DEVICE        = 'face_device',
  FINGERPRINT_DEVICE = 'fingerprint_device',
  CARD_DEVICE        = 'card_device',
  MOBILE_TERMINAL    = 'mobile_terminal',
  LAPTOP_TERMINAL    = 'laptop_terminal',
  KIOSK_TERMINAL     = 'kiosk_terminal',
}

export class PunchEventDto {
  /** Ai-HRMS employee code — must match `employees.employee_code` */
  employeeCode: string;

  /** UTC timestamp of the punch event */
  timestamp: Date;

  /** Direction (IN / OUT / UNKNOWN) */
  punchType: PunchDirection;

  /** How the employee was verified */
  verifyMethod: VerifyMethod;

  /** Name of the provider that produced this event (e.g. 'zkteco', 'easytimepro') */
  providerName: string;

  /** Device serial / provider-assigned device ID, if the provider exposes one */
  deviceId?: string;

  /** Normalized source category — written to attendance_records.attendance_source */
  attendanceSource?: AttendanceSource;

  /**
   * UUID of the attendance_terminals row when this punch came from a trusted
   * software terminal (laptop / tablet / kiosk / mobile). Null for hardware devices.
   */
  terminalId?: string;

  /** Opaque original payload from the provider for audit/debugging */
  rawPayload?: Record<string, unknown>;
}

export class ProviderSyncResultDto {
  /** Provider that performed the sync */
  provider: string;

  /** Total punch events received */
  total: number;

  /** Successfully persisted to attendance_records */
  synced: number;

  /** Punch events that failed processing */
  failed: number;

  /** Human-readable error list (truncated to first 10) */
  errors: string[];
}
