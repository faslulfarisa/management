import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RegistrationController } from './controllers/registration.controller';
import { OrganizationApprovalController } from './controllers/organization-approval.controller';
import { OrganizationChangeRequestController } from './controllers/organization-change-request.controller';
import { RegistrationService } from './services/registration.service';
import { OrganizationApprovalService } from './services/organization-approval.service';
import { OrganizationChangeRequestService } from './services/organization-change-request.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [RegistrationController, OrganizationApprovalController, OrganizationChangeRequestController],
  providers: [RegistrationService, OrganizationApprovalService, OrganizationChangeRequestService],
  exports: [OrganizationChangeRequestService],
})
export class OrganizationRegistrationModule {}
