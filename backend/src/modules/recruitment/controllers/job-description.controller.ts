import {
  Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { JobDescriptionService } from '../services/job-description.service';
import { JobDescriptionApprovalService } from '../services/job-description-approval.service';
import {
  ApproveJobDescriptionDto, CreateJobDescriptionDto, RejectJobDescriptionDto, UpdateJobDescriptionDto,
} from '../dto/job-description.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Job Descriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/job-descriptions')
export class JobDescriptionController {
  constructor(
    private readonly jobDescriptions: JobDescriptionService,
    private readonly approvals: JobDescriptionApprovalService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.jobDescriptions.list(tenantOf(req), {
      q: query.q, status: query.status, vacancyId: query.vacancy_id,
      isTemplate: query.is_template === 'true' ? true : query.is_template === 'false' ? false : undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.jobDescriptions.findOne(id, tenantOf(req)), error: null };
  }

  @Get(':id/versions')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listVersions(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.jobDescriptions.listVersions(id, tenantOf(req)), error: null };
  }

  @Post(':id/versions/:versionNumber/restore')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async restoreVersion(@Req() req: any, @Param('id') id: string, @Param('versionNumber') versionNumber: string) {
    return { success: true, data: await this.jobDescriptions.restoreVersion(id, tenantOf(req), parseInt(versionNumber, 10), req.user.sub), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateJobDescriptionDto) {
    return { success: true, data: await this.jobDescriptions.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/duplicate')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async duplicate(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.jobDescriptions.duplicate(id, tenantOf(req), req.user.sub), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJobDescriptionDto) {
    return { success: true, data: await this.jobDescriptions.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.jobDescriptions.softDelete(id, tenantOf(req)), error: null };
  }

  @Post(':id/archive')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async archive(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.jobDescriptions.archive(id, tenantOf(req)), error: null };
  }

  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async submit(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveJobDescriptionDto) {
    return { success: true, data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip), error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectJobDescriptionDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }
}
