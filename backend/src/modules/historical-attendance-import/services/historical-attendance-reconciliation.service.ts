import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import {
  ImportPreviewQueryDto,
  ReconcileAttendancePreviewDto,
} from '../dto/historical-attendance-import.dto';

interface Actor {
  sub: string;
}

type ReconciliationAction =
  | 'create'
  | 'update'
  | 'unchanged'
  | 'duplicate'
  | 'rejected'
  | 'unknown_employee'
  | 'conflict';

type AttendanceImpact = 'create' | 'update' | 'unchanged' | 'none';

interface StagingRow {
  id: string;
  row_number: number | null;
  raw_employee_identifier: string | null;
  punched_at: Date | string | null;
  punch_direction: string | null;
  device_identifier: string | null;
  source_id: string | null;
  source_type: string | null;
  source_name: string | null;
  mapped_employee_id: string | null;
  mapping_status: string;
  validation_status: string;
  status: string;
  validation_errors: any[];
  validation_warnings: any[];
  rejected_reason: string | null;
  mapping_confidence: string | number | null;
  employee_code: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: Date | string;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: Date | string;
  clock_in: Date | string | null;
  clock_out: Date | string | null;
  status: string | null;
  provider_name: string | null;
  source_device_id: string | null;
  punch_sequence: any[] | null;
  punch_count: number | null;
}

interface ExistingPunch {
  attendanceRecordId: string;
  time: Date;
  direction: string;
  provider: string | null;
  device: string | null;
}

interface RowDecision {
  row: StagingRow;
  action: ReconciliationAction;
  attendanceImpact: AttendanceImpact;
  sourceRank: number;
  punchDate: string | null;
  punchTime: Date | null;
  existingAttendanceRecordId?: string | null;
  duplicateOfStagingRowId?: string | null;
  duplicateOfAttendanceRecordId?: string | null;
  conflictType?: string | null;
  mergeSuggestion: Record<string, unknown>;
  details: Record<string, unknown>;
}

const DEFAULT_TOLERANCE_MINUTES = 5;
const DEFAULT_SOURCE_PRIORITY = [
  'existing_attendance',
  'device',
  'vendor_software',
  'rest_api',
  'csv',
  'sql_database',
  'sdk',
];

@Injectable()
export class HistoricalAttendanceReconciliationService {
  constructor(private readonly db: DatabaseService) {}

  async reconcileBatch(tenantId: string, actor: Actor, batchId: string, body: ReconcileAttendancePreviewDto = {}) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const toleranceMinutes = body.toleranceMinutes ?? this.readBatchTolerance(batch) ?? DEFAULT_TOLERANCE_MINUTES;
    const sourcePriority = this.normalizeSourcePriority(body.sourcePriority);

    if (toleranceMinutes < 0 || toleranceMinutes > 120) {
      throw new BadRequestException('toleranceMinutes must be between 0 and 120');
    }

    const rows = await this.getStagingRows(tenantId, batchId);
    const pendingValidation = rows.some((row) => row.status === 'staged' && row.validation_status === 'pending');
    if (pendingValidation) {
      throw new BadRequestException('Validate the historical attendance batch before generating reconciliation preview');
    }

    const existingAttendance = await this.getExistingAttendance(tenantId, batch, rows);
    const decisions = this.buildDecisions(rows, existingAttendance, toleranceMinutes, sourcePriority);
    const summary = this.summarize(decisions);

