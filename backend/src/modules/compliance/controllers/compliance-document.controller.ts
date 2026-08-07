import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put,
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
import { AuthorizationService } from '../../platform/services/authorization.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { ComplianceDocumentService } from '../services/compliance-document.service';
import { ComplianceApprovalService } from '../services/compliance-approval.service';
import {
  ApproveDocumentDto, CreateComplianceDocumentDto, RejectDocumentDto, RestoreVersionDto,
  UpdateComplianceDocumentDto, UploadVersionDto,
} from '../dto/compliance-document.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/documents')
export class ComplianceDocumentController {
  constructor(
    private readonly documents: ComplianceDocumentService,
    private readonly approvals: ComplianceApprovalService,
    private readonly fileUpload: FileUploadService,
    private readonly authz: AuthorizationService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  private async assertCanManage(req: any, doc: { scope: string; employee_id?: string | null; owner_id?: string | null; created_by?: string | null }) {
    const user = req.user;
    if (user.sub === doc.owner_id || user.sub === doc.created_by) return;
    if (doc.scope === 'employee' && doc.employee_id && user.employeeId === doc.employee_id) return;
    const permission = doc.scope === 'company' ? PERMISSIONS.COMPLIANCE_COMPANY_DOCS_MANAGE : PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_MANAGE;
    if (await this.authz.can(user, permission)) return;
    throw new ForbiddenException('You do not have permission to manage this document');
  }

  // ── Raw file upload (separate from document metadata create/version calls) ──
  @Post('upload-file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadFile(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded — send a multipart/form-data request with field "file"');
    this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
    const { url, sizeBytes } = await this.fileUpload.uploadDocument(file.buffer, file.mimetype, 'compliance', tenantOf(req), file.originalname);
    return { success: true, data: { url, fileName: file.originalname, sizeBytes, mimeType: file.mimetype }, error: null };
  }

  @Get()
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const result = await this.documents.list(tenantOf(req), req.user, scope, {
      scope: query.scope, employeeId: query.employeeId, branchId: query.branchId, departmentId: query.departmentId,
      categoryId: query.categoryId, groupLabel: query.groupLabel, status: query.status,
      confidentialityLevel: query.confidentialityLevel, q: query.q, tag: query.tag,
      documentNumber: query.documentNumber, uploadedBy: query.uploadedBy,
      expiringWithinDays: query.expiringWithinDays ? parseInt(query.expiringWithinDays, 10) : undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
    return { success: true, data: result.data, total: result.total, error: null };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async findOne(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { success: true, data: await this.documents.findOne(id, tenantOf(req), req.user, scope), error: null };
  }

  @Get(':id/versions')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async listVersions(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    await this.documents.findOne(id, tenantOf(req), req.user, scope); // enforces visibility
    return { success: true, data: await this.documents.listVersions(id, tenantOf(req)), error: null };
  }

  @Get(':id/download')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async download(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { success: true, data: await this.documents.getDownloadUrl(id, tenantOf(req), req.user, scope), error: null };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateComplianceDocumentDto) {
    await this.assertCanManage(req, { scope: dto.scope, employee_id: dto.employee_id });
    return { success: true, data: await this.documents.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateComplianceDocumentDto) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.documents.update(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.documents.softDelete(id, tenantOf(req), req.user.sub), error: null };
  }

  @Post(':id/archive')
  async archive(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.documents.archive(id, tenantOf(req), req.user.sub), error: null };
  }

  @Post(':id/versions')
  async uploadVersion(@Req() req: any, @Param('id') id: string, @Body() dto: UploadVersionDto) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.documents.uploadVersion(id, tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/versions/restore')
  async restoreVersion(@Req() req: any, @Param('id') id: string, @Body() dto: RestoreVersionDto) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.documents.restoreVersion(id, tenantOf(req), req.user.sub, dto.version_number), error: null };
  }

  // ── Approval workflow (delegates to the shared ApprovalEngineService) ───
  @Post(':id/submit')
  async submit(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.approvals.submit(tenantOf(req), id, req.user.sub), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.COMPLIANCE_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveDocumentDto) {
    return {
      success: true,
      data: await this.approvals.approve(tenantOf(req), id, req.user.sub, dto.reason, dto.remarks, req.ip),
      error: null,
    };
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.COMPLIANCE_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() dto: RejectDocumentDto) {
    return { success: true, data: await this.approvals.reject(tenantOf(req), id, req.user.sub, dto.reason, req.ip), error: null };
  }

  @Post(':id/renewal')
  async requestRenewal(@Req() req: any, @Param('id') id: string, @Body() dto: UploadVersionDto) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const doc = await this.documents.findOne(id, tenantOf(req), req.user, scope);
    await this.assertCanManage(req, doc);
    return { success: true, data: await this.approvals.requestRenewal(tenantOf(req), id, req.user.sub, dto), error: null };
  }
}
