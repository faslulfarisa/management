import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BranchKpiService } from '../services/branch-kpi.service';

@UseGuards(JwtAuthGuard)
@Controller('branch-kpi')
export class BranchKpiController {
  constructor(private readonly service: BranchKpiService) {}

  @Get()
  async getKpis(
    @Req() req: any,
    @Query('branch_id') branchId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const data = await this.service.getKpis(req.user.tenantId, {
      branch_id: branchId,
      month: month ? parseInt(month) : undefined,
      year:  year  ? parseInt(year)  : undefined,
    });
    return { success: true, data };
  }

  @Get('trend')
  async getTrend(
    @Req() req: any,
    @Query('branch_id') branchId: string,
    @Query('metric') metric: 'attendance_rate' | 'net_payroll' | 'headcount' = 'attendance_rate',
    @Query('months') months?: string,
  ) {
    const data = await this.service.getTrend(
      req.user.tenantId,
      branchId,
      metric,
      months ? parseInt(months) : 6,
    );
    return { success: true, data };
  }
}