    await this.db.transaction(async (client) => {
      await client.query(
        'DELETE FROM historical_attendance_import_reconciliation_results WHERE tenant_id = $1 AND batch_id = $2',
        [tenantId, batchId],
      );

      for (const decision of decisions) {
        await client.query(
          `INSERT INTO historical_attendance_import_reconciliation_results
             (tenant_id, batch_id, staging_row_id, mapped_employee_id,
              existing_attendance_record_id, duplicate_of_staging_row_id,
              duplicate_of_attendance_record_id, punch_date, punch_time,
              punch_direction, source_type, source_name, source_rank, action,
              attendance_impact, conflict_type, tolerance_minutes, source_priority,
              merge_suggestion, details, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            tenantId,
            batchId,
            decision.row.id,
            decision.row.mapped_employee_id,
            decision.existingAttendanceRecordId ?? null,
            decision.duplicateOfStagingRowId ?? null,
            decision.duplicateOfAttendanceRecordId ?? null,
            decision.punchDate,
            decision.punchTime,
            decision.row.punch_direction,
            decision.row.source_type,
            decision.row.source_name,
            decision.sourceRank,
            decision.action,
            decision.attendanceImpact,
            decision.conflictType ?? null,
            toleranceMinutes,
            JSON.stringify(sourcePriority),
            JSON.stringify(decision.mergeSuggestion),
            JSON.stringify(decision.details),
            actor.sub,
          ],
        );
      }

      await this.updateBatchPreviewState(client, tenantId, batchId, actor.sub, summary);
      await this.logWithClient(client, tenantId, batchId, batch.source_id, 'info', 'reconciliation_preview_generated', actor.sub, {
        toleranceMinutes,
        sourcePriority,
        ...summary,
      });
    });

    return {
      toleranceMinutes,
      sourcePriority,
      counts: summary,
      preview: await this.getAttendancePreview(tenantId, batchId, { limit: 50 }),
    };
  }

  async getAttendancePreview(tenantId: string, batchId: string, query: ImportPreviewQueryDto) {
    await this.assertEnabled(tenantId);
    await this.getBatch(tenantId, batchId);

    const reconciliationExists = await this.hasReconciliation(tenantId, batchId);
    if (!reconciliationExists) {
      return this.getValidationOnlyPreview(tenantId, batchId, query);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const params: any[] = [tenantId, batchId];
    let where = 'WHERE rr.tenant_id = $1 AND rr.batch_id = $2';

    switch (query.bucket) {
      case 'create':
        where += " AND rr.attendance_impact = 'create'";
        break;
      case 'update':
        where += " AND rr.attendance_impact = 'update'";
        break;
      case 'unchanged':
        where += " AND rr.attendance_impact = 'unchanged'";
        break;
      case 'duplicates':
        where += " AND rr.action = 'duplicate'";
        break;
      case 'unknown':
        where += " AND rr.action = 'unknown_employee'";
        break;
      case 'rejected':
        where += " AND rr.action = 'rejected'";
        break;
      case 'conflicts':
        where += " AND rr.action = 'conflict'";
        break;
      case 'warnings':
        where += " AND sr.validation_status = 'warning'";
        break;
      case 'errors':
        where += ' AND jsonb_array_length(sr.validation_errors) > 0';
        break;
      case 'valid':
        where += " AND sr.validation_status = 'valid'";
        break;
      case 'mapped':
        where += ' AND sr.mapped_employee_id IS NOT NULL';
        break;
      default:
        break;
    }

    const [{ rows: countRows }, { rows: issueRows }] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total_rows,
           COUNT(*) FILTER (WHERE rr.attendance_impact = 'create')::int AS attendance_create_rows,
           COUNT(*) FILTER (WHERE rr.attendance_impact = 'update')::int AS attendance_update_rows,
           COUNT(*) FILTER (WHERE rr.attendance_impact = 'unchanged')::int AS attendance_unchanged_rows,
           COUNT(DISTINCT (rr.mapped_employee_id::text || ':' || rr.punch_date::text))
             FILTER (WHERE rr.attendance_impact = 'create')::int AS attendance_to_create,
           COUNT(DISTINCT (rr.mapped_employee_id::text || ':' || rr.punch_date::text))
             FILTER (WHERE rr.attendance_impact = 'update')::int AS attendance_to_update,
           COUNT(DISTINCT (rr.mapped_employee_id::text || ':' || rr.punch_date::text))
             FILTER (WHERE rr.attendance_impact = 'unchanged')::int AS attendance_unchanged,
           COUNT(*) FILTER (WHERE rr.action = 'duplicate')::int AS duplicate_punches,
           COUNT(*) FILTER (WHERE rr.action = 'duplicate')::int AS duplicate_rows,
           COUNT(*) FILTER (WHERE rr.action = 'rejected')::int AS rejected_punches,
           COUNT(*) FILTER (WHERE rr.action = 'unknown_employee')::int AS unknown_employees,
           COUNT(*) FILTER (WHERE rr.action = 'conflict')::int AS conflicts,
           COUNT(*) FILTER (WHERE sr.validation_status = 'valid')::int AS valid_rows,
           COUNT(*) FILTER (WHERE sr.validation_status = 'warning')::int AS warning_rows,
           COUNT(*) FILTER (WHERE jsonb_array_length(sr.validation_errors) > 0)::int AS error_rows,
           COUNT(*) FILTER (WHERE sr.mapped_employee_id IS NOT NULL)::int AS mapped_employees,
           COUNT(*) FILTER (WHERE sr.validation_status = 'rejected')::int AS rejected_rows
         FROM historical_attendance_import_reconciliation_results rr
         JOIN historical_attendance_import_staging_rows sr ON sr.id = rr.staging_row_id
         WHERE rr.tenant_id = $1 AND rr.batch_id = $2`,
        [tenantId, batchId],
      ),
      this.db.query(
        `SELECT action AS code, action AS severity, COUNT(*)::int AS count
         FROM historical_attendance_import_reconciliation_results
         WHERE tenant_id = $1 AND batch_id = $2
         GROUP BY action
         ORDER BY action`,
        [tenantId, batchId],
      ),
    ]);

    params.push(limit, (page - 1) * limit);
    const { rows } = await this.db.query(
      `SELECT sr.id, sr.row_number, sr.raw_employee_identifier, sr.punched_at,
              sr.punch_direction, sr.device_identifier, sr.mapping_status,
              sr.mapping_method, sr.mapping_confidence, sr.validation_status,
              sr.validation_errors, sr.validation_warnings, sr.duplicate_of_row_id,
              sr.rejected_reason, e.id AS employee_id, e.employee_code,
              e.first_name, e.last_name,
              rr.action AS reconciliation_action,
              rr.attendance_impact,
              rr.conflict_type,
              rr.existing_attendance_record_id,
              rr.duplicate_of_staging_row_id,
              rr.duplicate_of_attendance_record_id,
              rr.merge_suggestion,
              rr.details AS reconciliation_details,
              rr.source_rank,
              rr.tolerance_minutes
       FROM historical_attendance_import_reconciliation_results rr
       JOIN historical_attendance_import_staging_rows sr ON sr.id = rr.staging_row_id
       LEFT JOIN employees e ON e.id = sr.mapped_employee_id
       ${where}
       ORDER BY
         CASE rr.action
           WHEN 'conflict' THEN 1
           WHEN 'rejected' THEN 2
           WHEN 'unknown_employee' THEN 3
           WHEN 'duplicate' THEN 4
           WHEN 'update' THEN 5
           WHEN 'create' THEN 6
           ELSE 7
         END,
         sr.punched_at NULLS LAST,
         sr.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      counts: countRows[0],
      issues: issueRows,
      rows,
      meta: { page, limit, reconciled: true },
    };
  }

  private buildDecisions(
    rows: StagingRow[],
    existingAttendance: AttendanceRecord[],
    toleranceMinutes: number,
    sourcePriority: string[],
  ): RowDecision[] {
    const toleranceMs = toleranceMinutes * 60_000;
    const rankBySource = new Map(sourcePriority.map((source, index) => [source, index + 1]));
    const existingAttendanceRank = rankBySource.get('existing_attendance') ?? 100;
    const existingByEmployeeDate = new Map<string, AttendanceRecord>();
    const existingPunchesByEmployeeDate = new Map<string, ExistingPunch[]>();

    for (const record of existingAttendance) {
      const key = this.employeeDateKey(record.employee_id, this.toDateString(record.date));
      existingByEmployeeDate.set(key, record);
      existingPunchesByEmployeeDate.set(key, this.extractExistingPunches(record));
    }

    const decisions = rows.map((row) => this.initialDecision(row, rankBySource));
    const eligible = decisions.filter((decision) => this.isEligibleForReconciliation(decision));

    this.applyImportedDuplicateDetection(eligible, toleranceMs);
    this.applyDirectionConflictDetection(eligible, toleranceMs);

    for (const decision of decisions) {
      if (!this.isEligibleForReconciliation(decision)) continue;
      if (decision.action === 'duplicate' || decision.action === 'conflict') continue;

      const row = decision.row;
      const punchDate = decision.punchDate;
      if (!row.mapped_employee_id || !punchDate || !decision.punchTime) continue;

      const existingKey = this.employeeDateKey(row.mapped_employee_id, punchDate);
      const existingRecord = existingByEmployeeDate.get(existingKey);
      const existingPunches = existingPunchesByEmployeeDate.get(existingKey) ?? [];
      const duplicateExistingPunch = this.findNearExistingPunch(decision, existingPunches, toleranceMs);

      if (duplicateExistingPunch && existingAttendanceRank <= decision.sourceRank) {
        decision.action = 'duplicate';
        decision.attendanceImpact = 'unchanged';
        decision.duplicateOfAttendanceRecordId = duplicateExistingPunch.attendanceRecordId;
        decision.existingAttendanceRecordId = duplicateExistingPunch.attendanceRecordId;
        decision.mergeSuggestion = {
          operation: 'ignore_punch',
          reason: 'A matching production attendance punch exists within the tolerance window',
          keep: 'existing_attendance',
          duplicateOfAttendanceRecordId: duplicateExistingPunch.attendanceRecordId,
        };
        decision.details = {
          ...decision.details,
          duplicateSource: 'existing_attendance',
          matchedPunch: {
            time: duplicateExistingPunch.time.toISOString(),
            direction: duplicateExistingPunch.direction,
            provider: duplicateExistingPunch.provider,
            device: duplicateExistingPunch.device,
          },
        };
        continue;
      }

      if (!existingRecord) {
        decision.action = 'create';
        decision.attendanceImpact = 'create';
        decision.mergeSuggestion = {
          operation: 'create_attendance',
          date: punchDate,
          punchTime: decision.punchTime.toISOString(),
          punchDirection: row.punch_direction ?? 'unknown',
        };
        decision.details = {
          ...decision.details,
          reason: 'No production attendance exists for this employee and date',
        };
        continue;
      }

      decision.existingAttendanceRecordId = existingRecord.id;
      if (duplicateExistingPunch) {
        decision.action = 'update';
        decision.attendanceImpact = 'update';
        decision.mergeSuggestion = {
          operation: 'update_attendance_source',
          reason: 'Imported punch matches production attendance but has higher source priority',
          current: {
            source: 'existing_attendance',
            rank: existingAttendanceRank,
          },
          proposed: {
            source: row.source_type,
            sourceName: row.source_name,
            rank: decision.sourceRank,
          },
        };
        decision.details = {
          ...decision.details,
          reason: 'Higher-priority import source matched an existing production punch',
          existingAttendance: this.serializeExistingAttendance(existingRecord),
          matchedPunch: {
            time: duplicateExistingPunch.time.toISOString(),
            direction: duplicateExistingPunch.direction,
            provider: duplicateExistingPunch.provider,
            device: duplicateExistingPunch.device,
          },
        };
        continue;
      }

      const updateSuggestion = this.getUpdateSuggestion(decision, existingRecord, toleranceMs);
      if (updateSuggestion.shouldUpdate) {
        decision.action = 'update';
        decision.attendanceImpact = 'update';
        decision.mergeSuggestion = updateSuggestion.suggestion;
        decision.details = {
          ...decision.details,
          reason: updateSuggestion.reason,
          existingAttendance: this.serializeExistingAttendance(existingRecord),
        };
      } else {
        decision.action = 'unchanged';
        decision.attendanceImpact = 'unchanged';
        decision.mergeSuggestion = {
          operation: 'no_change',
          reason: updateSuggestion.reason,
          existingAttendanceRecordId: existingRecord.id,
        };
        decision.details = {
          ...decision.details,
          existingAttendance: this.serializeExistingAttendance(existingRecord),
        };
      }
    }

    return decisions;
  }

  private initialDecision(row: StagingRow, rankBySource: Map<string, number>): RowDecision {
    const punchTime = this.toDate(row.punched_at);
    const punchDate = punchTime ? punchTime.toISOString().slice(0, 10) : null;
    const sourceKey = row.source_id && rankBySource.has(row.source_id) ? row.source_id : row.source_type ?? 'unknown';
    const sourceRank = rankBySource.get(sourceKey) ?? rankBySource.get(row.source_type ?? '') ?? 100;
    const validationErrors = this.asArray(row.validation_errors);
    const mappingUnresolved = ['unknown', 'conflict', 'unmapped'].includes(row.mapping_status);

    if (!row.mapped_employee_id || mappingUnresolved) {
      return {
        row,
        action: 'unknown_employee',
        attendanceImpact: 'none',
        sourceRank,
        punchDate,
        punchTime,
        mergeSuggestion: {
          operation: 'resolve_employee_mapping',
          reason: 'The source employee identifier is unresolved',
        },
        details: { validationErrors },
      };
    }

    if (row.validation_status === 'rejected' || validationErrors.length > 0) {
      return {
        row,
        action: 'rejected',
        attendanceImpact: 'none',
        sourceRank,
        punchDate,
        punchTime,
        mergeSuggestion: {
          operation: 'reject_punch',
          reason: row.rejected_reason ?? validationErrors[0]?.message ?? 'Validation rejected this punch',
        },
        details: { validationErrors },
      };
    }

    if (!punchTime || !punchDate) {
      return {
        row,
        action: 'rejected',
        attendanceImpact: 'none',
        sourceRank,
        punchDate,
        punchTime,
        mergeSuggestion: {
          operation: 'reject_punch',
          reason: 'Punch timestamp is missing or invalid',
        },
        details: { validationErrors },
      };
    }

    return {
      row,
      action: 'unchanged',
      attendanceImpact: 'none',
      sourceRank,
      punchDate,
      punchTime,
      mergeSuggestion: {},
      details: {
        sourceType: row.source_type,
        sourceName: row.source_name,
        deviceIdentifier: row.device_identifier,
        validationWarnings: this.asArray(row.validation_warnings),
      },
    };
  }

  private applyImportedDuplicateDetection(decisions: RowDecision[], toleranceMs: number) {
    const sorted = [...decisions].sort((a, b) => {
      const employeeCmp = (a.row.mapped_employee_id ?? '').localeCompare(b.row.mapped_employee_id ?? '');
      if (employeeCmp !== 0) return employeeCmp;
      const dateCmp = (a.punchDate ?? '').localeCompare(b.punchDate ?? '');
      if (dateCmp !== 0) return dateCmp;
      const directionCmp = this.directionGroup(a.row.punch_direction).localeCompare(this.directionGroup(b.row.punch_direction));
      if (directionCmp !== 0) return directionCmp;
      return (a.punchTime?.getTime() ?? 0) - (b.punchTime?.getTime() ?? 0);
    });

    let cluster: RowDecision[] = [];
    for (const decision of sorted) {
      if (!cluster.length || this.belongsToDuplicateCluster(cluster[cluster.length - 1], decision, toleranceMs)) {
        cluster.push(decision);
        continue;
      }
      this.markDuplicateCluster(cluster, toleranceMs);
      cluster = [decision];
    }
    this.markDuplicateCluster(cluster, toleranceMs);
  }

  private applyDirectionConflictDetection(decisions: RowDecision[], toleranceMs: number) {
    const active = decisions.filter((decision) => decision.action !== 'duplicate');
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const left = active[i];
        const right = active[j];
        if (!this.sameEmployeeDate(left, right)) continue;
        if (!left.punchTime || !right.punchTime) continue;
        if (Math.abs(left.punchTime.getTime() - right.punchTime.getTime()) > toleranceMs) continue;
        if (!this.isOpposingDirection(left.row.punch_direction, right.row.punch_direction)) continue;

        for (const decision of [left, right]) {
          decision.action = 'conflict';
          decision.attendanceImpact = 'none';
          decision.conflictType = 'opposing_directions_within_tolerance';
          decision.mergeSuggestion = {
            operation: 'manual_review',
            reason: 'Opposing punch directions occur inside the tolerance window',
            relatedStagingRowId: decision === left ? right.row.id : left.row.id,
          };
          decision.details = {
            ...decision.details,
            conflictingStagingRowId: decision === left ? right.row.id : left.row.id,
          };
        }
      }
    }
  }

  private markDuplicateCluster(cluster: RowDecision[], toleranceMs: number) {
    if (cluster.length <= 1) return;
    const winner = [...cluster].sort((a, b) => {
      if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
      const confidenceDiff = Number(b.row.mapping_confidence ?? 0) - Number(a.row.mapping_confidence ?? 0);
      if (confidenceDiff !== 0) return confidenceDiff;
      return new Date(a.row.created_at).getTime() - new Date(b.row.created_at).getTime();
    })[0];

    for (const decision of cluster) {
      if (decision.row.id === winner.row.id) continue;
      decision.action = 'duplicate';
      decision.attendanceImpact = 'unchanged';
      decision.duplicateOfStagingRowId = winner.row.id;
      decision.mergeSuggestion = {
        operation: 'ignore_punch',
        reason: 'A higher-priority imported punch exists within the tolerance window',
        keepStagingRowId: winner.row.id,
      };
      decision.details = {
        ...decision.details,
        duplicateSource: 'imported_punch',
        duplicateOfStagingRowId: winner.row.id,
        toleranceMs,
      };
    }
  }

  private getUpdateSuggestion(decision: RowDecision, record: AttendanceRecord, toleranceMs: number) {
    const punchTime = decision.punchTime!;
    const direction = this.directionGroup(decision.row.punch_direction);
    const clockIn = this.toDate(record.clock_in);
    const clockOut = this.toDate(record.clock_out);
    const currentClockIn = clockIn?.toISOString() ?? null;
    const currentClockOut = clockOut?.toISOString() ?? null;

    if (direction === 'in') {
      if (!clockIn || punchTime.getTime() < clockIn.getTime() - toleranceMs) {
        return {
          shouldUpdate: true,
          reason: 'Imported punch is earlier than the current clock-in',
          suggestion: {
            operation: 'update_attendance',
            updateFields: { clock_in: punchTime.toISOString() },
            current: { clock_in: currentClockIn, clock_out: currentClockOut },
          },
        };
      }
      return {
        shouldUpdate: false,
        reason: 'Imported punch does not improve the current clock-in',
        suggestion: {},
      };
    }

    if (direction === 'out') {
      if (!clockOut || punchTime.getTime() > clockOut.getTime() + toleranceMs) {
        return {
          shouldUpdate: true,
          reason: 'Imported punch is later than the current clock-out',
          suggestion: {
            operation: 'update_attendance',
            updateFields: { clock_out: punchTime.toISOString() },
            current: { clock_in: currentClockIn, clock_out: currentClockOut },
          },
        };
      }
      return {
        shouldUpdate: false,
        reason: 'Imported punch does not improve the current clock-out',
        suggestion: {},
      };
    }

    const beforeClockIn = clockIn && punchTime.getTime() < clockIn.getTime() - toleranceMs;
    const afterClockOut = clockOut && punchTime.getTime() > clockOut.getTime() + toleranceMs;
    const missingClockIn = !clockIn;
    const missingClockOut = !clockOut;

    if (missingClockIn || beforeClockIn || missingClockOut || afterClockOut) {
      return {
        shouldUpdate: true,
        reason: 'Imported unknown-direction punch can extend the attendance window',
        suggestion: {
          operation: 'update_attendance',
          updateFields: {
            clock_in: missingClockIn || beforeClockIn ? punchTime.toISOString() : currentClockIn,
            clock_out: missingClockOut || afterClockOut ? punchTime.toISOString() : currentClockOut,
          },
          current: { clock_in: currentClockIn, clock_out: currentClockOut },
        },
      };
    }

    return {
      shouldUpdate: false,
      reason: 'Imported punch falls inside the existing attendance window',
      suggestion: {},
    };
  }

  private findNearExistingPunch(decision: RowDecision, existingPunches: ExistingPunch[], toleranceMs: number) {
    if (!decision.punchTime) return null;
    const direction = this.directionGroup(decision.row.punch_direction);
    return existingPunches.find((punch) => {
      const sameDirection = direction === 'unknown' || punch.direction === 'unknown' || punch.direction === direction;
      return sameDirection && Math.abs(punch.time.getTime() - decision.punchTime!.getTime()) <= toleranceMs;
    }) ?? null;
  }

  private extractExistingPunches(record: AttendanceRecord): ExistingPunch[] {
    const punches: ExistingPunch[] = [];
    const clockIn = this.toDate(record.clock_in);
    const clockOut = this.toDate(record.clock_out);

    if (clockIn) {
      punches.push({
        attendanceRecordId: record.id,
        time: clockIn,
        direction: 'in',
        provider: record.provider_name,
        device: record.source_device_id,
      });
    }
    if (clockOut) {
      punches.push({
        attendanceRecordId: record.id,
        time: clockOut,
        direction: 'out',
        provider: record.provider_name,
        device: record.source_device_id,
      });
    }

    for (const entry of this.asArray(record.punch_sequence)) {
      const time = this.toDate(entry?.time);
      if (!time) continue;
      punches.push({
        attendanceRecordId: record.id,
        time,
        direction: this.directionGroup(entry?.type),
        provider: entry?.provider ?? record.provider_name,
        device: entry?.device ?? record.source_device_id,
      });
    }

    return punches;
  }

  private async getStagingRows(tenantId: string, batchId: string): Promise<StagingRow[]> {
    const { rows } = await this.db.query(
      `SELECT sr.*, s.source_type, s.name AS source_name,
              e.employee_code, e.first_name, e.last_name
       FROM historical_attendance_import_staging_rows sr
       LEFT JOIN historical_attendance_import_sources s ON s.id = sr.source_id
       LEFT JOIN employees e ON e.id = sr.mapped_employee_id
       WHERE sr.tenant_id = $1 AND sr.batch_id = $2
       ORDER BY sr.punched_at NULLS LAST, sr.created_at ASC`,
      [tenantId, batchId],
    );
    return rows;
  }

  private async getExistingAttendance(tenantId: string, batch: any, rows: StagingRow[]): Promise<AttendanceRecord[]> {
    const employeeIds = [...new Set(rows.map((row) => row.mapped_employee_id).filter(Boolean))];
    if (!employeeIds.length) return [];

    const { rows: attendanceRows } = await this.db.query(
      `SELECT id, employee_id, date, clock_in, clock_out, status, provider_name,
              source_device_id, punch_sequence, punch_count
       FROM attendance_records
       WHERE tenant_id = $1
         AND employee_id = ANY($2::uuid[])
         AND date BETWEEN $3::date AND $4::date`,
      [tenantId, employeeIds, batch.date_from, batch.date_to],
    );
    return attendanceRows;
  }

  private async getValidationOnlyPreview(tenantId: string, batchId: string, query: ImportPreviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const params: any[] = [tenantId, batchId];
    let where = 'WHERE sr.tenant_id = $1 AND sr.batch_id = $2';

    switch (query.bucket) {
      case 'duplicates':
        where += ' AND sr.duplicate_of_row_id IS NOT NULL';
        break;
      case 'unknown':
        where += " AND sr.mapping_status IN ('unknown', 'conflict', 'unmapped')";
        break;
      case 'rejected':
        where += " AND sr.validation_status = 'rejected'";
        break;
      case 'warnings':
        where += " AND sr.validation_status = 'warning'";
        break;
      case 'errors':
        where += ' AND jsonb_array_length(sr.validation_errors) > 0';
        break;
      case 'valid':
        where += " AND sr.validation_status = 'valid'";
        break;
      case 'mapped':
        where += ' AND sr.mapped_employee_id IS NOT NULL';
        break;
      default:
        break;
    }

    const [{ rows: countRows }, { rows: issueRows }] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total_rows,
           0::int AS attendance_create_rows,
           0::int AS attendance_update_rows,
           0::int AS attendance_unchanged_rows,
           0::int AS attendance_to_create,
           0::int AS attendance_to_update,
           0::int AS attendance_unchanged,
           COUNT(*) FILTER (WHERE duplicate_of_row_id IS NOT NULL)::int AS duplicate_punches,
           COUNT(*) FILTER (WHERE duplicate_of_row_id IS NOT NULL)::int AS duplicate_rows,
           COUNT(*) FILTER (WHERE validation_status = 'rejected')::int AS rejected_punches,
           COUNT(*) FILTER (WHERE mapping_status IN ('unknown', 'conflict', 'unmapped'))::int AS unknown_employees,
           0::int AS conflicts,
           COUNT(*) FILTER (WHERE validation_status = 'valid')::int AS valid_rows,
           COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS warning_rows,
           COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors) > 0)::int AS error_rows,
           COUNT(*) FILTER (WHERE mapped_employee_id IS NOT NULL)::int AS mapped_employees,
           COUNT(*) FILTER (WHERE validation_status = 'rejected')::int AS rejected_rows
         FROM historical_attendance_import_staging_rows
         WHERE tenant_id = $1 AND batch_id = $2`,
        [tenantId, batchId],
      ),
      this.db.query(
        `SELECT severity, code, COUNT(*)::int AS count
         FROM historical_attendance_import_validation_results
         WHERE tenant_id = $1 AND batch_id = $2
         GROUP BY severity, code
         ORDER BY severity, code`,
        [tenantId, batchId],
      ),
    ]);

    params.push(limit, (page - 1) * limit);
    const { rows } = await this.db.query(
      `SELECT sr.id, sr.row_number, sr.raw_employee_identifier, sr.punched_at,
              sr.punch_direction, sr.device_identifier, sr.mapping_status,
              sr.mapping_method, sr.mapping_confidence, sr.validation_status,
              sr.validation_errors, sr.validation_warnings, sr.duplicate_of_row_id,
              sr.rejected_reason, e.id AS employee_id, e.employee_code,
              e.first_name, e.last_name,
              NULL AS reconciliation_action,
              NULL AS attendance_impact,
              NULL AS conflict_type,
              NULL AS existing_attendance_record_id,
              NULL AS duplicate_of_staging_row_id,
              NULL AS duplicate_of_attendance_record_id,
              '{}'::jsonb AS merge_suggestion,
              '{}'::jsonb AS reconciliation_details,
              NULL AS source_rank,
              NULL AS tolerance_minutes
       FROM historical_attendance_import_staging_rows sr
       LEFT JOIN employees e ON e.id = sr.mapped_employee_id
       ${where}
       ORDER BY sr.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      counts: countRows[0],
      issues: issueRows,
      rows,
      meta: { page, limit, reconciled: false },
    };
  }

  private summarize(decisions: RowDecision[]) {
    const uniqueCreate = new Set<string>();
    const uniqueUpdate = new Set<string>();
    const uniqueUnchanged = new Set<string>();

    for (const decision of decisions) {
      if (!decision.row.mapped_employee_id || !decision.punchDate) continue;
      const key = this.employeeDateKey(decision.row.mapped_employee_id, decision.punchDate);
      if (decision.attendanceImpact === 'create') uniqueCreate.add(key);
      if (decision.attendanceImpact === 'update') uniqueUpdate.add(key);
      if (decision.attendanceImpact === 'unchanged') uniqueUnchanged.add(key);
    }

    return {
      totalRows: decisions.length,
      attendanceToCreate: uniqueCreate.size,
      attendanceToUpdate: uniqueUpdate.size,
      attendanceUnchanged: uniqueUnchanged.size,
      createRows: decisions.filter((decision) => decision.attendanceImpact === 'create').length,
      updateRows: decisions.filter((decision) => decision.attendanceImpact === 'update').length,
      unchangedRows: decisions.filter((decision) => decision.attendanceImpact === 'unchanged').length,
      duplicatePunches: decisions.filter((decision) => decision.action === 'duplicate').length,
      rejectedPunches: decisions.filter((decision) => decision.action === 'rejected').length,
      unknownEmployees: decisions.filter((decision) => decision.action === 'unknown_employee').length,
      conflicts: decisions.filter((decision) => decision.action === 'conflict').length,
    };
  }

  private async updateBatchPreviewState(client: any, tenantId: string, batchId: string, actorUserId: string, summary: any) {
    const blockingIssues = summary.rejectedPunches + summary.unknownEmployees + summary.conflicts;
    await client.query(
      `UPDATE historical_attendance_import_batches
       SET status = CASE WHEN $3::int = 0 THEN 'ready' ELSE 'validation' END,
           statistics = COALESCE(statistics, '{}'::jsonb) || jsonb_build_object(
             'importedRecords', 0,
             'previewOnly', true,
             'attendanceToCreate', $4::int,
             'attendanceToUpdate', $5::int,
             'attendanceUnchanged', $6::int,
             'duplicatePunches', $7::int,
             'rejectedPunches', $8::int,
             'unknownEmployees', $9::int,
             'conflicts', $10::int
           ),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        batchId,
        tenantId,
        blockingIssues,
        summary.attendanceToCreate,
        summary.attendanceToUpdate,
        summary.attendanceUnchanged,
        summary.duplicatePunches,
        summary.rejectedPunches,
        summary.unknownEmployees,
        summary.conflicts,
      ],
    );

    await client.query(
      `UPDATE historical_attendance_import_progress
       SET phase = 'reconciliation',
           processed_rows = $3,
           imported_records = 0,
           failed_records = $4,
           warning_count = $5,
           progress_percent = CASE WHEN total_rows = 0 THEN 100 ELSE 100 END,
           message = 'Attendance preview generated; production attendance unchanged',
           updated_by = $6,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId, summary.totalRows, summary.rejectedPunches, summary.duplicatePunches + summary.conflicts, actorUserId],
    );
  }

  private normalizeSourcePriority(sourcePriority?: string[]) {
    const basePriority = sourcePriority?.length ? sourcePriority : DEFAULT_SOURCE_PRIORITY;
    const normalized = basePriority
      .map((source) => source.trim())
      .filter(Boolean);
    const unique = [...new Set(normalized)];
    return unique.includes('existing_attendance') ? unique : ['existing_attendance', ...unique];
  }

  private readBatchTolerance(batch: any) {
    const config = batch.source_config ?? batch.config ?? {};
    const value = Number(config?.reconciliation?.toleranceMinutes ?? config?.toleranceMinutes);
    return Number.isFinite(value) ? value : null;
  }

  private isEligibleForReconciliation(decision: RowDecision) {
    return decision.attendanceImpact === 'none' && decision.action === 'unchanged' && !!decision.punchTime;
  }

  private belongsToDuplicateCluster(left: RowDecision, right: RowDecision, toleranceMs: number) {
    if (!this.sameEmployeeDate(left, right)) return false;
    if (this.directionGroup(left.row.punch_direction) !== this.directionGroup(right.row.punch_direction)) return false;
    if (!left.punchTime || !right.punchTime) return false;
    return Math.abs(left.punchTime.getTime() - right.punchTime.getTime()) <= toleranceMs;
  }

  private sameEmployeeDate(left: RowDecision, right: RowDecision) {
    return (
      left.row.mapped_employee_id === right.row.mapped_employee_id &&
      left.punchDate === right.punchDate &&
      !!left.row.mapped_employee_id &&
      !!left.punchDate
    );
  }

  private isOpposingDirection(left: string | null, right: string | null) {
    const leftGroup = this.directionGroup(left);
    const rightGroup = this.directionGroup(right);
    return (leftGroup === 'in' && rightGroup === 'out') || (leftGroup === 'out' && rightGroup === 'in');
  }

  private directionGroup(direction: unknown) {
    const value = String(direction ?? 'unknown').toLowerCase();
    if (['in', 'break_in'].includes(value)) return 'in';
    if (['out', 'break_out'].includes(value)) return 'out';
    if (value === 'unknown') return 'unknown';
    if (value.includes('in')) return 'in';
    if (value.includes('out')) return 'out';
    return 'unknown';
  }

  private employeeDateKey(employeeId: string, date: string) {
    return `${employeeId}:${date}`;
  }

  private serializeExistingAttendance(record: AttendanceRecord) {
    return {
      id: record.id,
      date: this.toDateString(record.date),
      clock_in: this.toDate(record.clock_in)?.toISOString() ?? null,
      clock_out: this.toDate(record.clock_out)?.toISOString() ?? null,
      status: record.status,
      provider_name: record.provider_name,
      source_device_id: record.source_device_id,
      punch_count: record.punch_count,
    };
  }

  private asArray(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private toDate(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toDateString(value: Date | string) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private async hasReconciliation(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT 1
       FROM historical_attendance_import_reconciliation_results
       WHERE tenant_id = $1 AND batch_id = $2
       LIMIT 1`,
      [tenantId, batchId],
    );
    return rows.length > 0;
  }

  private async getBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT b.*, s.config AS source_config
       FROM historical_attendance_import_batches b
       LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
       WHERE b.id = $1 AND b.tenant_id = $2 AND b.deleted_at IS NULL`,
      [batchId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import batch not found');
    return rows[0];
  }

  private async assertEnabled(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT historical_attendance_import_enabled
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (!rows.length) throw new NotFoundException('Organization not found');
    if (!rows[0].historical_attendance_import_enabled) {
      throw new BadRequestException('Historical attendance import is not enabled for this organization');
    }
  }

  private async logWithClient(
    client: any,
    tenantId: string,
    batchId: string,
    sourceId: string | null,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, source_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, batchId, sourceId, level, code, code.replace(/_/g, ' '), details, actorUserId],
    );
  }
}
