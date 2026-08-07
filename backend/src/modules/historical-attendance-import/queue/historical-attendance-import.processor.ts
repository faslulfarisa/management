import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { HistoricalAttendanceConnectorService } from '../services/historical-attendance-connector.service';
import { HistoricalAttendanceImportExecutionService } from '../services/historical-attendance-import-execution.service';
import {
  HISTORICAL_ATTENDANCE_IMPORT_EXECUTE_JOB,
  HISTORICAL_ATTENDANCE_IMPORT_QUEUE,
  HistoricalAttendanceImportJobData,
} from './historical-attendance-import.types';

@Processor(HISTORICAL_ATTENDANCE_IMPORT_QUEUE)
export class HistoricalAttendanceImportProcessor {
  private readonly logger = new Logger(HistoricalAttendanceImportProcessor.name);

  constructor(
    private readonly connectorService: HistoricalAttendanceConnectorService,
    private readonly executionService: HistoricalAttendanceImportExecutionService,
  ) {}

  @Process({ name: HISTORICAL_ATTENDANCE_IMPORT_EXECUTE_JOB, concurrency: 2 })
  async execute(job: Job<HistoricalAttendanceImportJobData>) {
    const { tenantId, batchId, executionJobId, actorUserId, payload } = job.data;
    await this.executionService.markRunning(tenantId, executionJobId);

    let cursor = payload.cursor ?? null;
    const maxChunks = Math.min(payload.maxChunks ?? 100000, 100000);
    const totals = {
      chunksProcessed: 0,
      recordsProcessed: 0,
      staged: 0,
      failed: 0,
      duplicates: 0,
      warnings: 0,
      total: null as number | null,
    };

    this.logger.log(JSON.stringify({
      event: 'historical_import_started',
      tenantId,
      batchId,
      executionJobId,
      queueJobId: job.id,
    }));

    try {
      while (totals.chunksProcessed < maxChunks) {
        const status = await this.executionService.getBatchStatus(tenantId, batchId);
        if (status === 'paused') {
          const summary = { status: 'paused', ...totals, nextCursor: cursor };
          await this.executionService.updateProgress({
            tenantId,
            batchId,
            executionJobId,
            queueJobId: String(job.id),
            chunksProcessed: totals.chunksProcessed,
            recordsProcessed: totals.recordsProcessed,
            staged: totals.staged,
            failed: totals.failed,
            duplicates: totals.duplicates,
            warnings: totals.warnings,
            cursor,
            hasMore: true,
            total: totals.total,
          });
          await this.executionService.interrupt({
            tenantId,
            batchId,
            executionJobId,
            actorUserId,
            status: 'paused',
            message: 'Background import paused; resume to continue from the last checkpoint',
            summary,
          });
          return summary;
        }
        if (status === 'cancelled') {
          const summary = { status: 'cancelled', ...totals, nextCursor: cursor };
          await this.executionService.interrupt({
            tenantId,
            batchId,
            executionJobId,
            actorUserId,
            status: 'cancelled',
            message: 'Background import cancelled',
            summary,
          });
          return summary;
        }

        const result = await this.connectorService.importChunk(tenantId, { sub: actorUserId }, batchId, {
          ...payload,
          cursor: cursor ?? undefined,
        });

        totals.chunksProcessed++;
        totals.recordsProcessed += result.staged + result.failed + result.duplicates;
        totals.staged += result.staged;
        totals.failed += result.failed;
        totals.duplicates += result.duplicates;
        totals.warnings += result.warnings;
        totals.total = result.total ?? totals.total;
        cursor = result.nextCursor ?? null;

        await this.executionService.updateProgress({
          tenantId,
          batchId,
          executionJobId,
          queueJobId: String(job.id),
          chunksProcessed: totals.chunksProcessed,
          recordsProcessed: totals.recordsProcessed,
          staged: totals.staged,
          failed: totals.failed,
          duplicates: totals.duplicates,
          warnings: totals.warnings,
          cursor,
          hasMore: result.hasMore,
          total: totals.total,
        });

        if (totals.total && totals.total > 0) {
          await job.progress(Math.min(99, Math.round((totals.recordsProcessed / totals.total) * 100)));
        }

        if (!result.hasMore || !cursor) break;
      }

      const summary = {
        status: cursor ? 'paused' : 'completed',
        recordsProcessed: totals.recordsProcessed,
        staged: totals.staged,
        failed: totals.failed,
        duplicates: totals.duplicates,
        warnings: totals.warnings,
        chunksProcessed: totals.chunksProcessed,
        nextCursor: cursor,
      };
      if (cursor) {
        await this.executionService.interrupt({
          tenantId,
          batchId,
          executionJobId,
          actorUserId,
          status: 'paused',
          message: 'Background import reached its chunk limit; resume to continue from the saved cursor',
          summary,
        });
        return summary;
      }
      await this.executionService.complete({ tenantId, batchId, executionJobId, actorUserId, summary });
      await job.progress(100);
      return summary;
    } catch (error: any) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.executionService.fail({
          tenantId,
          batchId,
          executionJobId,
          actorUserId,
          error: error?.message ?? 'Historical attendance import failed',
        });
      }
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<HistoricalAttendanceImportJobData>, error: Error) {
    this.logger.error(JSON.stringify({
      event: 'historical_import_job_failed',
      tenantId: job.data?.tenantId,
      batchId: job.data?.batchId,
      executionJobId: job.data?.executionJobId,
      queueJobId: job.id,
      attemptsMade: job.attemptsMade,
      error: error.message,
    }));
  }
}
