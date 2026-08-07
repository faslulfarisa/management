import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CredentialEncryptionService } from './crypto/credential-encryption.service';
import { RedisProvider } from './redis.provider';
import { BiometricsMetricsService } from './metrics/biometrics-metrics.service';
import { FileUploadService } from './file-upload.service';
import { BrandingEngineService } from './branding-engine.service';
import { PermissionsCacheService } from './permissions-cache.service';
import { FeatureAvailabilityService } from './feature-availability.service';
import { CurrencyService } from './currency.service';
import { SchedulerControlService } from './scheduler-control.service';

@Global()
@Module({
  providers: [
    DatabaseService, CredentialEncryptionService, RedisProvider,
    BiometricsMetricsService, FileUploadService, BrandingEngineService,
    PermissionsCacheService, FeatureAvailabilityService,
    CurrencyService, SchedulerControlService,
  ],
  exports: [
    DatabaseService, CredentialEncryptionService, RedisProvider,
    BiometricsMetricsService, FileUploadService, BrandingEngineService,
    PermissionsCacheService, FeatureAvailabilityService,
    CurrencyService, SchedulerControlService,
  ],
})
export class SharedModule {}
