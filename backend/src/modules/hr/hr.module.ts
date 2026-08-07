import { Module, forwardRef } from '@nestjs/common';
import { isRedisEnabled } from '../../config/redis.config';
import { registerQueues } from '../../shared/queue/queue.utils';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';
import { BiometricsModule } from '../biometrics/biometrics.module';
import { EmployeeController } from './controllers/employee.controller';
import { EmployeeService } from './services/employee.service';
import { AttendanceController } from './controllers/attendance.controller';
import { AttendanceService } from './services/attendance.service';
import { ShiftController } from './controllers/shift.controller';
import { ShiftService } from './services/shift.service';
import { LeaveController } from './controllers/leave.controller';
import { LeaveService } from './services/leave.service';
import { PayrollController } from './controllers/payroll.controller';
import { PayrollService } from './services/payroll.service';
import { PerformanceController } from './controllers/performance.controller';
import { PerformanceService } from './services/performance.service';
import { AttendancePerformanceController } from './controllers/attendance-performance.controller';
import { AttendanceBehaviourConfigService } from './services/attendance-behaviour-config.service';
import { AttendanceBehaviourEngineService } from './services/attendance-behaviour-engine.service';
import { PerformanceScoreEngineService } from './services/performance-score-engine.service';
import { AttendanceSummaryService } from './services/attendance-summary.service';
import { BusinessDaysService } from './services/business-days.service';
import { BankAccountService } from './services/bank-account.service';
import { BankDetailsValidationService } from './services/bank-details-validation.service';
import { PayrollPaymentService } from './services/payroll-payment.service';
import { RazorpayGatewayService } from './gateways/razorpay-gateway.service';
import { BankAccountController, PayrollBankValidationController } from './controllers/bank-account.controller';
import { PayrollPaymentController } from './controllers/payroll-payment.controller';
import { RazorpayWebhookController } from './controllers/razorpay-webhook.controller';
import { PayslipController } from './controllers/payslip.controller';
import { PayslipService } from './services/payslip.service';
import { PAYROLL_PAYOUT_QUEUE } from './queue/payroll-payout.types';
import { PayrollPayoutProcessor } from './queue/payroll-payout.processor';
import { OvertimeController } from './controllers/overtime.controller';
import { OvertimeService } from './services/overtime.service';
import { BreakSessionService } from './services/break-session.service';
import { BreakMonitorService } from './services/break-monitor.service';
import { ShiftOverrideController } from './controllers/shift-override.controller';
import { ShiftOverrideService } from './services/shift-override.service';
import { TaskController } from './controllers/task.controller';
import { TaskService } from './services/task.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => PlatformModule),
    forwardRef(() => ApprovalsModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => BillingModule),
    forwardRef(() => BiometricsModule),
    registerQueues({
      name: PAYROLL_PAYOUT_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      },
      settings: {
        lockDuration: 60_000,
        stalledInterval: 30_000,
        maxStalledCount: 2,
      },
    }),
  ],
  controllers: [
    EmployeeController, AttendanceController, ShiftController, LeaveController,
    PayrollController, PerformanceController,
    AttendancePerformanceController,
    BankAccountController, PayrollBankValidationController,
    PayrollPaymentController,
    RazorpayWebhookController,
    PayslipController,
    OvertimeController,
    ShiftOverrideController,
    TaskController,
  ],
  providers: [
    EmployeeService, AttendanceService, ShiftService, LeaveService,
    PayrollService, PerformanceService,
    AttendanceSummaryService, BusinessDaysService,
    AttendanceBehaviourConfigService, AttendanceBehaviourEngineService, PerformanceScoreEngineService,
    BankAccountService, BankDetailsValidationService,
    PayrollPaymentService,
    RazorpayGatewayService,
    // Queue processor — requires a real Bull connection
    ...(isRedisEnabled() ? [PayrollPayoutProcessor] : []),
    PayslipService,
    OvertimeService,
    BreakSessionService,
    BreakMonitorService,
    ShiftOverrideService,
    TaskService,
  ],
  exports: [
    EmployeeService, AttendanceService, ShiftService, LeaveService,
    PayrollService, PerformanceService,
    AttendanceSummaryService, BusinessDaysService,
    AttendanceBehaviourConfigService, AttendanceBehaviourEngineService, PerformanceScoreEngineService,
    BankAccountService, BankDetailsValidationService,
    PayrollPaymentService,
    RazorpayGatewayService,
    PayslipService,
    OvertimeService,
    BreakSessionService,
    ShiftOverrideService,
  ],
})
export class HrModule { }
