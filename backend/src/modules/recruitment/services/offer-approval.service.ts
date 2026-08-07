import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { OfferService } from './offer.service';
import { isOrganizationAdmin } from './recruitment-approval-bypass.util';

const WORKFLOW_TYPE = 'offer';

/** Thin wrapper around ApprovalEngineService — mirrors vacancy/job-description-approval.service.ts exactly. */
@Injectable()
export class OfferApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private offers: OfferService,
  ) {}

  async submit(tenantId: string, offerId: string, submittedById: string) {
    const offer = await this.offers.getRaw(offerId, tenantId);
    if (!['draft', 'rejected'].includes(offer.status)) {
      throw new BadRequestException(`Cannot submit an offer with status '${offer.status}' for approval`);
    }

    if (await isOrganizationAdmin(this.db, tenantId, submittedById)) {
      await this.db.query(
        `UPDATE offers
         SET status = 'approved',
             approval_status = 'approved',
             approved_by = $3,
             approved_at = now(),
             approval_reason = 'Auto-approved by organization admin',
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [offerId, tenantId, submittedById],
      );
      await this.auditLog.log({
        tenantId,
        userId: submittedById,
        entityType: 'offer',
        entityId: offerId,
        action: 'auto_approve',
        newValues: { reason: 'Organization admin action' },
      });
      return this.offers.findOne(offerId, tenantId);
    }

    await this.db.query(
      `UPDATE offers SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [offerId, tenantId],
    );

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: offerId,
      entityTable: 'offers',
      submittedBy: submittedById,
      branchId: null,
      title: `Offer approval: ${offer.designation || 'role'} — CTC ${offer.currency} ${offer.ctc ?? '—'}`,
      metadata: { application_id: offer.application_id, vacancy_id: offer.vacancy_id },
    });

    await this.auditLog.log({ tenantId, userId: submittedById, entityType: 'offer', entityId: offerId, action: 'submit_for_approval' });
    return request;
  }

  async approve(tenantId: string, offerId: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(offerId, 'offers', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(tenantId, offerId);
    await this.auditLog.log({ tenantId, userId: approverId, entityType: 'offer', entityId: offerId, action: 'approve', newValues: { reason } });
    return result;
  }

  async reject(tenantId: string, offerId: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(offerId, 'offers', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(tenantId, offerId);
    await this.auditLog.log({ tenantId, userId: rejecterId, entityType: 'offer', entityId: offerId, action: 'reject', newValues: { reason } });
    return result;
  }

  private async syncLifecycleStatus(tenantId: string, offerId: string) {
    await this.db.query(
      `UPDATE offers SET status = CASE
          WHEN approval_status = 'approved' THEN 'approved'
          WHEN approval_status = 'rejected' THEN 'rejected'
          ELSE status
        END,
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [offerId, tenantId],
    );
  }
}
