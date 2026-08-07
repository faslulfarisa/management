import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { WorkforcePlanService } from './workforce-plan.service';
import { isOrganizationAdmin } from './recruitment-approval-bypass.util';

const WORKFLOW_TYPE = 'workforce_plan';

/**
 * Thin wrapper around ApprovalEngineService, modeled directly on
 * VacancyApprovalService — gives headcount/budget plans the same multi-step/
 * SLA/escalation machinery already used across this module. Branch admins
 * configure the chain via the existing Approval Chains UI (workflow_type =
 * 'workforce_plan'); org-wide plans (branch_id null) fall back to the
 * engine's existing org-admin-only behavior.
 */
@Injectable()
export class WorkforcePlanApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private plans: WorkforcePlanService,
  ) {}

  async submit(tenantId: string, planId: string, submittedById: string) {
    const plan = await this.plans.getRaw(planId, tenantId);
    if (!['draft', 'rejected'].includes(plan.status)) {
      throw new BadRequestException(`Cannot submit a workforce plan with status '${plan.status}' for approval`);
    }

    if (await isOrganizationAdmin(this.db, tenantId, submittedById)) {
      await this.db.query(
        `UPDATE workforce_plans
         SET approval_status = 'approved',
             approved_by = $3,
             approved_at = now(),
             approval_reason = 'Auto-approved by organization admin',
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [planId, tenantId, submittedById],
      );
      const activePlan = await this.plans.activate(planId, tenantId);
      await this.auditLog.log({
        tenantId,
        userId: submittedById,
        entityType: 'workforce_plan',
        entityId: planId,
        action: 'auto_approve',
        newValues: { reason: 'Organization admin action' },
      });
      return activePlan;
    }

    await this.db.query(
      `UPDATE workforce_plans SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [planId, tenantId],
    );

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: planId,
      entityTable: 'workforce_plans',
      submittedBy: submittedById,
      branchId: plan.branch_id,
      title: `Workforce plan approval: ${plan.title} (${plan.year})`,
      description: plan.notes ?? undefined,
      metadata: { year: plan.year, branch_id: plan.branch_id },
    });

    await this.auditLog.log({
      tenantId, userId: submittedById, entityType: 'workforce_plan', entityId: planId, action: 'submit_for_approval',
    });
    return request;
  }

  async approve(tenantId: string, planId: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(planId, 'workforce_plans', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(tenantId, planId);
    await this.auditLog.log({
      tenantId, userId: approverId, entityType: 'workforce_plan', entityId: planId, action: 'approve', newValues: { reason },
    });
    return result;
  }

  async reject(tenantId: string, planId: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(planId, 'workforce_plans', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(tenantId, planId);
    await this.auditLog.log({
      tenantId, userId: rejecterId, entityType: 'workforce_plan', entityId: planId, action: 'reject', newValues: { reason },
    });
    return result;
  }

  /** Mirrors VacancyApprovalService.syncLifecycleStatus — approval_status -> status once fully resolved. */
  private async syncLifecycleStatus(tenantId: string, planId: string) {
    const plan = await this.plans.getRaw(planId, tenantId);
    if (plan.status !== 'pending_approval') return;

    if (plan.approval_status === 'approved') {
      await this.plans.activate(planId, tenantId);
    } else if (plan.approval_status === 'rejected') {
      await this.db.query(`UPDATE workforce_plans SET status = 'rejected', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [planId, tenantId]);
    }
  }
}
