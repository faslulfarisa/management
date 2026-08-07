import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { HrModule } from '../hr/hr.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssetsModule } from '../assets/assets.module';

import { ExitManagementController } from './controllers/exit-management.controller';
import { ExitSelfServiceController } from './controllers/exit-self-service.controller';
import { ExitManagerController } from './controllers/exit-manager.controller';

import { ExitTimelineService } from './services/exit-timeline.service';
import { ExitChecklistService } from './services/exit-checklist.service';
import { ExitClearanceService } from './services/exit-clearance.service';
import { ExitKnowledgeTransferService } from './services/exit-knowledge-transfer.service';
import { ExitInterviewService } from './services/exit-interview.service';
import { ExitRequestService } from './services/exit-request.service';
import { ExitOffboardingOrchestratorService } from './services/exit-offboarding-orchestrator.service';
import { FinalSettlementService } from './services/final-settlement.service';
import { ExitDocumentService } from './services/exit-document.service';
import { ExitDashboardService } from './services/exit-dashboard.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    PlatformModule,
    HrModule,
    ApprovalsModule,
    NotificationsModule,
    AssetsModule,
  ],
  controllers: [ExitManagementController, ExitSelfServiceController, ExitManagerController],
  providers: [
    ExitTimelineService,
    ExitChecklistService,
    ExitClearanceService,
    ExitKnowledgeTransferService,
    ExitInterviewService,
    ExitRequestService,
    ExitOffboardingOrchestratorService,
    FinalSettlementService,
    ExitDocumentService,
    ExitDashboardService,
  ],
  exports: [ExitRequestService, FinalSettlementService],
})
export class ExitManagementModule {}
