import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { DatabaseService } from '../../../shared/database.service';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { PerformanceService } from '../services/performance.service';
import { resolvePerformanceScope } from '../utils/performance-scope.util';

@ApiTags('Performance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly service: PerformanceService,
    private readonly db: DatabaseService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  /**
   * Plain employees/managers (anyone below branch_admin/admin/org_admin) may
   * only list their own KRAs/KPIs/reviews — caps a client-supplied
   * `employee_id` to the caller's own id (or first team member, see below)
   * rather than trusting it. org/branch tiers are unrestricted, matching
   * existing PERFORMANCE_VIEW behaviour for HR/admin roles.
   */
  private async _capEmployeeFilter(req: any, query: any): Promise<any> {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const scope = await resolvePerformanceScope(this.db, this.userHierarchyService, user, tenantId);
    if (scope.mode === 'org' || scope.mode === 'branch') return query;

    const allowed = scope.employeeIds ?? [];
    if (query.employee_id && allowed.includes(query.employee_id)) return query;
    return { ...query, employee_id: allowed[0] ?? '__none__' };
  }

  @Get('cycles')
  @RequirePermission(PERMISSIONS.PERFORMANCE_VIEW)
  @ApiOperation({ summary: 'List review cycles' })
  async getCycles(@Req() req: Request) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const cycles = await this.service.getCycles(tenantId);
    return { success: true, data: cycles, error: null };
  }

  @Post('cycles')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Create review cycle' })
  async createCycle(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const cycle = await this.service.createCycle(tenantId, data);
    return { success: true, data: cycle, error: null };
  }

  @Put('cycles/:id')
  @RequirePermission(PERMISSIONS.PERFORMANCE_APPROVE)
  @ApiOperation({ summary: 'Update review cycle' })
  async updateCycle(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const cycle = await this.service.updateCycle(id, tenantId, user.sub, data);
    return { success: true, data: cycle, error: null };
  }

  @Get('kras')
  @RequirePermission(PERMISSIONS.PERFORMANCE_VIEW)
  @ApiOperation({ summary: 'List KRAs' })
  async getKRAs(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kras = await this.service.getKRAs(tenantId, await this._capEmployeeFilter(req, query));
    return { success: true, data: kras, error: null };
  }

  @Post('kras')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Create KRA' })
  async createKRA(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kra = await this.service.createKRA(tenantId, data);
    return { success: true, data: kra, error: null };
  }

  @Put('kras/:id')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Update KRA' })
  async updateKRA(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kra = await this.service.updateKRA(id, tenantId, data);
    return { success: true, data: kra, error: null };
  }

  @Get('kpis')
  @RequirePermission(PERMISSIONS.PERFORMANCE_VIEW)
  @ApiOperation({ summary: 'List KPIs' })
  async getKPIs(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kpis = await this.service.getKPIs(tenantId, await this._capEmployeeFilter(req, query));
    return { success: true, data: kpis, error: null };
  }

  @Post('kpis')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Create KPI' })
  async createKPI(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kpi = await this.service.createKPI(tenantId, data);
    return { success: true, data: kpi, error: null };
  }

  @Put('kpis/:id')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Update KPI' })
  async updateKPI(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const kpi = await this.service.updateKPI(id, tenantId, data);
    return { success: true, data: kpi, error: null };
  }

  @Delete('kpis/:id')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Delete KPI' })
  async deleteKPI(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    await this.service.deleteKPI(id, tenantId);
    return { success: true, data: null, error: null };
  }

  @Get('reviews')
  @RequirePermission(PERMISSIONS.PERFORMANCE_VIEW)
  @ApiOperation({ summary: 'List performance reviews' })
  async getReviews(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const reviews = await this.service.getReviews(tenantId, await this._capEmployeeFilter(req, query));
    return { success: true, data: reviews, error: null };
  }

  @Post('reviews')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Submit performance review' })
  async createReview(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const reviewerId = user.sub;
    const review = await this.service.createReview(tenantId, reviewerId, data);
    return { success: true, data: review, error: null };
  }

  @Put('reviews/:id')
  @RequirePermission(PERMISSIONS.PERFORMANCE_EDIT)
  @ApiOperation({ summary: 'Update performance review' })
  async updateReview(@Req() req: Request, @Param('id') id: string, @Body() data: any) {
    const user = (req as any).user;
    const tenantId = user.tenantId || user.tenant_id;
    const review = await this.service.updateReview(id, tenantId, user.sub, data);
    return { success: true, data: review, error: null };
  }
}
