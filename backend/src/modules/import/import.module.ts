import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ImportController } from './import.controller';
import { ImportParserService } from './import-parser.service';
import { ImportRegistryService } from './import-registry.service';
import { ImportService } from './import.service';
import { registerAllImportConfigs } from './import-registrations';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportParserService, ImportRegistryService],
  exports: [ImportRegistryService],
})
export class ImportModule implements OnModuleInit {
  constructor(private readonly registry: ImportRegistryService) {}

  onModuleInit() {
    registerAllImportConfigs(this.registry);
  }
}
