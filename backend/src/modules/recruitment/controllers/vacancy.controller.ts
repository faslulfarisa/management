import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put,
  Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { FileUploadService } from '../../../shared/file-upload.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { DocumentService } from '../../platform/services/document.service';
import { VacancyService } from '../services/vacancy.service';
import { VacancyApprovalService } from '../services/vacancy-approval.service';
import { VacancyCommentService } from '../services/vacancy-comment.service';
import {
  AddVacancyCommentDto, ApproveVacancyDto, ArchiveVacancyDto, CloseVacancyDto,
  CreateVacancyDto, RejectVacancyDto, ReopenVacancyDto, UpdateVacancyDto,
} from '../dto/vacancy.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Vacancies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('recruitment/vacancies')
export class VacancyController {
  constructor(
    private readonly vacancies: VacancyService,
    private readonly approvals: VacancyApprovalService,
    private readonly comments: VacancyCommentService,
    private readonly documents: DocumentService,
    private readonly fileUpload: FileUploadService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  private async assertVacancyAttachment(id: string, tenantId: string) {
    const doc = await this.documents.findOne(id, tenantId);
    if (doc.entity_type !== 'vacancy') throw new NotFoundException('Attachment not found');
    return doc;
  }

  // ── Raw file upload (separate from attachment metadata create call) ──
  @Post('upload-file')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadFile(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded — send a multipart/form-data request with field "file"');
    this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
    const { url, sizeBytes } = await this.fileUpload.uploadDocument(file.buffer, file.mimetype, 'recruitment', tenantOf(req), file.originalname);
    return { success: true, data: { url, fileName: file.originalname, sizeBytes, mimeType: file.mimetype }, error: null };
  }

  @Get()
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const result = await this.vacancies.list(tenantOf(req), scope, {
      q: query.q, status: query.status, branch_id: query.branch_id, department_id: query.department_id,
      employment_type_id: query.employment_type_id, recruiter_id: query.recruiter_id, hiring_manager_id: query.hiring_manager_id,
      includeArchived: query.includeArchived === 'true',
      sortBy: query.sortBy, sortDir: query.sortDir === 'asc' ? 'asc' : 'desc',
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.vacancies.findOne(id, tenantOf(req)), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateVacancyDto) {
    return { success: true, data: await this.vacancies.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateVacancyDto) {
    return { success: true, data: await this.vacancies.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async remove(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.vacancies.softDelete(id, tenantOf(req)), error: null };
  }

  // ── Approval workflow (delegates to the shared ApprovalEngineService) ──
  @Post(':id/submit')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CREATE)
  async submit(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveVacancyDto) {
    return { success: true, data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip), error: null };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.RECRUITMENT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectVacancyDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }

  // ── Post-approval lifecycle ──
  @Post(':id/close')
  @RequirePermission(PERMISSIONS.RECRUITMENT_CLOSE)
  async close(@Req() req: any, @Param('id') id: string, @Body() dto: CloseVacancyDto) {
    return { success: true, data: await this.vacancies.close(id, tenantOf(req), req.user.sub, dto.reason), error: null };
  }

  @Post(':id/reopen')
  @RequirePermission(PERMISSIONS.RECRUITMENT_REOPEN)
  async reopen(@Req() req: any, @Param('id') id: string, @Body() dto: ReopenVacancyDto) {
    return { success: true, data: await this.vacancies.reopen(id, tenantOf(req), req.user.sub, dto.reason), error: null };
  }

  @Post(':id/archive')
  @RequirePermission(PERMISSIONS.RECRUITMENT_ARCHIVE)
  async archive(@Req() req: any, @Param('id') id: string, @Body() dto: ArchiveVacancyDto) {
    return { success: true, data: await this.vacancies.archive(id, tenantOf(req), req.user.sub, dto.reason), error: null };
  }

  @Get(':id/history')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async history(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.vacancies.getStatusHistory(id, tenantOf(req)), error: null };
  }

  // ── Comments ──
  @Get(':id/comments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listComments(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.comments.list(id, tenantOf(req)), error: null };
  }

  @Post(':id/comments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_COMMENT)
  async addComment(@Req() req: any, @Param('id') id: string, @Body() dto: AddVacancyCommentDto) {
    return { success: true, data: await this.comments.add(id, tenantOf(req), req.user.sub, dto.comment), error: null };
  }

  @Delete('comments/:commentId')
  @RequirePermission(PERMISSIONS.RECRUITMENT_COMMENT)
  async removeComment(@Req() req: any, @Param('commentId') commentId: string) {
    return { success: true, data: await this.comments.softDelete(commentId, tenantOf(req), req.user.sub), error: null };
  }

  // ── Attachments (delegates to the existing generic DocumentService) ──
  @Get(':id/attachments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async listAttachments(@Req() req: any, @Param('id') id: string) {
    return { success: true, data: await this.documents.findAll(tenantOf(req), 'vacancy', id), error: null };
  }

  @Post(':id/attachments')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async addAttachment(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const data = {
      entity_type: 'vacancy', entity_id: id,
      document_type: body.document_type || 'attachment',
      name: body.name || body.fileName,
      file_url: body.file_url || body.url,
      file_size_bytes: body.file_size_bytes ?? body.sizeBytes,
      mime_type: body.mime_type ?? body.mimeType,
    };
    if (!data.name || !data.file_url) throw new BadRequestException('name and file_url are required');
    return { success: true, data: await this.documents.create(tenantOf(req), req.user.sub, data), error: null };
  }

  @Get('attachments/:docId/download')
  @RequirePermission(PERMISSIONS.RECRUITMENT_VIEW)
  async downloadAttachment(@Req() req: any, @Param('docId') docId: string) {
    const doc = await this.assertVacancyAttachment(docId, tenantOf(req));
    return { success: true, data: { url: await this.fileUpload.getSignedDownloadUrl(doc.file_url) }, error: null };
  }

  @Delete('attachments/:docId')
  @RequirePermission(PERMISSIONS.RECRUITMENT_EDIT)
  async removeAttachment(@Req() req: any, @Param('docId') docId: string) {
    await this.assertVacancyAttachment(docId, tenantOf(req));
    return { success: true, data: await this.documents.remove(docId, tenantOf(req)), error: null };
  }
}
