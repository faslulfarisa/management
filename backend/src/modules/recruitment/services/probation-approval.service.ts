import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { EmployeeService } from '../../hr/services/employee.service';
import { ProbationService } from './probation.service';

const WORKFLOW_TYPE = 'probation_confirmation';

/** Thin wrapper around ApprovalEngineService — mirrors offer-approval.service.ts. */
@Injectable()
export class ProbationApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private employeeService: EmployeeService,
    private probation: ProbationService,
  ) {}

  async submit(tenantId: string, id: string, submittedById: string) {
    const review = await this.probation.getRaw(id, tenantId);
    if (!['draft', 'rejected'].includes(review.status)) {
      throw new BadRequestException(`Cannot submit a probation review with status '${review.status}' for approval`);
    }
    if (!review.recommendation) {
      throw new BadRequestException('Set a recommendation before submitting for approval');
    }

    await this.db.query(
      `UPDATE probation_reviews SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: id,
      entityTable: 'probation_reviews',
      submittedBy: submittedById,
      branchId: null,
      title: `Probation review: ${review.recommendation} recommendation`,
      metadata: { employee_id: review.employee_id },
    });

    await this.auditLog.log({ tenantId, userId: submittedById, entityType: 'probation_review', entityId: id, action: 'submit_for_approval' });
    return request;
  }

  async approve(tenantId: string, id: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(id, 'probation_reviews', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(tenantId, id);
    await this.auditLog.log({ tenantId, userId: approverId, entityType: 'probation_review', entityId: id, action: 'approve', newValues: { reason } });
    return result;
  }

  async reject(tenantId: string, id: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(id, 'probation_reviews', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(tenantId, id);
    await this.auditLog.log({ tenantId, userId: rejecterId, entityType: 'probation_review', entityId: id, action: 'reject', newValues: { reason } });
    return result;
  }

  /**
   * On full approval: 'confirm' recommendations call EmployeeService.confirm()
   * directly (no duplicate confirmation logic) and generate the letter;
   * 'extend' pushes employees.probation_end_date out. 'terminate' is left for
   * HR to action through the existing Exit Management module — not
   * auto-triggered here.
   */
  private async syncLifecycleStatus(tenantId: string, id: string) {
    const { rows } = await this.db.query('SELECT * FROM probation_reviews WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    const review = rows[0];
    if (!review) return;

    if (review.approval_status === 'approved') {
      await this.db.query(`UPDATE probation_reviews SET status = 'approved', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);

      if (review.recommendation === 'confirm') {
        const confirmationDate = new Date().toISOString().slice(0, 10);
        await this.employeeService.confirm(review.employee_id, tenantId, { confirmation_date: confirmationDate });
        await this.db.query('UPDATE probation_reviews SET confirmation_date = $3 WHERE id = $1 AND tenant_id = $2', [id, tenantId, confirmationDate]);
        await this.probation.generateConfirmationLetter(id, tenantId);
      } else if (review.recommendation === 'extend' && review.extended_probation_end_date) {
        await this.db.query('UPDATE employees SET probation_end_date = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2', [review.employee_id, tenantId, review.extended_probation_end_date]);
      }
    } else if (review.approval_status === 'rejected') {
      await this.db.query(`UPDATE probation_reviews SET status = 'rejected', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    }
  }
}
