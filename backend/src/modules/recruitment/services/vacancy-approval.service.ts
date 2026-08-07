import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { VacancyService } from './vacancy.service';

const WORKFLOW_TYPE = 'vacancy_request';

/**
 * Thin wrapper around the existing ApprovalEngineService — gives vacancy
 * requests the same multi-step/SLA/escalation approval machinery already
 * used by leave_requests, expenses, compliance_documents, etc. Branch admins
 * configure the actual chain via the existing Approval Chains UI; with none
 * configured, ApprovalEngineService falls back to "org admins only". The
 * engine already notifies approvers (on submit) and the submitter (on
 * resolution) internally — this service does not duplicate those notifications.
 */
@Injectable()
export class VacancyApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private vacancies: VacancyService,
  ) {}

  async submit(tenantId: string, vacancyId: string, submittedById: string) {
    const vacancy = await this.vacancies.getRaw(vacancyId, tenantId);
    if (!['draft', 'rejected'].includes(vacancy.status)) {
      throw new BadRequestException(`Cannot submit a vacancy with status '${vacancy.status}' for approval`);
    }

    await this.db.query(
      `UPDATE vacancies SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [vacancyId, tenantId],
    );
    await this.vacancies.recordStatusHistory(tenantId, vacancyId, vacancy.status, 'pending_approval', submittedById);

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: vacancyId,
      entityTable: 'vacancies',
      submittedBy: submittedById,
      branchId: vacancy.branch_id,
      departmentId: vacancy.department_id,
      title: `Vacancy approval: ${vacancy.title}`,
      description: vacancy.justification ?? undefined,
      metadata: { position_id: vacancy.position_id, number_of_positions: vacancy.number_of_positions, hiring_manager_id: vacancy.hiring_manager_id },
    });

    await this.auditLog.log({
      tenantId, userId: submittedById, entityType: 'vacancy', entityId: vacancyId, action: 'submit_for_approval',
    });
    return request;
  }

  async approve(tenantId: string, vacancyId: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(vacancyId, 'vacancies', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(tenantId, vacancyId, approverId, reason);
    await this.auditLog.log({
      tenantId, userId: approverId, entityType: 'vacancy', entityId: vacancyId, action: 'approve', newValues: { reason },
    });
    return result;
  }

  async reject(tenantId: string, vacancyId: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(vacancyId, 'vacancies', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(tenantId, vacancyId, rejecterId, reason);
    await this.auditLog.log({
      tenantId, userId: rejecterId, entityType: 'vacancy', entityId: vacancyId, action: 'reject', newValues: { reason },
    });
    return result;
  }

  /**
   * `approval_status` is what ApprovalEngineService writes; mirror it onto the
   * broader lifecycle `status` column once the request is fully resolved.
   * Mid-chain steps only advance approval_step/approval_log (handled by the
   * engine itself), so `status` stays `pending_approval` until then.
   */
  private async syncLifecycleStatus(tenantId: string, vacancyId: string, actorId: string, reason?: string) {
    const vacancy = await this.vacancies.getRaw(vacancyId, tenantId);
    if (vacancy.status !== 'pending_approval') return;

    if (vacancy.approval_status === 'approved') {
      await this.vacancies.open(vacancyId, tenantId, actorId);
    } else if (vacancy.approval_status === 'rejected') {
      await this.db.query(`UPDATE vacancies SET status = 'rejected', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [vacancyId, tenantId]);
      await this.vacancies.recordStatusHistory(tenantId, vacancyId, 'pending_approval', 'rejected', actorId, reason);
    }
  }
}
