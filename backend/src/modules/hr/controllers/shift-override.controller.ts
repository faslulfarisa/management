import { Controller, Get, Post, Param, Body, Query, Req, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ShiftOverrideService } from '../services/shift-override.service';
import { CreateShiftOverrideRequestDto, ApproveShiftOverrideRequestDto } from '../dto/shift-override.dto';

@ApiTags('Shift Overrides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('shift-overrides')
export class ShiftOverrideController {
  constructor(private readonly service: ShiftOverrideService) {}

  @Post()
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_CREATE)
  @ApiOperation({ summary: 'Submit a new shift override request' })
  async submitRequest(@Req() req: any, @Body() data: CreateShiftOverrideRequestDto) {
    const { tenantId, sub: userId, employeeId, employee_id } = req.user;
    const result = await this.service.submitRequest(tenantId, userId, employeeId || employee_id, data);
    return { success: true, data: result, error: null };
  }

  @Get()
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_VIEW)
  @ApiOperation({ summary: 'List shift override requests with filters' })
  async getRequests(@Req() req: any, @Query() query: any) {
    const { tenantId } = req.user;
    const result = await this.service.getRequests(tenantId, query);
    return { success: true, data: result, error: null };
  }

  @Get('me')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_VIEW)
  @ApiOperation({ summary: 'Get own shift override requests' })
  async getOwnRequests(@Req() req: any, @Query() query: any) {
    const { tenantId, sub: userId, employeeId } = req.user;
    const filterEmpId = employeeId || query.employee_id;
    const result = await this.service.getRequests(tenantId, { ...query, employee_id: filterEmpId });
    return { success: true, data: result, error: null };
  }

  @Get('validate-replacement')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_APPROVE)
  @ApiOperation({ summary: 'Validate availability of replacement employee' })
  async validateReplacement(@Req() req: any, @Query() query: any) {
    const { tenantId } = req.user;
    const result = await this.service.validateReplacementEmployee(
      tenantId,
      query.replacement_id,
      query.start_date,
      query.end_date,
    );
    return { success: true, data: result, error: null };
  }

  @Get('statistics')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_VIEW)
  @ApiOperation({ summary: 'Get shift override dashboard reporting statistics' })
  async getStatistics(@Req() req: any) {
    const { tenantId } = req.user;
    const result = await this.service.getStatistics(tenantId);
    return { success: true, data: result, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_VIEW)
  @ApiOperation({ summary: 'Get a single shift override request by ID' })
  async getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const { tenantId } = req.user;
    const result = await this.service.getById(id, tenantId);
    return { success: true, data: result, error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_APPROVE)
  @ApiOperation({ summary: 'Apply manager action and approve override request' })
  async approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() body: ApproveShiftOverrideRequestDto,
  ) {
    const { tenantId, sub: userId } = req.user;
    const result = await this.service.actionAndApprove(id, tenantId, userId, body);
    return { success: true, data: result, error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_APPROVE)
  @ApiOperation({ summary: 'Reject shift override request' })
  async rejectRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() body: { reason: string },
  ) {
    const { tenantId, sub: userId } = req.user;
    const result = await this.service.rejectRequest(id, tenantId, userId, body.reason);
    return { success: true, data: result, error: null };
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.SHIFT_OVERRIDE_VIEW)
  @ApiOperation({ summary: 'Cancel pending shift override request' })
  async cancelRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() body: { reason?: string },
  ) {
    const { tenantId, sub: userId } = req.user;
    const result = await this.service.cancelRequest(id, tenantId, userId, body.reason);
    return { success: true, data: result, error: null };
  }
}

