/**
 * easytimepro.config.dto.ts
 *
 * Typed configuration for an EasyTimePro integration.
 * Stored in integrations.config (JSONB) in the Ai-HRMS database.
 *
 * EasyTimePro supports two sync modes:
 *   - 'mssql'  : Direct SQL Server database polling (most common on-premise deployment)
 *   - 'api'    : REST API polling (cloud/SaaS deployments)
 */

export type EasyTimeProSyncMode = 'mssql' | 'api' | 'postgres';

export interface EasyTimeProConfig {
  /** Integration mode */
  syncMode: EasyTimeProSyncMode;

  // ── SQL Server Mode ───────────────────────────────────────────
  /** SQL Server host (for syncMode='mssql') */
  mssqlHost?: string;
  /** SQL Server port (default: 1433) */
  mssqlPort?: number;
  /** Database name */
  mssqlDatabase?: string;
  /** Database username */
  mssqlUsername?: string;
  /** Database password (store encrypted in production) */
  mssqlPassword?: string;

  // ── PostgreSQL Mode ───────────────────────────────────────────
  /** PostgreSQL host (for syncMode='postgres') */
  postgresHost?: string;
  /** PostgreSQL port (default: 5432) */
  postgresPort?: number;
  /** Database name */
  postgresDatabase?: string;
  /** Database username */
  postgresUsername?: string;
  /** Database password (store encrypted in production) */
  postgresPassword?: string;

  // ── API Mode ──────────────────────────────────────────────────
  /** Base URL of EasyTimePro API (for syncMode='api') */
  apiBaseUrl?: string;
  /** API key or bearer token */
  apiKey?: string;

  // ── Field Mappings ────────────────────────────────────────────
  /**
   * Column/field name in EasyTimePro that maps to Ai-HRMS employee_code.
   * Common values: 'EmployeeID', 'BadgeNumber', 'StaffCode'.
   */
  employeeCodeField: string;

  /**
   * Column/field name for the punch timestamp.
   * Common values: 'PunchTime', 'DateTime', 'Timestamp'.
   */
  timestampField: string;

  /**
   * Column/field name for punch direction (IN/OUT), if available.
   * Leave null if EasyTimePro doesn't differentiate.
   */
  punchTypeField?: string;

  /** Column/field name for provider work code, if available. */
  workCodeField?: string;

  /**
   * Column/field name for the verification mode (e.g. 'VerifyMode', 'CheckType').
   * The raw value is normalized via verification_method_mappings at runtime.
   * Leave null to fall back to VerifyMethod.OTHER for all punches.
   */
  verifyMethodField?: string;

  /**
   * Column/field name for the device serial number in the attendance log table.
   * Common values: 'SN', 'DeviceSN', 'MachineNumber'.
   * Used to populate PunchEventDto.deviceId for device-level traceability.
   */
  deviceSerialField?: string;

  // ── Table Name Overrides ───────────────────────────────────────
  /**
   * Override the attendance log table name (default: 'AttLogs').
   * Some EasyTimePro deployments rename this table.
   */
  attendanceLogTable?: string;

  /**
   * Override the device table name (default: 'Machines').
   * Used when syncing device inventory from EasyTimePro.
   */
  deviceTable?: string;

  /**
   * Override the employee table name (default: 'Employees').
   * Used when syncing employee metadata from EasyTimePro.
   */
  employeeTable?: string;

  // ── Sync Control ──────────────────────────────────────────────
  /** How often to poll in minutes (default: 5) */
  syncIntervalMinutes: number;

  /**
   * Maximum number of rows to fetch per sync run (default: 500).
   * Lower this on slow MSSQL connections; raise it for high-volume deployments.
   */
  syncBatchSize?: number;

  /**
   * Watermark: the last successfully synced punch timestamp.
   * The engine updates this after each successful sync cycle.
   * Format: ISO 8601 string.
   */
  lastSyncCursor?: string;
}
