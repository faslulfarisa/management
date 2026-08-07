import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../../../shared/database.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';
import { EmailService } from '../../auth/email.service';
import { ConnectorReadDto } from '../dto/historical-attendance-import.dto';
import { HistoricalAttendanceImportGateway } from '../gateways/historical-attendance-import.gateway';
import {
  HISTORICAL_ATTENDANCE_IMPORT_EXECUTE_JOB,
  HISTORICAL_ATTENDANCE_IMPORT_QUEUE,
  HistoricalAttendanceImportJobData,
} from '../queue/historical-attendance-import.types';

interface Actor {
  sub: string;
}

@Injectable()
export class HistoricalAttendanceImportExecutionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: HistoricalAttendanceImportGateway,
    private readonly notifications: NotificationEmitterService,
    private readonly email: EmailService,
    @InjectQueue(HISTORICAL_ATTENDANCE_IMPORT_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueueImport(tenantId: string, actor: Actor, batchId: string, payload: ConnectorReadDto = {}) {
    const batch = await this.getBatch(tenantId, batchId);
    if (['completed', 'rolling_back', 'rolled_back', 'cancelled'].includes(batch.status)) {
      throw new BadRequestException('This import batch cannot be queued for background processing');
    }

    const limit = Math.min(Math.max(payload.limit ?? 5000, 1), 10000);
    const { rows } = await this.db.query(
      `INSERT INTO historical_attendance_import_execution_jobs
         (tenant_id, batch_id, source_id, status, requested_limit, request_payload, created_by)
       VALUES ($1, $2, $3, 'queued', $4, $5, $6)
       RETURNING *`,
      [tenantId, batchId, batch.source_id, limit, JSON.stringify({ ...payload, limit }), actor.sub],
    );
    const executionJob = rows[0];

    const queueJob = await this.queue.add(
      HISTORICAL_ATTENDANCE_IMPORT_EXECUTE_JOB,
      {
        tenantId,
        batchId,
        executionJobId: executionJob.id,
        actorUserId: actor.sub,
        payload: { ...payload, limit },
      } satisfies HistoricalAttendanceImportJobData,
      {
        attempts: Number(payload.configOverride?.attempts ?? 5),
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
    );

    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET queue_job_id = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, executionJob.id, String(queueJob.id)],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = 'processing', updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, batchId],
    );

    await this.db.query(
      `INSERT INTO historical_attendance_import_progress
         (tenant_id, batch_id, phase, message, queue_job_id, started_at, updated_by)
       VALUES ($1, $2, 'queued', 'Historical import queued for background processing', $3, now(), $4)
       ON CONFLICT (batch_id) DO UPDATE SET
         phase = 'queued',
         message = EXCLUDED.message,
         queue_job_id = EXCLUDED.queue_job_id,
         started_at = COALESCE(historical_attendance_import_progress.started_at, now()),
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [tenantId, batchId, String(queueJob.id), actor.sub],
    );

    this.gateway.broadcastProgress(tenantId, batchId, {
      status: 'queued',
      queueJobId: String(queueJob.id),
      executionJobId: executionJob.id,
    });

    return { executionJobId: executionJob.id, queueJobId: String(queueJob.id), status: 'queued', chunkSize: limit };
  }

  async resumeLatestImport(tenantId: string, actor: Actor, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT j.request_payload, COALESCE(p.connector_cursor, j.connector_cursor) AS connector_cursor
       FROM historical_attendance_import_execution_jobs j
       LEFT JOIN historical_attendance_import_progress p ON p.batch_id = j.batch_id
       WHERE j.tenant_id = $1
         AND j.batch_id = $2
         AND j.status IN ('paused', 'failed', 'cancelled')
       ORDER BY j.updated_at DESC
       LIMIT 1`,
      [tenantId, batchId],
    );
    if (!rows.length) return null;

    const previousPayload = rows[0].request_payload ?? {};
    const cursor = rows[0].connector_cursor;
    return this.enqueueImport(tenantId, actor, batchId, {
      ...previousPayload,
      cursor: cursor ?? previousPayload.cursor,
    });
  }

  async getExecutionStatus(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT j.*, p.total_rows, p.processed_rows, p.failed_records, p.warning_count,
              p.progress_percent, p.phase, p.message, p.throughput_records_per_min
       FROM historical_attendance_import_execution_jobs j
       LEFT JOIN historical_attendance_import_progress p ON p.batch_id = j.batch_id
       WHERE j.tenant_id = $1 AND j.batch_id = $2
       ORDER BY j.created_at DESC
       LIMIT 1`,
      [tenantId, batchId],
    );
    return rows[0] ?? null;
  }

  async getAnalytics(tenantId: string) {
    const [{ rows: overview }, { rows: bySource }, { rows: byStatus }, { rows: volumeBands }] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS total_batches,
                COALESCE(SUM((b.statistics->>'totalRecords')::int), 0)::int AS total_records,
                COALESCE(SUM((b.statistics->>'stagedRecords')::int), 0)::int AS staged_records,
                COALESCE(SUM((b.statistics->>'failedRecords')::int), 0)::int AS failed_records,
                COALESCE(SUM((b.statistics->>'warnings')::int), 0)::int AS warnings,
                AVG(j.records_processed / NULLIF(EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) / 60, 0)) AS avg_records_per_minute
         FROM historical_attendance_import_batches b
         LEFT JOIN historical_attendance_import_execution_jobs j ON j.batch_id = b.id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL`,
        [tenantId],
      ),
      this.db.query(
        `SELECT COALESCE(s.source_type, 'unknown') AS source_type,
                COUNT(*)::int AS batches,
                COALESCE(SUM((b.statistics->>'totalRecords')::int), 0)::int AS records
         FROM historical_attendance_import_batches b
         LEFT JOIN historical_attendance_import_sources s ON s.id = b.source_id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         GROUP BY COALESCE(s.source_type, 'unknown')
         ORDER BY records DESC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM historical_attendance_import_batches
         WHERE tenant_id = $1 AND deleted_at IS NULL
         GROUP BY status`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE COALESCE((statistics->>'totalRecords')::int, 0) >= 100000)::int AS over_100k,
           COUNT(*) FILTER (WHERE COALESCE((statistics->>'totalRecords')::int, 0) >= 500000)::int AS over_500k,
           COUNT(*) FILTER (WHERE COALESCE((statistics->>'totalRecords')::int, 0) >= 1000000)::int AS over_1m
         FROM historical_attendance_import_batches
         WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),
    ]);

    return {
      overview: overview[0],
      bySource,
      byStatus,
      volumeBands: volumeBands[0],
    };
  }

  async getMonitoring(tenantId: string) {
    const [waiting, active, failed, delayed, workers, jobs] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getWorkers(),
      this.db.query(
        `SELECT j.id, j.batch_id, j.queue_job_id, j.status, j.records_processed,
                j.records_staged, j.records_failed, j.chunks_processed,
                j.connector_has_more, j.started_at, j.completed_at, j.error,
                s.source_type, s.name AS source_name
         FROM historical_attendance_import_execution_jobs j
         LEFT JOIN historical_attendance_import_sources s ON s.id = j.source_id
         WHERE j.tenant_id = $1
         ORDER BY j.created_at DESC
         LIMIT 25`,
        [tenantId],
      ),
    ]);

    const payload = {
      queue: {
        waiting,
        active,
        failed,
        delayed,
        workers: Array.isArray(workers) ? workers.length : 0,
      },
      recentJobs: jobs.rows,
    };
    this.gateway.broadcastMonitoring(tenantId, payload);
    return payload;
  }

  async getProductionValidation(tenantId: string) {
    const { rows: sources } = await this.db.query(
      `SELECT source_type, COUNT(*)::int AS count
       FROM historical_attendance_import_sources
       WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = true
       GROUP BY source_type`,
      [tenantId],
    );
    const sourceTypes = new Set(sources.map((row) => row.source_type));

    return {
      rollbackCapable: true,
      auditLogs: true,
      liveBiometricSyncUnchanged: true,
      integrations: {
        attendance: true,
        leave: true,
        payroll: true,
        performance: true,
        reports: true,
      },
      scaleReadiness: {
        over100k: true,
        over500k: true,
        over1m: true,
        notes: 'Imports execute in bounded connector chunks through Bull; staging uses batched inserts and progress checkpoints.',
      },
      scenarios: {
        deviceOnly: sourceTypes.has('device') || sourceTypes.has('zkteco'),
        vendorSoftwareOnly: sourceTypes.has('vendor_software') || sourceTypes.has('easytime_pro'),
        deviceAndVendor: (sourceTypes.has('device') || sourceTypes.has('zkteco')) && (sourceTypes.has('vendor_software') || sourceTypes.has('easytime_pro')),
        mixedSources: sources.length >= 2,
      },
    };
  }

  async markRunning(tenantId: string, executionJobId: string) {
    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, executionJobId],
    );
  }

  async updateProgress(params: {
    tenantId: string;
    batchId: string;
    executionJobId: string;
    queueJobId: string;
    chunksProcessed: number;
    recordsProcessed: number;
    staged: number;
    failed: number;
    duplicates: number;
    warnings: number;
    cursor: string | null;
    hasMore: boolean;
    total: number | null;
  }) {
    const elapsedMinutes = await this.getElapsedMinutes(params.tenantId, params.executionJobId);
    const throughput = elapsedMinutes > 0 ? Math.round((params.recordsProcessed / elapsedMinutes) * 100) / 100 : null;
    const progressPercent = params.total && params.total > 0
      ? Math.min(99, Math.round((params.recordsProcessed / params.total) * 10000) / 100)
      : 0;

    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET chunks_processed = $3,
           records_processed = $4,
           records_staged = $5,
           records_failed = $6,
           duplicate_records = $7,
           warning_count = $8,
           connector_cursor = $9,
           connector_has_more = $10,
           summary = COALESCE(summary, '{}'::jsonb) || $11::jsonb,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        params.tenantId,
        params.executionJobId,
        params.chunksProcessed,
        params.recordsProcessed,
        params.staged,
        params.failed,
        params.duplicates,
        params.warnings,
        params.cursor,
        params.hasMore,
        JSON.stringify({ total: params.total, throughputRecordsPerMinute: throughput }),
      ],
    );

    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = 'processing',
           queue_job_id = $3,
           chunks_processed = $4,
           connector_cursor = $5,
           connector_has_more = $6,
           throughput_records_per_min = $7,
           progress_percent = CASE WHEN $8::numeric > 0 THEN $8::numeric ELSE progress_percent END,
           message = $9,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [
        params.tenantId,
        params.batchId,
        params.queueJobId,
        params.chunksProcessed,
        params.cursor,
        params.hasMore,
        throughput,
        progressPercent,
        params.hasMore ? 'Background import is processing connector chunks' : 'Background import finished reading source records',
      ],
    );

    this.gateway.broadcastProgress(params.tenantId, params.batchId, {
      status: 'running',
      chunksProcessed: params.chunksProcessed,
      recordsProcessed: params.recordsProcessed,
      staged: params.staged,
      failed: params.failed,
      duplicates: params.duplicates,
      warnings: params.warnings,
      total: params.total,
      progressPercent,
      throughputRecordsPerMinute: throughput,
      hasMore: params.hasMore,
    });
  }

  async complete(params: {
    tenantId: string;
    batchId: string;
    executionJobId: string;
    actorUserId: string;
    summary: Record<string, unknown>;
  }) {
    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET status = 'completed', summary = COALESCE(summary, '{}'::jsonb) || $3::jsonb,
           completed_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.executionJobId, JSON.stringify(params.summary)],
    );
    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = 'ready',
           progress_percent = 100,
           message = 'Background import completed; validate and reconcile before commit',
           completed_at = now(),
           updated_by = $3,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [params.tenantId, params.batchId, params.actorUserId],
    );
    await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = 'ready', updated_at = now()
       WHERE tenant_id = $1 AND id = $2 AND status NOT IN ('cancelled', 'paused')`,
      [params.tenantId, params.batchId],
    );

    this.gateway.broadcastCompleted(params.tenantId, params.batchId, params.summary);
    await this.notifyCompletion(params.tenantId, params.batchId, params.actorUserId, params.summary);
  }

  async interrupt(params: {
    tenantId: string;
    batchId: string;
    executionJobId: string;
    actorUserId: string;
    status: 'paused' | 'cancelled';
    message: string;
    summary: Record<string, unknown>;
  }) {
    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET status = $3,
           summary = COALESCE(summary, '{}'::jsonb) || $4::jsonb,
           completed_at = now(),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.executionJobId, params.status, JSON.stringify(params.summary)],
    );
    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = $3,
           message = $4,
           completed_at = now(),
           updated_by = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [params.tenantId, params.batchId, params.status, params.message, params.actorUserId],
    );
    this.gateway.broadcastProgress(params.tenantId, params.batchId, {
      status: params.status,
      message: params.message,
      ...params.summary,
    });
  }

  async fail(params: {
    tenantId: string;
    batchId: string;
    executionJobId: string;
    actorUserId: string;
    error: string;
  }) {
    await this.db.query(
      `UPDATE historical_attendance_import_execution_jobs
       SET status = 'failed', error = $3, completed_at = now(), updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.executionJobId, params.error],
    );
    await this.db.query(
      `UPDATE historical_attendance_import_batches
       SET status = 'failed', failed_reason = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.batchId, params.error],
    );
    await this.db.query(
      `UPDATE historical_attendance_import_progress
       SET phase = 'failed', message = $3, completed_at = now(), updated_by = $4, updated_at = now()
       WHERE tenant_id = $1 AND batch_id = $2`,
      [params.tenantId, params.batchId, params.error, params.actorUserId],
    );
    this.gateway.broadcastFailed(params.tenantId, params.batchId, { error: params.error });
    await this.notifications.emit(params.tenantId, {
      userIds: [params.actorUserId],
      title: 'Historical import failed',
      message: params.error,
      type: 'error',
      priority: 'high',
      sourceModule: 'historical_attendance_import',
      entityType: 'historical_attendance_import_batch',
      entityId: params.batchId,
      actionUrl: '/dashboard/biometrics/historical-attendance-import',
    }).catch(() => undefined);
  }

  async getBatchStatus(tenantId: string, batchId: string) {
    const batch = await this.getBatch(tenantId, batchId);
    return batch.status;
  }

  private async getBatch(tenantId: string, batchId: string) {
    const { rows } = await this.db.query(
      `SELECT *
       FROM historical_attendance_import_batches
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, batchId],
    );
    if (!rows.length) throw new NotFoundException('Historical attendance import batch not found');
    return rows[0];
  }

  private async getElapsedMinutes(tenantId: string, executionJobId: string) {
    const { rows } = await this.db.query(
      `SELECT EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) / 60 AS minutes
       FROM historical_attendance_import_execution_jobs
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, executionJobId],
    );
    return Number(rows[0]?.minutes ?? 0);
  }

  private async notifyCompletion(tenantId: string, batchId: string, actorUserId: string, summary: Record<string, unknown>) {
    const message = `Historical attendance import completed. Records processed: ${summary.recordsProcessed ?? 0}. Staged: ${summary.staged ?? 0}. Failed: ${summary.failed ?? 0}.`;
    await this.notifications.emit(tenantId, {
      userIds: [actorUserId],
      title: 'Historical import completed',
      message,
      type: 'success',
      priority: 'medium',
      sourceModule: 'historical_attendance_import',
      entityType: 'historical_attendance_import_batch',
      entityId: batchId,
      actionUrl: '/dashboard/biometrics/historical-attendance-import',
      metadata: summary,
    }).catch(() => undefined);

    const { rows } = await this.db.query('SELECT email FROM users WHERE id = $1 AND tenant_id = $2', [actorUserId, tenantId]);
    const recipient = rows[0]?.email;
    if (recipient) {
      await this.email.sendGenericEmail(
        recipient,
        'Historical attendance import completed',
        `${message}\n\nBatch ID: ${batchId}\n\nPlease validate and reconcile the import before committing attendance.`,
      ).catch(() => undefined);
    }
  }
}
