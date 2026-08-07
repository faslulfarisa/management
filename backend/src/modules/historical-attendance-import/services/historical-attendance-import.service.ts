import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import {
  AddStagingRowsDto,
  CreateImportBatchDto,
  CreateImportMappingDto,
  CreateImportSourceDto,
  ImportLifecycleActionDto,
  ImportListQueryDto,
  UpdateImportSourceDto,
  UpdateHistoricalImportCapabilityDto,
  UpdateImportBatchStatusDto,
} from '../dto/historical-attendance-import.dto';
import { HistoricalAttendanceImportStatus } from '../constants/historical-attendance-import.constants';
import { ImportSourceNormalizerService, ImportSourceRecord } from './import-source-normalizer.service';

interface Actor {
  sub: string;
}

@Injectable()
export class HistoricalAttendanceImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly normalizer: ImportSourceNormalizerService,
  ) {}

  async getDashboard(tenantId: string) {
    await this.assertEnabled(tenantId);

    const [{ rows: statRows }, { rows: batchRows }, { rows: sourceRows }, { rows: warningRows }] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)::int AS total_batches,
           COUNT(*) FILTER (WHERE status IN ('uploading', 'processing', 'validation'))::int AS active_batches,
           COALESCE(SUM((statistics->>'importedRecords')::int), 0)::int AS imported_records,
           COALESCE(SUM((statistics->>'failedRecords')::int), 0)::int AS failed_records,
           COALESCE(SUM((statistics->>'warnings')::int), 0)::int AS warnings
         FROM historical_attendance_import_batches
         WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),
      this.db.query(
        `SELECT b.*, s.name AS source_name, s.source_type,
                p.total_rows, p.processed_rows, p.imported_records, p.failed_records,
                p.warning_count, p.progress_percent, p.phase, p.message
         FROM historical_attendance_import_batches b
         LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
         LEFT JOIN historical_attendance_import_progress p ON p.batch_id = b.id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         ORDER BY b.created_at DESC
         LIMIT 10`,
        [tenantId],
      ),
      this.db.query(
        `SELECT source_type, COUNT(*)::int AS count
         FROM historical_attendance_import_sources
         WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true
         GROUP BY source_type
         ORDER BY source_type`,
        [tenantId],
      ),
      this.db.query(
        `SELECT l.*
         FROM historical_attendance_import_logs l
         WHERE l.tenant_id = $1 AND l.level IN ('warning', 'error')
         ORDER BY l.created_at DESC
         LIMIT 10`,
        [tenantId],
      ),
    ]);

    return {
      stats: statRows[0],
      recentBatches: batchRows,
      sourcesByType: sourceRows,
      recentWarnings: warningRows,
      supportedSourceTypes: this.normalizer.listSourceTypes(),
    };
  }

  async listSources(tenantId: string) {
    await this.assertEnabled(tenantId);
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_sources
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async createSource(tenantId: string, actor: Actor, body: CreateImportSourceDto) {
    await this.assertEnabled(tenantId);
    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_sources
         (tenant_id, source_type, name, description, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, body.source_type, body.name.trim(), body.description ?? null, body.config ?? {}, actor.sub],
    );
    await this.audit(tenantId, actor.sub, 'source_created', { sourceId: rows[0].id }, null, rows[0]);
    return rows[0];
  }

  async updateSource(tenantId: string, actor: Actor, id: string, body: UpdateImportSourceDto) {
    await this.assertEnabled(tenantId);
    const before = await this.getSource(tenantId, id);
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_sources
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           config = COALESCE($5, config),
           is_active = COALESCE($6, is_active),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        tenantId,
        body.name?.trim() ?? null,
        body.description ?? null,
        body.config ?? null,
        body.is_active ?? null,
      ],
    );
    await this.audit(tenantId, actor.sub, 'source_updated', { sourceId: id }, before, rows[0]);
    return rows[0];
  }

  async listBatches(tenantId: string, query: ImportListQueryDto) {
    await this.assertEnabled(tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const params: any[] = [tenantId];
    let where = 'WHERE b.tenant_id = $1 AND b.deleted_at IS NULL';

    if (query.status) {
      params.push(query.status);
      where += ` AND b.status = $${params.length}`;
    }

    params.push(limit, (page - 1) * limit);
    const dataParam = params.length - 1;

    const { rows } = await this.db.query(
      `SELECT b.*, s.name AS source_name, s.source_type,
              p.total_rows, p.processed_rows, p.imported_records, p.failed_records,
              p.warning_count, p.progress_percent, p.phase, p.message
       FROM historical_attendance_import_batches b
       LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
       LEFT JOIN historical_attendance_import_progress p ON p.batch_id = b.id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${dataParam} OFFSET $${dataParam + 1}`,
      params,
    );

    const { rows: countRows } = await this.db.query(
      `SELECT COUNT(*)::int AS total
       FROM historical_attendance_import_batches b
       ${where}`,
      params.slice(0, -2),
    );

    const total = countRows[0].total;
    return { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async listImportHistory(tenantId: string, query: ImportListQueryDto) {
    await this.assertEnabled(tenantId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const params: any[] = [tenantId];
    let where = 'WHERE b.tenant_id = $1 AND b.deleted_at IS NULL';

    if (query.status) {
      params.push(query.status);
      where += ` AND b.status = $${params.length}`;
    }

    params.push(limit, (page - 1) * limit);
    const dataParam = params.length - 1;

    const { rows } = await this.db.query(
      `SELECT b.id,
              b.status,
              b.date_from,
              b.date_to,
              b.created_at,
              b.completed_at,
              b.cancelled_at,
              b.failed_reason,
              b.statistics,
              b.rollback_status,
              b.rollback_metadata,
              s.name AS source_name,
              s.source_type,
              COALESCE(u.email, 'Unknown') AS imported_by,
              COALESCE(c.committed_at, b.completed_at, b.created_at) AS import_date,
              COALESCE(
                c.duration_ms,
                CASE
                  WHEN b.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (b.completed_at - b.created_at))::int * 1000
                  ELSE NULL
                END
              ) AS duration_ms,
              COALESCE(employee_counts.employees, 0)::int AS employees,
              COALESCE(record_counts.attendance_records, 0)::int AS attendance_records,
              COALESCE(warning_counts.warnings, 0)::int AS warnings,
              COALESCE(error_counts.errors, 0)::int AS errors,
              c.id AS import_commit_id,
              c.status AS import_commit_status,
              c.rolled_back_at,
              rr.status AS latest_rollback_status
       FROM historical_attendance_import_batches b
       LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
       LEFT JOIN users u ON u.id = b.created_by
       LEFT JOIN historical_attendance_import_commits c ON c.batch_id = b.id
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT mapped_employee_id)::int AS employees
         FROM historical_attendance_import_staging_rows sr
         WHERE sr.batch_id = b.id AND sr.mapped_employee_id IS NOT NULL
       ) employee_counts ON true
       LEFT JOIN LATERAL (
         SELECT GREATEST(
           (
             SELECT COUNT(DISTINCT l.attendance_record_id)::int
             FROM historical_attendance_import_attendance_links l
             WHERE l.batch_id = b.id
           ),
           (
             SELECT COUNT(*)::int
             FROM historical_attendance_import_commit_snapshots snap
             WHERE snap.commit_id = c.id
               AND snap.entity_type = 'attendance_record'
           )
         ) AS attendance_records
       ) record_counts ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS warnings
         FROM historical_attendance_import_logs l
         WHERE l.batch_id = b.id AND l.level = 'warning'
       ) warning_counts ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS errors
         FROM historical_attendance_import_logs l
         WHERE l.batch_id = b.id AND l.level = 'error'
       ) error_counts ON true
       LEFT JOIN LATERAL (
         SELECT status
         FROM historical_attendance_import_rollback_runs r
         WHERE r.batch_id = b.id
         ORDER BY r.created_at DESC
         LIMIT 1
       ) rr ON true
       ${where}
       ORDER BY b.created_at DESC
       LIMIT $${dataParam} OFFSET $${dataParam + 1}`,
      params,
    );

    const { rows: countRows } = await this.db.query(
      `SELECT COUNT(*)::int AS total
       FROM historical_attendance_import_batches b
       ${where}`,
      params.slice(0, -2),
    );

    return {
      data: rows,
      meta: { page, limit, total: countRows[0].total, totalPages: Math.ceil(countRows[0].total / limit) },
    };
  }

  async getBatch(tenantId: string, id: string) {
    await this.assertEnabled(tenantId);
    const { rows } = await this.db.query(
      `SELECT b.*, s.name AS source_name, s.source_type, s.config AS source_config,
              p.total_rows, p.processed_rows, p.imported_records, p.failed_records,
              p.warning_count, p.progress_percent, p.phase, p.message
       FROM historical_attendance_import_batches b
       LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
       LEFT JOIN historical_attendance_import_progress p ON p.batch_id = b.id
       WHERE b.id = $1 AND b.tenant_id = $2 AND b.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import batch not found');
    return rows[0];
  }

  async createBatch(tenantId: string, actor: Actor, body: CreateImportBatchDto) {
    await this.assertEnabled(tenantId);
    await this.getSource(tenantId, body.source_id);
    if (new Date(body.date_to) < new Date(body.date_from)) {
      throw new BadRequestException('date_to must be greater than or equal to date_from');
    }

    return this.db.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO historical_attendance_import_batches
           (tenant_id, source_id, date_from, date_to, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [tenantId, body.source_id, body.date_from, body.date_to, body.notes ?? null, actor.sub],
      );
      const batch = rows[0];

      await client.query(
        `INSERT INTO historical_attendance_import_progress
           (tenant_id, batch_id, phase, message, updated_by)
         VALUES ($1, $2, 'draft', 'Batch created', $3)`,
        [tenantId, batch.id, actor.sub],
      );

      await this.auditWithClient(client, tenantId, actor.sub, 'batch_created', { batchId: batch.id }, null, batch);
      return batch;
    });
  }

  async updateBatchStatus(tenantId: string, actor: Actor, id: string, body: UpdateImportBatchStatusDto) {
    await this.assertEnabled(tenantId);
    const before = await this.getBatch(tenantId, id);
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = $3,
           completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END,
           cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END,
           failed_reason = CASE WHEN $3 = 'failed' THEN COALESCE($4, failed_reason) ELSE failed_reason END,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId, body.status, body.message ?? null],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = $3, message = $4, updated_by = $5, updated_at = now()
       WHERE batch_id = $1 AND tenant_id = $2`,
      [id, tenantId, body.status, body.message ?? `Batch moved to ${body.status}`, actor.sub],
    );

    await this.log(tenantId, id, rows[0].source_id, 'info', 'batch_status_updated', body.message ?? `Batch status changed to ${body.status}`, actor.sub);
    await this.audit(tenantId, actor.sub, 'batch_status_updated', { batchId: id }, before, rows[0]);
    return rows[0];
  }

  async pauseBatch(tenantId: string, actor: Actor, id: string, body: ImportLifecycleActionDto = {}) {
    const batch = await this.getBatch(tenantId, id);
    if (!['uploading', 'processing', 'validation', 'ready'].includes(batch.status)) {
      throw new BadRequestException('Only active import batches can be paused');
    }
    return this.transitionBatch(tenantId, actor, id, 'paused', body.reason ?? 'Import paused');
  }

  async resumeBatch(tenantId: string, actor: Actor, id: string, body: ImportLifecycleActionDto = {}) {
    const batch = await this.getBatch(tenantId, id);
    if (batch.status !== 'paused') {
      throw new BadRequestException('Only paused import batches can be resumed');
    }
    const resumableStatuses: HistoricalAttendanceImportStatus[] = ['uploading', 'processing', 'validation', 'ready'];
    const phase = resumableStatuses.includes(batch.phase) ? batch.phase : 'processing';
    return this.transitionBatch(tenantId, actor, id, phase, body.reason ?? 'Import resumed');
  }

  async cancelBatch(tenantId: string, actor: Actor, id: string, body: ImportLifecycleActionDto = {}) {
    const batch = await this.getBatch(tenantId, id);
    if (['completed', 'rolling_back', 'rolled_back', 'cancelled'].includes(batch.status)) {
      throw new BadRequestException('This import batch cannot be cancelled');
    }
    return this.transitionBatch(tenantId, actor, id, 'cancelled', body.reason ?? 'Import cancelled');
  }

  async retryBatch(tenantId: string, actor: Actor, id: string, body: ImportLifecycleActionDto = {}) {
    const batch = await this.getBatch(tenantId, id);
    if (!['failed', 'cancelled', 'paused'].includes(batch.status)) {
      throw new BadRequestException('Only failed, cancelled, or paused imports can be retried');
    }
    const nextStatus = batch.total_rows > 0 ? 'processing' : 'draft';
    const before = batch;
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = $3,
           failed_reason = NULL,
           cancelled_at = NULL,
           paused_at = NULL,
           resumed_at = now(),
           retry_count = retry_count + 1,
           last_retry_at = now(),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId, nextStatus],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = $3, message = $4, updated_by = $5, updated_at = now()
       WHERE batch_id = $1 AND tenant_id = $2`,
      [id, tenantId, nextStatus, body.reason ?? 'Import queued for retry', actor.sub],
    );

    await this.log(tenantId, id, rows[0].source_id, 'info', 'batch_retry_requested', body.reason ?? 'Import queued for retry', actor.sub);
    await this.audit(tenantId, actor.sub, 'batch_retry_requested', { batchId: id }, before, rows[0]);
    return rows[0];
  }

  async createMapping(tenantId: string, actor: Actor, body: CreateImportMappingDto) {
    await this.assertEnabled(tenantId);
    if (body.source_id) await this.getSource(tenantId, body.source_id);
    if (body.batch_id) await this.getBatch(tenantId, body.batch_id);

    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_mapping
         (tenant_id, source_id, batch_id, mapping_type, source_field, canonical_field, transform_config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        body.source_id ?? null,
        body.batch_id ?? null,
        body.mapping_type ?? 'field_mapping',
        body.source_field,
        body.canonical_field,
        body.transform_config ?? {},
        actor.sub,
      ],
    );
    await this.audit(tenantId, actor.sub, 'mapping_created', { mappingId: rows[0].id }, null, rows[0]);
    return rows[0];
  }

  async listMappings(tenantId: string) {
    await this.assertEnabled(tenantId);
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_mapping
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  }

  async addStagingRows(tenantId: string, actor: Actor, batchId: string, body: AddStagingRowsDto) {
    await this.assertEnabled(tenantId);
    if (body.rows.length === 0) throw new BadRequestException('At least one staging row is required');

    const batch = await this.getBatch(tenantId, batchId);
    if (['paused', 'completed', 'rolling_back', 'rolled_back', 'cancelled'].includes(batch.status)) {
      throw new BadRequestException('Cannot add staging rows to a paused, completed, rolled back, or cancelled batch');
    }

    const source = await this.getSource(tenantId, batch.source_id);
    let staged = 0;
    let failed = 0;
    let warnings = 0;
    let duplicates = 0;

    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE historical_attendance_import_batches
         SET status = CASE WHEN status = 'draft' THEN 'uploading' ELSE status END,
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [batchId, tenantId],
      );

      for (const row of body.rows) {
        try {
          const normalized = this.normalizer.normalize(row.raw_payload, source as ImportSourceRecord);
          const { canonicalPunch } = normalized;
          const inserted = await client.query(
            `INSERT INTO historical_attendance_import_staging_rows
               (tenant_id, batch_id, source_id, row_number, raw_payload, canonical_punch,
                raw_employee_identifier, punched_at, punch_direction, device_identifier,
                location_identifier, confidence, row_hash, status, warnings, errors)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'staged', $14, '[]'::jsonb)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
              tenantId,
              batchId,
              source.id,
              row.row_number ?? null,
              row.raw_payload,
              canonicalPunch,
              canonicalPunch.employeeIdentifier,
              canonicalPunch.punchTimestamp,
              canonicalPunch.punchDirection,
              canonicalPunch.deviceIdentifier,
              canonicalPunch.locationIdentifier,
              1,
              normalized.rowHash,
              JSON.stringify(normalized.warnings),
            ],
          );
          if (inserted.rows.length) {
            staged++;
            warnings += normalized.warnings.length;
          } else {
            duplicates++;
          }
        } catch (error: any) {
          failed++;
          await client.query(
            `INSERT INTO historical_attendance_import_staging_rows
               (tenant_id, batch_id, source_id, row_number, raw_payload, canonical_punch,
                status, warnings, errors)
             VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'normalization_failed', '[]'::jsonb, $6)`,
            [
              tenantId,
              batchId,
              source.id,
              row.row_number ?? null,
              row.raw_payload,
              JSON.stringify([error?.message ?? 'Normalization failed']),
            ],
          );
        }
      }

      await this.refreshBatchStatsWithClient(client, tenantId, batchId, actor.sub);
      await this.auditWithClient(
        client,
        tenantId,
        actor.sub,
        'staging_rows_added',
        { batchId, sourceId: source.id },
        null,
        { staged, failed, warnings, duplicates },
      );
    });

    await this.log(
      tenantId,
      batchId,
      source.id,
      failed ? 'warning' : 'info',
      'staging_rows_added',
      `Staged ${staged} historical punch rows; ${failed} failed normalization; ${duplicates} duplicate rows skipped`,
      actor.sub,
      { staged, failed, warnings, duplicates },
    );

    return { staged, failed, warnings, duplicates };
  }

  async listStagingRows(tenantId: string, batchId: string, query: ImportListQueryDto) {
    await this.assertEnabled(tenantId);
    await this.getBatch(tenantId, batchId);
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const { rows } = await this.db.query(
      `SELECT id, row_number, canonical_punch, raw_employee_identifier, punched_at,
              punch_direction, device_identifier, location_identifier, status,
              warnings, errors, created_at
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1 AND batch_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, batchId, limit, (page - 1) * limit],
    );
    return rows;
  }

  async listLogs(tenantId: string, batchId?: string) {
    await this.assertEnabled(tenantId);
    const params: any[] = [tenantId];
    let where = 'WHERE tenant_id = $1';
    if (batchId) {
      params.push(batchId);
      where += ' AND batch_id = $2';
    }
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );
    return rows;
  }

  async getCapability(tenantId: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, slug, historical_attendance_import_enabled
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );
    if (!rows.length) throw new NotFoundException('Organization not found');
    return rows[0];
  }

  async updateCapability(tenantId: string, actor: Actor, body: UpdateHistoricalImportCapabilityDto) {
    const before = await this.getCapability(tenantId);
    const { rows } = await this.db.query(
      `UPDATE tenants
       SET historical_attendance_import_enabled = $2, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, slug, historical_attendance_import_enabled`,
      [tenantId, body.enabled],
    );
    await this.audit(tenantId, actor.sub, 'capability_updated', { tenantId }, before, rows[0], {
      platformOperation: true,
    });
    return rows[0];
  }

  async listPlatformJobs(query: ImportListQueryDto & { tenantId?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const params: any[] = [];
    let where = 'WHERE b.deleted_at IS NULL';

    if (query.tenantId) {
      params.push(query.tenantId);
      where += ` AND b.tenant_id = $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND b.status = $${params.length}`;
    }

    params.push(limit, (page - 1) * limit);
    const dataParam = params.length - 1;

    const { rows } = await this.db.query(
      `SELECT b.id, b.tenant_id, t.name AS organization_name, t.slug AS organization_slug,
              b.status, b.date_from, b.date_to, b.created_at, b.updated_at,
              s.source_type, s.name AS source_name,
              p.total_rows, p.processed_rows, p.imported_records, p.failed_records,
              p.warning_count, p.progress_percent, p.phase, p.message
       FROM historical_attendance_import_batches b
       JOIN tenants t ON t.id = b.tenant_id
       LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
       LEFT JOIN historical_attendance_import_progress p ON p.batch_id = b.id
       ${where}
       ORDER BY b.updated_at DESC
       LIMIT $${dataParam} OFFSET $${dataParam + 1}`,
      params,
    );
    return { data: rows, meta: { page, limit } };
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
      throw new ForbiddenException('Historical attendance import is not enabled for this organization');
    }
  }

  private async getSource(tenantId: string, id: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_sources
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import source not found');
    return rows[0];
  }

  private async refreshBatchStatsWithClient(client: any, tenantId: string, batchId: string, actorUserId: string) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)::int AS total_rows,
         COUNT(*) FILTER (WHERE status = 'staged')::int AS staged_rows,
         COUNT(*) FILTER (WHERE status = 'normalization_failed')::int AS failed_rows,
         COALESCE(SUM(jsonb_array_length(warnings)), 0)::int AS warning_count
       FROM historical_attendance_import_staging_rows
       WHERE tenant_id = $1 AND batch_id = $2`,
      [tenantId, batchId],
    );
    const stats = rows[0];
    const progress = stats.total_rows > 0 ? Math.round((stats.staged_rows / stats.total_rows) * 10000) / 100 : 0;

    await client.query(
      `UPDATE historical_attendance_import_batches
       SET statistics = jsonb_build_object(
             'totalRecords', $3::int,
             'stagedRecords', $4::int,
             'importedRecords', 0,
             'failedRecords', $5::int,
             'warnings', $6::int
           ),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [batchId, tenantId, stats.total_rows, stats.staged_rows, stats.failed_rows, stats.warning_count],
    );

    await client.query(
      `INSERT INTO historical_attendance_import_progress
         (tenant_id, batch_id, phase, total_rows, processed_rows, imported_records,
          failed_records, warning_count, progress_percent, message, updated_by)
       VALUES ($1, $2, 'uploading', $3, $4, 0, $5, $6, $7, 'Rows normalized into staging', $8)
       ON CONFLICT (batch_id) DO UPDATE SET
         phase = EXCLUDED.phase,
         total_rows = EXCLUDED.total_rows,
         processed_rows = EXCLUDED.processed_rows,
         imported_records = 0,
         failed_records = EXCLUDED.failed_records,
         warning_count = EXCLUDED.warning_count,
         progress_percent = EXCLUDED.progress_percent,
         message = EXCLUDED.message,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [
        tenantId,
        batchId,
        stats.total_rows,
        stats.staged_rows + stats.failed_rows,
        stats.failed_rows,
        stats.warning_count,
        progress,
        actorUserId,
      ],
    );
  }

  private async transitionBatch(
    tenantId: string,
    actor: Actor,
    id: string,
    status: HistoricalAttendanceImportStatus,
    message: string,
  ) {
    const before = await this.getBatch(tenantId, id);
    const { rows } = await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = $3,
           paused_at = CASE WHEN $3 = 'paused' THEN now() ELSE paused_at END,
           resumed_at = CASE WHEN $3 <> 'paused' THEN now() ELSE resumed_at END,
           cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [id, tenantId, status],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = $3, message = $4, updated_by = $5, updated_at = now()
       WHERE batch_id = $1 AND tenant_id = $2`,
      [id, tenantId, status, message, actor.sub],
    );

    await this.log(tenantId, id, rows[0].source_id, 'info', `batch_${status}`, message, actor.sub);
    await this.audit(tenantId, actor.sub, `batch_${status}`, { batchId: id }, before, rows[0]);
    return rows[0];
  }

  private async log(
    tenantId: string,
    batchId: string | null,
    sourceId: string | null,
    level: 'info' | 'warning' | 'error',
    code: string,
    message: string,
    actorUserId?: string,
    details: Record<string, unknown> = {},
  ) {
    await this.db.query(
      `INSERT INTO historical_attendance_import_logs
         (tenant_id, batch_id, source_id, level, code, message, details, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, batchId, sourceId, level, code, message, details, actorUserId ?? null],
    );
  }

  private async audit(
    tenantId: string,
    actorUserId: string,
    action: string,
    entity: { batchId?: string; sourceId?: string; mappingId?: string; tenantId?: string },
    oldValues: unknown,
    newValues: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    await this.auditWithClient(this.db, tenantId, actorUserId, action, entity, oldValues, newValues, metadata);
  }

  private async auditWithClient(
    client: any,
    tenantId: string,
    actorUserId: string,
    action: string,
    entity: { batchId?: string; sourceId?: string; mappingId?: string; tenantId?: string },
    oldValues: unknown,
    newValues: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    await client.query(
      `INSERT INTO historical_attendance_import_audit
         (tenant_id, batch_id, source_id, actor_user_id, action, old_values, new_values, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        entity.batchId ?? null,
        entity.sourceId ?? null,
        actorUserId,
        action,
        oldValues ?? null,
        newValues ?? null,
        { ...metadata, mappingId: entity.mappingId ?? null, tenantId: entity.tenantId ?? tenantId },
      ],
    );
  }
}
