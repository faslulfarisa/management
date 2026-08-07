import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { TemplateService } from '../../platform/services/template.service';

import { ExitRequestService } from '../services/exit-request.service';
import { ExitChecklistService } from '../services/exit-checklist.service';
import { ExitClearanceService } from '../services/exit-clearance.service';
import { ExitKnowledgeTransferService } from '../services/exit-knowledge-transfer.service';
import { ExitInterviewService } from '../services/exit-interview.service';
import { FinalSettlementService } from '../services/final-settlement.service';
import { ExitDashboardService } from '../services/exit-dashboard.service';
import { ExitDocumentService } from '../services/exit-document.service';

import { SubmitExitRequestDto, ApproveExitRequestDto, RejectExitRequestDto } from '../dto/exit-request.dto';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from '../dto/exit-checklist.dto';
import { CreateClearanceDto, UpdateClearanceDto } from '../dto/exit-clearance.dto';
import { ApproveSettlementDto, RejectSettlementDto, RecordPaymentDto, ManualAdjustmentDto } from '../dto/final-settlement.dto';
import { ReviewKnowledgeTransferDto } from '../dto/exit-knowledge-transfer.dto';
import { ScheduleInterviewDto, InterviewFeedbackDto } from '../dto/exit-interview.dto';

function tenantOf(req: any): string {
  return req.user.tenantId || req.user.tenant_id;
}
function actorOf(req: any) {
  const user = req.user;
  return { sub: user.sub, isSuperAdmin: user.isSuperAdmin, userType: user.isSuperAdmin ? 'super_admin' : user.userType };
}

@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('exit-management')
export class ExitManagementController {
  constructor(
    private readonly requests: ExitRequestService,
    private readonly checklist: ExitChecklistService,
    private readonly clearance: ExitClearanceService,
    private readonly kt: ExitKnowledgeTransferService,
    private readonly interview: ExitInterviewService,
    private readonly settlement: FinalSettlementService,
    private readonly dashboard: ExitDashboardService,
    private readonly documents: ExitDocumentService,
    private readonly userHierarchy: UserHierarchyService,
    private readonly templateService: TemplateService,
  ) {}

  // ── Dashboard ───────────────────────────────────────────────────────────
  @Get('stats')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getStats(@Req() req: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { data: await this.dashboard.getStats(tenantOf(req), scope) };
  }

  @Get('analytics/monthly-trend')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async monthlyTrend(@Req() req: any, @Query('months') months?: string) {
    return { data: await this.dashboard.getMonthlyTrend(tenantOf(req), months ? parseInt(months, 10) : undefined) };
  }

  @Get('analytics/department-trend')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async departmentTrend(@Req() req: any) {
    return { data: await this.dashboard.getDepartmentTrend(tenantOf(req)) };
  }

  @Get('analytics/branch-trend')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async branchTrend(@Req() req: any) {
    return { data: await this.dashboard.getBranchTrend(tenantOf(req)) };
  }

  @Get('analytics/attrition')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async attrition(@Req() req: any, @Query() query: any) {
    return { data: await this.dashboard.getAttritionReport(tenantOf(req), query) };
  }

