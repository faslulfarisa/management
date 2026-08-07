import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportRegistryService } from './export-registry.service';
import { registerAllExportConfigs } from './export-registrations';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportRegistryService],
  exports: [ExportRegistryService],
})
export class ExportModule implements OnModuleInit {
  constructor(private readonly registry: ExportRegistryService) {}

  onModuleInit() {
    registerAllExportConfigs(this.registry);
  }
}
