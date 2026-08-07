import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { PlatformModule } from '../platform/platform.module';
import { SharedModule } from '../../shared/shared.module';

import { FinesController } from './controllers/fines.controller';
import { DeductionCategoriesController } from './controllers/deduction-categories.controller';
import { FinesService } from './services/fines.service';
import { DeductionCategoriesService } from './services/deduction-categories.service';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ApprovalsModule),
    forwardRef(() => PlatformModule),
  ],
  controllers: [DeductionCategoriesController, FinesController],
  providers: [FinesService, DeductionCategoriesService],
  exports: [FinesService, DeductionCategoriesService],
})
export class FinesModule {}
