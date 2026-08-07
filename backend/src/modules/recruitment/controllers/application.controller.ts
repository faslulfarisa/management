import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ApplicationService } from '../services/application.service';
import { ScreeningService } from '../services/screening.service';
import { AssessmentService } from '../services/assessment.service';
import { EvaluationService } from '../services/evaluation.service';
import { CommunicationService } from '../services/communication.service';
import { VerificationService } from '../services/verification.service';
import { PreboardingService } from '../services/preboarding.service';
import { EmployeeConversionService } from '../services/employee-conversion.service';
import {
  CreateAssessmentDto, CreateEvaluationDto, MoveApplicationStageDto, SendCommunicationDto,
  UpdateAssessmentDto, UpsertScreeningDto,
} from '../dto/pipeline.dto';
import { UpsertVerificationDto } from '../dto/verification.dto';
import { UpdateJoiningDateDto, UpdatePreboardingItemDto } from '../dto/preboarding.dto';
import { ConvertToEmployeeDto } from '../dto/employee-conversion.dto';
import { SetApplicationCampaignDto } from '../dto/campaign.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/applications')
export class ApplicationController {
  constructor(
    private readonly applications: ApplicationService,
    private readonly screenings: ScreeningService,
    private readonly assessments: AssessmentService,
    private readonly evaluations: EvaluationService,
    private readonly communication: CommunicationService,
    private readonly verifications: VerificationService,
    private readonly preboarding: PreboardingService,
    private readonly conversion: EmployeeConversionService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const result = await this.applications.list(tenantOf(req), {
      q: query.q, candidateId: query.candidate_id, jobPostingId: query.job_posting_id, vacancyId: query.vacancy_id,
      status: query.status, stageId: query.stage_id, campaignId: query.campaign_id,
      eligibleForOffer: query.eligible_for_offer === 'true',
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.applications.findOne(id, tenantOf(req)), error: null };
  }

  @Post(':id/status')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string; rejection_reason?: string }) {
    return { success: true, data: await this.applications.updateStatus(id, tenantOf(req), req.user.sub, body.status, body.rejection_reason), error: null };
  }

  @Put(':id/campaign')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async setCampaign(@Req() req: any, @Param('id') id: string, @Body() body: SetApplicationCampaignDto) {
    return { success: true, data: await this.applications.setCampaign(id, tenantOf(req), body.campaign_id ?? null), error: null };
  }

  // ── Pipeline stage transitions ────────────────────────────────────────
  @Post(':id/stage')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async moveStage(@Req() req: any, @Param('id') id: string, @Body() dto: MoveApplicationStageDto) {
    return { success: true, data: await this.applications.moveStage(id, tenantOf(req), req.user.sub, dto.to_stage_id, dto.comment), error: null };
  }

  @Get(':id/stage-history')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async stageHistory(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.applications.getStageHistory(id, tenantOf(req)), error: null };
  }

  // ── HR Screening ───────────────────────────────────────────────────────
  @Get(':id/screening')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async getScreening(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.screenings.get(id, tenantOf(req)), error: null };
  }

  @Put(':id/screening')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async upsertScreening(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertScreeningDto) {
    return { success: true, data: await this.screenings.upsert(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Assessments ────────────────────────────────────────────────────────
  @Get(':id/assessments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listAssessments(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.assessments.list(id, tenantOf(req)), error: null };
  }

  @Post(':id/assessments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async createAssessment(@Req() req: any, @Param('id') id: string, @Body() dto: CreateAssessmentDto) {
    return { success: true, data: await this.assessments.create(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put('assessments/:assessmentId')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async updateAssessment(@Req() req: any, @Param('assessmentId') assessmentId: string, @Body() dto: UpdateAssessmentDto) {
    return { success: true, data: await this.assessments.update(assessmentId, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Evaluations ────────────────────────────────────────────────────────
  @Get(':id/evaluations')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listEvaluations(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.evaluations.list(id, tenantOf(req)), error: null };
  }

  @Post(':id/evaluations')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async createEvaluation(@Req() req: any, @Param('id') id: string, @Body() dto: CreateEvaluationDto) {
    return { success: true, data: await this.evaluations.create(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Verification ───────────────────────────────────────────────────────
  @Get(':id/verifications')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listVerifications(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.verifications.list(id, tenantOf(req)), error: null };
  }

  @Put(':id/verifications')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async upsertVerification(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertVerificationDto) {
    return { success: true, data: await this.verifications.upsert(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Candidate communication ────────────────────────────────────────────
  @Get(':id/communications')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listCommunications(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.communication.listForApplication(id, tenantOf(req)), error: null };
  }

  @Post(':id/communications')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async sendCommunication(@Req() req: any, @Param('id') id: string, @Body() dto: SendCommunicationDto) {
    return { success: true, data: await this.communication.send(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  // ── Preboarding ────────────────────────────────────────────────────────
  @Get(':id/preboarding')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async getPreboarding(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.preboarding.getForApplication(id, tenantOf(req)), error: null };
  }

  @Put(':id/preboarding/items/:key')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async updatePreboardingItem(@Req() req: any, @Param('id') id: string, @Param('key') key: string, @Body() dto: UpdatePreboardingItemDto) {
    return { success: true, data: await this.preboarding.updateItem(id, tenantOf(req), key, dto, req.user.sub), error: null };
  }

  @Put(':id/preboarding/joining-date')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async updateJoiningDate(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateJoiningDateDto) {
    return { success: true, data: await this.preboarding.updateJoiningDate(id, tenantOf(req), dto.joining_date, req.user.sub), error: null };
  }

  @Post(':id/preboarding/welcome-email')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async sendWelcomeEmail(@Req() req: any, @Param('id') id: string, @Body() body: { subject: string; body: string }) {
    return { success: true, data: await this.preboarding.sendWelcomeCommunication(id, tenantOf(req), req.user.sub, body.subject, body.body), error: null };
  }

  @Get(':id/preboarding/documents')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listPreboardingDocuments(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.preboarding.listDocuments(id, tenantOf(req)), error: null };
  }

  // ── Employee Conversion ──────────────────────────────────────────────
  @Get(':id/conversion-preview')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async getConversionPreview(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.conversion.getPreview(id, tenantOf(req)), error: null };
  }

  @Post(':id/convert')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async convertToEmployee(@Req() req: any, @Param('id') id: string, @Body() dto: ConvertToEmployeeDto) {
    return { success: true, data: await this.conversion.convert(id, tenantOf(req), req.user.sub, dto), error: null };
  }
}
