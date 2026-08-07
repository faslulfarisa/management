import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import {
  AutoMatchBatchDto,
  EmployeeSearchQueryDto,
  ManualEmployeeMappingDto,
  MappingDecisionDto,
} from '../dto/historical-attendance-import.dto';
import { HistoricalAttendanceEmployeeIdentifierType } from '../constants/historical-attendance-import.constants';

interface Actor {
  sub: string;
}

interface IdentifierCandidate {
  type: HistoricalAttendanceEmployeeIdentifierType;
  value: string;
}

interface EmployeeCandidate {
  employee: any;
  identifierType: HistoricalAttendanceEmployeeIdentifierType;
  confidence: number;
  reason: string;
}

const IDENTIFIER_FIELDS: Array<{ type: HistoricalAttendanceEmployeeIdentifierType; rawKeys: string[] }> = [
  { type: 'employee_code', rawKeys: ['employeeCode', 'employee_code', 'empCode', 'emp_code'] },
  { type: 'device_user_id', rawKeys: ['deviceUserId', 'device_user_id', 'userId', 'user_id', 'uid'] },
  { type: 'card_number', rawKeys: ['cardNumber', 'card_number', 'employeeCardNumber', 'employee_card_number'] },
  { type: 'biometric_employee_id', rawKeys: ['biometricEmployeeId', 'biometric_employee_id', 'biometricId', 'biometric_id'] },
  { type: 'pin', rawKeys: ['pin', 'PIN'] },
  { type: 'device_code', rawKeys: ['deviceCode', 'device_code'] },
];

@Injectable()
export class HistoricalAttendanceEmployeeMappingService {
  constructor(private readonly db: DatabaseService) {}

  async searchEmployees(tenantId: string, query: EmployeeSearchQueryDto) {
    await this.assertEnabled(tenantId);
    const search = `%${query.search.trim()}%`;
    const limit = query.limit ?? 10;
    const { rows } = await this.db.query(
      `SELECT id, employee_code, first_name, last_name, status,
              biometric_employee_id, device_code, card_number, employee_card_number
       FROM employees
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND (
           employee_code ILIKE $2
           OR first_name ILIKE $2
           OR last_name ILIKE $2
           OR biometric_employee_id ILIKE $2
           OR device_code ILIKE $2
           OR card_number ILIKE $2
           OR employee_card_number ILIKE $2
         )
       ORDER BY employee_code
       LIMIT $3`,
      [tenantId, search, limit],
    );
    return rows;
  }

  async listUnknownUsers(tenantId: string, batchId: string) {
    await this.assertEnabled(tenantId);
    await this.getBatch(tenantId, batchId);
    const { rows } = await this.db.query(
      `SELECT uu.*, e.employee_code AS best_employee_code,
              e.first_name AS best_first_name, e.last_name AS best_last_name
       FROM historical_attendance_import_unknown_users uu
       LEFT JOIN employees e ON e.id = uu.best_candidate_employee_id
       WHERE uu.tenant_id = $1 AND uu.batch_id = $2
       ORDER BY
         CASE uu.status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
         uu.row_count DESC,
         uu.source_identifier`,
      [tenantId, batchId],
    );
    return rows;
  }

