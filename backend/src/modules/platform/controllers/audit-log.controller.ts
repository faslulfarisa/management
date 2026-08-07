import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AuditLogService } from '../services/audit-log.service';
import { UserHierarchyService } from '../services/user-hierarchy.service';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(
    private readonly service: AuditLogService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.AUDIT_LOGS_VIEW)
  @ApiOperation({ summary: 'List audit logs' })
  async findAll(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const result = await this.service.findAll(tenantId, query, accessScope);
    return { success: true, data: result.data, meta: result.meta, error: null };
  }

  @Get('export')
  @RequirePermission(PERMISSIONS.AUDIT_LOGS_EXPORT)
  @ApiOperation({ summary: 'Export audit logs (CSV-ready rows)' })
  async export(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const accessScope = await this.userHierarchyService.getAccessScope(user, tenantId);
    const result = await this.service.findAll(tenantId, { ...query, page: 1, limit: query.limit || 1000 }, accessScope);
    return { success: true, data: result.data, meta: result.meta, error: null };
  }
}
