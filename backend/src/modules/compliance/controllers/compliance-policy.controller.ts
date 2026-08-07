import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CompliancePolicyService } from '../services/compliance-policy.service';

function tenantOf(req: any): string { return req.user.tenantId || req.user.tenant_id; }

@ApiTags('Compliance Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('compliance/policies')
export class CompliancePolicyController {
  constructor(private readonly policies: CompliancePolicyService) {}

  @Post(':documentId/publish')
  @RequirePermission(PERMISSIONS.COMPLIANCE_POLICY_MANAGE)
  async publish(@Req() req: any, @Param('documentId') documentId: string) {
    return { success: true, data: await this.policies.publish(tenantOf(req), documentId, req.user.sub), error: null };
  }

  @Get(':documentId/acknowledgements')
  @RequirePermission(PERMISSIONS.COMPLIANCE_POLICY_MANAGE)
  async getAcknowledgementStatus(@Req() req: any, @Param('documentId') documentId: string) {
    return { success: true, data: await this.policies.getAcknowledgementStatus(tenantOf(req), documentId), error: null };
  }

  @Post(':documentId/acknowledge')
  @RequirePermission(PERMISSIONS.COMPLIANCE_POLICY_ACKNOWLEDGE)
  async acknowledge(@Req() req: any, @Param('documentId') documentId: string) {
    return { success: true, data: await this.policies.acknowledge(tenantOf(req), documentId, req.user.employeeId, req.ip), error: null };
  }

  @Get('my/pending')
  @RequirePermission(PERMISSIONS.COMPLIANCE_POLICY_ACKNOWLEDGE)
  async myPending(@Req() req: any) {
    return { success: true, data: await this.policies.listPendingForEmployee(tenantOf(req), req.user.employeeId), error: null };
  }
}
