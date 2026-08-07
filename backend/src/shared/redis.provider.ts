import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions, isRedisEnabled } from '../config/redis.config';
import { NoopRedisClient } from './mock-redis.client';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    if (!isRedisEnabled()) {
      return new NoopRedisClient();
    }

    const client = new Redis({
      ...getRedisConnectionOptions(),
      lazyConnect: true,
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS ?? '500', 10),
    });
    client.on('error', () => {});
    return client;
  },
};
