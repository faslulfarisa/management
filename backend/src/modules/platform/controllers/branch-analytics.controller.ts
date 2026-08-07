import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BranchAnalyticsService } from '../services/branch-analytics.service';
import { UserHierarchyService } from '../services/user-hierarchy.service';

@ApiTags('Branch Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('branch-analytics')
export class BranchAnalyticsController {
  constructor(
    private readonly analyticsService: BranchAnalyticsService,
    private readonly userHierarchyService: UserHierarchyService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Per-branch overview: employees, today attendance, devices, payroll this month' })
  async getOverview(@Req() req: Request) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const data = await this.analyticsService.getOverview(user.tenantId, accessScope);
    return { success: true, data, meta: null, error: null };
  }

  @Get('attendance-summary')
  @ApiOperation({ summary: 'Per-branch attendance breakdown for a date range' })
  @ApiQuery({ name: 'branch_id', required: false })
  @ApiQuery({ name: 'date_from',  required: false, description: 'YYYY-MM-DD, defaults to today' })
  @ApiQuery({ name: 'date_to',    required: false, description: 'YYYY-MM-DD, defaults to today' })
  async getAttendanceSummary(
    @Req() req: Request,
    @Query('branch_id') branch_id?: string,
    @Query('date_from')  date_from?: string,
    @Query('date_to')    date_to?: string,
  ) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const data = await this.analyticsService.getAttendanceSummary(user.tenantId, {
      branch_id,
      date_from,
      date_to,
    }, accessScope);
    return { success: true, data, meta: null, error: null };
  }

  @Get('payroll-summary')
  @ApiOperation({ summary: 'Per-branch payroll breakdown for a month/year' })
  @ApiQuery({ name: 'branch_id', required: false })
  @ApiQuery({ name: 'month', required: false, description: '1-12, defaults to current month' })
  @ApiQuery({ name: 'year',  required: false, description: 'YYYY, defaults to current year' })
  async getPayrollSummary(
    @Req() req: Request,
    @Query('branch_id') branch_id?: string,
    @Query('month')     month?: string,
    @Query('year')      year?: string,
  ) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const data = await this.analyticsService.getPayrollSummary(user.tenantId, {
      branch_id,
      month: month ? parseInt(month, 10) : undefined,
      year:  year  ? parseInt(year,  10) : undefined,
    }, accessScope);
    return { success: true, data, meta: null, error: null };
  }

  @Get('device-health')
  @ApiOperation({ summary: 'Per-branch biometric device health with per-device detail' })
  @ApiQuery({ name: 'branch_id', required: false })
  async getDeviceHealth(
    @Req() req: Request,
    @Query('branch_id') branch_id?: string,
  ) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const data = await this.analyticsService.getDeviceHealth(user.tenantId, branch_id, accessScope);
    return { success: true, data, meta: null, error: null };
  }

  @Get('export')
  @ApiOperation({ summary: 'Export branch analytics data as CSV' })
  @ApiQuery({ name: 'type',      required: true,  description: 'attendance | payroll | employees' })
  @ApiQuery({ name: 'branch_id', required: false })
  @ApiQuery({ name: 'date_from', required: false })
  @ApiQuery({ name: 'date_to',   required: false })
  @ApiQuery({ name: 'month',     required: false })
  @ApiQuery({ name: 'year',      required: false })
  async exportCsv(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type')      type: string,
    @Query('branch_id') branch_id?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to')   date_to?: string,
    @Query('month')     month?: string,
    @Query('year')      year?: string,
  ) {
    const user = (req as any).user;
    const accessScope = await this.userHierarchyService.getAccessScope(user, user.tenantId);
    const { csv, filename } = await this.analyticsService.exportCsv(user.tenantId, {
      type,
      branch_id,
      date_from,
      date_to,
      month: month ? parseInt(month, 10) : undefined,
      year:  year  ? parseInt(year,  10) : undefined,
    }, accessScope);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
