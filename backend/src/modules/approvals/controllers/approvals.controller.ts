import { Controller, Get, Post, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OrgAdminGuard } from '../../auth/guards/org-admin.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';
import { ApprovalEngineService } from '../services/approval-engine.service';
import { InboxFilters } from '../dto/approval.dto';

@Controller('approvals')
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
export class ApprovalsController {
  constructor(
    private engine: ApprovalEngineService,
    private userHierarchyService: UserHierarchyService,
  ) {}

  @Get('inbox')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async getInbox(@Req() req: any, @Query() query: any) {
    const { tenantId, sub: userId, isSuperAdmin } = req.user;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    const filters: InboxFilters = {
      page: query.page,
      limit: query.limit,
      workflowType: query.workflow_type,
      branchId: query.branch_id,
      priority: query.priority,
    };
    return this.engine.getInbox(tenantId, userId, !!isSuperAdmin, filters, accessScope);
  }

  @Get('submitted')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async getSubmitted(@Req() req: any, @Query() query: any) {
    const { tenantId, sub: userId, isSuperAdmin } = req.user;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    return this.engine.getSubmitted(tenantId, userId, !!isSuperAdmin, {
      page: query.page,
      limit: query.limit,
      workflowType: query.workflow_type,
      status: query.status,
    }, accessScope);
  }

  @Get('history')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async getHistory(@Req() req: any, @Query() query: any) {
    const { tenantId, sub: userId, isSuperAdmin } = req.user;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    const filters: InboxFilters = {
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
      workflowType: query.workflow_type,
      branchId: query.branch_id,
      status: query.status,
      priority: query.priority,
    };
    return this.engine.getHistory(tenantId, userId, !!isSuperAdmin, filters, accessScope);
  }

  @Get('pending-count')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async getPendingCount(@Req() req: any) {
    const { tenantId, sub: userId, isSuperAdmin } = req.user;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    const count = await this.engine.getPendingCount(tenantId, userId, !!isSuperAdmin, accessScope);
    return { count };
  }

  @Get('analytics')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async getAnalytics(@Req() req: any, @Query() query: any) {
    const tenantId = req.user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    return this.engine.getAnalytics(tenantId, {
      from: query.from,
      to: query.to,
      workflowType: query.workflow_type,
      branchId: query.branch_id,
    }, accessScope);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async findOne(@Param('id') id: string, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const accessScope = await this.userHierarchyService.getAccessScope(req.user, tenantId);
    return this.engine.findOne(id, tenantId, accessScope);
  }

  @Post(':id/approve')
  @RequirePermission(PERMISSIONS.APPROVALS_APPROVE)
  async approve(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reason: string; remarks?: string },
  ) {
    const { tenantId, sub: userId } = req.user;
    const ipAddress = req.ip ?? req.headers['x-forwarded-for'];
    return this.engine.approve(id, tenantId, userId, body.reason, body.remarks, ipAddress);
  }

  @Post(':id/reject')
  @RequirePermission(PERMISSIONS.APPROVALS_REJECT)
  async reject(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reason: string },
  ) {
    const { tenantId, sub: userId } = req.user;
    const ipAddress = req.ip ?? req.headers['x-forwarded-for'];
    return this.engine.reject(id, tenantId, userId, body.reason, ipAddress);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.APPROVALS_VIEW)
  async cancel(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reason?: string },
  ) {
    return this.engine.cancel(id, req.user.tenantId, req.user.sub, body.reason);
  }

  @Post(':id/escalate')
  @UseGuards(OrgAdminGuard)
  @RequirePermission(PERMISSIONS.APPROVALS_MANAGE)
  async escalate(@Param('id') id: string, @Req() req: any) {
    return this.engine.escalate(id, req.user.tenantId, req.user.sub);
  }
}
