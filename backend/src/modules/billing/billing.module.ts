import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../../shared/shared.module';
import { BillingController } from './controllers/billing.controller';
import { BillingService } from './services/billing.service';
import { BillingEngineService } from './services/billing-engine.service';

@Module({
  imports: [forwardRef(() => AuthModule), SharedModule],
  controllers: [BillingController],
  providers: [BillingService, BillingEngineService],
  exports: [BillingService, BillingEngineService],
})
export class BillingModule {}
