import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ProbationService } from '../services/probation.service';
import { ProbationApprovalService } from '../services/probation-approval.service';
import {
  AddGoalDto, AddReviewEntryDto, ApproveProbationDto, CreateProbationReviewDto,
  RejectProbationDto, SetRecommendationDto,
} from '../dto/probation.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Probation Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/probation-reviews')
export class ProbationController {
  constructor(
    private readonly probation: ProbationService,
    private readonly approvals: ProbationApprovalService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.probation.list(tenantOf(req), {
      employeeId: query.employee_id, status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.probation.findOne(id, tenantOf(req)), error: null };
  }

  @Get('by-employee/:employeeId')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findByEmployee(@Req() req: any, @Param('employeeId') employeeId: string) {
    return { success: true, data: await this.probation.findByEmployee(employeeId, tenantOf(req)), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateProbationReviewDto) {
    return { success: true, data: await this.probation.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.probation.softDelete(id, tenantOf(req)), error: null };
  }

  @Post(':id/goals')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async addGoal(@Req() req: any, @Param('id') id: string, @Body() dto: AddGoalDto) {
    return { success: true, data: await this.probation.addGoal(id, tenantOf(req), dto, req.user.sub), error: null };
  }

  @Post(':id/review-entries')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async addReviewEntry(@Req() req: any, @Param('id') id: string, @Body() dto: AddReviewEntryDto) {
    return { success: true, data: await this.probation.addReviewEntry(id, tenantOf(req), dto, req.user.sub), error: null };
  }

  @Put(':id/recommendation')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async setRecommendation(@Req() req: any, @Param('id') id: string, @Body() dto: SetRecommendationDto) {
    return { success: true, data: await this.probation.setRecommendation(id, tenantOf(req), dto, req.user.sub), error: null };
  }

  // ── Approval workflow ────────────────────────────────────────────────
  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async submit(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveProbationDto) {
    return { success: true, data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip), error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectProbationDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }
}
