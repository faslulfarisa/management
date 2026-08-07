import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { CredentialEncryptionService } from './crypto/credential-encryption.service';
import { RedisProvider } from './redis.provider';
import { BiometricsMetricsService } from './metrics/biometrics-metrics.service';
import { FileUploadService } from './file-upload.service';
import { BrandingEngineService } from './branding-engine.service';
import { PermissionsCacheService } from './permissions-cache.service';

@Global()
@Module({
  providers: [
    DatabaseService, CredentialEncryptionService, RedisProvider,
    BiometricsMetricsService, FileUploadService, BrandingEngineService,
    PermissionsCacheService,
  ],
  exports: [
    DatabaseService, CredentialEncryptionService, RedisProvider,
    BiometricsMetricsService, FileUploadService, BrandingEngineService,
    PermissionsCacheService,
  ],
})
export class SharedModule {}
