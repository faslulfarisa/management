import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { OrganizationLifecycleService } from '../services/organization-lifecycle.service';

@ApiTags('Operations - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/reports')
export class OperationsReportsController {
  constructor(private readonly lifecycleService: OrganizationLifecycleService) {}

  @Get('analytics')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Organization stage distribution and registration trend' })
  async getAnalytics() {
    const data = await this.lifecycleService.getAnalytics();
    return { success: true, data, meta: null, error: null };
  }

  @Get('activity')
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_VIEW)
  @ApiOperation({ summary: 'Cross-organization activity log' })
  async getActivity(@Query() query: any) {
    const result = await this.lifecycleService.getGlobalActivity(query);
    return { success: true, ...result, error: null };
  }
}
