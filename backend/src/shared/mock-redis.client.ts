import { Logger } from '@nestjs/common';

/**
 * No-op stand-in for an ioredis client, used when REDIS_ENABLED=false.
 * Implements the subset of commands used across the codebase (caching,
 * nonce/replay checks, offline buffering) as harmless no-ops so consumers
 * fall back to their non-cached/non-buffered code paths.
 */
export class NoopRedisClient {
  private readonly logger = new Logger('NoopRedisClient');

  constructor() {
    this.logger.warn(
      'Redis disabled - cache, replay-protection and offline-buffer features are inactive.',
    );
  }

  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<'OK'> {
    return 'OK';
  }

  async setex(): Promise<'OK'> {
    return 'OK';
  }

  async exists(): Promise<number> {
    return 0;
  }

  async del(): Promise<number> {
    return 0;
  }

  async keys(): Promise<string[]> {
    return [];
  }

  async llen(): Promise<number> {
    return 0;
  }

  async rpush(): Promise<number> {
    return 0;
  }

  async lpush(): Promise<number> {
    return 0;
  }

  async lpop(): Promise<string | null> {
    return null;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  on(): this {
    return this;
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  disconnect(): void {}
}
