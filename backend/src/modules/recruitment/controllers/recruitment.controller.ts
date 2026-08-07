import {
  BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards,
  UploadedFile, UseInterceptors, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { FileUploadService } from '../../../shared/file-upload.service';
import { DocumentService } from '../../platform/services/document.service';
import { RecruitmentService } from '../services/recruitment.service';
import { JobPublishingService } from '../services/job-publishing.service';
import { CandidateService } from '../services/candidate.service';
import { ApplicationService } from '../services/application.service';
import { RecruitmentDashboardService } from '../services/recruitment-dashboard.service';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Recruitment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment')
export class RecruitmentController {
  constructor(
    private readonly service: RecruitmentService,
    private readonly publishing: JobPublishingService,
    private readonly candidates: CandidateService,
    private readonly applications: ApplicationService,
    private readonly documents: DocumentService,
    private readonly fileUpload: FileUploadService,
    private readonly dashboard: RecruitmentDashboardService,
  ) {}

  private async assertCandidateDocument(docId: string, tenantId: string) {
    const doc = await this.documents.findOne(docId, tenantId);
    if (doc.entity_type !== 'candidate') throw new NotFoundException('Document not found');
    return doc;
  }

  @Get('jobs')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: 'List job postings' })
  async getJobPostings(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const jobs = await this.service.getJobPostings(tenantId, query);
    return { success: true, data: jobs, error: null };
  }

  @Post('jobs')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  @ApiOperation({ summary: 'Create job posting' })
  async createJobPosting(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const job = await this.service.createJobPosting(tenantId, user.sub, data);
    return { success: true, data: job, error: null };
  }

  @Put('jobs/:id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Update job posting' })
  async updateJobPosting(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const job = await this.service.updateJobPosting(id, tenantId, data);
    return { success: true, data: job, error: null };
  }

  @Delete('jobs/:id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Delete job posting' })
  async deleteJobPosting(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteJobPosting(id, tenantId);
    return { success: true, error: null };
  }

  // ── Publishing (provider-based; only 'career_portal' supported today) ──
  @Post('jobs/publish')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Publish an approved vacancy + job description to the Career Portal' })
  async publish(@Req() req: Request, @Body() body: { vacancy_id: string; job_description_id: string; provider?: string; visibility?: string; closes_at?: string }) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const posting = await this.publishing.publishFromVacancy(tenantId, body.vacancy_id, body.job_description_id, user.sub, {
      provider: body.provider, visibility: body.visibility, closesAt: body.closes_at,
    });
    return { success: true, data: posting, error: null };
  }

  @Post('jobs/:id/unpublish')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Unpublish a job posting (removes it from the Career Portal)' })
  async unpublish(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: await this.publishing.unpublish(tenantId, id), error: null };
  }

  @Post('jobs/:id/republish')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Republish a previously unpublished job posting' })
  async republish(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: await this.publishing.republish(tenantId, id), error: null };
  }

  @Get('jobs/:id/share')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: 'Get the public share link + QR code for a published job posting' })
  async share(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: await this.publishing.getShareInfo(tenantId, id), error: null };
  }

  @Get('candidates')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: 'List candidates' })
  async getCandidates(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.candidates.list(tenantId, {
      q: query.q, tag: query.tag, source: query.source,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get('candidates/:id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: 'Get candidate profile' })
  async getCandidate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    return { success: true, data: await this.candidates.findOne(id, tenantId), error: null };
  }

  @Get('candidates/:id/applications')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: "List a candidate's applications" })
  async getCandidateApplications(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const result = await this.applications.list(tenantId, { candidateId: id, limit: 100 });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Post('candidates')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  @ApiOperation({ summary: 'Add candidate (internal entry — walk-in/agency/manual)' })
  async createCandidate(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const { candidate } = await this.candidates.findOrCreateByContact(tenantId, { ...data, source: data.source || 'manual' }, user.sub);
    if (data.job_posting_id) {
      await this.applications.create(tenantId, {
        candidateId: candidate.id, jobPostingId: data.job_posting_id, source: data.source || 'manual',
        campaignId: data.campaign_id,
      });
    }
    return { success: true, data: candidate, error: null };
  }

  @Put('candidates/:id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Update candidate profile' })
  async updateCandidate(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const candidate = await this.candidates.update(id, tenantId, data);
    return { success: true, data: candidate, error: null };
  }

  @Delete('candidates/:id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiOperation({ summary: 'Delete candidate' })
  async deleteCandidate(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    await this.candidates.softDelete(id, tenantId);
    return { success: true, error: null };
  }

  // ── Resumes (reuses the generic documents table, same pattern as vacancy attachments) ──
  @Get('candidates/:id/resumes')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: "List a candidate's resumes (newest first = current)" })
  async listResumes(@Req() req: Request, @Param('id') id: string) {
    const data = await this.documents.findAll(tenantOf(req), 'candidate', id);
    return { success: true, data: data.filter((d: any) => d.document_type === 'resume'), error: null };
  }

  @Post('candidates/:id/resumes')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a new resume version for a candidate' })
  async uploadResume(@Req() req: Request, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded — send a multipart/form-data request with field "file"');
    const user = (req as any).user;
    const tenantId = tenantOf(req);
    this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
    const { url, sizeBytes } = await this.fileUpload.uploadDocument(file.buffer, file.mimetype, 'candidates', tenantId, file.originalname);
    const doc = await this.documents.create(tenantId, user.sub, {
      entity_type: 'candidate', entity_id: id, document_type: 'resume',
      name: file.originalname, file_url: url, file_size_bytes: sizeBytes, mime_type: file.mimetype,
    });
    return { success: true, data: doc, error: null };
  }

  @Get('candidates/resumes/:docId/download')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async downloadResume(@Req() req: Request, @Param('docId') docId: string) {
    const doc = await this.assertCandidateDocument(docId, tenantOf(req));
    return { success: true, data: { url: await this.fileUpload.getSignedDownloadUrl(doc.file_url) }, error: null };
  }

  @Delete('candidates/resumes/:docId')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async removeResume(@Req() req: Request, @Param('docId') docId: string) {
    await this.assertCandidateDocument(docId, tenantOf(req));
    return { success: true, data: await this.documents.remove(docId, tenantOf(req)), error: null };
  }

  // Interview endpoints moved to InterviewController (/recruitment/interviews)
  // in Phase 4 — rounds/panels/scorecards/permission-gating replace this
  // legacy ungated CRUD, same "rewire in place" treatment Phase 2/3 gave
  // jobs/candidates.

  @Get('stats')
  @ApiOperation({ summary: 'Recruitment stats' })
  async getStats(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const stats = await this.service.getStats(tenantId);
    return { success: true, data: stats, error: null };
  }

  @Get('dashboard')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  @ApiOperation({ summary: 'Recruitment KPI dashboard — vacancies, pipeline, interviews, offers, joining schedule, workload, funnel, recent activity' })
  async getDashboard(@Req() req: Request, @Query('branch_id') branchId?: string) {
    const tenantId = tenantOf(req);
    return { success: true, data: await this.dashboard.getOverview(tenantId, branchId), error: null };
  }
}
