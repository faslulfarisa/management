import {
  Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { OvertimeService } from '../services/overtime.service';
import { CreateOtRequestDto, OtRequestFiltersDto } from '../dto/overtime.dto';

@ApiTags('Overtime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('overtime')
export class OvertimeController {
  constructor(private readonly service: OvertimeService) {}

  @Get('eligibility/:employee_id')
  @ApiOperation({ summary: 'Check OT eligibility for an employee' })
  @ApiParam({ name: 'employee_id', description: 'Employee UUID' })
  async checkEligibility(@Req() req: Request, @Param('employee_id') employeeId: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.service.checkEligibility(tenantId, employeeId);
    return { success: true, data: result, error: null };
  }

  @Post('requests')
  @ApiOperation({ summary: 'Submit an overtime request' })
  async createRequest(@Req() req: Request, @Body() body: CreateOtRequestDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const submittedBy = user.sub || user.id;
    const data = await this.service.createRequest(tenantId, body, submittedBy);
    return { success: true, data, error: null };
  }

  @Get('requests')
  @ApiOperation({ summary: 'List overtime requests (admin/manager view)' })
  async getRequests(@Req() req: Request, @Query() query: OtRequestFiltersDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.service.getRequests(tenantId, query);
    return { success: true, ...result, error: null };
  }

  @Get('requests/my')
  @ApiOperation({ summary: 'Get my OT request history' })
  async getMyRequests(@Req() req: Request, @Query() query: OtRequestFiltersDto) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const employeeId: string = user.employeeId || user.employee_id;
    if (!employeeId) return { success: true, data: [], total: 0, error: null };
    const result = await this.service.getMyRequests(tenantId, employeeId, query);
    return { success: true, ...result, error: null };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'OT analytics: costs, approvals, branch breakdown' })
  async getAnalytics(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const data = await this.service.getAnalytics(tenantId, query);
    return { success: true, data, error: null };
  }

  @Get('requests/:id')
  @ApiOperation({ summary: 'Get OT request detail with approval timeline' })
  @ApiParam({ name: 'id', description: 'OT request UUID' })
  async getRequestDetail(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const data = await this.service.getRequestDetail(id, tenantId);
    return { success: true, data, error: null };
  }

  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an OT request (pending/under_review only)' })
  @ApiParam({ name: 'id', description: 'OT request UUID' })
  async cancelRequest(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const cancelledBy = user.sub || user.id;
    const data = await this.service.cancelRequest(id, tenantId, cancelledBy);
    return { success: true, data, error: null };
  }
}