  async autoMatchBatch(tenantId: string, actor: Actor, batchId: string, body: AutoMatchBatchDto) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1
         AND batch_id = $2
         AND status IN ('staged', 'normalization_failed')
       ORDER BY created_at ASC`,
      [tenantId, batchId],
    );

    let autoMatched = 0;
    let conflicts = 0;
    let unknown = 0;
    let approved = 0;

    for (const row of rows) {
      const identifiers = this.extractIdentifiers(row);
      await this.db.query(
        `UPDATE historical_attendance_import_staging_rows
         SET identifier_candidates = $3
         WHERE id = $1 AND tenant_id = $2`,
        [row.id, tenantId, Object.fromEntries(identifiers.map((item) => [item.type, item.value]))],
      );

      if (!identifiers.length) {
        unknown++;
        await this.markUnknown(tenantId, batch, row, { type: 'manual', value: row.raw_employee_identifier ?? 'unknown' });
        continue;
      }

      const saved = await this.findApprovedSavedMapping(tenantId, batch.source_id, identifiers);
      if (saved) {
        await this.applyMappingToRow(tenantId, row.id, saved.employee_id, saved.id, 'approved', saved.source_identifier_type, saved.confidence);
        approved++;
        continue;
      }

      const candidates = await this.findEmployeeCandidates(tenantId, identifiers);
      if (!candidates.length) {
        unknown++;
        await this.markUnknown(tenantId, batch, row, identifiers[0]);
        continue;
      }

      const bestConfidence = candidates[0].confidence;
      const top = candidates.filter((candidate) => candidate.confidence === bestConfidence);
      if (top.length > 1) {
        conflicts++;
        await this.markConflict(tenantId, row.id, top);
        await this.markUnknown(tenantId, batch, row, identifiers[0], top);
        continue;
      }

      const best = top[0];
      const status = body.approveHighConfidence && best.confidence >= 0.95 ? 'approved' : 'pending';
      const mapping = await this.saveEmployeeMapping(tenantId, actor, {
        sourceId: batch.source_id,
        batchId,
        identifierType: best.identifierType,
        identifier: identifiers.find((item) => item.type === best.identifierType)?.value ?? identifiers[0].value,
        employeeId: best.employee.id,
        mappingMethod: 'automatic',
        confidence: best.confidence,
        status,
        matchDetails: { reason: best.reason, candidates: candidates.slice(0, 5).map((candidate) => this.toCandidateSummary(candidate)) },
      });

      await this.applyMappingToRow(
        tenantId,
        row.id,
        best.employee.id,
        mapping.id,
        status === 'approved' ? 'approved' : 'auto_matched',
        best.identifierType,
        best.confidence,
      );
      if (status === 'approved') approved++;
      else autoMatched++;
    }

    await this.refreshUnknownCounts(tenantId, batchId);
    await this.refreshBatchStats(tenantId, batchId, actor.sub);
    await this.log(tenantId, batchId, batch.source_id, 'info', 'employee_auto_match_completed', actor.sub, {
      autoMatched,
      approved,
      conflicts,
      unknown,
    });

    return { autoMatched, approved, conflicts, unknown, totalRows: rows.length };
  }

  async createManualMapping(tenantId: string, actor: Actor, batchId: string, body: ManualEmployeeMappingDto) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const employee = await this.getEmployee(tenantId, body.employee_id);
    const mapping = await this.saveEmployeeMapping(tenantId, actor, {
      sourceId: batch.source_id,
      batchId,
      identifierType: body.source_identifier_type,
      identifier: body.source_identifier.trim(),
      employeeId: employee.id,
      mappingMethod: 'manual',
      confidence: 1,
      status: 'approved',
      matchDetails: { notes: body.notes ?? null },
    });

    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapped_employee_id = $4,
           employee_mapping_id = $5,
           mapping_status = 'approved',
           mapping_method = 'manual',
           mapping_confidence = 1,
           mapping_notes = $6,
           updated_at = now()
       WHERE tenant_id = $1
         AND batch_id = $2
         AND (
           identifier_candidates ->> $7 = $3
           OR raw_employee_identifier = $3
         )
       RETURNING id`,
      [
        tenantId,
        batchId,
        body.source_identifier.trim(),
        employee.id,
        mapping.id,
        body.notes ?? null,
        body.source_identifier_type,
      ],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_unknown_users
       SET status = 'resolved',
           resolved_mapping_id = $4,
           resolved_by = $5,
           resolved_at = now(),
           updated_at = now()
       WHERE tenant_id = $1
         AND batch_id = $2
         AND source_identifier = $3`,
      [tenantId, batchId, body.source_identifier.trim(), mapping.id, actor.sub],
    );

    await this.refreshBatchStats(tenantId, batchId, actor.sub);
    await this.log(tenantId, batchId, batch.source_id, 'info', 'manual_employee_mapping_saved', actor.sub, {
      sourceIdentifierType: body.source_identifier_type,
      sourceIdentifier: body.source_identifier,
      employeeId: employee.id,
      affectedRows: rows.length,
    });

    return { mapping, affectedRows: rows.length };
  }

  async approveMapping(tenantId: string, actor: Actor, mappingId: string) {
    await this.assertEnabled(tenantId);
    const mapping = await this.getMapping(tenantId, mappingId);
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_employee_mappings
       SET status = 'approved',
           approved_by = $3,
           approved_at = now(),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [mappingId, tenantId, actor.sub],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapping_status = 'approved',
           mapped_employee_id = $4,
           mapping_confidence = $5,
           updated_at = now()
       WHERE tenant_id = $1
         AND batch_id = $2
         AND employee_mapping_id = $3`,
      [tenantId, mapping.batch_id, mappingId, mapping.employee_id, mapping.confidence],
    );

    await this.refreshBatchStats(tenantId, mapping.batch_id, actor.sub);
    return rows[0];
  }

  async rejectMapping(tenantId: string, actor: Actor, mappingId: string, body: MappingDecisionDto) {
    await this.assertEnabled(tenantId);
    const mapping = await this.getMapping(tenantId, mappingId);
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_employee_mappings
       SET status = 'rejected',
           rejected_by = $3,
           rejected_at = now(),
           rejection_reason = $4,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [mappingId, tenantId, actor.sub, body.reason ?? null],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapping_status = 'unknown',
           mapped_employee_id = NULL,
           employee_mapping_id = NULL,
           mapping_notes = $4,
           updated_at = now()
       WHERE tenant_id = $1
         AND batch_id = $2
         AND employee_mapping_id = $3`,
      [tenantId, mapping.batch_id, mappingId, body.reason ?? 'Mapping rejected'],
    );

    await this.refreshBatchStats(tenantId, mapping.batch_id, actor.sub);
    return rows[0];
  }

  private extractIdentifiers(row: any): IdentifierCandidate[] {
    const raw = row.raw_payload ?? {};
    const canonical = row.canonical_punch ?? {};
    const candidates: IdentifierCandidate[] = [];

    const add = (type: HistoricalAttendanceEmployeeIdentifierType, value: unknown) => {
      const normalized = String(value ?? '').trim();
      if (!normalized) return;
      if (!candidates.some((candidate) => candidate.type === type && candidate.value === normalized)) {
        candidates.push({ type, value: normalized });
      }
    };

    add('employee_code', canonical.employeeIdentifier ?? row.raw_employee_identifier);
    for (const field of IDENTIFIER_FIELDS) {
      for (const key of field.rawKeys) add(field.type, raw[key]);
    }

    return candidates;
  }

  private async findApprovedSavedMapping(tenantId: string, sourceId: string, identifiers: IdentifierCandidate[]) {
    for (const identifier of identifiers) {
      const { rows } = await this.db.query(
        `SELECT *
         FROM historical_attendance_import_employee_mappings
         WHERE tenant_id = $1
           AND source_id = $2
           AND source_identifier_type = $3
           AND source_identifier = $4
           AND status = 'approved'
           AND deleted_at IS NULL
         ORDER BY approved_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [tenantId, sourceId, identifier.type, identifier.value],
      );
      if (rows[0]) return rows[0];
    }
    return null;
  }

  private async findEmployeeCandidates(tenantId: string, identifiers: IdentifierCandidate[]): Promise<EmployeeCandidate[]> {
    const candidates: EmployeeCandidate[] = [];
    for (const identifier of identifiers) {
      const matches = await this.findEmployeesByIdentifier(tenantId, identifier);
      candidates.push(...matches);
    }

    const bestByEmployee = new Map<string, EmployeeCandidate>();
    for (const candidate of candidates) {
      const existing = bestByEmployee.get(candidate.employee.id);
      if (!existing || candidate.confidence > existing.confidence) bestByEmployee.set(candidate.employee.id, candidate);
    }

    return Array.from(bestByEmployee.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private async findEmployeesByIdentifier(tenantId: string, identifier: IdentifierCandidate): Promise<EmployeeCandidate[]> {
    const value = identifier.value;
    const exact = (confidence: number, reason: string) => ({ confidence, reason });
    let sql = '';
    let meta = exact(0.75, 'Identifier matched an employee field');

    switch (identifier.type) {
      case 'employee_code':
        sql = 'LOWER(employee_code) = LOWER($2)';
        meta = exact(0.99, 'Employee code exact match');
        break;
      case 'biometric_employee_id':
        sql = 'LOWER(biometric_employee_id) = LOWER($2)';
        meta = exact(0.97, 'Biometric employee ID exact match');
        break;
      case 'card_number':
        sql = '(LOWER(card_number) = LOWER($2) OR LOWER(employee_card_number) = LOWER($2))';
        meta = exact(0.94, 'Card number exact match');
        break;
      case 'device_code':
        sql = 'LOWER(device_code) = LOWER($2)';
        meta = exact(0.92, 'Device code exact match');
        break;
      case 'device_user_id':
        sql = '(LOWER(biometric_employee_id) = LOWER($2) OR LOWER(device_code) = LOWER($2) OR LOWER(employee_code) = LOWER($2))';
        meta = exact(0.86, 'Device user ID matched employee biometric/device fields');
        break;
      case 'pin':
        sql = '(LOWER(device_code) = LOWER($2) OR LOWER(biometric_employee_id) = LOWER($2) OR LOWER(employee_code) = LOWER($2))';
        meta = exact(0.82, 'PIN matched employee biometric/device fields');
        break;
      default:
        return [];
    }

    const { rows } = await this.db.query(
      `SELECT id, employee_code, first_name, last_name, status,
              biometric_employee_id, device_code, card_number, employee_card_number
       FROM employees
       WHERE tenant_id = $1 AND deleted_at IS NULL AND ${sql}
       LIMIT 10`,
      [tenantId, value],
    );

    return rows.map((employee) => ({
      employee,
      identifierType: identifier.type,
      confidence: employee.status === 'active' ? meta.confidence : Math.max(meta.confidence - 0.1, 0),
      reason: employee.status === 'active' ? meta.reason : `${meta.reason}; employee is not active`,
    }));
  }

  private async saveEmployeeMapping(
    tenantId: string,
    actor: Actor,
    data: {
      sourceId: string;
      batchId: string;
      identifierType: HistoricalAttendanceEmployeeIdentifierType;
      identifier: string;
      employeeId: string;
      mappingMethod: 'automatic' | 'manual';
      confidence: number;
      status: 'pending' | 'approved' | 'rejected' | 'conflict';
      matchDetails: Record<string, unknown>;
    },
  ) {
    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_employee_mappings
         (tenant_id, source_id, batch_id, source_identifier_type, source_identifier,
          employee_id, mapping_method, confidence, status, match_details, created_by,
          approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $9 = 'approved' THEN $11 ELSE NULL END,
               CASE WHEN $9 = 'approved' THEN now() ELSE NULL END)
       RETURNING *`,
      [
        tenantId,
        data.sourceId,
        data.batchId,
        data.identifierType,
        data.identifier,
        data.employeeId,
        data.mappingMethod,
        data.confidence,
        data.status,
        data.matchDetails,
        actor.sub,
      ],
    );
    return rows[0];
  }

  private async applyMappingToRow(
    tenantId: string,
    rowId: string,
    employeeId: string,
    mappingId: string,
    mappingStatus: 'auto_matched' | 'approved',
    mappingMethod: HistoricalAttendanceEmployeeIdentifierType,
    confidence: number,
  ) {
    await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapped_employee_id = $3,
           employee_mapping_id = $4,
           mapping_status = $5,
           mapping_method = $6,
           mapping_confidence = $7,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [rowId, tenantId, employeeId, mappingId, mappingStatus, mappingMethod, confidence],
    );
  }

  private async markUnknown(
    tenantId: string,
    batch: any,
    row: any,
    identifier: IdentifierCandidate,
    candidates: EmployeeCandidate[] = [],
  ) {
    await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapping_status = 'unknown',
           mapped_employee_id = NULL,
           employee_mapping_id = NULL,
           mapping_confidence = $3,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [row.id, tenantId, candidates[0]?.confidence ?? null],
    );

    await this.db.query(
      `INSERT INTO historical_attendance_import_unknown_users
         (tenant_id, batch_id, source_id, source_identifier_type, source_identifier,
          candidate_count, best_candidate_employee_id, best_confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (batch_id, source_identifier_type, source_identifier) DO UPDATE SET
         row_count = historical_attendance_import_unknown_users.row_count + 1,
         last_seen_at = now(),
         candidate_count = EXCLUDED.candidate_count,
         best_candidate_employee_id = EXCLUDED.best_candidate_employee_id,
         best_confidence = EXCLUDED.best_confidence,
         updated_at = now()`,
      [
        tenantId,
        batch.id,
        batch.source_id,
        identifier.type,
        identifier.value,
        candidates.length,
        candidates[0]?.employee.id ?? null,
        candidates[0]?.confidence ?? null,
      ],
    );
  }

  private async markConflict(tenantId: string, rowId: string, candidates: EmployeeCandidate[]) {
    await this.db.query(
      `UPDATE historical_attendance_import_staging_rows
       SET mapping_status = 'conflict',
           mapping_confidence = $3,
           mapping_notes = $4,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        rowId,
        tenantId,
        candidates[0]?.confidence ?? null,
        JSON.stringify(candidates.slice(0, 5).map((candidate) => this.toCandidateSummary(candidate))),
      ],
    );
  }

  private toCandidateSummary(candidate: EmployeeCandidate) {
    return {
      employeeId: candidate.employee.id,
      employeeCode: candidate.employee.employee_code,
      name: `${candidate.employee.first_name ?? ''} ${candidate.employee.last_name ?? ''}`.trim(),
      identifierType: candidate.identifierType,
      confidence: candidate.confidence,
      reason: candidate.reason,
    };
  }

  private async refreshUnknownCounts(tenantId: string, batchId: string) {
    await this.db.query(
      `UPDATE historical_attendance_import_unknown_users uu
       SET row_count = counts.row_count,
           updated_at = now()
       FROM (
         SELECT source_identifier_type, source_identifier, COUNT(*)::int AS row_count
         FROM (
           SELECT key AS source_identifier_type, value AS source_identifier
           FROM historical_attendance_import_staging_rows,
                jsonb_each_text(identifier_candidates)
           WHERE tenant_id = $1
             AND batch_id = $2
             AND mapping_status IN ('unknown', 'conflict')
         ) identifiers
         GROUP BY source_identifier_type, source_identifier
       ) counts
       WHERE uu.tenant_id = $1
         AND uu.batch_id = $2
         AND uu.source_identifier_type = counts.source_identifier_type
         AND uu.source_identifier = counts.source_identifier`,
      [tenantId, batchId],
    );
  }

  private async refreshBatchStats(tenantId: string, batchId: string, actorUserId: string) {
    const { rows } = await this.db.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (WHERE status = 'staged')::int AS staged_rows,
         COUNT(*) FILTER (WHERE status = 'normalization_failed')::int AS failed_rows,
         COUNT(*) FILTER (WHERE mapping_status IN ('auto_matched', 'manual_mapped', 'approved'))::int AS mapped_rows,
         COUNT(*) FILTER (WHERE mapping_status = 'unknown')::int AS unknown_rows,
         COUNT(*) FILTER (WHERE mapping_status = 'conflict')::int AS conflict_rows,
         COUNT(*) FILTER (WHERE validation_status = 'valid')::int AS valid_rows,
         COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS warning_rows,
         COUNT(*) FILTER (WHERE validation_status IN ('error', 'rejected'))::int AS rejected_rows,
         COALESCE(SUM(jsonb_array_length(warnings)), 0)::int
           + COALESCE(SUM(jsonb_array_length(validation_warnings)), 0)::int AS warning_count,
         COALESCE(SUM(jsonb_array_length(errors)), 0)::int
           + COALESCE(SUM(jsonb_array_length(validation_errors)), 0)::int AS error_count
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId],
    );
    const stats = rows[0];
    await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET statistics = jsonb_build_object(
             'totalRecords', $3::int,
             'stagedRecords', $4::int,
             'importedRecords', 0,
             'failedRecords', $5::int,
             'warnings', $6::int,
             'errors', $7::int,
             'mappedEmployees', $8::int,
             'unknownEmployees', $9::int,
             'conflicts', $10::int,
             'validRows', $11::int,
             'rejectedRows', $12::int
           ),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [
        batchId,
        tenantId,
        stats.total_rows,
        stats.staged_rows,
        stats.failed_rows,
        stats.warning_count,
        stats.error_count,
        stats.mapped_rows,
        stats.unknown_rows,
        stats.conflict_rows,
        stats.valid_rows + stats.warning_rows,
        stats.rejected_rows,
      ],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET total_rows = $3,
           processed_rows = $4,
           failed_records = $5,
           warning_count = $6,
           progress_percent = CASE WHEN $3::int = 0 THEN 0 ELSE ROUND(($4::numeric / $3::numeric) * 100, 2) END,
           updated_by = $7,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId, stats.total_rows, stats.mapped_rows + stats.rejected_rows, stats.failed_rows, stats.warning_count, actorUserId],
    );
  }

  private async getEmployee(tenantId: string, employeeId: string) {
    const { rows } = await this.db.query(
      `SELECT id, employee_code, first_name, last_name, status
       FROM employees
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [employeeId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee not found');
    return rows[0];
  }

  private async getMapping(tenantId: string, mappingId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_employee_mappings
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [mappingId, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Employee mapping not found');
    return rows[0];
  }

  private async getBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_batches
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
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

  private async log(
    tenantId: string,
    batchId: string,
    sourceId: string | null,
    level: 'info' | 'warning' | 'error',
    code: string,
    actorUserId: string,
    details: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, source_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, batchId, sourceId, level, code, code.replace(/_/g, ' '), details, actorUserId],
    );
  }
}
