import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AttendanceEngineService } from '../engine/attendance-engine.service';
import { PunchEventDto, PunchDirection, VerifyMethod, AttendanceSource } from '../dto/punch-event.dto';
import { PUNCH_INGESTION_QUEUE, PUNCH_INGESTION_JOB, PunchIngestionJobData } from './punch-ingestion.types';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';
import { OfflineBufferService } from '../services/offline-buffer.service';

@Processor(PUNCH_INGESTION_QUEUE)
export class PunchIngestionProcessor {
  private readonly logger = new Logger(PunchIngestionProcessor.name);

  constructor(
    private readonly engine: AttendanceEngineService,
    private readonly metrics: BiometricsMetricsService,
    private readonly offlineBuffer: OfflineBufferService,
  ) {}

  @Process({ name: PUNCH_INGESTION_JOB, concurrency: 10 })
  async handlePunchBatch(job: Job<PunchIngestionJobData>) {
    const { tenantId, integrationId, providerName, events, requestId, correlationId } = job.data;
    const timer = this.metrics.ingestionDuration.startTimer({ provider: providerName });

    this.logger.log(
      JSON.stringify({
        level: 'info',
        correlationId,
        jobId: job.id,
        event: 'job_started',
        provider: providerName,
        tenantId,
        punchCount: events.length,
        requestId,
      }),
    );

    const dtos: PunchEventDto[] = events.map((e) => ({
      employeeCode: e.employeeCode,
      timestamp: new Date(e.timestamp),
      punchType: e.punchType as PunchDirection,
      verifyMethod: e.verifyMethod as VerifyMethod,
      providerName: e.providerName,
      deviceId: e.deviceId,
      terminalSerialNumber: e.terminalSerialNumber,
      workCode: e.workCode,
      punchState: e.punchState,
      rawVerifyType: e.rawVerifyType,
      gps: e.gps
        ? {
            latitude: e.gps.latitude,
            longitude: e.gps.longitude,
            accuracyMeters: e.gps.accuracyMeters,
            recordedAt: e.gps.recordedAt ? new Date(e.gps.recordedAt) : undefined,
          }
        : undefined,
      photo: e.photo
        ? {
            url: e.photo.url,
            objectKey: e.photo.objectKey,
            sha256: e.photo.sha256,
            capturedAt: e.photo.capturedAt ? new Date(e.photo.capturedAt) : undefined,
          }
        : undefined,
      locationMetadata: e.locationMetadata,
      requestId: e.requestId ?? requestId,
      correlationId: e.correlationId ?? correlationId,
      syncBatchId: e.syncBatchId,
      sourceIp: e.sourceIp,
      sourceUserAgent: e.sourceUserAgent,
      terminalId: e.terminalId,
      attendanceSource: e.attendanceSource as AttendanceSource | undefined,
      rawPayload: {
        ...(e.rawPayload ?? {}),
        queue: {
          name: PUNCH_INGESTION_QUEUE,
          job_id: String(job.id),
          attempt: job.attemptsMade + 1,
          request_id: requestId,
          submitted_at: job.data.submittedAt,
        },
      },
    }));

    const result = await this.engine.processPunchEvents(tenantId, integrationId, dtos);
    await this.offlineBuffer.markProcessed(job.data).catch(() => undefined);

    timer();

    this.metrics.punchesTotal.inc({ provider: providerName, direction: 'in' }, result.synced);
    if (result.failed > 0) {
      this.metrics.duplicatesTotal.inc({ provider: providerName }, result.failed);
    }

    // Track verify method and attendance source distribution
    for (const dto of dtos) {
      this.metrics.verifyMethodTotal.inc({ method: dto.verifyMethod ?? 'other', provider: providerName });
      if (dto.attendanceSource) {
        this.metrics.attendanceSourceTotal.inc({ source: dto.attendanceSource });
      }
    }

    this.logger.log(
      JSON.stringify({
        level: 'info',
        correlationId,
        jobId: job.id,
        event: 'job_completed',
        provider: providerName,
        synced: result.synced,
        failed: result.failed,
        total: result.total,
      }),
    );

    return result;
  }

  @OnQueueFailed()
  onFailed(job: Job<PunchIngestionJobData>, error: Error) {
    const { tenantId, providerName, correlationId } = job.data;

    this.logger.error(
      JSON.stringify({
        level: 'error',
        correlationId,
        jobId: job.id,
        event: 'job_failed',
        provider: providerName,
        tenantId,
        attempt: job.attemptsMade,
        error: error.message,
      }),
    );

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      this.metrics.dlqTotal.inc();
      this.offlineBuffer.markFailed(job.data, error).catch(() => undefined);
    }
  }
}
