import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { OrganizationLifecycleService } from '../services/organization-lifecycle.service';

@ApiTags('Operations - Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/dashboard')
export class OperationsDashboardController {
  constructor(private readonly lifecycleService: OrganizationLifecycleService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.DASHBOARD_VIEW)
  @ApiOperation({ summary: 'Operations Portal dashboard widgets' })
  async getStats() {
    const data = await this.lifecycleService.getDashboardStats();
    return { success: true, data, meta: null, error: null };
  }
}
