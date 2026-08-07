import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { PunchEventDto } from '../dto/punch-event.dto';

@Injectable()
export class PunchFingerprintService {
  private readonly logger = new Logger(PunchFingerprintService.name);

  constructor(private readonly db: DatabaseService) {}

  computeFingerprint(tenantId: string, event: PunchEventDto): string {
    const timestamp = new Date(event.timestamp);
    const key = [
      tenantId,
      event.employeeCode.trim().toUpperCase(),
      timestamp.toISOString(),
      String(event.punchType ?? event.punchState ?? 'UNKNOWN').trim().toUpperCase(),
      String(event.punchState ?? '').trim().toUpperCase(),
      String(event.providerName ?? 'unknown').trim().toLowerCase(),
      String(event.deviceId ?? '').trim(),
      String(event.terminalId ?? '').trim(),
      String(event.terminalSerialNumber ?? '').trim(),
      String(event.workCode ?? '').trim(),
      this.rawIdentity(event.rawPayload),
    ].join(':');
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Filter events to those not yet seen, and register the new ones.
   *
   * Safe for concurrent callers — ON CONFLICT DO NOTHING handles races at
   * the DB level. No Redis lock needed at single-instance scale.
   *
   * Returns the subset of events that should be processed plus a count of
   * how many were dropped as duplicates.
   */
  async filterDuplicates(
    tenantId: string,
    events: PunchEventDto[],
  ): Promise<{ unique: PunchEventDto[]; duplicateCount: number }> {
    if (events.length === 0) return { unique: [], duplicateCount: 0 };

    const tagged = new Map<string, { event: PunchEventDto; fingerprint: string }>();
    for (const event of events) {
      const fingerprint = this.computeFingerprint(tenantId, event);
      if (!tagged.has(fingerprint)) {
        tagged.set(fingerprint, { event, fingerprint });
      }
    }

    const candidates = [...tagged.values()];
    const sameBatchDuplicateCount = events.length - candidates.length;
    const fps = candidates.map((t) => t.fingerprint);

    const { rows: existing } = await this.db.query(
      `SELECT fingerprint FROM punch_fingerprints
       WHERE tenant_id = $1 AND fingerprint = ANY($2::text[])`,
      [tenantId, fps],
    );
    const existingSet = new Set(existing.map((r) => r.fingerprint));

    const fresh = candidates.filter((t) => !existingSet.has(t.fingerprint));
    const duplicateCount = sameBatchDuplicateCount + candidates.length - fresh.length;

    if (duplicateCount > 0) {
      this.logger.log(
        `[${tenantId}] Dropped ${duplicateCount}/${events.length} duplicate punches`,
      );
    }

    if (fresh.length > 0) {
      // Build a multi-row INSERT — one param group per new fingerprint
      const valueClauses = fresh.map((_, i) => {
        const b = i * 16;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, $${b + 12}, $${b + 13}, $${b + 14}, $${b + 15}::jsonb, $${b + 16}::inet)`;
      });
      const params: any[] = [];
      for (const { event, fingerprint } of fresh) {
        params.push(
          tenantId,
          fingerprint,
          event.employeeCode,
          event.providerName,
          event.timestamp,
          event.terminalId ?? null,
          event.deviceId ?? null,
          event.attendanceSource ?? null,
          event.rawVerifyType ?? null,
          event.workCode ?? null,
          event.punchState ?? event.punchType ?? null,
          event.syncBatchId ?? null,
          event.requestId ?? null,
          event.correlationId ?? null,
          event.rawPayload ? JSON.stringify(event.rawPayload) : null,
          event.sourceIp ?? null,
        );
      }
      await this.db.query(
        `INSERT INTO punch_fingerprints
           (tenant_id, fingerprint, employee_code, provider_name, punched_at,
            terminal_id, source_device_id, attendance_source, raw_verify_type,
            work_code, punch_state, sync_batch_id, request_id, correlation_id,
            raw_payload, source_ip)
         VALUES ${valueClauses.join(', ')}
         ON CONFLICT ON CONSTRAINT uq_punch_fingerprint DO NOTHING`,
        params,
      );
    }

    return { unique: fresh.map((t) => t.event), duplicateCount };
  }

  /** Link a registered fingerprint to the attendance_record it produced. */
  async linkToRecord(
    tenantId: string,
    fingerprint: string,
    attendanceRecordId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE punch_fingerprints
       SET attendance_record_id = $1
       WHERE tenant_id = $2 AND fingerprint = $3`,
      [attendanceRecordId, tenantId, fingerprint],
    );
  }

  async linkToPendingReview(
    tenantId: string,
    fingerprint: string,
    pendingReviewId: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE punch_fingerprints
       SET pending_review_id = $1
       WHERE tenant_id = $2 AND fingerprint = $3`,
      [pendingReviewId, tenantId, fingerprint],
    );
  }

  private rawIdentity(rawPayload?: Record<string, unknown>): string {
    if (!rawPayload) return '';
    const candidate =
      rawPayload.id ??
      rawPayload.uid ??
      rawPayload.log_id ??
      rawPayload.transaction_id ??
      rawPayload.transactionId ??
      rawPayload.line;
    return candidate === undefined || candidate === null ? '' : String(candidate).trim();
  }
}
