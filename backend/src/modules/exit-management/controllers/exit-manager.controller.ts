import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActiveOrgGuard } from '../../auth/guards/active-org.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { UserHierarchyService } from '../../platform/services/user-hierarchy.service';

import { ExitRequestService } from '../services/exit-request.service';
import { ExitChecklistService } from '../services/exit-checklist.service';
import { ExitClearanceService } from '../services/exit-clearance.service';
import { ExitKnowledgeTransferService } from '../services/exit-knowledge-transfer.service';

function tenantOf(req: any): string {
  return req.user.tenantId || req.user.tenant_id;
}

/**
 * Read-only exit-detail view for a manager who clicked into a pending
 * exit_request approval from the existing generic /approvals inbox — the
 * approve/reject action itself is handled by that inbox, not here.
 */
@UseGuards(JwtAuthGuard, ActiveOrgGuard, PermissionGuard)
@Controller('manager/exit-requests')
export class ExitManagerController {
  constructor(
    private readonly requests: ExitRequestService,
    private readonly checklist: ExitChecklistService,
    private readonly clearance: ExitClearanceService,
    private readonly kt: ExitKnowledgeTransferService,
    private readonly userHierarchy: UserHierarchyService,
  ) {}

  @Get(':id')
  @RequirePermission(PERMISSIONS.EXIT_VIEW)
  async getOne(@Req() req: any, @Param('id') id: string) {
    const scope = await this.userHierarchy.getAccessScope(req.user, tenantOf(req));
    const [exitRequest, timeline, checklist, clearances, kt] = await Promise.all([
      this.requests.getById(tenantOf(req), id, scope),
      this.requests.getTimeline(tenantOf(req), id),
      this.checklist.list(tenantOf(req), id),
      this.clearance.list(tenantOf(req), id),
      this.kt.get(tenantOf(req), id),
    ]);
    return { data: { ...exitRequest, timeline, checklist, clearances, knowledge_transfer: kt } };
  }
}
