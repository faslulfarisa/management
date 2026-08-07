/**
 * biometric-sync.processor.ts
 *
 * BullMQ processor for the 'biometric-sync' queue.
 *
 * Each job carries a list of cursor types to process ('attendance_logs',
 * 'devices').  For each cursor type the processor:
 *
 *   1. Reads the current watermark from biometric_sync_cursors
 *   2. Opens a biometric_sync_logs row for auditability
 *   3. Delegates data fetching to EasyTimeProSyncAdapter (circuit-breaker-protected)
 *   4. For attendance_logs → enqueues batch to existing punch-ingestion queue
 *      For devices        → upserts into biometric_devices
 *   5. Advances the cursor ONLY on success (at-least-once guarantee)
 *   6. Finalizes the sync log row with counts and duration
 *
 * A job failure (exception) leaves the cursor unchanged so BullMQ's built-in
 * exponential-backoff retry re-fetches the same window.
 */

import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import { BiometricDeviceService } from '../services/biometric-device.service';

import {
  BIOMETRIC_SYNC_QUEUE,
  BIOMETRIC_SYNC_JOB,
  BiometricSyncJobData,
  SyncCursorType,
} from './biometric-sync.types';
import { SyncCursorService } from './sync-cursor.service';
import { EasyTimeProSyncAdapter, EASYTIMEPRO_PROVIDER_NAME } from './easytimepro-sync.adapter';
import { PunchEventDto } from '../dto/punch-event.dto';
import { PunchIngestionService } from '../services/punch-ingestion.service';

/** 24 h look-back when no cursor exists for an integration yet */
const FALLBACK_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

@Processor(BIOMETRIC_SYNC_QUEUE)
export class BiometricSyncProcessor {
  private readonly logger = new Logger(BiometricSyncProcessor.name);

  constructor(
    private readonly cursorSvc: SyncCursorService,
    private readonly etpAdapter: EasyTimeProSyncAdapter,
    private readonly deviceService: BiometricDeviceService,
    private readonly metrics: BiometricsMetricsService,
    private readonly punchIngestion: PunchIngestionService,
  ) {}

  // ── Job Handler ───────────────────────────────────────────────────────────

  @Process({ name: BIOMETRIC_SYNC_JOB, concurrency: 5 })
  async handleSyncRun(job: Job<BiometricSyncJobData>): Promise<void> {
    const { tenantId, integrationId, providerName, cursorTypes, correlationId } = job.data;

    const syncTimer = this.metrics.providerSyncDuration.startTimer({ provider: providerName });

    this.logger.log(
      JSON.stringify({
        event: 'sync_job_started',
        jobId: job.id,
        providerName,
        tenantId,
        integrationId,
        cursorTypes,
        correlationId,
      }),
    );

    // Load config once for all cursor types in this job
    const config = await this.etpAdapter.loadConfig(integrationId);
    if (!config) {
      this.logger.warn(
        `[biometric-sync] No active EasyTimePro config for integration ${integrationId}`,
      );
      syncTimer();
      return;
    }

    const syncErrors: Array<{ cursorType: SyncCursorType; error: Error }> = [];
    for (const cursorType of cursorTypes) {
      try {
        await this._syncCursorType(job, config, cursorType);
      } catch (err: any) {
        this.logger.error(
          `[biometric-sync] Sync failed for cursor type '${cursorType}': ${err.message}`,
          err.stack,
        );
        syncErrors.push({ cursorType, error: err });
      }
    }

    if (syncErrors.length > 0) {
      const msgs = syncErrors.map((e) => `${e.cursorType} (${e.error.message})`).join(', ');
      throw new Error(`Partial sync failures occurred: ${msgs}`);
    }

    syncTimer();

    this.logger.log(
      JSON.stringify({
        event: 'sync_job_completed',
        jobId: job.id,
        providerName,
        tenantId,
        integrationId,
      }),
    );
  }

  // ── Per-Cursor-Type Orchestration ─────────────────────────────────────────

