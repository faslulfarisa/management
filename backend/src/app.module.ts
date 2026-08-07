import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { isRedisEnabled, getRedisConnectionOptions } from './config/redis.config';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { HrModule } from './modules/hr/hr.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GstModule } from './modules/gst/gst.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BillingModule } from './modules/billing/billing.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { BiometricsModule } from './modules/biometrics/biometrics.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationRegistrationModule } from './modules/organization-registration/organization-registration.module';
import { OperationsModule } from './modules/operations/operations.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ExitManagementModule } from './modules/exit-management/exit-management.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FinesModule } from './modules/fines/fines.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { HistoricalAttendanceImportModule } from './modules/historical-attendance-import/historical-attendance-import.module';
import { ExportModule } from './modules/export/export.module';
import { ImportModule } from './modules/import/import.module';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './shared/health/health.module';
import { LoggingInterceptor } from './middleware/logging.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    ...(isRedisEnabled()
      ? [BullModule.forRoot({ redis: getRedisConnectionOptions() })]
      : []),
    SharedModule,
    HealthModule,
    AuthModule,
    PlatformModule,
    OperationsModule,
    HrModule,
    FinanceModule,
    GstModule,
    DashboardModule,
    BillingModule,
    IntegrationsModule,
    BiometricsModule,
    ApprovalsModule,
    NotificationsModule,
    OrganizationRegistrationModule,
    RecruitmentModule,
    ExitManagementModule,
    AssetsModule,
    ReportsModule,
    FinesModule,
    ComplianceModule,
    HistoricalAttendanceImportModule,
    ExportModule,
    ImportModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {
  private readonly logger = new Logger(AppModule.name);

  constructor() {
    if (isRedisEnabled()) {
      this.logger.log('Redis enabled - Bull queues and Redis-backed caching are active.');
    } else {
      this.logger.warn('Redis disabled - running without queue processing.');
    }
  }
}
