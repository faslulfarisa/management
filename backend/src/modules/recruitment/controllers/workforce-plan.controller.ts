import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { WorkforcePlanService } from '../services/workforce-plan.service';
import { WorkforcePlanApprovalService } from '../services/workforce-plan-approval.service';
import {
  ApproveWorkforcePlanDto, CreateWorkforcePlanDto, RejectWorkforcePlanDto, UpdateWorkforcePlanDto,
} from '../dto/workforce-plan.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Workforce Planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/workforce-plans')
export class WorkforcePlanController {
  constructor(
    private readonly plans: WorkforcePlanService,
    private readonly approvals: WorkforcePlanApprovalService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const result = await this.plans.list(tenantOf(req), scope, {
      status: query.status, branch_id: query.branch_id,
      year: query.year ? parseInt(query.year, 10) : undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.plans.findOne(id, tenantOf(req)), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateWorkforcePlanDto) {
    return { success: true, data: await this.plans.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWorkforcePlanDto) {
    return { success: true, data: await this.plans.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.plans.softDelete(id, tenantOf(req)), error: null };
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async submit(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveWorkforcePlanDto) {
    return { success: true, data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip), error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectWorkforcePlanDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }

  @Post(':id/close')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CLOSE)
  async close(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.plans.close(id, tenantOf(req)), error: null };
  }
}
