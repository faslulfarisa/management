import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, UseGuards, BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { EmployeeService } from '../services/employee.service';
import { AttendanceService } from '../services/attendance.service';
import { BreakSessionService } from '../services/break-session.service';
import { LeaveService } from '../services/leave.service';
import { ShiftService } from '../services/shift.service';
import { PayrollService } from '../services/payroll.service';
import { PayslipService } from '../services/payslip.service';
import { BankAccountService } from '../services/bank-account.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { getPunchOutReason } from '../constants/punch-out-reasons';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly service: EmployeeService,
    private readonly attendanceService: AttendanceService,
    private readonly breakSessionService: BreakSessionService,
    private readonly leaveService: LeaveService,
    private readonly shiftService: ShiftService,
    private readonly payrollService: PayrollService,
    private readonly payslipService: PayslipService,
    private readonly bankAccountService: BankAccountService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'List employees (paginated, filterable)' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const result = await this.service.findAll(tenantId, { ...query, accessScope });
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.EMPLOYEES_CREATE)
  @ApiOperation({ summary: 'Create employee' })
  async create(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = (user.isSuperAdmin && data.tenant_id)
      ? data.tenant_id
      : (user.tenantId || user.tenant_id);
    if (!tenantId) throw new BadRequestException('Organization context required — please select an organization first');
    const employee = await this.service.create(tenantId, user.sub, data);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Get('count')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Headcount summary by status' })
  async getCount(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const count = await this.service.getCount(tenantId);
    return { success: true, data: count, meta: null, error: null };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current employee profile' })
  async findMe(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    if (!user.employeeId) {
      const employee = await this.service.findMeByEmail(user.email, tenantId);
      return { success: true, data: employee, meta: null, error: null };
    }
    const employee = await this.service.findOne(user.employeeId, tenantId);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Get('me/attendance/today')
  @ApiOperation({ summary: 'Get current employee today attendance status' })
  async getMyTodayAttendance(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const record = await this.breakSessionService.getTodayStatus(tenantId, employeeId);
    return { success: true, data: record, error: null };
  }

  @Get('me/attendance/breaks/today')
  @ApiOperation({ summary: "Get today's break sessions and resolved break policy limits" })
  async getMyTodayBreaks(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const [breaks, limits] = await Promise.all([
      this.breakSessionService.getTodayBreaks(tenantId, employeeId),
      this.breakSessionService.getResolvedLimits(tenantId, employeeId),
    ]);
    return { success: true, data: { breaks, limits }, error: null };
  }

  @Post('me/attendance/punch')
  @ApiOperation({ summary: 'Clock in / Clock out (punch), with optional punch-out reason' })
  async myAttendancePunch(@Req() req: Request, @Body() body: { type: 'in' | 'out'; reason_code?: string; note?: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    let record;
    if (body.type === 'in') {
      const activeBreak = await this.breakSessionService.getActiveBreak(tenantId, employeeId);
      if (activeBreak) {
        record = await this.breakSessionService.endBreak(tenantId, employeeId);
      } else {
        await this.attendanceService.clockIn(tenantId, employeeId, {});
        record = await this.breakSessionService.getTodayStatus(tenantId, employeeId);
      }
    } else {
      const reason = getPunchOutReason(body.reason_code);
      if (reason && reason.category !== 'final_logout') {
        record = await this.breakSessionService.startBreak(tenantId, employeeId, body.reason_code!, body.note);
      } else {
        await this.attendanceService.clockOut(tenantId, employeeId, { reason_code: body.reason_code, note: body.note });
        record = await this.breakSessionService.getTodayStatus(tenantId, employeeId);
      }
    }
    return { success: true, data: record, error: null };
  }

  @Get('me/attendance')
  @ApiOperation({ summary: 'List current employee attendance records' })
  async getMyAttendanceHistory(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const result = await this.attendanceService.findAll(tenantId, { ...query, employee_id: employeeId });
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Get('me/attendance/summary')
  @ApiOperation({ summary: 'Current employee attendance summary' })
  async getMyAttendanceSummary(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const summary = await this.attendanceService.getSummary(tenantId, { ...query, employee_id: employeeId });
    return { success: true, data: summary, error: null };
  }

  @Get('me/leaves/balances')
  @ApiOperation({ summary: 'Current employee leave balances' })
  async getMyLeaveBalances(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const balances = await this.leaveService.getBalances(tenantId, employeeId);
    return { success: true, data: balances, error: null };
  }

  @Get('me/leaves/requests')
  @ApiOperation({ summary: 'Current employee leave requests history' })
  async getMyLeaveRequests(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const requests = await this.leaveService.getRequests(tenantId, { ...query, employee_id: employeeId });
    return { success: true, data: requests, error: null };
  }

  @Get('me/shifts/today')
  @ApiOperation({ summary: 'Current employee today shift' })
  async getMyTodayShift(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const row = await this.shiftService.getTodayShiftForEmployee(tenantId, employeeId);
    const shift = row ? {
      shift_name: row.shift_name,
      shift_code: row.shift_code,
      start_time: row.start_time,
      end_time: row.end_time,
      break_minutes: row.break_minutes,
      grace_period_minutes: row.grace_period_minutes,
    } : null;
    return { success: true, data: shift, error: null };
  }

  @Get('me/shifts/schedule')
  @ApiOperation({ summary: 'Current employee shift schedule' })
  async getMyShiftSchedule(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const schedule = await this.shiftService.getSchedules(tenantId, { ...query, employee_id: employeeId });
    return { success: true, data: schedule, error: null };
  }

  @Get('me/payslips')
  @ApiOperation({ summary: 'Current employee payslips history' })
  async getMyPayslips(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const payslips = await this.payrollService.getPayslips(tenantId, { ...query, employee_id: employeeId });
    return { success: true, data: payslips, error: null };
  }

  @Get('me/payslips/:id')
  @ApiOperation({ summary: 'Current employee payslip detail' })
  async getMyPayslipDetail(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const payslip = await this.payslipService.getPayslipDetail(tenantId, id, {
      employeeId,
      actorId: user.sub,
      actorType: 'employee',
      ipAddress: (req as any).ip,
    });
    return { success: true, data: payslip, error: null };
  }

  @Get('me/bank-accounts')
  @ApiOperation({ summary: 'Current employee bank accounts (masked, for salary credit info)' })
  async getMyBankAccounts(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const accounts = await this.bankAccountService.findByEmployee(tenantId, employeeId);
    return { success: true, data: accounts, error: null };
  }

  @Get('manager-select')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Lightweight tenant-scoped employee list for manager selection' })
  async findManagerCandidates(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.service.findManagerCandidates(tenantId, query);
    return { success: true, data: result, meta: null, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Get employee full profile' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.findOne(id, tenantId);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Update employee' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.update(id, tenantId, data, user.sub);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Get(':id/code-history')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Employee code change history' })
  async getCodeHistory(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const history = await this.service.getEmployeeCodeHistory(id, tenantId);
    return { success: true, data: history, meta: null, error: null };
  }

  @Patch(':id/status')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Update employee status (inline, with audit trail)' })
  async updateStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.updateStatus(id, tenantId, body.status, user.sub);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Get(':id/attendance-status')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Live biometric attendance status (on-demand, read-only)' })
  async getAttendanceStatus(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const status = await this.service.getAttendanceStatus(id, tenantId, user.sub, accessScope);
    return { success: true, data: status, meta: null, error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  @ApiOperation({ summary: 'Soft delete (deactivate) employee' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.remove(id, tenantId, { sub: user.sub });
    return { success: true, data: null, meta: null, error: null };
  }

  @Delete(':id/permanent')
  @RequirePermission(PERMISSIONS.EMPLOYEES_DELETE)
  @ApiOperation({ summary: 'Permanently remove an inactive employee (anonymize, retain protected records)' })
  async permanentDelete(@Req() req: Request, @Param('id') id: string, @Body() body: { deleteCategories?: string[]; confirm: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.service.permanentDelete(id, tenantId, body.deleteCategories ?? [], body.confirm, {
      sub: user.sub,
    });
    return { success: true, data: result, meta: null, error: null };
  }

  @Get(':id/lifecycle')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Employee lifecycle events' })
  async getLifecycle(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const events = await this.service.getLifecycle(id, tenantId);
    return { success: true, data: events, meta: null, error: null };
  }

  @Post(':id/transfer')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Transfer to dept/property' })
  async transfer(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.transfer(id, tenantId, data);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Post(':id/promote')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Promotion / designation change' })
  async promote(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.promote(id, tenantId, data);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Post(':id/confirm')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Confirm probation' })
  async confirm(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employee = await this.service.confirm(id, tenantId, data);
    return { success: true, data: employee, meta: null, error: null };
  }

  @Get(':id/documents')
  @RequirePermission(PERMISSIONS.EMPLOYEES_VIEW)
  @ApiOperation({ summary: 'Employee documents' })
  async getDocuments(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const docs = await this.service.getDocuments(id, tenantId);
    return { success: true, data: docs, meta: null, error: null };
  }

  @Post(':id/documents')
  @RequirePermission(PERMISSIONS.EMPLOYEES_EDIT)
  @ApiOperation({ summary: 'Add document to employee' })
  async addDocument(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const doc = await this.service.addDocument(id, tenantId, user.sub, body);
    return { success: true, data: doc, meta: null, error: null };
  }
}
