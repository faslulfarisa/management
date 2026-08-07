/**
 * attendance-engine.service.ts
 *
 * Vendor-independent attendance processing engine.
 *
 * Accepts normalized PunchEventDto[] from any provider and:
 *   1. Deduplicates via PunchFingerprintService (idempotent ingestion)
 *   2. Batch-resolves employees in a single query
 *   3. Looks up shift schedule for the punch date
 *   4. Calculates late minutes with grace period
 *   5. Handles overnight shifts via shift-window correlation
 *   6. UPSERTs into attendance_records (clock_in = LEAST, clock_out = GREATEST)
 *   7. Appends to punch_sequence JSONB for full punch audit trail
 *   8. Writes to attendance_audit_logs (immutable event record)
 *   9. Links punch fingerprint to the resulting attendance_record
 *  10. Logs sync result to sync_logs
 *
 * This service knows nothing about ZKTeco, EasyTimePro, or any vendor.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { PunchEventDto, ProviderSyncResultDto } from '../dto/punch-event.dto';
import { PunchFingerprintService } from '../services/punch-fingerprint.service';
import { AttendanceAuditService } from '../services/attendance-audit.service';
import { ShiftCacheService, ShiftRow } from '../services/shift-cache.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';

@Injectable()
export class AttendanceEngineService {
  private readonly logger = new Logger(AttendanceEngineService.name);

  constructor(
    readonly db: DatabaseService,
    private readonly fingerprints: PunchFingerprintService,
    private readonly audit: AttendanceAuditService,
    private readonly shiftCache: ShiftCacheService,
    @Inject(forwardRef(() => NotificationEmitterService))
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  /**
   * Main entry point. Processes a batch of normalized punch events.
   */
  async processPunchEvents(
    tenantId: string,
    integrationId: string | null,
    events: PunchEventDto[],
  ): Promise<ProviderSyncResultDto> {
    const syncStartedAt = new Date();
    const providerName = events[0]?.providerName ?? 'unknown';

    this.logger.log(
      `[${providerName}] Processing ${events.length} punch events for tenant ${tenantId}`,
    );

    // 1. Deduplicate — drop punches we've already processed
    const { unique, duplicateCount } = await this.fingerprints.filterDuplicates(tenantId, events);

    if (unique.length === 0) {
      this.logger.log(`[${providerName}] All ${events.length} punches were duplicates — skipping`);
      await this._writeSyncLog(tenantId, integrationId, events.length, 0, [], syncStartedAt);
      await this._touchIntegration(integrationId);
      return { provider: providerName, total: events.length, synced: 0, failed: 0, errors: [] };
    }

    if (duplicateCount > 0) {
      this.logger.log(
        `[${providerName}] Skipped ${duplicateCount} duplicates, processing ${unique.length} unique punches`,
      );
    }

    // 2. Batch employee lookup — single query for all employee codes in the batch
    const codes = [...new Set(unique.map((e) => e.employeeCode))];
    const { rows: empRows } = await this.db.query(
      `SELECT id, employee_code, branch_id FROM employees
       WHERE tenant_id = $1 AND employee_code = ANY($2::text[]) AND deleted_at IS NULL`,
      [tenantId, codes],
    );
    const empMap = new Map<string, { id: string; branch_id: string | null }>(
      empRows.map((r) => [r.employee_code, { id: r.id, branch_id: r.branch_id ?? null }]),
    );

    // Warn about unknown codes once per batch rather than per event
    const unknownCodes = codes.filter((c) => !empMap.has(c));
    if (unknownCodes.length > 0) {
      this.logger.warn(
        `[${providerName}] Unknown employee codes (not in Ai-HRMS): ${unknownCodes.join(', ')}`,
      );
    }

    // 3. Process each unique event
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const event of unique) {
      const emp = empMap.get(event.employeeCode);
      if (!emp) {
        skipped++; // Unknown employee — not a hard error
        continue;
      }

      try {
        await this._processSingleEvent(tenantId, emp.id, emp.branch_id, event);
        synced++;
      } catch (err: any) {
        const msg = `${event.employeeCode}: ${err?.message ?? 'Unknown error'}`;
        this.logger.error(`[${providerName}] Failed to process punch: ${msg}`, err?.stack);
        errors.push(msg);
      }
    }

    await this._writeSyncLog(tenantId, integrationId, events.length, synced, errors, syncStartedAt);
    await this._touchIntegration(integrationId);

    return {
      provider: providerName,
      total: events.length,
      synced,
      failed: unique.length - synced - skipped,
      errors,
    };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private async _processSingleEvent(
    tenantId: string,
    employeeId: string,
    branchId: string | null,
    event: PunchEventDto,
  ): Promise<void> {
    const punchTime = event.timestamp;

    // Resolve shift for punch time
    const shiftRes = await this._resolveShiftForPunch(tenantId, employeeId, punchTime);

    let shiftId: string | null = null;
    let lateMinutes = 0;
    let shiftDate: string = punchTime.toISOString().split('T')[0];

    if (shiftRes) {
      shiftId = shiftRes.shift_id;
      shiftDate = this._resolveShiftDate(punchTime, shiftRes);

      const existingAtt = await this.db.query(
        'SELECT clock_in FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3',
        [tenantId, employeeId, shiftDate],
      );

      if (existingAtt.rows.length === 0 || existingAtt.rows[0].clock_in === null) {
        lateMinutes = this._calculateLateMinutes(punchTime, shiftDate, shiftRes);
      }
    }

    // UPSERT attendance record — returns id in both INSERT and UPDATE paths
    const { rows: upsertRows } = await this.db.query(
      `INSERT INTO attendance_records (
         tenant_id, employee_id, date, clock_in, clock_out,
         status, shift_id, late_minutes, provider_name, source_device_id, remarks, branch_id, updated_at
       ) VALUES ($1, $2, $3, $4, $4, 'present', $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (tenant_id, employee_id, date) DO UPDATE SET
         clock_in         = LEAST(attendance_records.clock_in, EXCLUDED.clock_in),
         clock_out        = GREATEST(attendance_records.clock_out, EXCLUDED.clock_out),
         status           = 'present',
         shift_id         = COALESCE(attendance_records.shift_id, EXCLUDED.shift_id),
         late_minutes     = CASE
           WHEN attendance_records.clock_in IS NULL OR EXCLUDED.clock_in < attendance_records.clock_in
           THEN EXCLUDED.late_minutes
           ELSE attendance_records.late_minutes
         END,
         provider_name    = COALESCE(attendance_records.provider_name, EXCLUDED.provider_name),
         source_device_id = COALESCE(EXCLUDED.source_device_id, attendance_records.source_device_id),
         branch_id        = COALESCE(attendance_records.branch_id, EXCLUDED.branch_id),
         updated_at       = now()
       RETURNING id, clock_in`,
      [
        tenantId,
        employeeId,
        shiftDate,
        punchTime,
        shiftId,
        lateMinutes,
        event.providerName,
        event.deviceId ?? null,
        `Synced via ${event.providerName} [${event.verifyMethod}]`,
        branchId,
      ],
    );

    const recordId = upsertRows[0]?.id ?? null;

    // Notify branch managers/admins of a late arrival (best-effort; non-fatal).
    if (lateMinutes > 0 && recordId) {
      this.notificationEmitter.emit(tenantId, {
        title: 'Late Arrival',
        message: `${event.employeeCode} clocked in ${lateMinutes} minute(s) late on ${shiftDate}.`,
        type: 'warning',
        priority: 'medium',
        sourceModule: 'attendance',
        actionUrl: '/dashboard/automation?tab=attendance-alerts',
        entityType: 'attendance_record',
        entityId: recordId,
        branchId: branchId || undefined,
      }).catch((err) => this.logger.warn(`Failed to emit late-arrival notification: ${err?.message}`));
    }

    // Append this punch to the ordered punch_sequence JSONB array
    const punchEntry = JSON.stringify([{
      time: punchTime.toISOString(),
      type: event.punchType,
      method: event.verifyMethod,
      provider: event.providerName,
      device: event.deviceId ?? null,
    }]);

    await this.db.query(
      `UPDATE attendance_records
       SET punch_sequence = COALESCE(punch_sequence, '[]'::jsonb) || $1::jsonb,
           punch_count    = COALESCE(punch_count, 0) + 1
       WHERE tenant_id = $2 AND employee_id = $3 AND date = $4`,
      [punchEntry, tenantId, employeeId, shiftDate],
    );

    // Write immutable audit event
    await this.audit.write({
      tenantId,
      employeeId,
      attendanceRecordId: recordId,
      eventType: 'punch_received',
      actorType: 'provider',
      actorId: event.providerName,
      afterState: {
        date: shiftDate,
        punch_time: punchTime.toISOString(),
        punch_type: event.punchType,
      },
      metadata: {
        provider: event.providerName,
        device: event.deviceId ?? null,
        verify_method: event.verifyMethod,
        fingerprint: this.fingerprints.computeFingerprint(tenantId, event),
      },
    });

    // Link fingerprint → attendance record (best-effort; non-fatal if it fails)
    if (recordId) {
      const fp = this.fingerprints.computeFingerprint(tenantId, event);
      await this.fingerprints.linkToRecord(tenantId, fp, recordId).catch(() => {});
    }
  }

  private async _resolveShiftForPunch(
    tenantId: string,
    employeeId: string,
    punchTime: Date,
  ): Promise<ShiftRow | null> {
    const dateStr = punchTime.toISOString().split('T')[0];
    return this.shiftCache.getShift(tenantId, employeeId, dateStr);
  }

  /**
   * For overnight shifts: a punch after midnight belongs to the previous day's shift.
   * Example: night shift 22:00–06:00, punch at 03:00 → shift date = yesterday.
   */
  private _resolveShiftDate(punchTime: Date, shift: ShiftRow): string {
    const dateStr = punchTime.toISOString().split('T')[0];
    if (!shift.is_overnight) return dateStr;

    const [startHour] = shift.start_time.split(':').map(Number);
    const punchHour = punchTime.getUTCHours();
    if (punchHour < startHour) {
      const prev = new Date(punchTime);
      prev.setUTCDate(prev.getUTCDate() - 1);
      return prev.toISOString().split('T')[0];
    }
    return dateStr;
  }

  private _calculateLateMinutes(punchTime: Date, shiftDate: string, shift: ShiftRow): number {
    const [startHour, startMin, startSec = 0] = shift.start_time.split(':').map(Number);
    const [year, month, day] = shiftDate.split('-').map(Number);
    const shiftStart = new Date(Date.UTC(year, month - 1, day, startHour, startMin, startSec));
    const graceDeadline = new Date(shiftStart.getTime() + Number(shift.grace_period_minutes) * 60_000);
    if (punchTime <= graceDeadline) return 0;
    return Math.floor((punchTime.getTime() - shiftStart.getTime()) / 60_000);
  }

  private async _writeSyncLog(
    tenantId: string,
    integrationId: string | null,
    total: number,
    synced: number,
    errors: string[],
    startedAt: Date,
  ): Promise<void> {
    const status =
      errors.length === 0 ? 'success' : errors.length === total ? 'failed' : 'partial';
    await this.db.query(
      `INSERT INTO sync_logs
         (tenant_id, integration_id, direction, entity_type,
          records_synced, status, error, started_at, completed_at)
       VALUES ($1, $2, 'inbound', 'attendance', $3, $4, $5, $6, now())`,
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
    await this.db.query(
      'UPDATE integrations SET last_sync_at = now(), updated_at = now() WHERE id = $1',
      [integrationId],
    );
  }
}
