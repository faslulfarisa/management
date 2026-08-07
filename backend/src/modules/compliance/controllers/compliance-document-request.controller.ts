import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ComplianceDocumentRequestService } from '../services/compliance-document-request.service';
import { CreateDocumentRequestDto, DecideDocumentRequestDto, FulfilDocumentRequestDto } from '../dto/compliance-document-request.dto';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Document Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/document-requests')
export class ComplianceDocumentRequestController {
  constructor(private readonly requests: ComplianceDocumentRequestService) {}

  @Get()
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    // Employees implicitly see only their own requests; HR/admin can filter by any employeeId.
    const employeeId = query.employeeId ?? req.user.employeeId;
    return { success: true, data: await this.requests.list(tenantOf(req), { employeeId, status: query.status }), error: null };
  }

  @Post()
  @RequirePermission(PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_MANAGE)
  async create(@Req() req: any, @Body() dto: CreateDocumentRequestDto) {
    return { success: true, data: await this.requests.create(tenantOf(req), req.user.sub, dto), error: null };
  }

  @Post(':id/fulfil')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_VIEW_OWN)
  async fulfil(@Req() req: any, @Param('id') id: string, @Body() dto: FulfilDocumentRequestDto) {
    return { success: true, data: await this.requests.fulfil(id, tenantOf(req), req.user.employeeId, dto.document_id), error: null };
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_MANAGE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() dto: DecideDocumentRequestDto) {
    return { success: true, data: await this.requests.decide(id, tenantOf(req), req.user.sub, true, dto.remarks), error: null };
  }

  @Post(':id/request-resubmission')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EMPLOYEE_DOCS_MANAGE)
  async requestResubmission(@Req() req: any, @Param('id') id: string, @Body() dto: DecideDocumentRequestDto) {
    return { success: true, data: await this.requests.decide(id, tenantOf(req), req.user.sub, false, dto.remarks), error: null };
  }
}
