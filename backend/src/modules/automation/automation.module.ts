import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { AutomationController } from './controllers/automation.controller';
import { AutomationService } from './services/automation.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => PlatformModule)],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
