import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { ApprovalEngineService } from '../../approvals/services/approval-engine.service';
import { AuditLogService } from '../../platform/services/audit-log.service';
import { JobDescriptionService } from './job-description.service';
import { isOrganizationAdmin } from './recruitment-approval-bypass.util';

const WORKFLOW_TYPE = 'job_description';

/** Thin wrapper around ApprovalEngineService — mirrors vacancy-approval.service.ts exactly. */
@Injectable()
export class JobDescriptionApprovalService {
  constructor(
    private db: DatabaseService,
    private approvalEngine: ApprovalEngineService,
    private auditLog: AuditLogService,
    private jobDescriptions: JobDescriptionService,
  ) {}

  async submit(tenantId: string, jobDescriptionId: string, submittedById: string) {
    const jd = await this.jobDescriptions.getRaw(jobDescriptionId, tenantId);
    if (!['draft', 'rejected'].includes(jd.status)) {
      throw new BadRequestException(`Cannot submit a job description with status '${jd.status}' for approval`);
    }

    if (await isOrganizationAdmin(this.db, tenantId, submittedById)) {
      await this.db.query(
        `UPDATE job_descriptions
         SET status = 'approved',
             approval_status = 'approved',
             approved_by = $3,
             approved_at = now(),
             approval_reason = 'Auto-approved by organization admin',
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [jobDescriptionId, tenantId, submittedById],
      );
      await this.auditLog.log({
        tenantId,
        userId: submittedById,
        entityType: 'job_description',
        entityId: jobDescriptionId,
        action: 'auto_approve',
        newValues: { reason: 'Organization admin action' },
      });
      return this.jobDescriptions.findOne(jobDescriptionId, tenantId);
    }

    await this.db.query(
      `UPDATE job_descriptions SET status = 'pending_approval', approval_status = 'pending', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [jobDescriptionId, tenantId],
    );

    const request = await this.approvalEngine.submit({
      tenantId,
      workflowType: WORKFLOW_TYPE,
      entityId: jobDescriptionId,
      entityTable: 'job_descriptions',
      submittedBy: submittedById,
      branchId: null,
      title: `Job description approval: ${jd.title}`,
      metadata: { vacancy_id: jd.vacancy_id },
    });

    await this.auditLog.log({ tenantId, userId: submittedById, entityType: 'job_description', entityId: jobDescriptionId, action: 'submit_for_approval' });
    return request;
  }

  async approve(tenantId: string, jobDescriptionId: string, approverId: string, reason: string, remarks?: string, ipAddress?: string) {
    const result = await this.approvalEngine.approveByEntity(jobDescriptionId, 'job_descriptions', tenantId, approverId, reason, remarks, ipAddress);
    await this.syncLifecycleStatus(tenantId, jobDescriptionId);
    await this.auditLog.log({ tenantId, userId: approverId, entityType: 'job_description', entityId: jobDescriptionId, action: 'approve', newValues: { reason } });
    return result;
  }

  async reject(tenantId: string, jobDescriptionId: string, rejecterId: string, reason: string, ipAddress?: string) {
    const result = await this.approvalEngine.rejectByEntity(jobDescriptionId, 'job_descriptions', tenantId, rejecterId, reason, ipAddress);
    await this.syncLifecycleStatus(tenantId, jobDescriptionId);
    await this.auditLog.log({ tenantId, userId: rejecterId, entityType: 'job_description', entityId: jobDescriptionId, action: 'reject', newValues: { reason } });
    return result;
  }

  private async syncLifecycleStatus(tenantId: string, jobDescriptionId: string) {
    await this.db.query(
      `UPDATE job_descriptions SET status = CASE
          WHEN approval_status = 'approved' THEN 'approved'
          WHEN approval_status = 'rejected' THEN 'rejected'
          ELSE status
        END,
        updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [jobDescriptionId, tenantId],
    );
  }
}
