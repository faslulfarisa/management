import { Logger } from '@nestjs/common';

/**
 * No-op stand-in for a Bull `Queue`, used when REDIS_ENABLED=false.
 * Satisfies @InjectQueue(...) consumers so the app can start without Redis —
 * jobs are dropped (with a warning) and stats/lookups report empty.
 */
export class MockQueue {
  private readonly logger = new Logger(`MockQueue:${this.name}`);

  constructor(private readonly name: string) {}

  async add(jobName?: unknown): Promise<{ id: string }> {
    this.logger.warn(
      `Redis disabled - job "${String(jobName)}" was not enqueued on queue "${this.name}".`,
    );
    return { id: 'noop' };
  }

  async getJob(): Promise<null> {
    return null;
  }

  async getFailed(): Promise<unknown[]> {
    return [];
  }

  async getWaitingCount(): Promise<number> {
    return 0;
  }

  async getActiveCount(): Promise<number> {
    return 0;
  }

  async getFailedCount(): Promise<number> {
    return 0;
  }

  async getDelayedCount(): Promise<number> {
    return 0;
  }

  async getCompletedCount(): Promise<number> {
    return 0;
  }

  async isPaused(): Promise<boolean> {
    return false;
  }

  async getWorkers(): Promise<unknown[]> {
    return [];
  }

  process(): void {}

  on(): this {
    return this;
  }
}