  private async _syncCursorType(
    job: Job<BiometricSyncJobData>,
    config: any,
    cursorType: SyncCursorType,
  ): Promise<void> {
    const { tenantId, integrationId, providerName, correlationId } = job.data;
    const startedAt = Date.now();

    const cursorBefore = await this.cursorSvc.getCursor(
      tenantId,
      integrationId,
      providerName,
      cursorType,
    );

    const logId = await this.cursorSvc.beginSyncLog(
      tenantId,
      integrationId,
      providerName,
      cursorType,
      cursorBefore,
    );

    // Fall back to 24 h look-back for first-ever run
    const since = cursorBefore
      ? new Date(cursorBefore)
      : new Date(Date.now() - FALLBACK_LOOKBACK_MS);

    let fetchedCount = 0;
    let syncedCount  = 0;
    let skippedCount = 0;
    let failedCount  = 0;
    let cursorAfter: string | null = cursorBefore;

    const cursorTimer = this.metrics.syncCursorDuration.startTimer({
      provider: providerName,
      cursor_type: cursorType,
    });

    try {
      if (cursorType === 'attendance_logs') {
        const result = await this.etpAdapter.fetchAttendanceLogs(config, since, tenantId);
        fetchedCount = result.fetchedCount;

        const enq = await this._enqueueAttendance(
          tenantId, integrationId, providerName, result.records, correlationId,
        );
        syncedCount  = enq.enqueued;
        failedCount  = enq.failed;
        cursorAfter  = result.latestCursor ?? cursorAfter;

      } else if (cursorType === 'devices') {
        const result = await this.etpAdapter.fetchDevices(config, since, tenantId);
        fetchedCount = result.fetchedCount;

        const ups = await this.deviceService.upsertFromSync(tenantId, providerName, result.records);
        syncedCount  = ups.upserted;
        failedCount  = ups.failed;
        cursorAfter  = result.latestCursor ?? cursorAfter;

      } else if (cursorType === 'employees') {
        const result = await this.etpAdapter.fetchEmployees(config, since, tenantId);
        fetchedCount = result.fetchedCount;

        const ups = await this.etpAdapter.upsertEmployees(tenantId, result.records);
        syncedCount  = ups.upserted;
        failedCount  = ups.failed;
        cursorAfter  = result.latestCursor ?? cursorAfter;
      }

      // Emit per-cursor-type record counters
      if (fetchedCount > 0) {
        this.metrics.syncRecordsFetched.inc(
          { provider: providerName, cursor_type: cursorType }, fetchedCount,
        );
      }
      if (syncedCount > 0) {
        this.metrics.syncRecordsSynced.inc(
          { provider: providerName, cursor_type: cursorType }, syncedCount,
        );
      }
      if (failedCount > 0) {
        this.metrics.syncRecordsFailed.inc(
          { provider: providerName, cursor_type: cursorType }, failedCount,
        );
      }

      // Advance cursor only after a successful sync
      if (cursorAfter && cursorAfter !== cursorBefore) {
        await this.cursorSvc.setCursor(
          tenantId, integrationId, providerName, cursorType, cursorAfter, syncedCount,
        );
      }

      // Lag = how old the newest successfully synced record is right now
      if (cursorAfter) {
        const cursorDate = new Date(cursorAfter);
        if (!isNaN(cursorDate.getTime())) {
          this.metrics.syncLagSeconds.set(
            { provider: providerName, cursor_type: cursorType },
            (Date.now() - cursorDate.getTime()) / 1000,
          );
        }
      }

      const status =
        failedCount === 0 ? 'success' : syncedCount > 0 ? 'partial' : 'failed';

      await this.cursorSvc.completeSyncLog(logId, {
        status,
        cursorAfter,
        recordsFetched: fetchedCount,
        recordsSynced:  syncedCount,
        recordsSkipped: skippedCount,
        recordsFailed:  failedCount,
        durationMs: Date.now() - startedAt,
      });

      cursorTimer();
      this.metrics.syncRunsTotal.inc({ provider: providerName, cursor_type: cursorType, status });

      this.logger.log(
        JSON.stringify({
          event: 'cursor_sync_done',
          cursorType,
          providerName,
          tenantId,
          fetchedCount,
          syncedCount,
          failedCount,
          status,
        }),
      );

    } catch (err: any) {
      cursorTimer();

      // Do NOT advance the cursor — BullMQ will retry with same window
      await this.cursorSvc.completeSyncLog(logId, {
        status: 'failed',
        cursorAfter: cursorBefore,
        recordsFetched: fetchedCount,
        recordsSynced:  syncedCount,
        recordsSkipped: skippedCount,
        recordsFailed:  failedCount,
        durationMs: Date.now() - startedAt,
        errorSummary: err?.message ?? 'Unknown error',
      });

      this.metrics.syncRunsTotal.inc({
        provider: providerName,
        cursor_type: cursorType,
        status: 'failed',
      });

      throw err; // propagate so BullMQ retries the job
    }
  }

  // ── Attendance: enqueue to punch-ingestion ────────────────────────────────

  private async _enqueueAttendance(
    tenantId: string,
    integrationId: string,
    providerName: string,
    events: PunchEventDto[],
    correlationId?: string,
  ): Promise<{ enqueued: number; failed: number }> {
    if (events.length === 0) return { enqueued: 0, failed: 0 };

    try {
      await this.punchIngestion.submit({
        tenantId,
        integrationId,
        providerName,
        events,
        correlationId,
      });
      return { enqueued: events.length, failed: 0 };
    } catch (err: any) {
      this.logger.error(
        `[biometric-sync] Failed to enqueue ${events.length} attendance events: ${err?.message}`,
      );
      return { enqueued: 0, failed: events.length };
    }
  }

  // ── DLQ Handler ───────────────────────────────────────────────────────────

  @OnQueueFailed()
  onFailed(job: Job<BiometricSyncJobData>, error: Error): void {
    const { tenantId, providerName, integrationId } = job.data;

    this.logger.error(
      JSON.stringify({
        event: 'sync_job_failed',
        jobId: job.id,
        providerName,
        tenantId,
        integrationId,
        attempt: job.attemptsMade,
        error: error.message,
      }),
    );

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      this.metrics.dlqTotal.inc();
      this.logger.error(
        JSON.stringify({
          event: 'sync_job_dlq',
          jobId: job.id,
          providerName,
          tenantId,
          integrationId,
        }),
      );
    }
  }
}
