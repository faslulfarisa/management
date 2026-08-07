import { RedisOptions } from 'ioredis';

/**
 * Redis is opt-in. Set REDIS_ENABLED=false (or omit it in dev) to run the
 * API without Redis/Bull — queue-backed features degrade gracefully instead
 * of failing to start.
 */
export function isRedisEnabled(): boolean {
  return process.env.REDIS_ENABLED !== 'false';
}

export function getRedisConnectionOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => Math.min(times * 2000, 60000),
  };
}
