import {
  Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { PayrollService } from '../services/payroll.service';
import { AttendanceSummaryService, ManualAttendanceSummaryAdjustment } from '../services/attendance-summary.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { PayrollLockService, SummaryScope } from '../../platform/services/payroll-lock.service';
import { NotificationEmitterService } from '../../notifications/services/notification-emitter.service';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly service: PayrollService,
    private readonly summaryService: AttendanceSummaryService,
    private readonly payrollLock: PayrollLockService,
    private readonly userHierarchyService: UserHierarchyService,
    private readonly notifications: NotificationEmitterService,
  ) {}

  // ── Salary Structure ─────────────────────────────────────────────────────────

  @Get('structure/:employee_id')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'Get employee salary structure' })
  async getSalaryStructure(@Req() req: Request, @Param('employee_id') employeeId: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const structure = await this.service.getSalaryStructure(tenantId, employeeId);
    return { success: true, data: structure, error: null };
  }

  @Post('structure')
  @RequirePermission(PERMISSIONS.PAYROLL_EDIT)
  @ApiOperation({ summary: 'Set salary structure' })
  async setSalaryStructure(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const structure = await this.service.setSalaryStructure(tenantId, data);
    return { success: true, data: structure, error: null };
  }

  // ── Payroll Runs ─────────────────────────────────────────────────────────────

  @Get('runs')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'List payroll runs' })
  async getPayrollRuns(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const runs = await this.service.getPayrollRuns(tenantId, query);
    return { success: true, data: runs, error: null };
  }

  @Post('runs')
  @RequirePermission(PERMISSIONS.PAYROLL_CREATE, 'branch_id')
  @ApiOperation({ summary: 'Create payroll run' })
  async createPayrollRun(@Req() req: Request, @Body() data: { month: number; year: number; branch_id?: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const run = await this.service.createPayrollRun(tenantId, data.month, data.year, data.branch_id);
    return { success: true, data: run, error: null };
  }

  @Post('runs/generate')
  @RequirePermission(PERMISSIONS.PAYROLL_CREATE, 'branch_id')
  @ApiOperation({
    summary: 'Generate payslips for a month (prorated against approved attendance summary if present)',
  })
  async generatePayslips(@Req() req: Request, @Body() data: { month: number; year: number; branch_id?: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.id ?? user.sub ?? null;
    const requestId = (req as any).headers?.['x-request-id'] ?? null;
    const payslips = await this.service.generatePayslips(tenantId, data.month, data.year, data.branch_id, userId, requestId);
    return { success: true, data: payslips, error: null };
  }

  @Post('runs/:id/process')
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'Process payroll run (mark all payslips as processed)' })
  @ApiParam({ name: 'id', description: 'Payroll run UUID' })
  async processPayrollRun(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const run = await this.service.processPayrollRun(id, tenantId, user.sub);
    return { success: true, data: run, error: null };
  }

  // ── Payslips ─────────────────────────────────────────────────────────────────

  @Get('payslips')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'List payslips with optional filters' })
  async getPayslips(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const payslips = await this.service.getPayslips(tenantId, { ...query, accessScope });
    return { success: true, data: payslips, error: null };
  }

  @Post('payslips/:id/pay')
  @RequirePermission(PERMISSIONS.PAYROLL_PROCESS_PAYMENT)
  @ApiOperation({ summary: 'Mark payslip as paid (legacy endpoint — creates a cash payment record)' })
  @ApiParam({ name: 'id', description: 'Payslip UUID' })
  async markPaid(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.sub || user.id;
    const payslip = await this.service.markPaid(id, tenantId, userId);
    return { success: true, data: payslip, error: null };
  }

  // ── Attendance Summary & Payroll Lock Workflow ───────────────────────────────

  @Get('attendance-summary')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'List attendance summaries for a payroll period, with filters' })
  async listAttendanceSummaries(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.summaryService.listSummaries(
      tenantId,
      parseInt(query.year ?? new Date().getFullYear().toString(), 10),
      parseInt(query.month ?? (new Date().getMonth() + 1).toString(), 10),
      {
        branch_id: query.branch_id, department_id: query.department_id, employee_id: query.employee_id,
        status: query.status, leave_type: query.leave_type, attendance_state: query.attendance_state,
        search: query.search, accessScope,
      },
    );
    return { success: true, data, error: null };
  }

  @Get('attendance-summary/kpis')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'Dashboard KPI cards for the Attendance Summary module' })
  async getAttendanceSummaryKpis(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const data = await this.summaryService.getKpis(
      tenantId,
      parseInt(query.year ?? new Date().getFullYear().toString(), 10),
      parseInt(query.month ?? (new Date().getMonth() + 1).toString(), 10),
      { branch_id: query.branch_id, department_id: query.department_id, accessScope },
    );
    return { success: true, data, error: null };
  }

  @Get('attendance-summary/:id/versions')
  @RequirePermission(PERMISSIONS.PAYROLL_VIEW)
  @ApiOperation({ summary: 'Generation/version history for a single attendance summary' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async getAttendanceSummaryVersions(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const data = await this.summaryService.getVersions(tenantId, id);
    return { success: true, data, error: null };
  }

  @Post('attendance-summary/compute')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_EDIT, 'branch_id')
  @ApiOperation({
    summary: 'Compute/recompute attendance summaries for a scope (organization/branch/department/employees/employee). Skips locked/processed summaries.',
  })
  async computeAttendanceSummaries(
    @Req() req: Request,
    @Body() body: { month: number; year: number; scope?: SummaryScope; branch_id?: string },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.id ?? user.sub ?? null;
    const scope: SummaryScope = body.scope ?? { type: 'organization' };
    let result: Awaited<ReturnType<AttendanceSummaryService['compute']>>;

    try {
      result = await this.summaryService.compute(tenantId, body.year, body.month, scope, userId);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message
          ? `Attendance summaries could not be computed: ${err.message}`
          : 'Attendance summaries could not be computed. Check payroll prerequisites and try again.',
      );
    }

    await this.notifications.emit(tenantId, {
      title: 'Attendance Summary Generated',
      message: `Attendance summaries computed for ${body.month}/${body.year} (${result.computed} updated, ${result.skippedLocked} locked/skipped).`,
      type: 'info', priority: 'medium', sourceModule: 'payroll',
      entityType: 'attendance_summary', branchId: scope.branchId, departmentId: scope.departmentId,
    }).catch(() => {});

    return { success: true, data: result, error: null };
  }

  @Post('attendance-summary/:id/recompute')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_EDIT)
  @ApiOperation({ summary: 'Recompute a single attendance summary (bumps generation_version if values changed)' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async recomputeAttendanceSummary(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.id ?? user.sub ?? 'unknown';
    const data = await this.summaryService.recompute(tenantId, id, userId);
    return { success: true, data, error: null };
  }

  @Put('attendance-summary/:id/manual-adjustment')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_EDIT)
  @ApiOperation({ summary: 'Manually edit attendance summary day/hour figures for review' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async manuallyAdjustAttendanceSummary(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { adjustments?: ManualAttendanceSummaryAdjustment },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.id ?? user.sub ?? 'unknown';
    const data = await this.summaryService.applyManualAdjustment(tenantId, id, userId, body?.adjustments ?? {});

    await this.notifications.emit(tenantId, {
      title: 'Attendance Summary Manually Adjusted',
      message: `Attendance summary for ${data.period_start} – ${data.period_end} was manually adjusted and is pending review.`,
      type: 'info', priority: 'medium', sourceModule: 'payroll',
      entityType: 'attendance_summary', entityId: id, branchId: data.branch_id ?? undefined, departmentId: data.department_id ?? undefined,
    }).catch(() => {});

    return { success: true, data, error: null };
  }

  @Put('attendance-summary/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'Approve an attendance summary (manager gate)' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async approveSummary(@Req() req: Request, @Param('id') id: string, @Body() body: { notes?: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const approvedBy = user.id ?? user.sub ?? 'unknown';
    const data = await this.summaryService.approve(tenantId, id, approvedBy, body?.notes);

    await this.notifications.emit(tenantId, {
      title: 'Attendance Summary Approved',
      message: `Attendance summary for ${data.period_start} – ${data.period_end} was approved.`,
      type: 'success', priority: 'medium', sourceModule: 'payroll',
      entityType: 'attendance_summary', entityId: id, branchId: data.branch_id ?? undefined, departmentId: data.department_id ?? undefined,
    }).catch(() => {});

    return { success: true, data, error: null };
  }

  @Put('attendance-summary/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'Reject an attendance summary (requires a reason)' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async rejectSummary(@Req() req: Request, @Param('id') id: string, @Body() body: { reason: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const rejectedBy = user.id ?? user.sub ?? 'unknown';
    const data = await this.summaryService.reject(tenantId, id, rejectedBy, body?.reason);

    await this.notifications.emit(tenantId, {
      title: 'Attendance Summary Rejected',
      message: `Attendance summary for ${data.period_start} – ${data.period_end} was rejected: ${body?.reason}`,
      type: 'warning', priority: 'high', sourceModule: 'payroll',
      entityType: 'attendance_summary', entityId: id, branchId: data.branch_id ?? undefined, departmentId: data.department_id ?? undefined,
    }).catch(() => {});

    return { success: true, data, error: null };
  }

  @Put('attendance-summary/:id/request-correction')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_APPROVE)
  @ApiOperation({ summary: 'Send an attendance summary back to Draft pending a correction' })
  @ApiParam({ name: 'id', description: 'payroll_attendance_summary UUID' })
  async requestCorrection(@Req() req: Request, @Param('id') id: string, @Body() body: { notes: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const userId = user.id ?? user.sub ?? 'unknown';
    const data = await this.summaryService.requestCorrection(tenantId, id, userId, body?.notes);

    await this.notifications.emit(tenantId, {
      title: 'Attendance Correction Requested',
      message: `A correction was requested for ${data.period_start} – ${data.period_end}: ${body?.notes}`,
      type: 'warning', priority: 'medium', sourceModule: 'payroll',
      entityType: 'attendance_summary', entityId: id, branchId: data.branch_id ?? undefined, departmentId: data.department_id ?? undefined,
    }).catch(() => {});

    return { success: true, data, error: null };
  }

  @Post('attendance-summary/lock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_LOCK, 'branch_id')
  @ApiOperation({
    summary: 'Lock approved attendance summaries for a scope (organization/branch/department/employees). Blocked if Draft/Pending Review summaries remain.',
  })
  async lockAttendanceSummaries(
    @Req() req: Request,
    @Body() body: { month: number; year: number; scope?: SummaryScope; reason: string; branch_id?: string },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const lockedBy = user.id ?? user.sub ?? 'unknown';
    const scope: SummaryScope = body.scope ?? { type: 'organization' };
    const data = await this.payrollLock.lock(tenantId, body.year, body.month, scope, lockedBy, body.reason);

    await this.notifications.emit(tenantId, {
      title: 'Payroll Locked',
      message: `${data.locked} attendance summary(ies) for ${body.month}/${body.year} were locked for payroll. Reason: ${body.reason}`,
      type: 'info', priority: 'high', sourceModule: 'payroll',
      entityType: 'attendance_summary', branchId: scope.branchId, departmentId: scope.departmentId,
    }).catch(() => {});

    return { success: true, data, error: null };
  }

  @Post('attendance-summary/unlock')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PERMISSIONS.PAYROLL_UNLOCK)
  @ApiOperation({ summary: 'Reopen locked/processed attendance summaries (requires a reason)' })
  async unlockAttendanceSummaries(
    @Req() req: Request,
    @Body() body: { summaryIds: string[]; reason: string },
  ) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const unlockedBy = user.id ?? user.sub ?? 'unknown';
    const data = await this.payrollLock.unlock(tenantId, body.summaryIds, unlockedBy, body.reason);

    await this.notifications.emit(tenantId, {
      title: 'Payroll Unlocked',
      message: `${data.unlocked} attendance summary(ies) were reopened. Reason: ${body.reason}`,
      type: 'warning', priority: 'high', sourceModule: 'payroll', entityType: 'attendance_summary',
    }).catch(() => {});

    return { success: true, data, error: null };
  }
}
