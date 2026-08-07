/**
 * easytimepro.scheduler.ts
 *
 * Trigger layer for EasyTimePro synchronisation.
 *
 * Every 5 minutes (configurable per integration) this scheduler enqueues a
 * BiometricSyncJob for each active EasyTimePro integration.  The actual data
 * fetching, cursor management, and device upsert logic lives in
 * BiometricSyncProcessor + EasyTimeProSyncAdapter — the scheduler only decides
 * WHEN to run and guards against queue overload.
 *
 * Reliability features:
 *   - Job deduplication: uses a stable jobId so a second enqueue within the
 *     same window is silently dropped by BullMQ (idempotent trigger).
 *   - Backpressure: skips scheduling when the biometric-sync queue exceeds
 *     BACKPRESSURE_LIMIT waiting jobs.
 *   - Offline buffer drain: every 30 s, re-enqueues punches that were
 *     buffered to Redis while Bull was temporarily unavailable.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';

import { DatabaseService } from '../../../../shared/database.service';
import { EasyTimeProConfig } from './easytimepro.config.dto';
import {
  BIOMETRIC_SYNC_QUEUE,
  BIOMETRIC_SYNC_JOB,
  BiometricSyncJobData,
} from '../../sync/biometric-sync.types';
import { PUNCH_INGESTION_QUEUE } from '../../queue/punch-ingestion.types';
import { OfflineBufferService } from '../../services/offline-buffer.service';

const BACKPRESSURE_LIMIT = 2_000;
const PROVIDER_NAME      = 'easytimepro';

@Injectable()
export class EasyTimeProScheduler {
  private readonly logger = new Logger(EasyTimeProScheduler.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly offlineBuffer: OfflineBufferService,
    @InjectQueue(BIOMETRIC_SYNC_QUEUE) private readonly syncQueue: Queue,
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly punchQueue: Queue,
  ) {}

  // ── Scheduled Sync ─────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'easytimepro-sync' })
  async runScheduledSync(): Promise<void> {
    const integrations = await this._loadActiveIntegrations();
    if (integrations.length === 0) return;

    const queueDepth = await this.syncQueue.getWaitingCount();
    if (queueDepth > BACKPRESSURE_LIMIT) {
      this.logger.warn(
        JSON.stringify({
          event: 'sync_skipped_backpressure',
          provider: PROVIDER_NAME,
          queueDepth,
          limit: BACKPRESSURE_LIMIT,
        }),
      );
      return;
    }

    for (const integration of integrations) {
      await this._enqueueSyncJob(integration);
    }
  }

  /** Drain the offline Redis buffer back into the punch queue every 30 s. */
  @Interval(30_000)
  async drainOfflineBuffer(): Promise<void> {
    const integrations = await this._loadActiveIntegrations();
    for (const { tenant_id: tenantId } of integrations) {
      const buffered = await this.offlineBuffer.size(tenantId, PROVIDER_NAME);
      if (buffered > 0) {
        await this.offlineBuffer.drain(tenantId, PROVIDER_NAME, this.punchQueue);
      }
    }
  }

  /** Trigger a full sync immediately for a given integration (manual / API-triggered). */
  async triggerManualSync(
    integrationId: string,
  ): Promise<{ queued: boolean; provider: string }> {
    const integration = await this._loadIntegration(integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found or not active`);
    }

    await this._enqueueSyncJob(integration, true);
    return { queued: true, provider: PROVIDER_NAME };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _enqueueSyncJob(
    integration: { id: string; tenant_id: string; config: EasyTimeProConfig },
    manual = false,
  ): Promise<void> {
    const { id: integrationId, tenant_id: tenantId } = integration;

    const jobData: BiometricSyncJobData = {
      tenantId,
      integrationId,
      providerName:  PROVIDER_NAME,
      cursorTypes:   ['attendance_logs', 'devices', 'employees'],
      triggeredAt:   new Date().toISOString(),
      manual,
      correlationId: randomUUID(),
    };

    // Stable jobId prevents duplicate jobs for the same integration in the
    // same 5-minute window.  BullMQ silently ignores an add() when a job
    // with the same ID is already waiting or active.
    const jobId = `${PROVIDER_NAME}:${integrationId}:sync`;

    await this.syncQueue.add(BIOMETRIC_SYNC_JOB, jobData, {
      jobId: manual ? undefined : jobId, // manual runs always enqueue fresh
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 200 },
      removeOnFail:     { count: 100 },
    });

    this.logger.log(
      JSON.stringify({
        event: 'sync_job_enqueued',
        provider: PROVIDER_NAME,
        tenantId,
        integrationId,
        manual,
        jobId: manual ? '(fresh)' : jobId,
      }),
    );
  }

  private async _loadActiveIntegrations(): Promise<
    Array<{ id: string; tenant_id: string; config: EasyTimeProConfig }>
  > {
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, config
       FROM integrations
       WHERE type = 'easytimepro' AND is_active = true
       ORDER BY created_at ASC`,
    );
    return rows as Array<{ id: string; tenant_id: string; config: EasyTimeProConfig }>;
  }

  private async _loadIntegration(
    integrationId: string,
  ): Promise<{ id: string; tenant_id: string; config: EasyTimeProConfig } | null> {
    const { rows } = await this.db.query(
      `SELECT id, tenant_id, config
       FROM integrations
       WHERE id = $1 AND type = 'easytimepro' AND is_active = true`,
      [integrationId],
    );
    return (rows[0] as any) ?? null;
  }
}
