import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsController } from './controllers/integrations.controller';
import { ZktecoController } from './controllers/zkteco.controller';
import { IntegrationsService } from './services/integrations.service';
import { ZktecoService } from './services/zkteco.service';
import { SharedModule } from '../../shared/shared.module';

// BiometricsModule provides AttendanceEngineService which ZktecoController now needs.
// Use forwardRef to avoid circular dependency.
import { BiometricsModule } from '../biometrics/biometrics.module';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => BiometricsModule),
  ],
  controllers: [IntegrationsController, ZktecoController],
  providers: [IntegrationsService, ZktecoService],
  exports: [IntegrationsService, ZktecoService],
})
export class IntegrationsModule {}
