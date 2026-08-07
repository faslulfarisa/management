import {
  Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { LeaveService } from '../services/leave.service';
import { IsOptional, IsString } from 'class-validator';

export class GetLeaveTypesDto {
  @IsOptional()
  @IsString()
  employee_id?: string;

  @IsOptional()
  all?: any;
}

@ApiTags('Leaves')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('leaves')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Get('types')
  @ApiOperation({ summary: 'List leave types — pass employee_id to get gender-filtered results' })
  async getLeaveTypes(@Req() req: Request, @Query() query: GetLeaveTypesDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const resolvedEmployeeId = String(query.all) === 'true' ? undefined : (query.employee_id || user.employeeId || user.employee_id);
    const types = await this.service.getLeaveTypes(tenantId, resolvedEmployeeId);
    return { success: true, data: types, error: null };
  }


  @Get('balances')
  @ApiOperation({ summary: 'Leave balances' })
  async getBalances(@Req() req: Request, @Query('employee_id') employeeId?: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const balances = await this.service.getBalances(tenantId, employeeId);
    return { success: true, data: balances, error: null };
  }



  @Get('requests')
  @ApiOperation({ summary: 'List leave requests' })
  async getRequests(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const requests = await this.service.getRequests(tenantId, query);
    return { success: true, data: requests, error: null };
  }

  @Post('requests')
  @ApiOperation({ summary: 'Create leave request' })
  async createRequest(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = user.employeeId || user.employee_id;
    const request = await this.service.createRequest(tenantId, employeeId, data);
    return { success: true, data: request, error: null };
  }

  @Post('requests/:id/approve')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Approve leave request' })
  async approveRequest(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.approveRequest(id, tenantId, user.sub, body.reason);
    return { success: true, data: request, error: null };
  }

  @Post('requests/:id/reject')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Reject leave request' })
  async rejectRequest(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.rejectRequest(id, tenantId, user.sub, body.reason);
    return { success: true, data: request, error: null };
  }

  // ── Leave Encashment ──────────────────────────────────────────────────────────

  @Get('encashment')
  @ApiOperation({ summary: 'List leave encashment requests' })
  async getEncashmentRequests(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const requests = await this.service.getEncashmentRequests(tenantId, {
      employee_id: query.employee_id,
      status: query.status,
      year: query.year ? parseInt(query.year) : undefined,
    });
    return { success: true, data: requests, error: null };
  }

  @Post('encashment')
  @ApiOperation({ summary: 'Create leave encashment request' })
  async createEncashmentRequest(@Req() req: Request, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId = body.employee_id || user.employeeId || user.employee_id;
    const request = await this.service.createEncashmentRequest(tenantId, employeeId, {
      leave_type_id: body.leave_type_id,
      days: parseFloat(body.days),
      remarks: body.remarks,
    });
    return { success: true, data: request, error: null };
  }

  @Post('encashment/:id/approve')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Approve leave encashment request' })
  async approveEncashmentRequest(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.approveEncashmentRequest(id, tenantId, user.sub, body?.reason);
    return { success: true, data: request, error: null };
  }

  @Post('encashment/:id/reject')
  @RequirePermission(PERMISSIONS.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Reject leave encashment request' })
  async rejectEncashmentRequest(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const request = await this.service.rejectEncashmentRequest(id, tenantId, user.sub, body?.reason);
    return { success: true, data: request, error: null };
  }
}