  // ── Exit Requests ───────────────────────────────────────────────────────
  @Get('requests')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async list(@Req() req: any, @Query() query: any) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { data: await this.requests.list(tenantOf(req), query, scope) };
  }

  @Get('requests/:id')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getOne(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    return { data: await this.requests.getById(tenantOf(req), id, scope) };
  }

  @Post('requests')
  @RequirePermission(PERMISSIONS.EXIT_CREATE)
  async create(@Req() req: any, @Body() body: SubmitExitRequestDto) {
    if (!body.employee_id) throw new BadRequestException('employee_id is required');
    return { data: await this.requests.submit(tenantOf(req), body.employee_id, body, req.user.sub, 'hr_admin') };
  }

  @Put('requests/:id/approve')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async approve(@Req() req: any, @Param('id') id: string, @Body() body: ApproveExitRequestDto) {
    return { data: await this.requests.approve(tenantOf(req), id, req.user.sub, body.reason, req.ip) };
  }

  @Put('requests/:id/reject')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async reject(@Req() req: any, @Param('id') id: string, @Body() body: RejectExitRequestDto) {
    return { data: await this.requests.reject(tenantOf(req), id, req.user.sub, body.reason, req.ip) };
  }

  @Delete('requests/:id')
  @RequirePermission(PERMISSIONS.EXIT_DELETE)
  async delete(@Req() req: any, @Param('id') id: string) {
    return { data: await this.requests.delete(tenantOf(req), id) };
  }

  @Get('requests/:id/timeline')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async timeline(@Req() req: any, @Param('id') id: string) {
    return { data: await this.requests.getTimeline(tenantOf(req), id) };
  }

  // ── Checklist ───────────────────────────────────────────────────────────
  @Get('requests/:id/checklist')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getChecklist(@Req() req: any, @Param('id') id: string) {
    return { data: await this.checklist.list(tenantOf(req), id) };
  }

  @Post('requests/:id/checklist')
  @RequirePermission(PERMISSIONS.EXIT_CHECKLIST_MANAGE)
  async createChecklistItem(@Req() req: any, @Param('id') id: string, @Body() body: CreateChecklistItemDto) {
    return { data: await this.checklist.create(tenantOf(req), id, body) };
  }

  @Put('checklist/:itemId')
  @RequirePermission(PERMISSIONS.EXIT_CHECKLIST_MANAGE)
  async updateChecklistItem(@Req() req: any, @Param('itemId') itemId: string, @Body() body: UpdateChecklistItemDto) {
    return { data: await this.checklist.update(tenantOf(req), itemId, { ...body, actorId: req.user.sub }) };
  }

  @Delete('checklist/:itemId')
  @RequirePermission(PERMISSIONS.EXIT_CHECKLIST_MANAGE)
  async deleteChecklistItem(@Req() req: any, @Param('itemId') itemId: string) {
    return { data: await this.checklist.delete(tenantOf(req), itemId) };
  }

  // ── Clearances ──────────────────────────────────────────────────────────
  @Get('requests/:id/clearances')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getClearances(@Req() req: any, @Param('id') id: string) {
    return { data: await this.clearance.list(tenantOf(req), id) };
  }

  @Post('requests/:id/clearances')
  @RequirePermission(PERMISSIONS.EXIT_CLEARANCE_MANAGE)
  async createClearance(@Req() req: any, @Param('id') id: string, @Body() body: CreateClearanceDto) {
    return { data: await this.clearance.create(tenantOf(req), id, body) };
  }

  @Put('clearances/:clearanceId')
  @RequirePermission(PERMISSIONS.EXIT_CLEARANCE_MANAGE)
  async updateClearance(@Req() req: any, @Param('clearanceId') clearanceId: string, @Body() body: UpdateClearanceDto) {
    return { data: await this.clearance.update(tenantOf(req), clearanceId, { ...body, cleared_by: req.user.sub }) };
  }

  @Delete('clearances/:clearanceId')
  @RequirePermission(PERMISSIONS.EXIT_CLEARANCE_MANAGE)
  async deleteClearance(@Req() req: any, @Param('clearanceId') clearanceId: string) {
    return { data: await this.clearance.delete(tenantOf(req), clearanceId) };
  }

  // ── Knowledge Transfer ──────────────────────────────────────────────────
  @Get('requests/:id/knowledge-transfer')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getKnowledgeTransfer(@Req() req: any, @Param('id') id: string) {
    return { data: await this.kt.get(tenantOf(req), id) };
  }

  @Put('requests/:id/knowledge-transfer/review')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async reviewKnowledgeTransfer(@Req() req: any, @Param('id') id: string, @Body() body: ReviewKnowledgeTransferDto) {
    return { data: await this.kt.review(tenantOf(req), id, req.user.sub, body.approved, body.remarks) };
  }

  // ── Exit Interview ──────────────────────────────────────────────────────
  @Get('interview-questionnaire')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async questionnaire() {
    return { data: this.interview.getQuestionnaire() };
  }

  @Get('requests/:id/interview')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getInterview(@Req() req: any, @Param('id') id: string) {
    return { data: await this.interview.get(tenantOf(req), id) };
  }

  @Post('requests/:id/interview/schedule')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async scheduleInterview(@Req() req: any, @Param('id') id: string, @Body() body: ScheduleInterviewDto) {
    return { data: await this.interview.schedule(tenantOf(req), id, body.scheduled_at, body.conducted_by ?? req.user.sub) };
  }

  @Post('requests/:id/interview/skip')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async skipInterview(@Req() req: any, @Param('id') id: string) {
    return { data: await this.interview.skip(tenantOf(req), id) };
  }

  @Put('requests/:id/interview/manager-feedback')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async managerFeedback(@Req() req: any, @Param('id') id: string, @Body() body: InterviewFeedbackDto) {
    return { data: await this.interview.addFeedback(tenantOf(req), id, 'manager_feedback', body.feedback) };
  }

  @Put('requests/:id/interview/hr-feedback')
  @RequirePermission(PERMISSIONS.EXIT_APPROVE)
  async hrFeedback(@Req() req: any, @Param('id') id: string, @Body() body: InterviewFeedbackDto) {
    return { data: await this.interview.addFeedback(tenantOf(req), id, 'hr_feedback', body.feedback) };
  }

  @Get('interviews/export')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async exportInterviews(@Req() req: any, @Query() query: any) {
    return { data: await this.interview.export(tenantOf(req), query) };
  }

  // ── Settlements ─────────────────────────────────────────────────────────
  @Get('settlements')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_VIEW)
  async listSettlements(@Req() req: any, @Query() query: any) {
    return { data: await this.settlement.list(tenantOf(req), query) };
  }

  @Get('requests/:id/settlement')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_VIEW)
  async getSettlementForRequest(@Req() req: any, @Param('id') id: string) {
    return { data: await this.settlement.getByExitRequest(tenantOf(req), id) };
  }

  @Post('requests/:id/settlement/calculate')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_CALCULATE)
  async calculateSettlement(@Req() req: any, @Param('id') id: string) {
    return { data: await this.settlement.calculate(tenantOf(req), id, req.user.sub) };
  }

  @Put('settlements/:id/adjust')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_CALCULATE)
  async adjustSettlement(@Req() req: any, @Param('id') id: string, @Body() body: ManualAdjustmentDto) {
    return { data: await this.settlement.applyManualAdjustment(tenantOf(req), id, body, req.user.sub) };
  }

  @Put('settlements/:id/approve')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_APPROVE)
  async approveSettlement(@Req() req: any, @Param('id') id: string, @Body() body: ApproveSettlementDto) {
    return { data: await this.settlement.approve(tenantOf(req), id, actorOf(req), body.reason, req.ip, req.headers['user-agent']) };
  }

  @Put('settlements/:id/reject')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_APPROVE)
  async rejectSettlement(@Req() req: any, @Param('id') id: string, @Body() body: RejectSettlementDto) {
    return { data: await this.settlement.reject(tenantOf(req), id, req.user.sub, body.reason) };
  }

  @Put('settlements/:id/payment-status')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_PAY)
  async markPaid(@Req() req: any, @Param('id') id: string, @Body() body: RecordPaymentDto) {
    return { data: await this.settlement.markPaid(tenantOf(req), id, body.payment_date, req.user.sub) };
  }

  @Delete('settlements/:id')
  @RequirePermission(PERMISSIONS.EXIT_SETTLEMENT_CALCULATE)
  async deleteSettlement(@Req() req: any, @Param('id') id: string) {
    return { data: await this.settlement.delete(tenantOf(req), id) };
  }

  // ── Templates (delegates to the generic TemplateService, filtered to exit types) ──
  @Get('templates')
  @RequirePermission(PERMISSIONS.EXIT_TEMPLATES_MANAGE)
  async listTemplates(@Req() req: any, @Query('template_type') templateType?: string) {
    return { data: await this.templateService.findAll(tenantOf(req), templateType || 'exit_checklist') };
  }

  @Post('templates')
  @RequirePermission(PERMISSIONS.EXIT_TEMPLATES_MANAGE)
  async createTemplate(@Req() req: any, @Body() body: any) {
    return { data: await this.templateService.create(tenantOf(req), req.user.sub, body) };
  }

  @Post('templates/assign')
  @RequirePermission(PERMISSIONS.EXIT_TEMPLATES_MANAGE)
  async assignTemplate(@Req() req: any, @Body() body: any) {
    return { data: await this.templateService.assign(tenantOf(req), body) };
  }

  // ── Documents ───────────────────────────────────────────────────────────
  @Get('requests/:id/documents')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async listDocuments(@Req() req: any, @Param('id') id: string) {
    return { data: await this.documents.list(tenantOf(req), id) };
  }

  @Post('requests/:id/documents')
  @RequirePermission(PERMISSIONS.EXIT_EDIT)
  async registerDocument(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return { data: await this.documents.register(tenantOf(req), req.user.sub, { ...body, exit_request_id: id }) };
  }
}
