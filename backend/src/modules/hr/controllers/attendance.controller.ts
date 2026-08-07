import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AttendanceService } from '../services/attendance.service';
import { BreakSessionService } from '../services/break-session.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly breakSessionService: BreakSessionService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get('breaks/active')
  @RequirePermission(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'List employees currently on a break (manager/HR monitoring)' })
  async getActiveBreaks(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const breaks = await this.breakSessionService.getActiveBreaksForTenant(tenantId, { branch_id: query.branch_id });
    return { success: true, data: breaks, error: null };
  }

  @Get('breaks/violations')
  @RequirePermission(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'List overdue/violation break sessions for a date range' })
  async getBreakViolations(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const violations = await this.breakSessionService.getViolations(tenantId, {
      date_from: query.date_from,
      date_to: query.date_to,
      employee_id: query.employee_id,
      branch_id: query.branch_id,
    });
    return { success: true, data: violations, error: null };
  }

  @Get()
  @RequirePermission(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'List attendance records' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const result = await this.service.findAll(tenantId, { ...query, accessScope });
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Post('clock-in')
  @ApiOperation({ summary: 'Clock in' })
  async clockIn(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const record = await this.service.clockIn(tenantId, employeeId, data);
    return { success: true, data: record, error: null };
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out' })
  async clockOut(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const record = await this.service.clockOut(tenantId, employeeId);
    return { success: true, data: record, error: null };
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today attendance status' })
  async getToday(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const record = await this.service.getTodayStatus(tenantId, employeeId);
    return { success: true, data: record, error: null };
  }

  @Get('summary')
  @RequirePermission(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'Attendance summary' })
  async getSummary(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const summary = await this.service.getSummary(tenantId, query);
    return { success: true, data: summary, error: null };
  }

  @Get('requests')
  @RequirePermission(PERMISSIONS.ATTENDANCE_VIEW)
  @ApiOperation({ summary: 'List attendance requests' })
  async getRequests(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const requests = await this.service.getRequests(tenantId, query);
    return { success: true, data: requests, error: null };
  }

  @Post('requests')
  @ApiOperation({ summary: 'Create attendance request' })
  async createRequest(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const request = await this.service.createRequest(tenantId, employeeId, data);
    return { success: true, data: request, error: null };
  }

  @Post('requests/:id/approve')
  @RequirePermission(PERMISSIONS.ATTENDANCE_APPROVE)
  @ApiOperation({ summary: 'Approve attendance request' })
  async approveRequest(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.approveRequest(id, tenantId, user.sub);
    return { success: true, data: request, error: null };
  }

  @Post('requests/:id/reject')
  @RequirePermission(PERMISSIONS.ATTENDANCE_APPROVE)
  @ApiOperation({ summary: 'Reject attendance request' })
  async rejectRequest(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.rejectRequest(id, tenantId, data?.reason);
    return { success: true, data: request, error: null };
  }
}
