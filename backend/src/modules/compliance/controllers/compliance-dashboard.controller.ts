import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { ComplianceDashboardService } from '../services/compliance-dashboard.service';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/dashboard')
export class ComplianceDashboardController {
  constructor(
    private readonly dashboard: ComplianceDashboardService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  @Get('cards')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async getCards(@Req() req: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { success: true, data: await this.dashboard.getCards(tenantOf(req), scope), error: null };
  }

  @Get('expiry-timeline')
  @RequirePermission(PERMISSIONS.COMPLIANCE_VIEW)
  async getExpiryTimeline(@Req() req: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { success: true, data: await this.dashboard.getExpiryTimeline(tenantOf(req), scope), error: null };
  }

  @Get('audit-activity')
  @RequirePermission(PERMISSIONS.AUDIT_LOGS_VIEW)
  async getRecentAuditActivity(@Req() req: any, @Query('limit') limit?: string) {
    return { success: true, data: await this.dashboard.getRecentAuditActivity(tenantOf(req), limit ? parseInt(limit, 10) : undefined), error: null };
  }
}
