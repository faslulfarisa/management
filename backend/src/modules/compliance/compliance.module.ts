import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { ComplianceCategoryController } from './controllers/compliance-category.controller';
import { ComplianceDocumentController } from './controllers/compliance-document.controller';
import { ComplianceTrackerController } from './controllers/compliance-tracker.controller';
import { CompliancePolicyController } from './controllers/compliance-policy.controller';
import { ComplianceDocumentRequestController } from './controllers/compliance-document-request.controller';
import { ComplianceDashboardController } from './controllers/compliance-dashboard.controller';
import { ComplianceReportController } from './controllers/compliance-report.controller';

import { ComplianceCategoryService } from './services/compliance-category.service';
import { ComplianceDocumentService } from './services/compliance-document.service';
import { ComplianceApprovalService } from './services/compliance-approval.service';
import { ComplianceExpiryService } from './services/compliance-expiry.service';
import { ComplianceTrackerService } from './services/compliance-tracker.service';
import { CompliancePolicyService } from './services/compliance-policy.service';
import { ComplianceDocumentRequestService } from './services/compliance-document-request.service';
import { ComplianceDashboardService } from './services/compliance-dashboard.service';
import { ComplianceReportService } from './services/compliance-report.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    PlatformModule,
    ApprovalsModule,
    NotificationsModule,
  ],
  controllers: [
    ComplianceCategoryController,
    ComplianceDocumentController,
    ComplianceTrackerController,
    CompliancePolicyController,
    ComplianceDocumentRequestController,
    ComplianceDashboardController,
    ComplianceReportController,
  ],
  providers: [
    ComplianceCategoryService,
    ComplianceDocumentService,
    ComplianceApprovalService,
    ComplianceExpiryService,
    ComplianceTrackerService,
    CompliancePolicyService,
    ComplianceDocumentRequestService,
    ComplianceDashboardService,
    ComplianceReportService,
  ],
  exports: [ComplianceDocumentService, ComplianceTrackerService],
})
export class ComplianceModule {}
