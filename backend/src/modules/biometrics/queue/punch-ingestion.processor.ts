import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { AttendanceEngineService } from '../engine/attendance-engine.service';
import { PunchEventDto, PunchDirection, VerifyMethod, AttendanceSource } from '../dto/punch-event.dto';
import { PUNCH_INGESTION_QUEUE, PUNCH_INGESTION_JOB, PunchIngestionJobData } from './punch-ingestion.types';
import { BiometricsGateway } from '../gateways/biometrics.gateway';
import { BiometricsMetricsService } from '../../../shared/metrics/biometrics-metrics.service';

@Processor(PUNCH_INGESTION_QUEUE)
export class PunchIngestionProcessor {
  private readonly logger = new Logger(PunchIngestionProcessor.name);

  constructor(
    private readonly engine: AttendanceEngineService,
    private readonly gateway: BiometricsGateway,
    private readonly metrics: BiometricsMetricsService,
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
      terminalId: e.terminalId,
      attendanceSource: e.attendanceSource as AttendanceSource | undefined,
      rawPayload: e.rawPayload,
    }));

    const result = await this.engine.processPunchEvents(tenantId, integrationId, dtos);

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

    // Broadcast each processed punch to connected WebSocket clients
    for (const dto of dtos) {
      this.gateway.broadcastPunch({
        tenantId,
        employeeCode: dto.employeeCode,
        timestamp: dto.timestamp.toISOString(),
        punchType: dto.punchType,
        provider: providerName,
        deviceId: dto.deviceId,
      });
    }

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
      this.gateway.broadcastAlert(tenantId, {
        type: 'dlq_spike',
        jobId: job.id,
        provider: providerName,
        error: error.message,
      });
    }
  }
}
