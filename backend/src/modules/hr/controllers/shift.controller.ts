import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ShiftService } from '../services/shift.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';

@ApiTags('Shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('shifts')
export class ShiftController {
  constructor(
    private readonly service: ShiftService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get('definitions')
  @RequirePermission(PERMISSIONS.SCHEDULES_VIEW)
  @ApiOperation({ summary: 'List shift definitions' })
  async getShifts(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const shifts = await this.service.getShifts(tenantId);
    return { success: true, data: shifts, error: null };
  }

  @Post('definitions')
  @RequirePermission(PERMISSIONS.SCHEDULES_CREATE)
  @ApiOperation({ summary: 'Create shift definition' })
  async createShift(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const shift = await this.service.createShift(tenantId, data);
    return { success: true, data: shift, error: null };
  }

  @Put('definitions/:id')
  @RequirePermission(PERMISSIONS.SCHEDULES_EDIT)
  @ApiOperation({ summary: 'Update shift definition' })
  async updateShift(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const shift = await this.service.updateShift(id, tenantId, data);
    return { success: true, data: shift, error: null };
  }

  @Delete('definitions/:id')
  @RequirePermission(PERMISSIONS.SCHEDULES_DELETE)
  @ApiOperation({ summary: 'Deactivate shift definition' })
  async deleteShift(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteShift(id, tenantId);
    return { success: true, error: null };
  }

  @Get('assignments')
  @RequirePermission(PERMISSIONS.SCHEDULES_VIEW)
  @ApiOperation({ summary: 'List shift assignments' })
  async getAssignments(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const assignments = await this.service.getAssignments(tenantId, { ...query, accessScope });
    return { success: true, data: assignments, error: null };
  }

  @Post('assignments')
  @RequirePermission(PERMISSIONS.SCHEDULES_ASSIGN)
  @ApiOperation({ summary: 'Assign shift to employee' })
  async assignShift(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const assignment = await this.service.assignShift(tenantId, data, accessScope);
    return { success: true, data: assignment, error: null };
  }

  @Get('schedules')
  @RequirePermission(PERMISSIONS.SCHEDULES_VIEW)
  @ApiOperation({ summary: 'List shift schedules' })
  async getSchedules(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const schedules = await this.service.getSchedules(tenantId, { ...query, accessScope });
    return { success: true, data: schedules, error: null };
  }

  @Post('schedules')
  @RequirePermission(PERMISSIONS.SCHEDULES_ASSIGN)
  @ApiOperation({ summary: 'Create/update shift schedule' })
  async createSchedule(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const schedule = await this.service.createSchedule(tenantId, data, accessScope);
    return { success: true, data: schedule, error: null };
  }

  @Post('schedules/bulk')
  @RequirePermission(PERMISSIONS.SCHEDULES_ASSIGN)
  @ApiOperation({ summary: 'Bulk create shift schedules' })
  async bulkCreateSchedule(@Req() req: Request, @Body() data: { schedules: any[] }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const schedules = await this.service.bulkCreateSchedule(tenantId, data.schedules, accessScope);
    return { success: true, data: schedules, error: null };
  }
}
