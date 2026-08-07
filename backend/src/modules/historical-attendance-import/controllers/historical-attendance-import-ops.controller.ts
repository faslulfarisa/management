import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { InternalStaffGuard } from '../../auth/guards/internal-staff.guard';
import { OpsPermissionGuard } from '../../auth/guards/ops-permission.guard';
import { RequireOpsPermission } from '../../auth/decorators/require-ops-permission.decorator';
import { OPS_PERMISSIONS } from '../../../shared/ops-permissions.constants';
import { HistoricalAttendanceImportService } from '../services/historical-attendance-import.service';
import { ImportListQueryDto, UpdateHistoricalImportCapabilityDto } from '../dto/historical-attendance-import.dto';

@ApiTags('Operations - Historical Attendance Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, InternalStaffGuard, OpsPermissionGuard)
@Controller('operations/historical-attendance-import')
export class HistoricalAttendanceImportOpsController {
  constructor(private readonly service: HistoricalAttendanceImportService) {}

  @Get('jobs')
  @RequireOpsPermission(OPS_PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_MONITOR)
  @ApiOperation({ summary: 'Platform monitoring for historical attendance import jobs, without customer punch payloads' })
  async listJobs(@Query() query: ImportListQueryDto & { tenantId?: string }) {
    return { success: true, ...(await this.service.listPlatformJobs(query)), error: null };
  }

  @Get('organizations/:tenantId/capability')
  @RequireOpsPermission(OPS_PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_CONFIGURE)
  @ApiOperation({ summary: 'Get historical attendance import capability flag for an organization' })
  async getCapability(@Param('tenantId') tenantId: string) {
    return { success: true, data: await this.service.getCapability(tenantId), error: null };
  }

  @Put('organizations/:tenantId/capability')
  @RequireOpsPermission(OPS_PERMISSIONS.HISTORICAL_ATTENDANCE_IMPORT_CONFIGURE)
  @ApiOperation({ summary: 'Enable or disable historical attendance import for an organization' })
  async updateCapability(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Body() body: UpdateHistoricalImportCapabilityDto,
  ) {
    return {
      success: true,
      data: await this.service.updateCapability(tenantId, { sub: req.user.sub }, body),
      error: null,
    };
  }
}
