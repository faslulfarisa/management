import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { OrgAdminGuard } from '../../auth/guards/org-admin.guard';
import { FinesService } from '../services/fines.service';

@ApiTags('Fines & Deductions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('fines')
export class FinesController {
  constructor(private readonly service: FinesService) {}

  // ─── Fines CRUD ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List fines with filters (branch, employee, status, payroll cycle)' })
  async getFines(@Req() req: any, @Query() query: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userType = req.user.userType;
    return { success: true, data: await this.service.getFines(tenantId, query, userType), error: null };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new fine (triggers approval workflow)' })
  async createFine(@Req() req: any, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const createdBy = req.user.sub || req.user.id;
    return { success: true, data: await this.service.createFine(tenantId, dto, createdBy), error: null };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Branch/department deduction analytics' })
  async getAnalytics(@Req() req: any, @Query() query: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getAnalytics(tenantId, query), error: null };
  }

  @Get('employee/:employeeId')
  @ApiOperation({ summary: 'Employee-facing deduction history and active fines' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  async getEmployeeFines(@Req() req: any, @Param('employeeId') employeeId: string, @Query() query: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userType = req.user.userType;
    return { success: true, data: await this.service.getEmployeeFines(employeeId, tenantId, query, userType), error: null };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fine detail with approval log and payment history' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async getFineById(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const userType = req.user.userType;
    const tid = req.user.isSuperAdmin ? null : tenantId;
    return { success: true, data: await this.service.getFineById(id, tid, userType), error: null };
  }

  @Put(':id')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Update fine (only allowed if payroll not locked/finalized)' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async updateFine(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const actor = {
      sub: req.user.sub || req.user.id,
      userType: req.user.userType,
      isSuperAdmin: req.user.isSuperAdmin,
    };
    return { success: true, data: await this.service.updateFine(id, tenantId, dto, actor), error: null };
  }

  @Delete(':id')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Cancel a fine' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async cancelFine(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const cancelledBy = req.user.sub || req.user.id;
    const userType = req.user.userType;
    const isSuperAdmin = req.user.isSuperAdmin;
    return { success: true, data: await this.service.cancelFine(id, tenantId, cancelledBy, userType, isSuperAdmin), error: null };
  }

  // ─── Settlement & Payments ───────────────────────────────────────────────────

  @Post(':id/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit manual payment proof for a fine' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async settleFine(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const settledBy = req.user.sub || req.user.id;
    return { success: true, data: await this.service.settleFine(id, tenantId, dto, settledBy), error: null };
  }

  @Post(':id/waive')
  @UseGuards(OrgAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Waive a fine (HR/Finance governance action)' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async waiveFine(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const actorId = req.user.sub || req.user.id;
    return { success: true, data: await this.service.waiveFine(id, tenantId, dto.reason, actorId), error: null };
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Get payment and deduction history for a fine' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  async getPayments(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getPayments(id, tenantId), error: null };
  }

  @Post(':id/payments/:paymentId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finance verifies or rejects a manual payment' })
  @ApiParam({ name: 'id', description: 'Fine UUID' })
  @ApiParam({ name: 'paymentId', description: 'Payment UUID' })
  async verifyPayment(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: any,
  ) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    const verifiedBy = req.user.sub || req.user.id;
    return { success: true, data: await this.service.verifyPayment(paymentId, tenantId, verifiedBy, dto), error: null };
  }

  // ─── Deduction Rules ─────────────────────────────────────────────────────────

  @Get('rules/list')
  @ApiOperation({ summary: 'List deduction automation rules' })
  async getRules(@Req() req: any, @Query('branch_id') branchId?: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getRules(tenantId, branchId), error: null };
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a deduction rule' })
  async createRule(@Req() req: any, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.createRule(tenantId, dto), error: null };
  }

  @Put('rules/:ruleId')
  @ApiOperation({ summary: 'Update a deduction rule' })
  @ApiParam({ name: 'ruleId', description: 'Rule UUID' })
  async updateRule(@Req() req: any, @Param('ruleId') ruleId: string, @Body() dto: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.updateRule(ruleId, tenantId, dto), error: null };
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Deactivate a deduction rule' })
  @ApiParam({ name: 'ruleId', description: 'Rule UUID' })
  async deleteRule(@Req() req: any, @Param('ruleId') ruleId: string) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.deleteRule(ruleId, tenantId), error: null };
  }

  // ─── Compliance Reports ───────────────────────────────────────────────────────

  @Get('reports/edited-fines')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Get report of edited fine records' })
  async getEditedFinesReport(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getEditedFinesReport(tenantId), error: null };
  }

  @Get('reports/edited-deductions')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Get report of edited deduction records' })
  async getEditedDeductionsReport(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getEditedDeductionsReport(tenantId), error: null };
  }

  @Get('reports/most-modified')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Get report of most modified records' })
  async getMostModifiedReport(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getMostModifiedReport(tenantId), error: null };
  }

  @Get('reports/payroll-adjustments')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Get payroll adjustment history report' })
  async getPayrollAdjustmentHistoryReport(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getPayrollAdjustmentHistoryReport(tenantId), error: null };
  }

  @Get('reports/admin-activity')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Get admin modification activity report' })
  async getAdminActivityReport(@Req() req: any) {
    const tenantId = req.user.tenantId || req.user.tenant_id;
    return { success: true, data: await this.service.getAdminActivityReport(tenantId), error: null };
  }
}
