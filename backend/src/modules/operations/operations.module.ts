import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { OrganizationOpsController } from './controllers/organization-ops.controller';
import { OperationsDashboardController } from './controllers/operations-dashboard.controller';
import { OperationsReportsController } from './controllers/operations-reports.controller';
import { InternalStaffController } from './controllers/internal-staff.controller';
import { OrganizationLifecycleService } from './services/organization-lifecycle.service';
import { InternalStaffService } from './services/internal-staff.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => PlatformModule)],
  controllers: [OrganizationOpsController, OperationsDashboardController, OperationsReportsController, InternalStaffController],
  providers: [OrganizationLifecycleService, InternalStaffService],
})
export class OperationsModule {}
