import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue } from 'bull';
import { REDIS_CLIENT } from '../../../shared/redis.provider';
import { DatabaseService } from '../../../shared/database.service';
import { PunchIngestionJobData, PUNCH_INGESTION_JOB } from '../queue/punch-ingestion.types';

const MAX_BUFFER_SIZE = 10_000;
const DEFAULT_MAX_ATTEMPTS = 5;

@Injectable()
export class OfflineBufferService {
  private readonly logger = new Logger(OfflineBufferService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  private key(tenantId: string, provider: string) {
    return `offline_buffer:${tenantId}:${provider}`;
  }

  async buffer(tenantId: string, provider: string, jobData: PunchIngestionJobData): Promise<void> {
    const key = this.key(tenantId, provider);
    await this.persistBufferedJob(jobData);

    const size = await this.redis.llen(key);
    if (size >= MAX_BUFFER_SIZE) {
      this.logger.warn(
        JSON.stringify({
          level: 'warn',
          event: 'offline_buffer_full',
          tenantId,
          provider,
          size,
          durable: true,
        }),
      );
      return;
    }

    await this.redis.rpush(key, JSON.stringify(jobData));

    this.logger.warn(
      JSON.stringify({
        level: 'warn',
        event: 'punch_buffered_offline',
        tenantId,
        provider,
        punchCount: jobData.events.length,
        bufferSize: size + 1,
      }),
    );
  }

  async drain(tenantId: string, provider: string, queue: Queue): Promise<number> {
    const key = this.key(tenantId, provider);
    let drained = 0;

    while (true) {
      const raw = await this.redis.lpop(key);
      if (!raw) break;

      try {
        const jobData = JSON.parse(raw) as PunchIngestionJobData;
        await queue.add(PUNCH_INGESTION_JOB, jobData, {
          jobId: this.jobId(jobData),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1_000 },
          removeOnFail: false,
        });
        drained++;
      } catch {
        // Re-push to front so we preserve order and retry on next drain cycle
        await this.redis.lpush(key, raw);
        break;
      }
    }

    drained += await this.drainDurable(tenantId, provider, queue);

    if (drained > 0) {
      this.logger.log(
        JSON.stringify({
          level: 'info',
          event: 'offline_buffer_drained',
          tenantId,
          provider,
          drained,
        }),
      );
    }

    return drained;
  }

  async drainDurable(tenantId: string, provider: string, queue: Queue, limit = 100): Promise<number> {
    const { rows } = await this.db.query(
      `SELECT id, payload
       FROM biometric_offline_punch_buffers
       WHERE tenant_id = $1
         AND provider_name = $2
         AND status IN ('buffered', 'failed')
         AND attempts < max_attempts
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY buffered_at ASC
       LIMIT $3`,
      [tenantId, provider, limit],
    );

    let drained = 0;
    for (const row of rows as Array<{ id: string; payload: PunchIngestionJobData }>) {
      const jobData = row.payload;
      try {
        await queue.add(PUNCH_INGESTION_JOB, jobData, {
          jobId: this.jobId(jobData),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1_000 },
          removeOnFail: false,
        });
        await this.db.query(
          `UPDATE biometric_offline_punch_buffers
           SET status = 'queued',
               attempts = attempts + 1,
               queued_at = NOW(),
               next_retry_at = NULL,
               last_error = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id],
        );
        drained++;
      } catch (err: any) {
        await this.db.query(
          `UPDATE biometric_offline_punch_buffers
           SET status = 'failed',
               attempts = attempts + 1,
               next_retry_at = NOW() + (LEAST(attempts + 1, 6) * INTERVAL '1 minute'),
               last_error = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [row.id, err?.message ?? 'Failed to enqueue buffered punch batch'],
        );
        break;
      }
    }

