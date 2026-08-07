import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis.provider';
import { isRedisEnabled } from '../../config/redis.config';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly timeoutMs = parseInt(process.env.REDIS_HEALTH_TIMEOUT_MS ?? '500', 10);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!isRedisEnabled()) {
      return this.getStatus(key, true, { status: 'disabled' });
    }

    try {
      const pong = await this.withTimeout(this.redis.ping());
      return this.getStatus(key, pong === 'PONG');
    } catch {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false),
      );
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Redis health check timed out after ${this.timeoutMs}ms`)),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
