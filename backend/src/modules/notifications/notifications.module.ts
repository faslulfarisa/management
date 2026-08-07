import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationEmitterService } from './services/notification-emitter.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
    forwardRef(() => ApprovalsModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEmitterService],
  exports: [NotificationsService, NotificationEmitterService],
})
export class NotificationsModule {}
