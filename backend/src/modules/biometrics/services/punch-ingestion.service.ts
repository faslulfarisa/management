import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { PunchEventDto } from '../dto/punch-event.dto';
import {
  PUNCH_INGESTION_QUEUE,
  PUNCH_INGESTION_JOB,
  PunchIngestionJobData,
} from '../queue/punch-ingestion.types';
import { OfflineBufferService } from './offline-buffer.service';

const PUNCH_QUEUE_BACKPRESSURE_LIMIT = parseInt(
  process.env.PUNCH_QUEUE_BACKPRESSURE_LIMIT ?? '10000',
  10,
);

export interface SubmitPunchBatchInput {
  tenantId: string;
  integrationId: string | null;
  providerName: string;
  events: PunchEventDto[];
  requestId?: string;
  submittedAt?: string;
  correlationId?: string;
  terminalId?: string;
}

@Injectable()
export class PunchIngestionService {
  constructor(
    @InjectQueue(PUNCH_INGESTION_QUEUE) private readonly punchQueue: Queue,
    private readonly offlineBuffer: OfflineBufferService,
  ) {}

  async submit(input: SubmitPunchBatchInput): Promise<{
    queued: number;
    buffered: number;
    requestId: string;
    provider: string;
  }> {
    const requestId = input.requestId ?? randomUUID();
    const jobData = this.toJobData({ ...input, requestId });

    try {
      const [waiting, delayed] = await Promise.all([
        this.punchQueue.getWaitingCount(),
        this.punchQueue.getDelayedCount(),
      ]);
      if (waiting + delayed >= PUNCH_QUEUE_BACKPRESSURE_LIMIT) {
        await this.offlineBuffer.buffer(input.tenantId, input.providerName, jobData);
        return {
          queued: 0,
          buffered: input.events.length,
          requestId,
          provider: input.providerName,
        };
      }

      await this.punchQueue.add(PUNCH_INGESTION_JOB, jobData, {
        jobId: this.jobId(jobData),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: false,
      });

      return {
        queued: input.events.length,
        buffered: 0,
        requestId,
        provider: input.providerName,
      };
    } catch {
      await this.offlineBuffer.buffer(input.tenantId, input.providerName, jobData);
      return {
        queued: 0,
        buffered: input.events.length,
        requestId,
        provider: input.providerName,
      };
    }
  }

  toJobData(input: SubmitPunchBatchInput & { requestId: string }): PunchIngestionJobData {
    return {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      providerName: input.providerName,
      terminalId: input.terminalId,
      events: input.events.map((event) => ({
        employeeCode: event.employeeCode,
        timestamp: event.timestamp.toISOString(),
        punchType: event.punchType,
        verifyMethod: event.verifyMethod,
        providerName: event.providerName,
        deviceId: event.deviceId,
        terminalSerialNumber: event.terminalSerialNumber,
        workCode: event.workCode,
        punchState: event.punchState,
        rawVerifyType: event.rawVerifyType,
        gps: event.gps
          ? {
              latitude: event.gps.latitude,
              longitude: event.gps.longitude,
              accuracyMeters: event.gps.accuracyMeters,
              recordedAt: event.gps.recordedAt?.toISOString(),
            }
          : undefined,
        photo: event.photo
          ? {
              url: event.photo.url,
              objectKey: event.photo.objectKey,
              sha256: event.photo.sha256,
              capturedAt: event.photo.capturedAt?.toISOString(),
            }
          : undefined,
        locationMetadata: event.locationMetadata,
        requestId: input.requestId,
        correlationId: event.correlationId ?? input.correlationId,
        syncBatchId: event.syncBatchId,
        sourceIp: event.sourceIp,
        sourceUserAgent: event.sourceUserAgent,
        terminalId: event.terminalId,
        attendanceSource: event.attendanceSource,
        rawPayload: event.rawPayload,
      })),
      requestId: input.requestId,
      submittedAt: input.submittedAt ?? new Date().toISOString(),
      correlationId: input.correlationId,
    };
  }

  private jobId(jobData: PunchIngestionJobData): string {
    return `punch:${jobData.tenantId}:${jobData.providerName}:${jobData.requestId}`;
  }
}
