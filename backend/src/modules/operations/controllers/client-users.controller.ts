import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { ClientUserSearchService } from '../services/client-user-search.service';

@ApiTags('Operations - Client Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/client-users')
export class ClientUsersController {
  constructor(private readonly service: ClientUserSearchService) {}

  @Get()
  @RequireOpsPermission(OPS_PERMISSIONS.ORGANIZATIONS_CREATE)
  @ApiOperation({ summary: 'Search customer-side users eligible for organization admin assignment' })
  async search(@Query('q') q?: string, @Query('limit') limit?: string) {
    const data = await this.service.search(q ?? '', limit ? parseInt(limit, 10) : 20);
    return { success: true, data, meta: null, error: null };
  }
}
