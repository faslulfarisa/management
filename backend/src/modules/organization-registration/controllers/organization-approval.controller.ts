import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { OrganizationApprovalService } from '../services/organization-approval.service';
import { TransitionApprovalDto } from '../dto/organization-approval.dto';

/**
 * Self-registration approval review — Internal Operations Portal only (Sales
 * staff with ORGANIZATIONS_MANAGE_LIFECYCLE, or Customer Success staff with
 * the same grant, or Platform Super Admin via OpsPermissionGuard's standing
 * bypass). Previously super-admin-only and surfaced in the regular admin
 * dashboard's Approvals page; that surface was removed since this is
 * organization handling, not org-admin self-service. As of Phase 2 of the
 * Platform/Customer separation, `is_super_admin` (customer hierarchy) no
 * longer reaches this — only `is_internal_staff` accounts can.
 */
@ApiTags('Organization Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('organization-approvals')
export class OrganizationApprovalController {
  constructor(private readonly approvalService: OrganizationApprovalService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'List organization registrations awaiting review' })
  async list(@Query('status') status?: string) {
    const data = await this.approvalService.listPending(status);
    return { success: true, data, meta: null, error: null };
  }

  @Get('stats')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Dashboard widget counts for registrations/approvals/change-requests' })
  async stats() {
    const data = await this.approvalService.getStats();
    return { success: true, data, meta: null, error: null };
  }

  @Get(':id')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Get full registration detail for one organization' })
  async getOne(@Param('id') id: string) {
    const data = await this.approvalService.getOne(id);
    return { success: true, data, meta: null, error: null };
  }

  @Post(':id/transition')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_MANAGE_LIFECYCLE)
  @ApiOperation({ summary: 'Approve, reject, request info, schedule a demo, or move to under-discussion' })
  async transition(@Req() req: Request, @Param('id') id: string, @Body() dto: TransitionApprovalDto) {
    const user = (req as any).user;
    const data = await this.approvalService.transition(id, dto, user.sub, req.ip, req.headers['user-agent'] as string);
    return { success: true, data, meta: null, error: null };
  }
}
