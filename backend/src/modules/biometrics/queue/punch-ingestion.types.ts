export const PUNCH_INGESTION_QUEUE = 'punch-ingestion';
export const PUNCH_INGESTION_JOB = 'process-punch-batch';

export interface PunchIngestionJobData {
  tenantId: string;

  /**
   * UUID of the integrations row that sourced these punches.
   * null for terminal-sourced punches — there is no biometric integration.
   * sync_logs.integration_id is a nullable FK so the engine's INSERT is safe.
   */
  integrationId: string | null;

  providerName: string;

  /** Serialized PunchEventDto array — Date fields as ISO strings */
  events: Array<{
    employeeCode: string;
    timestamp: string;
    punchType: string;
    verifyMethod: string;
    providerName: string;
    deviceId?: string;
    /** UUID of the attendance_terminals row when punch came from a trusted terminal. */
    terminalId?: string;
    /** Normalized AttendanceSource written to attendance_records.attendance_source. */
    attendanceSource?: string;
    rawPayload?: Record<string, unknown>;
  }>;

  /** Idempotency key for the batch — prevents double-enqueue on retries */
  requestId: string;
  submittedAt: string;

  /** Propagated from HTTP request for end-to-end log correlation */
  correlationId?: string;

  /**
   * Present when the batch was submitted by a trusted attendance terminal
   * (laptop / tablet / kiosk / mobile) rather than a biometric provider.
   */
  terminalId?: string;
}
