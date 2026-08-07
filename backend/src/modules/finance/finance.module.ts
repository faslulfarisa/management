import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { FinanceController } from './controllers/finance.controller';
import { FinanceService } from './services/finance.service';
import { VendorController } from './controllers/vendor.controller';
import { VendorService } from './services/vendor.service';

@Module({
  imports: [forwardRef(() => AuthModule), PlatformModule, forwardRef(() => ApprovalsModule)],
  controllers: [FinanceController, VendorController],
  providers: [FinanceService, VendorService],
  exports: [FinanceService, VendorService],
})
export class FinanceModule {}
