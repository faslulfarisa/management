import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { HierarchyGuard } from '../../auth/guards/hierarchy.guard';
import { RequireUserType } from '../../auth/decorators/user-type.decorator';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { FileUploadService } from '../../../shared/file-upload.service';
import { OrganizationChangeRequestService } from '../services/organization-change-request.service';
import { CreateChangeRequestDto, TransitionChangeRequestDto } from '../dto/organization-change-request.dto';

@ApiTags('Organization Change Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization-change-requests')
export class OrganizationChangeRequestController {
  constructor(
    private readonly changeRequestService: OrganizationChangeRequestService,
    private readonly fileUpload: FileUploadService,
  ) {}

  @Post()
  @UseGuards(ActiveOrgGuard, HierarchyGuard)
  @RequireUserType('org_admin')
  @ApiOperation({ summary: 'Request a change to a protected organization field (org admin only, own organization)' })
  async create(@Req() req: Request, @Body() dto: CreateChangeRequestDto) {
    const user = (req as any).user;
    const data = await this.changeRequestService.create(user.tenantId, user.sub, dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    return { success: true, data, meta: null, error: null };
  }

  @Get()
  @UseGuards(ActiveOrgGuard, HierarchyGuard)
  @RequireUserType('org_admin')
  @ApiOperation({ summary: "List the calling org admin's own change requests" })
  async listMine(@Req() req: Request) {
    const user = (req as any).user;
    const data = await this.changeRequestService.listForTenant(user.tenantId);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/supporting-documents/upload')
  @UseGuards(ActiveOrgGuard, HierarchyGuard)
  @RequireUserType('org_admin')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a document for a change request follow-up' })
  async uploadSupportingDocument(@Req() req: Request, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded — send a multipart/form-data request with field "file"');
    const user = (req as any).user;
    await this.changeRequestService.assertRequesterCanRespond(id, user.tenantId, user.sub);
    this.fileUpload.validateDocumentFile(file.buffer, file.mimetype);
    const { url, sizeBytes } = await this.fileUpload.uploadDocument(
      file.buffer,
      file.mimetype,
      'organization-change-requests',
      user.tenantId,
      file.originalname,
    );
    return {
      success: true,
      data: { url, fileName: file.originalname, sizeBytes, mimeType: file.mimetype },
      meta: null,
      error: null,
    };
  }

  @Post(':id/respond')
  @UseGuards(ActiveOrgGuard, HierarchyGuard)
  @RequireUserType('org_admin')
  @ApiOperation({ summary: 'Respond to an organization change request that needs documents or extra information' })
  async respond(@Req() req: Request, @Param('id') id: string, @Body() body: { notes?: string; documents?: any[] }) {
    const user = (req as any).user;
    const data = await this.changeRequestService.respondToDocumentsRequest(id, user.tenantId, user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    return { success: true, data, meta: null, error: null };
  }

  @Get('admin')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'List all organizations\' change requests (Internal Operations Portal)' })
  async listAll(@Query('status') status?: string) {
    const data = await this.changeRequestService.listAll(status);
    return { success: true, data, meta: null, error: null };
  }

  @Get('admin/:id')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Get one change request (Internal Operations Portal)' })
  async getOne(@Param('id') id: string) {
    const data = await this.changeRequestService.getOne(id);
    return { success: true, data, meta: null, error: null };
  }

  @Post('admin/:id/transition')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Approve, reject, or request documents for a change request (Internal Operations Portal)' })
  async transition(@Req() req: Request, @Param('id') id: string, @Body() dto: TransitionChangeRequestDto) {
    const user = (req as any).user;
    const data = await this.changeRequestService.transition(id, dto, user.sub, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    return { success: true, data, meta: null, error: null };
  }

  @Post('admin/:id/fulfill')
  @UseGuards(InternalStaffGuard, OpsPermissionGuard)
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Mark an additional organization request fulfilled after creating its organization' })
  async fulfill(@Req() req: Request, @Param('id') id: string, @Body() body: { createdTenantId: string }) {
    const user = (req as any).user;
    const data = await this.changeRequestService.fulfillAdditionalOrganizationRequest(id, body.createdTenantId, user.sub, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });
    return { success: true, data, meta: null, error: null };
  }
}
