import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ComplianceReportService } from '../services/compliance-report.service';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/reports')
export class ComplianceReportController {
  constructor(private readonly reports: ComplianceReportService) {}

  @Get('document-inventory')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async documentInventory(@Req() req: any) {
    return { success: true, data: await this.reports.documentInventory(tenantOf(req)), error: null };
  }

  @Get('expired-documents')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async expiredDocuments(@Req() req: any) {
    return { success: true, data: await this.reports.expiredDocuments(tenantOf(req)), error: null };
  }

  @Get('upcoming-renewals')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async upcomingRenewals(@Req() req: any) {
    return { success: true, data: await this.reports.upcomingRenewals(tenantOf(req)), error: null };
  }

  @Get('employee-missing-documents')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async employeeMissingDocuments(@Req() req: any) {
    return { success: true, data: await this.reports.employeeMissingDocuments(tenantOf(req)), error: null };
  }

  @Get('company-licenses')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async companyLicenseReport(@Req() req: any) {
    return { success: true, data: await this.reports.companyLicenseReport(tenantOf(req)), error: null };
  }

  @Get('policy-acknowledgements')
  @RequirePermission(PERMISSIONS.COMPLIANCE_EXPORT)
  async policyAcknowledgementReport(@Req() req: any) {
    return { success: true, data: await this.reports.policyAcknowledgementReport(tenantOf(req)), error: null };
  }

  @Get('audit')
  @RequirePermission(PERMISSIONS.AUDIT_LOGS_EXPORT)
  async auditReport(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return { success: true, data: await this.reports.auditReport(tenantOf(req), { from, to }), error: null };
  }
}
