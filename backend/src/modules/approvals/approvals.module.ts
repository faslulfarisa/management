import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../../shared/shared.module';
import { PlatformModule } from '../platform/platform.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { ApprovalEngineService } from './services/approval-engine.service';
import { ApprovalNotificationService } from './services/approval-notification.service';
import { ApprovalGateway } from './gateways/approval.gateway';
import { ApprovalsController } from './controllers/approvals.controller';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [ApprovalsController],
  providers: [
    ApprovalEngineService,
    ApprovalNotificationService,
    ApprovalGateway,
  ],
  exports: [ApprovalEngineService, ApprovalGateway],
})
export class ApprovalsModule {}
