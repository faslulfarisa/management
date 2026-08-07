import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { SharedModule } from '../../shared/shared.module';
import { ReportsController } from './reports.controller';
import { AttendanceReportsService } from './services/attendance-reports.service';
import { HrReportsService } from './services/hr-reports.service';
import { PayrollReportsService } from './services/payroll-reports.service';
import { FinanceReportsService } from './services/finance-reports.service';
import { LeaveReportsService } from './services/leave-reports.service';
import { ShiftReportsService } from './services/shift-reports.service';
import { BiometricReportsService } from './services/biometric-reports.service';
import { BranchReportsService } from './services/branch-reports.service';
import { OperationalAnalyticsService } from './services/operational-analytics.service';
import { SavedReportsService } from './services/saved-reports.service';
import { PerformanceReportsService } from './services/performance-reports.service';
import { RecruitmentReportsService } from './services/recruitment-reports.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => PlatformModule), SharedModule],
  controllers: [ReportsController],
  providers: [
    AttendanceReportsService,
    HrReportsService,
    PayrollReportsService,
    FinanceReportsService,
    LeaveReportsService,
    ShiftReportsService,
    BiometricReportsService,
    BranchReportsService,
    OperationalAnalyticsService,
    SavedReportsService,
    PerformanceReportsService,
    RecruitmentReportsService,
  ],
})
export class ReportsModule {}
