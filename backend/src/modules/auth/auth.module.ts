import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AccountProfileService } from './account-profile.service';
import { AuthController } from './auth.controller';
import { EmailService } from './email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyOrJwtGuard } from './guards/api-key-or-jwt.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { OrgAdminGuard } from './guards/org-admin.guard';
import { ActiveOrgGuard } from './guards/active-org.guard';
import { HierarchyGuard } from './guards/hierarchy.guard';
import { PermissionGuard } from './guards/permission.guard';
import { FeatureAvailabilityGuard } from './guards/feature-availability.guard';
import { InternalStaffGuard } from './guards/internal-staff.guard';
import { OpsPermissionGuard } from './guards/ops-permission.guard';
import { PlatformModule } from '../platform/platform.module';
import { NotificationEmitterService } from '../notifications/services/notification-emitter.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '15m') },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => PlatformModule),
  ],
  controllers: [AuthController],
  // NotificationEmitterService is provided directly here (not via importing
  // NotificationsModule) because NotificationsModule transitively imports
  // ApprovalsModule, which imports AuthModule directly (no forwardRef) —
  // importing the whole module back into AuthModule creates an unresolvable
  // require-time cycle. The service itself only needs DatabaseService
  // (global, via SharedModule) and an optional ApprovalGateway for realtime
  // push, so a second DI instance here is harmless — it just won't push
  // over the websocket gateway for auth-originated notifications.
  providers: [AuthService, AccountProfileService, EmailService, LocalStrategy, JwtStrategy, JwtAuthGuard, ApiKeyOrJwtGuard, SuperAdminGuard, OrgAdminGuard, ActiveOrgGuard, HierarchyGuard, PermissionGuard, FeatureAvailabilityGuard, InternalStaffGuard, OpsPermissionGuard, NotificationEmitterService],
  exports: [AuthService, EmailService, JwtAuthGuard, ApiKeyOrJwtGuard, JwtModule, SuperAdminGuard, OrgAdminGuard, ActiveOrgGuard, HierarchyGuard, PermissionGuard, FeatureAvailabilityGuard, InternalStaffGuard, OpsPermissionGuard],
})
export class AuthModule {}
