import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis.provider';
import { isRedisEnabled } from '../../config/redis.config';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!isRedisEnabled()) {
      return this.getStatus(key, true, { status: 'disabled' });
    }

    try {
      const pong = await this.redis.ping();
      return this.getStatus(key, pong === 'PONG');
    } catch {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false),
      );
    }
  }
}
