import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Interval } from '@nestjs/schedule';
import { PUNCH_INGESTION_QUEUE } from '../queue/punch-ingestion.types';
import { BiometricsGateway, QueueHealthDto } from '../gateways/biometrics.gateway';

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);

  constructor(
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly queue: Queue,
    private readonly gateway: BiometricsGateway,
  ) {}

  @Interval(5000)
  async broadcastHealth() {
    try {
      const snapshot = await this.getSnapshot();
      this.gateway.broadcastQueueHealth('*', snapshot);
    } catch (err) {
      this.logger.warn('Failed to broadcast queue health', err);
    }
  }

  async getSnapshot(): Promise<QueueHealthDto> {
    const [waiting, active, failed, delayed, workers] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getWorkers(),
    ]);

    return {
      depth: waiting + delayed,
      active,
      failed,
      workers: workers.length,
      timestamp: new Date().toISOString(),
    };
  }
}
