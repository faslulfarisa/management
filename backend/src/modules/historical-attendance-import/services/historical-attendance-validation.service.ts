import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ImportPreviewQueryDto } from '../dto/historical-attendance-import.dto';

interface Actor {
  sub: string;
}

interface ValidationIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  details?: Record<string, unknown>;
}

@Injectable()
export class HistoricalAttendanceValidationService {
  constructor(private readonly db: DatabaseService) {}

  async validateBatch(tenantId: string, actor: Actor, batchId: string) {
    await this.assertEnabled(tenantId);
    const batch = await this.getBatch(tenantId, batchId);
    const { rows } = await this.db.query(
      `SELECT sr.*, e.employee_code, e.first_name, e.last_name, e.status AS employee_status
       FROM historical_attendance_import_staging_rows sr
       LEFT JOIN employees e ON e.id = sr.mapped_employee_id
       WHERE sr.tenant_id = $1 AND sr.batch_id = $2
       ORDER BY sr.punched_at NULLS LAST, sr.created_at ASC`,
      [tenantId, batchId],
    );

    const duplicateRowIds = this.findDuplicateRowIds(rows);
    let validRows = 0;
    let warningRows = 0;
    let rejectedRows = 0;
    let errorRows = 0;

    await this.db.transaction(async (client) => {
      await client.query('DELETE FROM historical_attendance_import_validation_results WHERE tenant_id = $1 AND batch_id = $2', [
        tenantId,
        batchId,
      ]);

      for (const row of rows) {
        const issues = await this.validateRow(tenantId, batch, row, duplicateRowIds.get(row.id) ?? null);
        const errors = issues.filter((issue) => issue.severity === 'error');
        const warnings = issues.filter((issue) => issue.severity === 'warning');
        const validationStatus = errors.length ? 'rejected' : warnings.length ? 'warning' : 'valid';

        if (validationStatus === 'valid') validRows++;
        if (validationStatus === 'warning') warningRows++;
        if (validationStatus === 'rejected') {
          rejectedRows++;
          errorRows++;
        }

        await client.query(
          `UPDATE historical_attendance_import_staging_rows
           SET validation_status = $3,
               validation_errors = $4,
               validation_warnings = $5,
               duplicate_of_row_id = $6,
               rejected_reason = $7,
               validated_at = now(),
               validated_by = $8,
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2`,
          [
            row.id,
            tenantId,
            validationStatus,
            JSON.stringify(errors.map((issue) => this.serializeIssue(issue))),
            JSON.stringify(warnings.map((issue) => this.serializeIssue(issue))),
            duplicateRowIds.get(row.id) ?? null,
            errors[0]?.message ?? null,
            actor.sub,
          ],
        );

        for (const issue of issues) {
          await client.query(
            `INSERT INTO historical_attendance_import_validation_results
               (tenant_id, batch_id, staging_row_id, severity, code, message, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tenantId, batchId, row.id, issue.severity, issue.code, issue.message, issue.details ?? {}],
          );
        }
      }

      await this.refreshBatchStatsWithClient(client, tenantId, batchId, actor.sub);
      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = CASE WHEN status IN ('draft', 'uploading', 'processing') THEN 'validation' ELSE status END,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenantId],
      );
    });

    await this.log(tenantId, batchId, batch.source_id, errorRows ? 'warning' : 'info', 'validation_completed', actor.sub, {
      totalRows: rows.length,
      validRows,
      warningRows,
      rejectedRows,
      errorRows,
    });

    return { totalRows: rows.length, validRows, warningRows, rejectedRows, errorRows };
  }

  async getPreview(tenantId: string, batchId: string, query: ImportPreviewQueryDto) {
    await this.assertEnabled(tenantId);
    await this.getBatch(tenantId, batchId);

    const [{ rows: countRows }, { rows: issueRows }] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE validation_status = 'valid')::int AS valid_rows,
           COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS warning_rows,
           COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors) > 0)::int AS error_rows,
           COUNT(*) FILTER (WHERE duplicate_of_row_id IS NOT NULL)::int AS duplicate_rows,
           COUNT(*) FILTER (WHERE mapping_status IN ('unknown', 'conflict', 'unmapped'))::int AS unknown_employees,
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

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const params: any[] = [tenantId, batchId];
    let where = 'WHERE sr.tenant_id = $1 AND sr.batch_id = $2';

    switch (query.bucket) {
      case 'valid':
        where += " AND sr.validation_status = 'valid'";
        break;
      case 'warnings':
        where += " AND sr.validation_status = 'warning'";
        break;
      case 'errors':
        where += ' AND jsonb_array_length(sr.validation_errors) > 0';
        break;
      case 'duplicates':
        where += ' AND sr.duplicate_of_row_id IS NOT NULL';
        break;
      case 'unknown':
        where += " AND sr.mapping_status IN ('unknown', 'conflict', 'unmapped')";
        break;
      case 'mapped':
        where += ' AND sr.mapped_employee_id IS NOT NULL';
        break;
      case 'rejected':
        where += " AND sr.validation_status = 'rejected'";
        break;
      default:
        break;
    }

    params.push(limit, (page - 1) * limit);
    const { rows } = await this.db.query(
      `SELECT sr.id, sr.row_number, sr.raw_employee_identifier, sr.punched_at,
              sr.punch_direction, sr.device_identifier, sr.mapping_status,
              sr.mapping_method, sr.mapping_confidence, sr.validation_status,
              sr.validation_errors, sr.validation_warnings, sr.duplicate_of_row_id,
              sr.rejected_reason, e.id AS employee_id, e.employee_code,
              e.first_name, e.last_name
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
      meta: { page, limit },
    };
  }

  private async validateRow(
    tenantId: string,
    batch: any,
    row: any,
    duplicateOfRowId: string | null,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const punchedAt = row.punched_at ? new Date(row.punched_at) : null;
    const punchDate = punchedAt && !Number.isNaN(punchedAt.getTime()) ? punchedAt.toISOString().slice(0, 10) : null;

    if (!punchedAt || Number.isNaN(punchedAt.getTime())) {
      issues.push({ severity: 'error', code: 'invalid_timestamp', message: 'Punch timestamp is missing or invalid' });
    }

    if (!row.mapped_employee_id) {
      issues.push({ severity: 'error', code: 'missing_employee', message: 'No employee is mapped to this punch' });
    }

    if (row.mapping_status === 'unknown' || row.mapping_status === 'conflict' || row.mapping_status === 'unmapped') {
      issues.push({ severity: 'error', code: 'unknown_user', message: 'Punch belongs to an unknown or unresolved source user' });
    }

    if (punchDate && (punchDate < this.toDateString(batch.date_from) || punchDate > this.toDateString(batch.date_to))) {
      issues.push({
        severity: 'error',
        code: 'invalid_date',
        message: 'Punch date is outside the import batch date range',
        details: { punchDate, dateFrom: batch.date_from, dateTo: batch.date_to },
      });
    }

    if (duplicateOfRowId) {
      issues.push({
        severity: 'error',
        code: 'duplicate_punch',
        message: 'Duplicate punch detected inside this import batch',
        details: { duplicateOfRowId },
      });
    }

    if (row.device_identifier) {
      const deviceExists = await this.deviceExists(tenantId, row.device_identifier);
      if (!deviceExists) {
        issues.push({
          severity: 'error',
          code: 'invalid_device',
          message: 'Punch references an unknown or inactive device',
          details: { deviceIdentifier: row.device_identifier },
        });
      }
    }

    if (row.mapped_employee_id && punchDate) {
      const [payrollLocked, attendanceConflict, validShift] = await Promise.all([
        this.isPayrollLocked(tenantId, row.mapped_employee_id, punchDate),
        this.hasAttendanceConflict(tenantId, row.mapped_employee_id, punchDate),
        this.hasValidShift(tenantId, row.mapped_employee_id, punchDate),
      ]);

      if (payrollLocked) {
        issues.push({
          severity: 'error',
          code: 'payroll_locked_date',
          message: 'Punch falls within a locked or processed payroll period',
          details: payrollLocked,
        });
      }

      if (attendanceConflict) {
        issues.push({
          severity: 'warning',
          code: 'attendance_conflict',
          message: 'Production attendance already exists for this employee and date and will be reconciled in preview',
          details: attendanceConflict,
        });
      }

      if (!validShift) {
        issues.push({
          severity: 'warning',
          code: 'invalid_shift',
          message: 'No active shift schedule or assignment was found for this employee and date',
          details: { punchDate },
        });
      }
    }

    return issues;
  }

  private findDuplicateRowIds(rows: any[]) {
    const firstByKey = new Map<string, string>();
    const duplicates = new Map<string, string>();
    for (const row of rows) {
      if (!row.mapped_employee_id || !row.punched_at) continue;
      const key = [row.mapped_employee_id, new Date(row.punched_at).toISOString(), row.punch_direction ?? 'unknown'].join('|');
      const first = firstByKey.get(key);
      if (first) duplicates.set(row.id, first);
      else firstByKey.set(key, row.id);
    }
    return duplicates;
  }

  private async deviceExists(tenantId: string, deviceIdentifier: string) {
    const { rows } = await this.db.query(
      `SELECT 1
       FROM (
         SELECT id
         FROM biometric_devices
         WHERE tenant_id = $1
           AND is_active = true
           AND (
             serial_number = $2
             OR provider_device_id = $2
             OR name = $2
           )
         UNION ALL
         SELECT id
         FROM attendance_terminals
         WHERE tenant_id = $1
           AND is_active = true
           AND device_name = $2
       ) devices
       LIMIT 1`,
      [tenantId, deviceIdentifier],
    );
    return rows.length > 0;
  }

  private async isPayrollLocked(tenantId: string, employeeId: string, punchDate: string) {
    const { rows } = await this.db.query(
      `SELECT id, period_start, period_end, status
       FROM payroll_attendance_summary
       WHERE tenant_id = $1
         AND employee_id = $2
         AND status IN ('payroll_locked', 'payroll_processed')
         AND period_start <= $3
         AND period_end >= $3
       LIMIT 1`,
      [tenantId, employeeId, punchDate],
    );
    return rows[0] ?? null;
  }

  private async hasAttendanceConflict(tenantId: string, employeeId: string, punchDate: string) {
    const { rows } = await this.db.query(
      `SELECT id, date, clock_in, clock_out, status
       FROM attendance_records
       WHERE tenant_id = $1
         AND employee_id = $2
         AND date = $3
         AND (clock_in IS NOT NULL OR clock_out IS NOT NULL OR status <> 'absent')
       LIMIT 1`,
      [tenantId, employeeId, punchDate],
    );
    return rows[0] ?? null;
  }

  private async hasValidShift(tenantId: string, employeeId: string, punchDate: string) {
    const { rows } = await this.db.query(
      `SELECT 1
       FROM shift_schedules ss
       JOIN shift_definitions sd ON sd.id = ss.shift_id
       WHERE ss.tenant_id = $1
         AND ss.employee_id = $2
         AND ss.date = $3
         AND ss.status <> 'cancelled'
         AND sd.is_active = true
       UNION ALL
       SELECT 1
       FROM shift_assignments sa
       JOIN shift_definitions sd ON sd.id = sa.shift_id
       WHERE sa.tenant_id = $1
         AND sa.employee_id = $2
         AND sa.is_active = true
         AND sa.start_date <= $3
         AND (sa.end_date IS NULL OR sa.end_date >= $3)
         AND sd.is_active = true
       LIMIT 1`,
      [tenantId, employeeId, punchDate],
    );
    return rows.length > 0;
  }

  private async refreshBatchStatsWithClient(client: any, tenantId: string, batchId: string, actorUserId: string) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (WHERE status = 'staged')::int AS staged_rows,
         COUNT(*) FILTER (WHERE status = 'normalization_failed')::int AS failed_rows,
         COUNT(*) FILTER (WHERE mapped_employee_id IS NOT NULL)::int AS mapped_rows,
         COUNT(*) FILTER (WHERE mapping_status IN ('unknown', 'conflict', 'unmapped'))::int AS unknown_rows,
         COUNT(*) FILTER (WHERE validation_status = 'valid')::int AS valid_rows,
         COUNT(*) FILTER (WHERE validation_status = 'warning')::int AS warning_rows,
         COUNT(*) FILTER (WHERE validation_status = 'rejected')::int AS rejected_rows,
         COUNT(*) FILTER (WHERE duplicate_of_row_id IS NOT NULL)::int AS duplicate_rows,
         COALESCE(SUM(jsonb_array_length(validation_warnings)), 0)::int AS warning_count,
         COALESCE(SUM(jsonb_array_length(validation_errors)), 0)::int AS error_count
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId],
    );
    const stats = rows[0];
    await client.query(
      `UPDATE historical_attendance_import_batches
       SET statistics = jsonb_build_object(
             'totalRecords', $3::int,
             'stagedRecords', $4::int,
             'importedRecords', 0,
             'failedRecords', $5::int,
             'warnings', $6::int,
             'errors', $7::int,
             'duplicates', $8::int,
             'unknownEmployees', $9::int,
             'mappedEmployees', $10::int,
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
        stats.duplicate_rows,
        stats.unknown_rows,
        stats.mapped_rows,
        stats.valid_rows + stats.warning_rows,
        stats.rejected_rows,
      ],
    );

    await client.query(
      `UPDATE historical_attendance_import_progress
       SET phase = 'validation',
           total_rows = $3,
           processed_rows = $4,
           failed_records = $5,
           warning_count = $6,
           progress_percent = CASE WHEN $3::int = 0 THEN 0 ELSE ROUND(($4::numeric / $3::numeric) * 100, 2) END,
           message = 'Validation completed in staging',
           updated_by = $7,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId, stats.total_rows, stats.valid_rows + stats.warning_rows + stats.rejected_rows, stats.failed_rows, stats.warning_count, actorUserId],
    );
  }

  private serializeIssue(issue: ValidationIssue) {
    return {
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
      details: issue.details ?? {},
    };
  }

  private toDateString(value: any) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
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
