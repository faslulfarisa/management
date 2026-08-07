/**
 * Vendor-independent attendance computation engine.
 *
 * Providers only normalize raw payloads into PunchEventDto. This service owns
 * deduplication, shift correlation, clock-in/out, late/early/break math,
 * attendance UPSERTs, punch sequence persistence, audit logs, and live events.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import {
  AttendanceSource,
  PunchDirection,
  PunchEventDto,
  ProviderSyncResultDto,
  VerifyMethod,
} from '../dto/punch-event.dto';
import { PunchFingerprintService } from '../services/punch-fingerprint.service';
import { AttendanceAuditService } from '../services/attendance-audit.service';
import { ShiftCacheService, ShiftRow } from '../services/shift-cache.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { BiometricsGateway } from '../gateways/biometrics.gateway';

interface EmployeeLookup {
  id: string;
  branch_id: string | null;
}

interface ShiftContext {
  shift: ShiftRow | null;
  shiftDate: string;
  shiftStart: Date | null;
  shiftEnd: Date | null;
}

interface CanonicalPunch {
  fingerprint: string;
  employeeCode: string;
  timestamp: Date;
  punchType: PunchDirection;
  verifyMethod: VerifyMethod;
  providerName: string;
  deviceId?: string;
  terminalSerialNumber?: string;
  workCode?: string;
  punchState?: string;
  rawVerifyType?: string;
  requestId?: string;
  correlationId?: string;
  syncBatchId?: string;
  sourceIp?: string;
  sourceUserAgent?: string;
  terminalId?: string;
  attendanceSource?: AttendanceSource;
  gps?: PunchEventDto['gps'];
  photo?: PunchEventDto['photo'];
  locationMetadata?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}

interface AttendanceComputation {
  clockIn: Date;
  clockOut: Date;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  totalBreakMinutes: number;
  unpaidBreakMinutes: number;
  punchCount: number;
  punchSequence: Record<string, unknown>[];
}

@Injectable()
export class AttendanceEngineService {
  private readonly logger = new Logger(AttendanceEngineService.name);

  constructor(
    readonly db: DatabaseService,
    private readonly fingerprints: PunchFingerprintService,
    private readonly audit: AttendanceAuditService,
    private readonly shiftCache: ShiftCacheService,
    private readonly gateway: BiometricsGateway,
    @Inject(forwardRef(() => NotificationEmitterService))
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  async processPunchEvents(
    tenantId: string,
    integrationId: string | null,
    events: PunchEventDto[],
  ): Promise<ProviderSyncResultDto> {
    const syncStartedAt = new Date();
    const normalized = events
      .map((event) => this.normalizePunch(event))
      .filter((event): event is PunchEventDto => event !== null)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const providerName = normalized[0]?.providerName ?? events[0]?.providerName ?? 'unknown';

    this.logger.log(`[${providerName}] Processing ${normalized.length} normalized punch events for tenant ${tenantId}`);

    const { unique, duplicateCount } = await this.fingerprints.filterDuplicates(tenantId, normalized);

    if (unique.length === 0) {
      if (duplicateCount > 0) {
        this.logger.log(`[${providerName}] All ${normalized.length} punches were duplicates`);
      }
      await this._writeSyncLog(tenantId, integrationId, normalized.length, 0, [], syncStartedAt);
      await this._touchIntegration(integrationId);
      return { provider: providerName, total: normalized.length, synced: 0, failed: 0, errors: [] };
    }

    const employeeCodes = [...new Set(unique.map((event) => event.employeeCode))];
    const employeeMap = await this.lookupEmployees(tenantId, employeeCodes);

    const unknownCodes = employeeCodes.filter((code) => !employeeMap.has(code));
    if (unknownCodes.length > 0) {
      this.logger.warn(`[${providerName}] Unknown employee codes: ${unknownCodes.join(', ')}`);
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const event of unique) {
      const employee = employeeMap.get(event.employeeCode);
      if (!employee) {
        await this.createPendingPunchReview(tenantId, integrationId, event);
        skipped++;
        continue;
      }

      try {
        const processed = await this.processSinglePunch(tenantId, employee, event);
        this.gateway.broadcastPunch({
          tenantId,
          employeeCode: event.employeeCode,
          timestamp: event.timestamp.toISOString(),
          punchType: event.punchType,
          provider: event.providerName,
          deviceId: event.deviceId,
          terminalId: event.terminalId,
          attendanceSource: event.attendanceSource,
          verifyMethod: event.verifyMethod,
          recordId: processed.recordId ?? undefined,
          branchId: processed.branchId ?? undefined,
        });
        synced++;
      } catch (err: any) {
        const message = `${event.employeeCode}: ${err?.message ?? 'Unknown error'}`;
        this.logger.error(`[${providerName}] Failed to process punch: ${message}`, err?.stack);
        errors.push(message);
      }
    }

    await this._writeSyncLog(tenantId, integrationId, normalized.length, synced, errors, syncStartedAt);
    await this._touchIntegration(integrationId);

    return {
      provider: providerName,
      total: normalized.length,
      synced,
      failed: unique.length - synced - skipped,
      errors,
    };
  }

  private async processSinglePunch(
    tenantId: string,
    employee: EmployeeLookup,
    event: PunchEventDto,
  ): Promise<{ recordId: string | null; branchId: string | null; shiftDate: string }> {
    const shiftContext = await this.resolveShiftContext(tenantId, employee.id, event.timestamp);
    const before = await this.getExistingAttendance(tenantId, employee.id, shiftContext.shiftDate);
    const sequence = this.mergePunchSequence(
      tenantId,
      event.employeeCode,
      before?.punch_sequence,
      event,
    );
    const computed = this.computeAttendance(sequence, shiftContext);
    const provenance = sequence[sequence.length - 1];
    const record = await this.upsertAttendanceRecord(
      tenantId,
      employee,
      shiftContext,
      computed,
      provenance,
    );

    await this.auditPunch(tenantId, employee.id, record.id, event, shiftContext.shiftDate);
    await this.auditRecordMutation(tenantId, employee.id, record.id, before, record, computed);
    await this.linkFingerprint(tenantId, event, record.id);
    await this.notifyLateArrival(tenantId, employee.branch_id, event.employeeCode, record.id, before, computed, shiftContext.shiftDate);

    return { recordId: record.id, branchId: employee.branch_id, shiftDate: shiftContext.shiftDate };
  }

  private normalizePunch(event: PunchEventDto): PunchEventDto | null {
    const employeeCode = String(event.employeeCode ?? '').trim();
    const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
    if (!employeeCode || isNaN(timestamp.getTime())) return null;

    return {
      ...event,
      employeeCode,
      timestamp,
      punchType: this.normalizePunchDirection(event.punchType ?? event.punchState),
      verifyMethod: this.normalizeVerifyMethod(event.verifyMethod),
      providerName: String(event.providerName ?? 'unknown').trim().toLowerCase() || 'unknown',
      attendanceSource: this.normalizeAttendanceSource(event.attendanceSource),
    };
  }

  private normalizePunchDirection(raw?: string): PunchDirection {
    const value = String(raw ?? '').trim().toUpperCase();
    if (['IN', 'CHECKIN', 'CHECK IN', 'CLOCK_IN', 'CLOCKIN', '0'].includes(value)) return PunchDirection.IN;
    if (['OUT', 'CHECKOUT', 'CHECK OUT', 'CLOCK_OUT', 'CLOCKOUT', '1'].includes(value)) return PunchDirection.OUT;
    if (['BREAK_OUT', 'BREAKOUT', 'BREAK OUT', 'LUNCH_OUT', 'LUNCH OUT', 'BO', '2'].includes(value)) return PunchDirection.BREAK_OUT;
    if (['BREAK_IN', 'BREAKIN', 'BREAK IN', 'LUNCH_IN', 'LUNCH IN', 'BI', '3'].includes(value)) return PunchDirection.BREAK_IN;
    return PunchDirection.UNKNOWN;
  }

  private normalizeVerifyMethod(raw?: string): VerifyMethod {
    const value = String(raw ?? '').trim().toLowerCase();
    if (Object.values(VerifyMethod).includes(value as VerifyMethod)) return value as VerifyMethod;
    return VerifyMethod.OTHER;
  }

  private normalizeAttendanceSource(raw?: AttendanceSource): AttendanceSource {
    if (raw && Object.values(AttendanceSource).includes(raw)) return raw;
    return AttendanceSource.BIOMETRIC_DEVICE;
  }

  private async lookupEmployees(tenantId: string, employeeCodes: string[]): Promise<Map<string, EmployeeLookup>> {
    if (employeeCodes.length === 0) return new Map();

    const { rows } = await this.db.query(
      `SELECT id, employee_code, branch_id
       FROM employees
       WHERE tenant_id = $1
         AND employee_code = ANY($2::text[])
         AND deleted_at IS NULL`,
      [tenantId, employeeCodes],
    );

    return new Map(
      rows.map((row) => [
        String(row.employee_code).trim(),
        { id: row.id, branch_id: row.branch_id ?? null },
      ]),
    );
  }

  async retryPendingPunchReviews(
    tenantId: string,
    employeeCode?: string,
    limit = 100,
  ): Promise<{ attempted: number; processed: number; failed: number }> {
    const params: any[] = [tenantId, Math.max(1, Math.min(limit, 500))];
    let codeClause = '';
    if (employeeCode) {
      params.push(employeeCode);
      codeClause = ` AND employee_code = $${params.length}`;
    }

    const { rows } = await this.db.query(
      `SELECT *
       FROM pending_punch_reviews
       WHERE tenant_id = $1
         AND status IN ('pending', 'failed')
         ${codeClause}
       ORDER BY created_at ASC
       LIMIT $2`,
      params,
    );

    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.db.query(
          `UPDATE pending_punch_reviews
           SET status = 'retrying', retry_count = retry_count + 1, last_retry_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id],
        );
        const event = this.pendingReviewToPunchEvent(row);
        const employeeMap = await this.lookupEmployees(tenantId, [event.employeeCode]);
        const employee = employeeMap.get(event.employeeCode);
        if (!employee) {
          await this.db.query(
            `UPDATE pending_punch_reviews
             SET status = 'pending', last_error = 'Employee code is still unmapped', updated_at = NOW()
             WHERE id = $1`,
            [row.id],
          );
          failed++;
          continue;
        }

        const result = await this.processSinglePunch(tenantId, employee, event);
        await this.db.query(
          `UPDATE pending_punch_reviews
           SET status = 'processed',
               attendance_record_id = $2,
               resolved_employee_id = $3,
               resolved_at = NOW(),
               last_error = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, result.recordId, employee.id],
        );
        await this.audit.write({
          tenantId,
          employeeId: employee.id,
          attendanceRecordId: result.recordId,
          eventType: 'pending_punch_processed',
          actorType: 'system',
          actorId: 'attendance-engine',
          metadata: {
            pending_review_id: row.id,
            fingerprint: row.fingerprint,
            employee_code: row.employee_code,
          },
        });
        processed++;
      } catch (err: any) {
        failed++;
        await this.db.query(
          `UPDATE pending_punch_reviews
           SET status = 'failed', last_error = $2, updated_at = NOW()
           WHERE id = $1`,
          [row.id, err?.message ?? 'Retry failed'],
        );
      }
    }

    return { attempted: rows.length, processed, failed };
  }

  private async createPendingPunchReview(
    tenantId: string,
    integrationId: string | null,
    event: PunchEventDto,
  ): Promise<void> {
    const fingerprint = this.fingerprints.computeFingerprint(tenantId, event);
    const suggestions = await this.suggestEmployeeMappings(tenantId, event.employeeCode);
    const diagnostics = {
      reason: 'employee_code_not_found',
      provider: event.providerName,
      device_id: event.deviceId ?? null,
      terminal_id: event.terminalId ?? null,
      attendance_source: event.attendanceSource ?? null,
      request_id: event.requestId ?? null,
      correlation_id: event.correlationId ?? null,
      received_at: new Date().toISOString(),
    };

    const { rows } = await this.db.query(
      `INSERT INTO pending_punch_reviews (
         tenant_id, integration_id, provider_name, employee_code, fingerprint,
         punch_timestamp, punch_type, device_id, terminal_id, terminal_serial_number,
         attendance_source, request_id, correlation_id, sync_batch_id,
         source_ip, source_user_agent, raw_payload, diagnostics, mapping_suggestions
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15::inet, $16, $17::jsonb, $18::jsonb, $19::jsonb
       )
       ON CONFLICT (tenant_id, fingerprint) DO UPDATE SET
         diagnostics = pending_punch_reviews.diagnostics || EXCLUDED.diagnostics,
         mapping_suggestions = EXCLUDED.mapping_suggestions,
         updated_at = NOW()
       RETURNING id`,
      [
        tenantId,
        integrationId,
        event.providerName,
        event.employeeCode,
        fingerprint,
        event.timestamp,
        event.punchType,
        event.deviceId ?? null,
        event.terminalId ?? null,
        event.terminalSerialNumber ?? null,
        event.attendanceSource ?? null,
        event.requestId ?? null,
        event.correlationId ?? null,
        event.syncBatchId ?? null,
        event.sourceIp ?? null,
        event.sourceUserAgent ?? null,
        JSON.stringify(event.rawPayload ?? {}),
        JSON.stringify(diagnostics),
        JSON.stringify(suggestions),
      ],
    );

    const reviewId = rows[0]?.id;
    if (reviewId) {
      await this.fingerprints.linkToPendingReview(tenantId, fingerprint, reviewId).catch(() => {});
    }

    await this.audit.write({
      tenantId,
      eventType: 'unknown_punch_pending',
      actorType: 'provider',
      actorId: event.providerName,
      afterState: {
        employee_code: event.employeeCode,
        punch_time: event.timestamp.toISOString(),
        punch_type: event.punchType,
        status: 'pending',
      },
      metadata: {
        pending_review_id: reviewId ?? null,
        fingerprint,
        diagnostics,
        mapping_suggestions: suggestions,
      },
    });

    await this.notifyPendingPunchReview(tenantId, event, reviewId, suggestions);
  }

  private async resolveShiftContext(
    tenantId: string,
    employeeId: string,
    punchTime: Date,
  ): Promise<ShiftContext> {
    const punchDate = this.toDateString(punchTime);
    const previousDate = this.addDays(punchDate, -1);
    const candidates: ShiftContext[] = [];

    for (const date of [punchDate, previousDate]) {
      const shift = await this.shiftCache.getShift(tenantId, employeeId, date);
      if (!shift) continue;
      const window = this.buildShiftWindow(date, shift);
      candidates.push({
        shift,
        shiftDate: date,
        shiftStart: window.start,
        shiftEnd: window.end,
      });
    }

    const matched = candidates.find((candidate) => {
      if (!candidate.shiftStart || !candidate.shiftEnd) return false;
      const startBuffer = candidate.shiftStart.getTime() - 6 * 60 * 60_000;
      const endBuffer = candidate.shiftEnd.getTime() + 6 * 60 * 60_000;
      const time = punchTime.getTime();
      return time >= startBuffer && time <= endBuffer;
    });

    if (matched) return matched;

    const fallback = candidates[0];
    if (fallback) return fallback;

    return {
      shift: null,
      shiftDate: punchDate,
      shiftStart: null,
      shiftEnd: null,
    };
  }

  private async suggestEmployeeMappings(tenantId: string, employeeCode: string): Promise<Record<string, unknown>[]> {
    const normalized = employeeCode.trim().toLowerCase();
    const numeric = normalized.replace(/\D/g, '');
    const { rows } = await this.db.query(
      `SELECT id, employee_code, first_name, last_name, branch_id
       FROM employees
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND (
           lower(employee_code) LIKE $2
           OR ($3 <> '' AND regexp_replace(employee_code, '\\D', '', 'g') = $3)
           OR similarity(lower(employee_code), $4) > 0.35
         )
       ORDER BY
         CASE
           WHEN lower(employee_code) = $4 THEN 0
           WHEN $3 <> '' AND regexp_replace(employee_code, '\\D', '', 'g') = $3 THEN 1
           ELSE 2
         END,
         employee_code
       LIMIT 5`,
      [tenantId, `%${normalized}%`, numeric, normalized],
    ).catch(async () => {
      return this.db.query(
        `SELECT id, employee_code, first_name, last_name, branch_id
         FROM employees
         WHERE tenant_id = $1
           AND deleted_at IS NULL
           AND lower(employee_code) LIKE $2
         ORDER BY employee_code
         LIMIT 5`,
        [tenantId, `%${normalized}%`],
      );
    });

    return rows.map((row) => ({
      employee_id: row.id,
      employee_code: row.employee_code,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      branch_id: row.branch_id ?? null,
    }));
  }

  private pendingReviewToPunchEvent(row: any): PunchEventDto {
    return {
      employeeCode: row.employee_code,
      timestamp: new Date(row.punch_timestamp),
      punchType: this.normalizePunchDirection(row.punch_type),
      verifyMethod: VerifyMethod.OTHER,
      providerName: row.provider_name,
      deviceId: row.device_id ?? undefined,
      terminalId: row.terminal_id ?? undefined,
      terminalSerialNumber: row.terminal_serial_number ?? undefined,
      attendanceSource: this.normalizeAttendanceSource(row.attendance_source),
      requestId: row.request_id ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      syncBatchId: row.sync_batch_id ?? undefined,
      sourceIp: row.source_ip ?? undefined,
      sourceUserAgent: row.source_user_agent ?? undefined,
      rawPayload: row.raw_payload ?? {},
    };
  }

  private async notifyPendingPunchReview(
    tenantId: string,
    event: PunchEventDto,
    reviewId: string | null,
    suggestions: Record<string, unknown>[],
  ): Promise<void> {
    this.notificationEmitter.emit(tenantId, {
      title: 'Punch Needs Review',
      message: `Unmapped employee code ${event.employeeCode} submitted a ${event.punchType} punch.`,
      type: 'warning',
      priority: 'high',
      sourceModule: 'attendance',
      actionUrl: '/dashboard/notifications?tab=attendance-alerts',
      entityType: 'pending_punch_review',
      entityId: reviewId ?? undefined,
      metadata: {
        employee_code: event.employeeCode,
        provider: event.providerName,
        device_id: event.deviceId ?? null,
        terminal_id: event.terminalId ?? null,
        punch_time: event.timestamp.toISOString(),
        suggestions,
      },
    }).catch((err) => this.logger.warn(`Failed to emit pending-punch notification: ${err?.message}`));
  }

  private buildShiftWindow(dateStr: string, shift: ShiftRow): { start: Date; end: Date } {
    const start = this.combineDateAndTime(dateStr, shift.start_time);
    let end = this.combineDateAndTime(dateStr, shift.end_time);
    if (shift.is_overnight || end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60_000);
    }
    return { start, end };
  }

  private async getExistingAttendance(tenantId: string, employeeId: string, shiftDate: string): Promise<any | null> {
    const { rows } = await this.db.query(
      `SELECT *
       FROM attendance_records
       WHERE tenant_id = $1 AND employee_id = $2 AND date = $3`,
      [tenantId, employeeId, shiftDate],
    );
    return rows[0] ?? null;
  }

  private mergePunchSequence(
    tenantId: string,
    employeeCode: string,
    existingSequence: unknown,
    event: PunchEventDto,
  ): CanonicalPunch[] {
    const punches = new Map<string, CanonicalPunch>();

    for (const entry of this.parseExistingSequence(tenantId, employeeCode, existingSequence)) {
      punches.set(entry.fingerprint, entry);
    }

    const incoming = this.toCanonicalPunch(tenantId, event);
    punches.set(incoming.fingerprint, incoming);

    return [...punches.values()].sort((a, b) => {
      const byTime = a.timestamp.getTime() - b.timestamp.getTime();
      if (byTime !== 0) return byTime;
      return a.fingerprint.localeCompare(b.fingerprint);
    });
  }

  private parseExistingSequence(
    tenantId: string,
    employeeCode: string,
    existingSequence: unknown,
  ): CanonicalPunch[] {
    const entries = Array.isArray(existingSequence)
      ? existingSequence
      : typeof existingSequence === 'string'
        ? this.safeJsonArray(existingSequence)
        : [];

    return entries
      .map((entry: any): CanonicalPunch | null => {
        const timestamp = new Date(entry.time ?? entry.timestamp);
        if (isNaN(timestamp.getTime())) return null;

        const event: PunchEventDto = {
          employeeCode,
          timestamp,
          punchType: this.normalizePunchDirection(entry.type ?? entry.punch_type ?? entry.punchState),
          verifyMethod: this.normalizeVerifyMethod(entry.method ?? entry.verify_method),
          providerName: String(entry.provider ?? 'unknown').toLowerCase(),
          deviceId: entry.device ?? entry.deviceId ?? undefined,
          terminalSerialNumber: entry.terminal_serial_number ?? undefined,
          workCode: entry.work_code ?? undefined,
          punchState: entry.punch_state ?? entry.type ?? undefined,
          rawVerifyType: entry.raw_verify_type ?? undefined,
          terminalId: entry.terminal_id ?? undefined,
          attendanceSource: this.normalizeAttendanceSource(entry.source),
          gps: entry.gps ?? undefined,
          photo: entry.photo ?? undefined,
          locationMetadata: entry.location_metadata ?? undefined,
          requestId: entry.request_id ?? undefined,
          correlationId: entry.correlation_id ?? undefined,
          syncBatchId: entry.sync_batch_id ?? undefined,
        };
        return this.toCanonicalPunch(tenantId, event);
      })
      .filter((entry): entry is CanonicalPunch => entry !== null);
  }

  private toCanonicalPunch(tenantId: string, event: PunchEventDto): CanonicalPunch {
    return {
      fingerprint: this.fingerprints.computeFingerprint(tenantId, event),
      employeeCode: event.employeeCode,
      timestamp: event.timestamp,
      punchType: event.punchType,
      verifyMethod: event.verifyMethod,
      providerName: event.providerName,
      deviceId: event.deviceId,
      terminalSerialNumber: event.terminalSerialNumber,
      workCode: event.workCode,
      punchState: event.punchState,
      rawVerifyType: event.rawVerifyType,
      requestId: event.requestId,
      correlationId: event.correlationId,
      syncBatchId: event.syncBatchId,
      sourceIp: event.sourceIp,
      sourceUserAgent: event.sourceUserAgent,
      terminalId: event.terminalId,
      attendanceSource: event.attendanceSource,
      gps: event.gps,
      photo: event.photo,
      locationMetadata: event.locationMetadata,
      rawPayload: event.rawPayload,
    };
  }

  private computeAttendance(punches: CanonicalPunch[], shiftContext: ShiftContext): AttendanceComputation {
    const clockIn = this.resolveClockIn(punches);
    const clockOut = this.resolveClockOut(punches, clockIn);
    const lateMinutes = this.calculateLateMinutes(clockIn, shiftContext);
    const earlyDepartureMinutes = this.calculateEarlyDepartureMinutes(clockOut, shiftContext);
    const inferredBreakMinutes = this.calculateBreakMinutes(punches, clockIn, clockOut);
    const scheduledBreakMinutes = Number(shiftContext.shift?.break_minutes ?? 0) || 0;
    const totalBreakMinutes = Math.max(inferredBreakMinutes, scheduledBreakMinutes);

    return {
      clockIn,
      clockOut,
      lateMinutes,
      earlyDepartureMinutes,
      totalBreakMinutes,
      unpaidBreakMinutes: inferredBreakMinutes,
      punchCount: punches.length,
      punchSequence: punches.map((punch) => this.serializePunch(punch)),
    };
  }

  private resolveClockIn(punches: CanonicalPunch[]): Date {
    return punches.find((punch) => punch.punchType === PunchDirection.IN)?.timestamp ?? punches[0].timestamp;
  }

  private resolveClockOut(punches: CanonicalPunch[], clockIn: Date): Date {
    const explicitOut = [...punches].reverse().find(
      (punch) => punch.punchType === PunchDirection.OUT && punch.timestamp >= clockIn,
    );
    return explicitOut?.timestamp ?? punches[punches.length - 1].timestamp;
  }

  private calculateLateMinutes(clockIn: Date, shiftContext: ShiftContext): number {
    if (!shiftContext.shiftStart || !shiftContext.shift) return 0;
    const grace = Number(shiftContext.shift.grace_period_minutes ?? 0) || 0;
    const deadline = shiftContext.shiftStart.getTime() + grace * 60_000;
    if (clockIn.getTime() <= deadline) return 0;
    return Math.floor((clockIn.getTime() - shiftContext.shiftStart.getTime()) / 60_000);
  }

  private calculateEarlyDepartureMinutes(clockOut: Date, shiftContext: ShiftContext): number {
    if (!shiftContext.shiftEnd) return 0;
    if (clockOut.getTime() >= shiftContext.shiftEnd.getTime()) return 0;
    return Math.floor((shiftContext.shiftEnd.getTime() - clockOut.getTime()) / 60_000);
  }

  private calculateBreakMinutes(punches: CanonicalPunch[], clockIn: Date, clockOut: Date): number {
    if (punches.length < 4) return 0;

    const explicitBreaks = this.calculateExplicitBreaks(punches, clockIn, clockOut);
    if (explicitBreaks > 0) return explicitBreaks;

    let total = 0;
    for (let i = 1; i < punches.length - 1; i += 2) {
      const outPunch = punches[i];
      const inPunch = punches[i + 1];
      if (!inPunch) continue;
      if (outPunch.timestamp <= clockIn || inPunch.timestamp >= clockOut) continue;
      total += this.diffMinutes(outPunch.timestamp, inPunch.timestamp);
    }
    return total;
  }

  private calculateExplicitBreaks(punches: CanonicalPunch[], clockIn: Date, clockOut: Date): number {
    let total = 0;
    for (let i = 0; i < punches.length - 1; i++) {
      const current = punches[i];
      if (current.punchType !== PunchDirection.BREAK_OUT && current.punchType !== PunchDirection.OUT) continue;
      const nextIn = punches.slice(i + 1).find((candidate) => (
        candidate.punchType === PunchDirection.BREAK_IN || candidate.punchType === PunchDirection.IN
      ));
      if (!nextIn) continue;
      if (current.timestamp <= clockIn || nextIn.timestamp >= clockOut) continue;
      total += this.diffMinutes(current.timestamp, nextIn.timestamp);
    }
    return total;
  }

  private async upsertAttendanceRecord(
    tenantId: string,
    employee: EmployeeLookup,
    shiftContext: ShiftContext,
    computed: AttendanceComputation,
    provenance: CanonicalPunch,
  ): Promise<any> {
    const { rows } = await this.db.query(
      `INSERT INTO attendance_records (
         tenant_id, employee_id, date, clock_in, clock_out,
         status, shift_id, late_minutes, early_departure_minutes,
         provider_name, source_device_id, remarks, branch_id,
         verify_method, attendance_source, terminal_id, terminal_serial_number,
         work_code, punch_state, raw_verify_type, sync_batch_id, request_id, correlation_id,
         gps_latitude, gps_longitude, gps_accuracy_meters, gps_recorded_at,
         source_ip, source_user_agent, location,
         punch_sequence, punch_count, is_overnight,
         total_break_minutes, unpaid_break_minutes, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'present', $6, $7, $8,
         $9, $10, $11, $12,
         $13, $14, $15, $16,
         $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27::inet, $28, $29::jsonb,
         $30::jsonb, $31, $32,
         $33, $34, NOW()
       )
       ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET
         clock_in = EXCLUDED.clock_in,
         clock_out = EXCLUDED.clock_out,
         status = 'present',
         shift_id = EXCLUDED.shift_id,
         late_minutes = EXCLUDED.late_minutes,
         early_departure_minutes = EXCLUDED.early_departure_minutes,
         provider_name = EXCLUDED.provider_name,
         source_device_id = EXCLUDED.source_device_id,
         remarks = EXCLUDED.remarks,
         branch_id = EXCLUDED.branch_id,
         verify_method = EXCLUDED.verify_method,
         attendance_source = EXCLUDED.attendance_source,
         terminal_id = EXCLUDED.terminal_id,
         terminal_serial_number = EXCLUDED.terminal_serial_number,
         work_code = EXCLUDED.work_code,
         punch_state = EXCLUDED.punch_state,
         raw_verify_type = EXCLUDED.raw_verify_type,
         sync_batch_id = EXCLUDED.sync_batch_id,
         request_id = EXCLUDED.request_id,
         correlation_id = EXCLUDED.correlation_id,
         gps_latitude = EXCLUDED.gps_latitude,
         gps_longitude = EXCLUDED.gps_longitude,
         gps_accuracy_meters = EXCLUDED.gps_accuracy_meters,
         gps_recorded_at = EXCLUDED.gps_recorded_at,
         source_ip = EXCLUDED.source_ip,
         source_user_agent = EXCLUDED.source_user_agent,
         location = EXCLUDED.location,
         punch_sequence = EXCLUDED.punch_sequence,
         punch_count = EXCLUDED.punch_count,
         is_overnight = EXCLUDED.is_overnight,
         total_break_minutes = EXCLUDED.total_break_minutes,
         unpaid_break_minutes = EXCLUDED.unpaid_break_minutes,
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        employee.id,
        shiftContext.shiftDate,
        computed.clockIn,
        computed.clockOut,
        shiftContext.shift?.shift_id ?? null,
        computed.lateMinutes,
        computed.earlyDepartureMinutes,
        provenance.providerName,
        provenance.deviceId ?? null,
        `Computed by attendance engine from ${computed.punchCount} punch(es)`,
        employee.branch_id,
        provenance.verifyMethod ?? null,
        provenance.attendanceSource ?? AttendanceSource.BIOMETRIC_DEVICE,
        provenance.terminalId ?? null,
        provenance.terminalSerialNumber ?? null,
        provenance.workCode ?? null,
        provenance.punchState ?? provenance.punchType ?? null,
        provenance.rawVerifyType ?? null,
        provenance.syncBatchId ?? null,
        provenance.requestId ?? null,
        provenance.correlationId ?? null,
        provenance.gps?.latitude ?? null,
        provenance.gps?.longitude ?? null,
        provenance.gps?.accuracyMeters ?? null,
        provenance.gps?.recordedAt ?? null,
        provenance.sourceIp ?? null,
        provenance.sourceUserAgent ?? null,
        JSON.stringify(this.buildLocationPayload(provenance)),
        JSON.stringify(computed.punchSequence),
        computed.punchCount,
        shiftContext.shift?.is_overnight ?? false,
        computed.totalBreakMinutes,
        computed.unpaidBreakMinutes,
      ],
    );

    return rows[0];
  }

  private serializePunch(punch: CanonicalPunch): Record<string, unknown> {
    return {
      fingerprint: punch.fingerprint,
      time: punch.timestamp.toISOString(),
      type: punch.punchType,
      method: punch.verifyMethod,
      provider: punch.providerName,
      device: punch.deviceId ?? null,
      source: punch.attendanceSource ?? null,
      terminal_id: punch.terminalId ?? null,
      terminal_serial_number: punch.terminalSerialNumber ?? null,
      work_code: punch.workCode ?? null,
      punch_state: punch.punchState ?? punch.punchType,
      raw_verify_type: punch.rawVerifyType ?? null,
      request_id: punch.requestId ?? null,
      correlation_id: punch.correlationId ?? null,
      sync_batch_id: punch.syncBatchId ?? null,
      gps: punch.gps ?? null,
      photo: punch.photo ?? null,
      location_metadata: punch.locationMetadata ?? null,
    };
  }

  private async auditPunch(
    tenantId: string,
    employeeId: string,
    recordId: string | null,
    event: PunchEventDto,
    shiftDate: string,
  ): Promise<void> {
    await this.audit.write({
      tenantId,
      employeeId,
      attendanceRecordId: recordId,
      eventType: 'punch_received',
      actorType: 'provider',
      actorId: event.providerName,
      afterState: {
        date: shiftDate,
        punch_time: event.timestamp.toISOString(),
        punch_type: event.punchType,
      },
      metadata: {
        provider: event.providerName,
        device: event.deviceId ?? null,
        source: event.attendanceSource ?? null,
        terminal_id: event.terminalId ?? null,
        terminal_serial_number: event.terminalSerialNumber ?? null,
        work_code: event.workCode ?? null,
        punch_state: event.punchState ?? event.punchType,
        raw_verify_type: event.rawVerifyType ?? null,
        request_id: event.requestId ?? null,
        correlation_id: event.correlationId ?? null,
        sync_batch_id: event.syncBatchId ?? null,
        gps: event.gps ?? null,
        photo: event.photo ?? null,
        location_metadata: event.locationMetadata ?? null,
        verify_method: event.verifyMethod,
        fingerprint: this.fingerprints.computeFingerprint(tenantId, event),
      },
    });
  }

  private async auditRecordMutation(
    tenantId: string,
    employeeId: string,
    recordId: string,
    before: any | null,
    after: any,
    computed: AttendanceComputation,
  ): Promise<void> {
    const beforeState = before ? this.pickAttendanceState(before) : null;
    const afterState = {
      ...this.pickAttendanceState(after),
      punch_count: computed.punchCount,
      total_break_minutes: computed.totalBreakMinutes,
      unpaid_break_minutes: computed.unpaidBreakMinutes,
    };

    await this.audit.write({
      tenantId,
      employeeId,
      attendanceRecordId: recordId,
      eventType: before ? 'record_updated' : 'record_created',
      actorType: 'system',
      actorId: 'attendance-engine',
      beforeState,
      afterState,
      metadata: { computation: 'canonical_punch_sequence' },
    });
  }

  private pickAttendanceState(row: any): Record<string, unknown> {
    return {
      date: row.date,
      clock_in: row.clock_in,
      clock_out: row.clock_out,
      late_minutes: row.late_minutes,
      early_departure_minutes: row.early_departure_minutes,
      total_break_minutes: row.total_break_minutes,
      unpaid_break_minutes: row.unpaid_break_minutes,
      punch_count: row.punch_count,
      shift_id: row.shift_id,
    };
  }

  private async linkFingerprint(tenantId: string, event: PunchEventDto, recordId: string): Promise<void> {
    const fingerprint = this.fingerprints.computeFingerprint(tenantId, event);
    await this.fingerprints.linkToRecord(tenantId, fingerprint, recordId).catch(() => {});
  }

  private async notifyLateArrival(
    tenantId: string,
    branchId: string | null,
    employeeCode: string,
    recordId: string,
    before: any | null,
    computed: AttendanceComputation,
    shiftDate: string,
  ): Promise<void> {
    const beforeLate = Number(before?.late_minutes ?? 0);
    if (computed.lateMinutes <= 0 || beforeLate === computed.lateMinutes) return;

    this.notificationEmitter.emit(tenantId, {
      title: 'Late Arrival',
      message: `${employeeCode} clocked in ${computed.lateMinutes} minute(s) late on ${shiftDate}.`,
      type: 'warning',
      priority: 'medium',
      sourceModule: 'attendance',
      actionUrl: '/dashboard/notifications?tab=attendance-alerts',
      entityType: 'attendance_record',
      entityId: recordId,
      branchId: branchId || undefined,
    }).catch((err) => this.logger.warn(`Failed to emit late-arrival notification: ${err?.message}`));
  }

  private safeJsonArray(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private combineDateAndTime(dateStr: string, timeStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute, second = 0] = String(timeStr).split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private addDays(dateStr: string, days: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return this.toDateString(date);
  }

  private diffMinutes(start: Date, end: Date): number {
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
  }

  private buildLocationPayload(provenance: CanonicalPunch): Record<string, unknown> {
    return {
      ...(provenance.locationMetadata ?? {}),
      gps: provenance.gps ? {
        latitude: provenance.gps.latitude,
        longitude: provenance.gps.longitude,
        accuracy_meters: provenance.gps.accuracyMeters ?? null,
        recorded_at: provenance.gps.recordedAt?.toISOString() ?? null,
      } : null,
      photo: provenance.photo ?? null,
    };
  }

  private async _writeSyncLog(
    tenantId: string,
    integrationId: string | null,
    total: number,
    synced: number,
    errors: string[],
    startedAt: Date,
  ): Promise<void> {
    const status = errors.length === 0 ? 'success' : errors.length === total ? 'failed' : 'partial';
    await this.db.query(
      `INSERT INTO sync_logs
         (tenant_id, integration_id, direction, entity_type,
          records_synced, status, error, started_at, completed_at)
       VALUES ($1, $2, 'inbound', 'attendance', $3, $4, $5, $6, NOW())`,
      [
        tenantId,
        integrationId,
        synced,
        status,
        errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
        startedAt,
      ],
    );
  }

  private async _touchIntegration(integrationId: string | null): Promise<void> {
    if (!integrationId) return;
    await this.db.query(
      'UPDATE integrations SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
      [integrationId],
    );
  }
}
