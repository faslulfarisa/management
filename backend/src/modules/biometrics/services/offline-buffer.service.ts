import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue } from 'bull';
import { REDIS_CLIENT } from '../../../shared/redis.provider';
import { PunchIngestionJobData, PUNCH_INGESTION_JOB } from '../queue/punch-ingestion.types';

const MAX_BUFFER_SIZE = 10_000;

@Injectable()
export class OfflineBufferService {
  private readonly logger = new Logger(OfflineBufferService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(tenantId: string, provider: string) {
    return `offline_buffer:${tenantId}:${provider}`;
  }

  async buffer(tenantId: string, provider: string, jobData: PunchIngestionJobData): Promise<void> {
    const key = this.key(tenantId, provider);
    const size = await this.redis.llen(key);

    if (size >= MAX_BUFFER_SIZE) {
      this.logger.warn(
        JSON.stringify({
          level: 'warn',
          event: 'offline_buffer_full',
          tenantId,
          provider,
          size,
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
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1_000 },
        });
        drained++;
      } catch {
        // Re-push to front so we preserve order and retry on next drain cycle
        await this.redis.lpush(key, raw);
        break;
      }
    }

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

  async size(tenantId: string, provider: string): Promise<number> {
    return this.redis.llen(this.key(tenantId, provider));
  }
}
