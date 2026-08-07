import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../shared/database.service';
import { PunchEventDto } from '../dto/punch-event.dto';

@Injectable()
export class PunchFingerprintService {
  private readonly logger = new Logger(PunchFingerprintService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Deterministic fingerprint for a punch event.
   * Two punches from the same employee+provider within the same UTC minute
   * produce identical fingerprints and are treated as one event.
   */
  computeFingerprint(tenantId: string, event: PunchEventDto): string {
    const bucket = new Date(event.timestamp);
    bucket.setSeconds(0, 0);
    const key = [
      tenantId,
      event.employeeCode.trim().toUpperCase(),
      bucket.toISOString(),
      event.providerName,
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

    const tagged = events.map((e) => ({
      event: e,
      fingerprint: this.computeFingerprint(tenantId, e),
    }));

    const fps = tagged.map((t) => t.fingerprint);

    const { rows: existing } = await this.db.query(
      `SELECT fingerprint FROM punch_fingerprints
       WHERE tenant_id = $1 AND fingerprint = ANY($2::text[])`,
      [tenantId, fps],
    );
    const existingSet = new Set(existing.map((r) => r.fingerprint));

    const fresh = tagged.filter((t) => !existingSet.has(t.fingerprint));
    const duplicateCount = tagged.length - fresh.length;

    if (duplicateCount > 0) {
      this.logger.log(
        `[${tenantId}] Dropped ${duplicateCount}/${events.length} duplicate punches`,
      );
    }

    if (fresh.length > 0) {
      // Build a multi-row INSERT — one param group per new fingerprint
      const valueClauses = fresh.map((_, i) => {
        const b = i * 5;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
      });
      const params: any[] = [];
      for (const { event, fingerprint } of fresh) {
        const bucket = new Date(event.timestamp);
        bucket.setSeconds(0, 0);
        params.push(tenantId, fingerprint, event.employeeCode, event.providerName, bucket);
      }
      await this.db.query(
        `INSERT INTO punch_fingerprints
           (tenant_id, fingerprint, employee_code, provider_name, punched_at)
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
}
