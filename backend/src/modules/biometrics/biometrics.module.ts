import { Module, forwardRef } from '@nestjs/common';
import { isRedisEnabled } from '../../config/redis.config';
import { registerQueues } from '../../shared/queue/queue.utils';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformModule } from '../platform/platform.module';
import { SharedModule } from '../../shared/shared.module';

// Engine
import { AttendanceEngineService } from './engine/attendance-engine.service';

// Services
import { PunchFingerprintService } from './services/punch-fingerprint.service';
import { AttendanceAuditService } from './services/attendance-audit.service';
import { ServiceApiKeyService } from './services/service-api-key.service';
import { AttendanceCorrectionsService } from './services/attendance-corrections.service';
import { QueueHealthService } from './services/queue-health.service';
import { ShiftCacheService } from './services/shift-cache.service';
import { OfflineBufferService } from './services/offline-buffer.service';

// Gateway
import { BiometricsGateway } from './gateways/biometrics.gateway';

// Queues
import { PUNCH_INGESTION_QUEUE } from './queue/punch-ingestion.types';
import { PunchIngestionProcessor } from './queue/punch-ingestion.processor';
import { BIOMETRIC_SYNC_QUEUE } from './sync/biometric-sync.types';

// Sync pipeline (Phases 3–5)
import { SyncCursorService } from './sync/sync-cursor.service';
import { EasyTimeProSyncAdapter } from './sync/easytimepro-sync.adapter';
import { BiometricSyncProcessor } from './sync/biometric-sync.processor';

// Provider Registry
import { ProviderRegistryService } from './providers/provider-registry.service';

// Providers
import { ZktecoProvider } from './providers/zkteco/zkteco.provider';
import { EasyTimeProProvider } from './providers/easytimepro/easytimepro.provider';
import { EasyTimeProScheduler } from './providers/easytimepro/easytimepro.scheduler';

// Device registry
import { BiometricDeviceService } from './services/biometric-device.service';

// Normalization
import { VerifyMethodNormalizerService } from './normalization/verify-method-normalizer.service';

// Trusted terminal system (Phases 7–8)
import { AttendanceTerminalService } from './terminals/attendance-terminal.service';
import { TerminalAuthGuard } from './terminals/terminal-auth.guard';
import { TerminalPunchService } from './terminals/terminal-punch.service';
import { TerminalController } from './terminals/terminal.controller';

// Controllers
import { BiometricsController } from './biometrics.controller';

const SHARED_QUEUE_OPTIONS = {
  settings: {
    lockDuration: 30_000,
    stalledInterval: 30_000,
    maxStalledCount: 2,
  },
};

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => IntegrationsModule),
    forwardRef(() => ApprovalsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => PlatformModule),
    registerQueues(
      {
        name: PUNCH_INGESTION_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { count: 1_000 },
          removeOnFail: false,
        },
        ...SHARED_QUEUE_OPTIONS,
      },
      {
        name: BIOMETRIC_SYNC_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 100 },
        },
        ...SHARED_QUEUE_OPTIONS,
      },
    ),
  ],
  controllers: [BiometricsController, TerminalController],
  providers: [
    // Core engine
    AttendanceEngineService,

    // Hardening services
    PunchFingerprintService,
    AttendanceAuditService,
    ServiceApiKeyService,
    AttendanceCorrectionsService,
    QueueHealthService,
    ShiftCacheService,
    OfflineBufferService,

    // WebSocket gateway
    BiometricsGateway,

    // Queue processors — require a real Bull connection
    ...(isRedisEnabled() ? [PunchIngestionProcessor, BiometricSyncProcessor] : []),

    // Sync pipeline (Phases 3–5)
    SyncCursorService,
    EasyTimeProSyncAdapter,

    // Device registry (Phase 6)
    BiometricDeviceService,

    // Normalization
    VerifyMethodNormalizerService,

    // Trusted terminal system (Phases 7–8)
    AttendanceTerminalService,
    TerminalAuthGuard,
    TerminalPunchService,

    // Provider registry + providers
    ProviderRegistryService,
    ZktecoProvider,
    EasyTimeProProvider,
    EasyTimeProScheduler,
  ],
  exports: [
    AttendanceEngineService,
    ProviderRegistryService,
    AttendanceAuditService,
    BiometricsGateway,
    SyncCursorService,
    BiometricDeviceService,
    AttendanceTerminalService,
  ],
})
export class BiometricsModule {}
