import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview' })
  async getOverview(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const overview = await this.service.getOverview(tenantId, user);
    return { success: true, data: overview, error: null };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary bundle' })
  async getSummary(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const summary = await this.service.getSummary(tenantId, user);
    return { success: true, data: summary, error: null };
  }

  @Get('hr-metrics')
  @ApiOperation({ summary: 'HR metrics' })
  async getHrMetrics(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const metrics = await this.service.getHrMetrics(tenantId, user);
    return { success: true, data: metrics, error: null };
  }

  @Get('finance-metrics')
  @ApiOperation({ summary: 'Finance metrics' })
  async getFinanceMetrics(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const metrics = await this.service.getFinanceMetrics(tenantId, user);
    return { success: true, data: metrics, error: null };
  }

  @Get('widgets')
  @ApiOperation({ summary: 'Dashboard widgets' })
  async getWidgets(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const widgets = await this.service.getWidgets(tenantId);
    return { success: true, data: widgets, error: null };
  }

  @Post('widgets')
  @ApiOperation({ summary: 'Save widget' })
  async saveWidget(@Req() req: Request, @Body() data: any) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const widget = await this.service.saveWidget(tenantId, data);
    return { success: true, data: widget, error: null };
  }

  @Post('kpi')
  @ApiOperation({ summary: 'Record KPI' })
  async recordKpi(@Req() req: Request, @Body() data: { metric: string; value: number; metadata?: any }) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const kpi = await this.service.recordKpi(tenantId, data.metric, data.value, data.metadata);
    return { success: true, data: kpi, error: null };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get system notifications' })
  async getNotifications(@Req() req: Request) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const data = await this.service.getNotifications(
      tenantId,
      user.sub,
      user.employeeId || null,
      !!user.isSuperAdmin,
      user,
    );
    return { success: true, data, error: null };
  }

  @Get('search')
  @ApiOperation({ summary: 'Global search across all modules' })
  async globalSearch(@Req() req: Request, @Query('q') q: string) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const data = await this.service.globalSearch(tenantId, q, user);
    return { success: true, data, error: null };
  }

  @Get('kpi/:metric')
  @ApiOperation({ summary: 'KPI history' })
  async getKpiHistory(@Req() req: Request, @Param('metric') metric: string, @Query('days') days = 30) {
    const user = (req as any).user || (req as any);
    const tenantId = user.tenantId || user.tenant_id;
    const history = await this.service.getKpiHistory(tenantId, metric, parseInt(String(days)));
    return { success: true, data: history, error: null };
  }
}