    return drained;
  }

  async size(tenantId: string, provider: string): Promise<number> {
    const [redisSize, durable] = await Promise.all([
      this.redis.llen(this.key(tenantId, provider)),
      this.db.query(
        `SELECT COUNT(*) AS total
         FROM biometric_offline_punch_buffers
         WHERE tenant_id = $1
           AND provider_name = $2
           AND status IN ('buffered', 'failed')`,
        [tenantId, provider],
      ),
    ]);
    return redisSize + parseInt(durable.rows[0]?.total ?? '0', 10);
  }

  async summary(tenantId?: string): Promise<{
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    byProvider: Array<{ provider: string; pending: number; failed: number; queued: number }>;
  }> {
    const params = tenantId ? [tenantId] : [];
    const tenantFilter = tenantId ? 'WHERE tenant_id = $1' : '';

    const [totalRes, statusRes, providerRes] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) AS total
         FROM biometric_offline_punch_buffers
         ${tenantFilter}
         ${tenantFilter ? 'AND' : 'WHERE'} status IN ('buffered', 'failed', 'queued', 'processing')`,
        params,
      ),
      this.db.query(
        `SELECT status, COUNT(*) AS count
         FROM biometric_offline_punch_buffers
         ${tenantFilter}
         ${tenantFilter ? 'AND' : 'WHERE'} status IN ('buffered', 'failed', 'queued', 'processing')
         GROUP BY status
         ORDER BY status`,
        params,
      ),
      this.db.query(
        `SELECT provider_name,
                COUNT(*) FILTER (WHERE status = 'buffered') AS pending,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status = 'queued') AS queued
         FROM biometric_offline_punch_buffers
         ${tenantFilter}
         ${tenantFilter ? 'AND' : 'WHERE'} status IN ('buffered', 'failed', 'queued', 'processing')
         GROUP BY provider_name
         ORDER BY provider_name`,
        params,
      ),
    ]);

    return {
      total: parseInt(totalRes.rows[0]?.total ?? '0', 10),
      byStatus: statusRes.rows.map((row: any) => ({
        status: row.status,
        count: parseInt(row.count, 10),
      })),
      byProvider: providerRes.rows.map((row: any) => ({
        provider: row.provider_name,
        pending: parseInt(row.pending, 10),
        failed: parseInt(row.failed, 10),
        queued: parseInt(row.queued, 10),
      })),
    };
  }

  async pendingProviders(): Promise<Array<{ tenantId: string; provider: string }>> {
    const { rows } = await this.db.query(
      `SELECT tenant_id, provider_name
       FROM biometric_offline_punch_buffers
       WHERE status IN ('buffered', 'failed')
         AND attempts < max_attempts
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         AND (expires_at IS NULL OR expires_at > NOW())
       GROUP BY tenant_id, provider_name
       ORDER BY MIN(buffered_at) ASC`,
    );
    return rows.map((row: any) => ({
      tenantId: row.tenant_id,
      provider: row.provider_name,
    }));
  }

  async markProcessed(jobData: PunchIngestionJobData): Promise<void> {
    await this.db.query(
      `UPDATE biometric_offline_punch_buffers
       SET status = 'processed',
           processed_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND request_id = $2
         AND status IN ('buffered', 'queued', 'processing', 'failed')`,
      [jobData.tenantId, jobData.requestId],
    );
  }

  async markFailed(jobData: PunchIngestionJobData, error: Error): Promise<void> {
    await this.db.query(
      `UPDATE biometric_offline_punch_buffers
       SET status = 'failed',
           last_error = $3,
           next_retry_at = NOW() + (LEAST(attempts + 1, 6) * INTERVAL '1 minute'),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND request_id = $2
         AND status IN ('buffered', 'queued', 'processing', 'failed')`,
      [jobData.tenantId, jobData.requestId, error.message],
    );
  }

  private async persistBufferedJob(jobData: PunchIngestionJobData): Promise<void> {
    const firstEvent = jobData.events[0];
    await this.db.query(
      `INSERT INTO biometric_offline_punch_buffers
         (tenant_id, integration_id, provider_name, source_device_id, terminal_id,
          sync_batch_id, request_id, correlation_id, payload, punch_count,
          max_attempts, next_retry_at, expires_at)
       VALUES
         ($1, $2, $3, $4, $5,
          $6, $7, $8, $9::jsonb, $10,
          $11, NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT DO NOTHING`,
      [
        jobData.tenantId,
        jobData.integrationId,
        jobData.providerName,
        firstEvent?.deviceId ?? firstEvent?.terminalSerialNumber ?? null,
        jobData.terminalId ?? firstEvent?.terminalId ?? null,
        firstEvent?.syncBatchId ?? null,
        jobData.requestId,
        jobData.correlationId,
        JSON.stringify(jobData),
        jobData.events.length,
        DEFAULT_MAX_ATTEMPTS,
      ],
    );
  }

  private jobId(jobData: PunchIngestionJobData): string {
    return `punch:${jobData.tenantId}:${jobData.providerName}:${jobData.requestId}`;
  }
}
