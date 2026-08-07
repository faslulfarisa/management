import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { BillingModule } from '../billing/billing.module';
import { SharedModule } from '../../shared/shared.module';
import { OrganizationOpsController } from './controllers/organization-ops.controller';
import { OperationsDashboardController } from './controllers/operations-dashboard.controller';
import { OperationsReportsController } from './controllers/operations-reports.controller';
import { InternalStaffController } from './controllers/internal-staff.controller';
import { ClientUsersController } from './controllers/client-users.controller';
import { SubscriptionManagementController } from './controllers/subscription-management.controller';
import { SubscriptionInvoiceController } from './controllers/subscription-invoice.controller';
import { OrganizationFeatureManagementController } from './controllers/organization-feature-management.controller';
import { OrganizationLifecycleService } from './services/organization-lifecycle.service';
import { InternalStaffService } from './services/internal-staff.service';
import { ClientUserSearchService } from './services/client-user-search.service';
import { SubscriptionManagementService } from './services/subscription-management.service';
import { SubscriptionInvoiceService } from './services/subscription-invoice.service';
import { OrganizationFeatureManagementService } from './services/organization-feature-management.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => PlatformModule), forwardRef(() => BillingModule), SharedModule],
  controllers: [
    OrganizationOpsController,
    OperationsDashboardController,
    OperationsReportsController,
    InternalStaffController,
    ClientUsersController,
    SubscriptionManagementController,
    SubscriptionInvoiceController,
    OrganizationFeatureManagementController,
  ],
  providers: [
    OrganizationLifecycleService,
    InternalStaffService,
    ClientUserSearchService,
    SubscriptionManagementService,
    SubscriptionInvoiceService,
    OrganizationFeatureManagementService,
  ],
})
export class OperationsModule {}
