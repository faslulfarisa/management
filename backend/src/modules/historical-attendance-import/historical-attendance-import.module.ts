import { Module, forwardRef } from '@nestjs/common';
import { isRedisEnabled } from '../../config/redis.config';
import { registerQueues } from '../../shared/queue/queue.utils';
import { AuthModule } from '../auth/auth.module';
import { HrModule } from '../hr/hr.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformModule } from '../platform/platform.module';
import { HistoricalAttendanceImportController } from './controllers/historical-attendance-import.controller';
import { HistoricalAttendanceImportOpsController } from './controllers/historical-attendance-import-ops.controller';
import { HistoricalAttendanceImportGateway } from './gateways/historical-attendance-import.gateway';
import { HistoricalAttendanceImportGuard } from './guards/historical-attendance-import.guard';
import { HistoricalAttendanceConnectorService } from './services/historical-attendance-connector.service';
import { HistoricalAttendanceDependencyRebuildService } from './services/historical-attendance-dependency-rebuild.service';
import { HistoricalAttendanceImportExecutionService } from './services/historical-attendance-import-execution.service';
import { HistoricalAttendanceEmployeeMappingService } from './services/historical-attendance-employee-mapping.service';
import { HistoricalAttendanceImportService } from './services/historical-attendance-import.service';
import { HistoricalAttendanceRebuildService } from './services/historical-attendance-rebuild.service';
import { HistoricalAttendanceReconciliationService } from './services/historical-attendance-reconciliation.service';
import { HistoricalAttendanceRollbackService } from './services/historical-attendance-rollback.service';
import { HistoricalAttendanceValidationService } from './services/historical-attendance-validation.service';
import { ImportSourceNormalizerService } from './services/import-source-normalizer.service';
import {
  HISTORICAL_ATTENDANCE_IMPORT_QUEUE,
} from './queue/historical-attendance-import.types';
import { HistoricalAttendanceImportProcessor } from './queue/historical-attendance-import.processor';

const HISTORICAL_IMPORT_QUEUE_OPTIONS = {
  settings: {
    lockDuration: 120_000,
    stalledInterval: 60_000,
    maxStalledCount: 2,
  },
};

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
    forwardRef(() => HrModule),
    forwardRef(() => NotificationsModule),
    registerQueues({
      name: HISTORICAL_ATTENDANCE_IMPORT_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
      ...HISTORICAL_IMPORT_QUEUE_OPTIONS,
    }),
  ],
  controllers: [HistoricalAttendanceImportController, HistoricalAttendanceImportOpsController],
  providers: [
    HistoricalAttendanceImportGuard,
    HistoricalAttendanceImportGateway,
    HistoricalAttendanceConnectorService,
    HistoricalAttendanceImportExecutionService,
    HistoricalAttendanceDependencyRebuildService,
    HistoricalAttendanceImportService,
    HistoricalAttendanceEmployeeMappingService,
    HistoricalAttendanceValidationService,
    HistoricalAttendanceReconciliationService,
    HistoricalAttendanceRebuildService,
    HistoricalAttendanceRollbackService,
    ImportSourceNormalizerService,
    ...(isRedisEnabled() ? [HistoricalAttendanceImportProcessor] : []),
  ],
  exports: [
    HistoricalAttendanceImportService,
    HistoricalAttendanceImportExecutionService,
    HistoricalAttendanceConnectorService,
    HistoricalAttendanceDependencyRebuildService,
    HistoricalAttendanceEmployeeMappingService,
    HistoricalAttendanceValidationService,
    HistoricalAttendanceReconciliationService,
    HistoricalAttendanceRebuildService,
    HistoricalAttendanceRollbackService,
  ],
})
export class HistoricalAttendanceImportModule {}
