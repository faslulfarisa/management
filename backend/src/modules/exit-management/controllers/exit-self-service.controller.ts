import { Controller, Get, Post, Put, Body, Param, Req, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';

import { ExitRequestService } from '../services/exit-request.service';
import { ExitChecklistService } from '../services/exit-checklist.service';
import { ExitClearanceService } from '../services/exit-clearance.service';
import { ExitKnowledgeTransferService } from '../services/exit-knowledge-transfer.service';
import { ExitInterviewService } from '../services/exit-interview.service';
import { FinalSettlementService } from '../services/final-settlement.service';
import { ExitDocumentService } from '../services/exit-document.service';
import { AssetAssignmentService } from '../../assets/services/asset-assignment.service';

import { SubmitExitRequestDto, WithdrawExitRequestDto } from '../dto/exit-request.dto';
import { SubmitKnowledgeTransferDto } from '../dto/exit-knowledge-transfer.dto';
import { SubmitExitInterviewDto } from '../dto/exit-interview.dto';

function tenantOf(req: any): string {
  return req.user.tenantId || req.user.tenant_id;
}
function employeeOf(req: any): string {
  const id = req.user.employeeId || req.user.employee_id;
  if (!id) throw new ForbiddenException('No employee profile is linked to this account');
  return id;
}

/**
 * Ownership-scoped self-service surface — no PermissionGuard, matching the
 * established `/employees/me/*` convention: access is implicit via the
 * caller's own employeeId, not a role grant.
 */
@UseGuards(JwtAuthGuard, ActiveOrgGuard)
@Controller('employees/me/exit')
export class ExitSelfServiceController {
  constructor(
    private readonly requests: ExitRequestService,
    private readonly checklist: ExitChecklistService,
    private readonly clearance: ExitClearanceService,
    private readonly kt: ExitKnowledgeTransferService,
    private readonly interview: ExitInterviewService,
    private readonly settlement: FinalSettlementService,
    private readonly documents: ExitDocumentService,
    private readonly assets: AssetAssignmentService,
  ) {}

  private async assertOwned(tenantId: string, exitRequestId: string, employeeId: string) {
    const exitRequest = await this.requests.getById(tenantId, exitRequestId);
    if (exitRequest.employee_id !== employeeId) throw new NotFoundException('Exit request not found');
    return exitRequest;
  }

  @Get()
  async getMine(@Req() req: any) {
    return { data: await this.requests.getMyActiveRequest(tenantOf(req), employeeOf(req)) };
  }

  @Post()
  async submit(@Req() req: any, @Body() body: SubmitExitRequestDto) {
    return { data: await this.requests.submit(tenantOf(req), employeeOf(req), body, req.user.sub, 'self_service') };
  }

  @Put(':id/withdraw')
  async withdraw(@Req() req: any, @Param('id') id: string, @Body() body: WithdrawExitRequestDto) {
    return { data: await this.requests.withdraw(tenantOf(req), id, employeeOf(req), body.reason) };
  }

  @Get(':id/timeline')
  async timeline(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.requests.getTimeline(tenantOf(req), id) };
  }

  @Get(':id/checklist')
  async checklistFor(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.checklist.list(tenantOf(req), id) };
  }

  @Get(':id/clearances')
  async clearancesFor(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.clearance.list(tenantOf(req), id) };
  }

  @Get(':id/knowledge-transfer')
  async getKt(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.kt.get(tenantOf(req), id) };
  }

  @Post(':id/knowledge-transfer')
  async submitKt(@Req() req: any, @Param('id') id: string, @Body() body: SubmitKnowledgeTransferDto & { finalize?: boolean }) {
    const employeeId = employeeOf(req);
    await this.assertOwned(tenantOf(req), id, employeeId);
    return { data: await this.kt.submit(tenantOf(req), id, employeeId, body, Boolean(body.finalize)) };
  }

  @Get(':id/assets')
  async assetsFor(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.assets.listForExit(tenantOf(req), id) };
  }

  @Get(':id/interview/questionnaire')
  async interviewQuestionnaire(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: this.interview.getQuestionnaire() };
  }

  @Post(':id/interview')
  async submitInterview(@Req() req: any, @Param('id') id: string, @Body() body: SubmitExitInterviewDto) {
    const employeeId = employeeOf(req);
    await this.assertOwned(tenantOf(req), id, employeeId);
    return { data: await this.interview.submitResponses(tenantOf(req), id, employeeId, body) };
  }

  @Get(':id/settlement')
  async settlementFor(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.settlement.getByExitRequest(tenantOf(req), id) };
  }

  @Get(':id/documents')
  async documentsFor(@Req() req: any, @Param('id') id: string) {
    await this.assertOwned(tenantOf(req), id, employeeOf(req));
    return { data: await this.documents.list(tenantOf(req), id) };
  }
}
