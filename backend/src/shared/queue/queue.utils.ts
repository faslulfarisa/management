import { DynamicModule, Logger, Module } from '@nestjs/common';
import { BullModule, BullModuleOptions, getQueueToken } from '@nestjs/bull';
import { isRedisEnabled } from '../../config/redis.config';
import { MockQueue } from './mock-queue';

@Module({})
class MockQueueModule {}

/**
 * Drop-in replacement for `BullModule.registerQueue(...)`.
 *
 * When REDIS_ENABLED=false, returns a module providing `MockQueue` instances
 * under the same DI tokens (`getQueueToken(name)`) so `@InjectQueue(...)`
 * consumers resolve without connecting to Redis.
 */
export function registerQueues(...options: BullModuleOptions[]): DynamicModule {
  if (isRedisEnabled()) {
    return BullModule.registerQueue(...options);
  }

  const logger = new Logger('QueueModule');
  const providers = options.map((option) => {
    const name = option.name as string;
    logger.warn(`Redis disabled - queue "${name}" registered with a mock (no jobs will be processed).`);
    return {
      provide: getQueueToken(name),
      useValue: new MockQueue(name),
    };
  });

  return {
    module: MockQueueModule,
    providers,
    exports: providers.map((provider) => provider.provide),
  };
}
